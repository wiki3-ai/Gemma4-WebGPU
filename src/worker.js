import {
  AutoProcessor,
  Gemma4ForConditionalGeneration,
  TextStreamer,
  InterruptableStoppingCriteria,
  RawImage,
  env,
} from "@huggingface/transformers";

const MODELS = {
  "onnx-community/gemma-4-E2B-it-ONNX": { label: "E2B" },
  "onnx-community/gemma-4-E4B-it-ONNX": { label: "E4B" },
};

let fp16_supported = false;
let fp16_checked = false;

async function check() {
  if (fp16_checked) return;
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) throw new Error("WebGPU is not supported (no adapter found)");
    fp16_supported = adapter.features.has("shader-f16");
  } catch (e) {
    self.postMessage({ status: "error", data: e.toString() });
  } finally {
    fp16_checked = true;
  }
}

class Gemma4 {
  static model_id = null;
  static processor = null;
  static model = null;

  static async getInstance(model_id, progress_callback = null) {
    if (this.model_id !== model_id) {
      // Reset if model changed
      this.processor = null;
      this.model = null;
      this.model_id = model_id;
    }

    this.processor ??= AutoProcessor.from_pretrained(model_id, {
      progress_callback,
    });

    this.model ??= Gemma4ForConditionalGeneration.from_pretrained(model_id, {
      // q4f16: q4 weights + fp16 KV cache — smallest for WebGPU
      // Fallback: "q4" if fp16 unsupported (handled by library)
      dtype: {
        embed_tokens: "q4f16",
        decoder_model_merged: "q4f16",
        // vision_encoder / audio_encoder have only one variant (used as-is)
      },
      device: "webgpu",
      progress_callback,
    });

    return Promise.all([this.processor, this.model]);
  }
}

const stopping_criteria = new InterruptableStoppingCriteria();

async function generate({ messages, systemPrompt, maxNewTokens = 2048, thinking = true }) {
  const [processor, model] = await Gemma4.getInstance(Gemma4.model_id);

  // Build conversation — prepend system prompt into first user message
  // (Gemma chat template doesn't have a dedicated system role)
  const conversation = [];
  let systemInjected = !systemPrompt;
  for (const msg of messages) {
    const content = [];
    if (msg.image) content.push({ type: "image", image: msg.image });
    if (msg.audio) content.push({ type: "audio", audio: msg.audio });
    let text = msg.text || "";
    if (!systemInjected && msg.role === "user") {
      text = systemPrompt + "\n\n" + text;
      systemInjected = true;
    }
    content.push({ type: "text", text });
    conversation.push({ role: msg.role, content });
  }

  // Collect images
  const imageContents = conversation
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .filter((c) => c.type === "image" && c.image);
  const images = await Promise.all(
    imageContents.map((c) => RawImage.fromURL(c.image))
  );

  // Collect audio (Float32Array waveforms)
  const audioContents = conversation
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .filter((c) => c.type === "audio" && c.audio);
  const audios = audioContents.map((c) => c.audio);

  // Prepare text prompt
  const text = processor.apply_chat_template(conversation, {
    add_generation_prompt: true,
    tokenize: false,
    enable_thinking: thinking,
  });

  const inputs = await processor(
    text,
    images.length > 0 ? images : null,
    audios.length > 0 ? audios : null,
  );

  let startTime;
  let numTokens = 0;
  let tps;

  const streamer = new TextStreamer(processor.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: false,
    token_callback_function: () => {
      startTime ??= performance.now();
      if (numTokens++ > 0) {
        tps = (numTokens / (performance.now() - startTime)) * 1000;
      }
    },
    callback_function: (output) => {
      self.postMessage({ status: "update", output, tps, numTokens });
    },
  });

  self.postMessage({ status: "start" });

  const result = await model
    .generate({
      ...inputs,
      max_new_tokens: maxNewTokens,
      do_sample: true,
      temperature: 0.7,
      top_p: 0.95,
      repetition_penalty: 1.0,
      streamer,
      stopping_criteria,
      return_dict_in_generate: true,
    })
    .catch((e) => {
      self.postMessage({ status: "error", data: e.toString() });
      return null;
    });

  if (!result) return;

  const decoded = processor.batch_decode(result.sequences, {
    skip_special_tokens: true,
  });

  self.postMessage({ status: "complete", output: decoded });
}

async function transcribe(audio) {
  const [processor, model] = await Gemma4.getInstance(Gemma4.model_id);

  const text = processor.apply_chat_template(
    [
      { role: "system", content: "Transcribe the following audio into text." },
      { role: "user", content: [{ type: "audio" }] },
    ],
    { add_generation_prompt: true }
  );

  const inputs = await processor(text, null, audio, { add_special_tokens: false });

  stopping_criteria.reset();

  const result = await model
    .generate({
      ...inputs,
      max_new_tokens: 512,
      do_sample: false,
      stopping_criteria,
    })
    .catch((e) => {
      self.postMessage({ status: "error", data: e.toString() });
      return null;
    });

  if (!result) return;

  const inputLen = inputs.input_ids.dims.at(-1);
  const [transcription] = processor.batch_decode(
    result.slice(null, [inputLen, null]),
    { skip_special_tokens: true }
  );

  self.postMessage({ status: "transcription", text: transcription?.trim() || "" });
}

async function load(model_id) {
  try {
    self.postMessage({ status: "loading", data: "Loading model..." });
    await Gemma4.getInstance(model_id, (x) => {
      if (x?.status !== "ready") self.postMessage(x);
    });
    self.postMessage({ status: "ready" });
  } catch (e) {
    self.postMessage({ status: "error", data: e?.message || String(e) });
  }
}

self.addEventListener("message", async (e) => {
  const { type, data } = e.data;
  switch (type) {
    case "check":     check(); break;
    case "load":      load(data); break;
    case "transcribe": transcribe(data); break;
    case "generate":
      stopping_criteria.reset();
      generate(data);
      break;
    case "interrupt": stopping_criteria.interrupt(); break;
    case "reset":     stopping_criteria.reset(); break;
  }
});
