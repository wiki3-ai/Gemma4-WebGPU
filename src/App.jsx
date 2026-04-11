import { useState, useEffect, useRef, useCallback } from "react";
import Chat from "./components/Chat";
import Progress from "./components/Progress";
import VideoSourceModal from "./components/VideoSourceModal";
import { useMedia } from "./hooks/useMedia";
import { useSystemPrompt } from "./hooks/useSystemPrompt";

const MODEL_OPTIONS = [
  { id: "onnx-community/gemma-4-E2B-it-ONNX", label: "E2B (faster)" },
  { id: "onnx-community/gemma-4-E4B-it-ONNX", label: "E4B (smarter)" },
];

// Screen states
const SCREEN = { SOURCE: "source", LANDING: "landing", LOADING: "loading", CHAT: "chat" };

function normalizeBaseUrl(url) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

const PROXY_BASE = (() => {
  const explicitBase = import.meta.env.VITE_PROXY_BASE;
  if (explicitBase) return normalizeBaseUrl(explicitBase);

  if (import.meta.env.DEV) {
    return `http://localhost:${import.meta.env.VITE_PROXY_PORT || 3001}`;
  }

  return normalizeBaseUrl(new URL("proxy", window.location.origin + import.meta.env.BASE_URL).toString());
})();

function LandingScreen({ modelId, setModelId, onStart, onBack, onClearCache, webgpuOk, loadError, autoStart }) {
  // クラッシュリカバリ: autoStart=true のとき mount 直後に自動でロード開始
  useEffect(() => {
    if (autoStart) onStart();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-[#0f0f12] px-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-white mb-1">Gemma 4</h1>
        <p className="text-sm text-white/40">Multimodal AI · Runs entirely in your browser</p>
      </div>

      {!webgpuOk && (
        <p className="text-sm text-red-400/80 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2 max-w-sm text-center">
          WebGPU is not supported in this browser. Try Chrome 113+ on desktop.
        </p>
      )}
      {loadError && (
        <p className="text-xs text-red-400/80 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2 max-w-sm text-center font-mono">
          {loadError}
        </p>
      )}

      <div className="w-full max-w-xs flex flex-col gap-3">
        <label className="text-xs text-white/40 uppercase tracking-wider">Model</label>
        {MODEL_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setModelId(opt.id)}
            className={`w-full py-3 px-4 rounded-xl border text-sm text-left transition-colors ${
              modelId === opt.id
                ? "bg-blue-500/20 border-blue-400/50 text-blue-300"
                : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
            }`}
          >
            <span className="font-medium">{opt.label.split(" ")[0]}</span>
            <span className="text-white/40 ml-2">{opt.label.split(" ").slice(1).join(" ")}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2 w-full max-w-xs">
        <button
          onClick={onBack}
          className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white/50 hover:bg-white/10 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onStart}
          disabled={!webgpuOk}
          className="flex-[2] py-2.5 rounded-xl bg-blue-500/20 border border-blue-400/30 text-sm text-blue-300 hover:bg-blue-500/30 disabled:opacity-30 disabled:cursor-default transition-colors font-medium"
        >
          Load Model
        </button>
      </div>

      <button
        onClick={onClearCache}
        className="text-xs text-white/20 hover:text-white/50 transition-colors"
      >
        Clear model cache
      </button>
    </div>
  );
}

function LoadingScreen({ progressItems, modelLabel }) {
  const allDone = progressItems.length > 0 && progressItems.every((p) => p.status === "done");
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-[#0f0f12] px-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-white mb-1">Loading Gemma 4 {modelLabel}</h1>
        <p className="text-sm text-white/40">
          {allDone ? "Compiling WebGPU shaders… (may take a minute)" : "First load may take a few minutes…"}
        </p>
      </div>
      <div className="w-full max-w-md">
        <Progress items={progressItems} />
      </div>
      {!allDone && (
        <p className="text-xs text-white/20">Model weights are cached locally after first download</p>
      )}
    </div>
  );
}

const CRASH_KEY = "__GEMMA_CRASH_MODEL__";
const CRASH_VIDEO_KEY = "__GEMMA_CRASH_VIDEO__";

export default function App() {
  const [screen, setScreen] = useState(SCREEN.SOURCE);
  const [modelId, setModelId] = useState(() => {
    // クラッシュ後のリロード: sessionStorage に保存されたモデルIDで自動復帰
    return sessionStorage.getItem(CRASH_KEY) || MODEL_OPTIONS[1].id;
  });
  const [webgpuOk, setWebgpuOk] = useState(true);
  const [progressItems, setProgressItems] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [maxNewTokens, setMaxNewTokens] = useState(
    () => parseInt(localStorage.getItem("__GEMMA_MAX_TOKENS__") || "2048")
  );
  const [bgVisible, setBgVisible] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchAvailable, setSearchAvailable] = useState(false);

  const [autoLoad, setAutoLoad] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [videoError, setVideoError] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const workerRef = useRef(null);
  const pendingRef = useRef(null); // { resolve, reject }
  const videoTypeRef = useRef("blank"); // クラッシュ時の動画ソース記録用

  const {
    videoRef,
    canvasRef,
    startWebcam,
    loadVideoFile,
    startBlank,
    captureFrame,
    isRecording,
    startRecording,
    stopRecording,
  } = useMedia();

  const {
    presets,
    activeId,
    activeText,
    selectPreset,
    savePreset,
    addPreset,
    deletePreset,
  } = useSystemPrompt();

  const modelLabel = MODEL_OPTIONS.find((o) => o.id === modelId)?.label.split(" ")[0] || "";

  // Init worker
  useEffect(() => {
    const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.addEventListener("message", (e) => {
      const { status, data, output, tps, numTokens, file, progress, loaded, total } = e.data;

      switch (status) {
        case "error":
          console.error("[Worker error]", data);
          // WebGPU 致命エラー（OOM・バッファ破損・OrtRun失敗）→ クラッシュ記録してリロード
          if (
            typeof data === "string" && (
              data.includes("memory access") ||
              data.includes("OrtRun") ||
              data.includes("Invalid Buffer") ||
              data.includes("mapAsync")
            )
          ) {
            sessionStorage.setItem(CRASH_KEY, modelId);
            sessionStorage.setItem(CRASH_VIDEO_KEY, videoTypeRef.current || "blank");
            alert("WebGPU error occurred. Reloading and restarting the model...");
            window.location.reload();
            return;
          }
          setLoadError(data);
          if (pendingRef.current) { pendingRef.current.reject(new Error(data)); pendingRef.current = null; }
          setIsGenerating(false);
          break;

        case "transcription":
          if (pendingRef.current) { pendingRef.current.resolve(e.data.text); pendingRef.current = null; }
          break;

        case "ready":
          if (pendingRef.current) { pendingRef.current.resolve(); pendingRef.current = null; }
          setScreen(SCREEN.CHAT);
          break;

        case "loading":
          // Handled via progress events
          break;

        case "start":
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.generating) return prev;
            return [...prev, { role: "assistant", response: "", generating: true }];
          });
          break;

        case "update":
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== "assistant") return prev;
            return [
              ...prev.slice(0, -1),
              { ...last, response: (last.response || "") + output, tps, numTokens },
            ];
          });
          break;

        case "complete":
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== "assistant") return prev;
            return [...prev.slice(0, -1), { ...last, generating: false }];
          });
          setIsGenerating(false);
          if (pendingRef.current) { pendingRef.current.resolve(); pendingRef.current = null; }
          break;

        default:
          // Progress events from transformers.js: { status, file, progress, loaded, total }
          if (file !== undefined) {
            setProgressItems((prev) => {
              const idx = prev.findIndex((p) => p.file === file);
              const item = { file, progress: progress ?? 0, status, loaded, total };
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = item;
                return next;
              }
              return [...prev, item];
            });
          }
      }
    });

    worker.postMessage({ type: "check" });

    return () => worker.terminate();
  }, []);

  // Check WebGPU availability
  useEffect(() => {
    if (!navigator.gpu) setWebgpuOk(false);
  }, []);

  // クラッシュリカバリ: sessionStorage にモデルID+動画ソースが残っていれば自動復帰
  useEffect(() => {
    const savedModel = sessionStorage.getItem(CRASH_KEY);
    if (savedModel) {
      sessionStorage.removeItem(CRASH_KEY);
      const savedVideo = sessionStorage.getItem(CRASH_VIDEO_KEY) || "blank";
      sessionStorage.removeItem(CRASH_VIDEO_KEY);
      // 動画ソースを再初期化（fileは復元不可なのでblankにフォールバック）
      if (savedVideo === "webcam") {
        startWebcam().catch(() => startBlank());
        videoTypeRef.current = "webcam";
      } else {
        startBlank();
        videoTypeRef.current = "blank";
      }
      setAutoLoad(true);
      setScreen(SCREEN.LANDING);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Check search proxy availability when entering chat screen
  useEffect(() => {
    if (screen !== SCREEN.CHAT) return;
    // ルートパスは即座に404を返す（検索は実行されない）
    fetch(`${PROXY_BASE}/`, { signal: AbortSignal.timeout(2000) })
      .then(() => setSearchAvailable(true))  // 404でも応答があればOK
      .catch(() => setSearchAvailable(false));
  }, [screen]);

  async function handleVideoSource(type, fileOrNull) {
    setVideoError(null);
    // fileはserialize不可なのでクラッシュ時はblankとして記録
    videoTypeRef.current = type === "file" ? "blank" : type;
    try {
      if (type === "webcam") await startWebcam();
      else if (type === "file") loadVideoFile(fileOrNull);
      else startBlank();
      setScreen(SCREEN.LANDING);
    } catch (e) {
      setVideoError(e.message || "Failed to access video source");
    }
  }

  async function handleLoadModel() {
    setAutoLoad(false); // リトライ時の再トリガー防止
    setProgressItems([]);
    setScreen(SCREEN.LOADING);

    await new Promise((resolve, reject) => {
      pendingRef.current = { resolve, reject };
      workerRef.current.postMessage({ type: "load", data: modelId });
    }).catch((e) => {
      console.error("Model load failed:", e);
      setScreen(SCREEN.LANDING);
    });
  }

  async function applyWebSearch(queryText) {
    if (!webSearch || !queryText?.trim()) return queryText;
    setIsSearching(true);
    try {
      const res = await fetch(`${PROXY_BASE}/search?q=` + encodeURIComponent(queryText));
      if (res.ok) {
        const j = await res.json();
        const ctx = (j.results || [])
          .filter(r => {
            const u = r.url || "";
            if (u.includes("duckduckgo.com/y.js")) return false;
            if (u.length > 300) return false;
            if (!(r.description || "").trim()) return false;
            return true;
          })
          .slice(0, 5)
          .map((r, i) => {
            const title = (r.title || "").replace(/\s*more\s*info\s*$/i, "").trim();
            const desc = (r.description || "").trim().slice(0, 200);
            return `[${i + 1}] ${title}\nURL: ${r.url}\n${desc}`;
          })
          .join("\n\n")
          .slice(0, 2500);
        if (ctx) {
          return `Web search results for the query below. Use them to give an accurate and up-to-date answer.\n\n${ctx}\n\n---\nUser question: ${queryText}`;
        }
      }
    } catch (e) {
      console.warn("Web search failed:", e.message);
    } finally {
      setIsSearching(false);
      setWebSearch(false);
    }
    return queryText;
  }

  async function handleSend({ text, image, audio, isVoice }) {
    if (isGenerating || isTranscribing) return;

    // ─── 音声パス: モデルで書き起こし → テキストとして生成 ──────────────────
    if (audio) {
      setMessages((prev) => [...prev, { role: "user", text: "", image, isVoice: true, isTranscribing: true }]);
      setIsTranscribing(true);

      let transcript = "";
      try {
        transcript = await new Promise((resolve, reject) => {
          pendingRef.current = { resolve, reject };
          workerRef.current.postMessage({ type: "transcribe", data: audio });
        });
      } catch (e) {
        console.error("Transcription error:", e);
      }

      setIsTranscribing(false);

      if (!transcript) {
        setMessages((prev) => prev.filter((m) => !m.isTranscribing));
        return;
      }

      // プレースホルダーを書き起こし結果で置換
      const userMsg = { role: "user", text: transcript, image, isVoice: true };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);

      setIsGenerating(true);

      // Web検索: 書き起こしテキストに検索結果を注入
      const llmText = await applyWebSearch(transcript);

      const history = [];
      for (let i = 0; i < nextMessages.length; i++) {
        const m = nextMessages[i];
        if (m.role === "user") {
          const isLast = i === nextMessages.length - 1;
          history.push({ role: "user", text: isLast ? llmText : m.text, image: m.image });
        } else {
          history.push({ role: "assistant", text: m.response });
        }
      }

      await new Promise((resolve, reject) => {
        pendingRef.current = { resolve, reject };
        workerRef.current.postMessage({
          type: "generate",
          data: { messages: history, systemPrompt: activeText, maxNewTokens, thinking },
        });
      }).catch((e) => {
        console.error("Generation error:", e);
        setIsGenerating(false);
      });

      return;
    }

    // ─── テキストパス ──────────────────────────────────────────────────────
    // ユーザーメッセージを即座にチャットに表示
    const userMsg = { role: "user", text, image, isVoice };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);

    // Web検索: ユーザーの表示テキストはそのまま、LLMには検索結果を注入
    const llmText = await applyWebSearch(text);

    setIsGenerating(true);

    // Build history for worker: 最後のユーザーメッセージには llmText を使用
    const history = [];
    for (let i = 0; i < nextMessages.length; i++) {
      const m = nextMessages[i];
      if (m.role === "user") {
        const isLast = i === nextMessages.length - 1;
        history.push({ role: "user", text: isLast ? llmText : m.text, image: m.image, audio: m.audio });
      } else if (m.role === "assistant") {
        history.push({ role: "assistant", text: m.response });
      }
    }

    await new Promise((resolve, reject) => {
      pendingRef.current = { resolve, reject };
      workerRef.current.postMessage({
        type: "generate",
        data: { messages: history, systemPrompt: activeText, maxNewTokens, thinking },
      });
    }).catch((e) => {
      console.error("Generation error:", e);
      setIsGenerating(false);
    });
  }

  function handleInterrupt() {
    workerRef.current.postMessage({ type: "interrupt" });
  }

  function handleReset() {
    setMessages([]);
    workerRef.current.postMessage({ type: "reset" });
  }

  function handleCapture() {
    return captureFrame();
  }

  async function handleClearCache() {
    if (!window.confirm("Clear all cached model weights? You will need to re-download on next load.")) return;
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    alert("Cache cleared.");
  }

  const modelLabelFull = MODEL_OPTIONS.find((o) => o.id === modelId)?.label || "";

  return (
    <div className="fixed inset-0 bg-[#0f0f12] overflow-hidden">
      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Background video — always mounted so videoRef is available from source selection onward */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
          screen === SCREEN.CHAT && bgVisible ? "opacity-20" : "opacity-0"
        }`}
      />

      {screen === SCREEN.SOURCE && (
        <VideoSourceModal
          onWebcam={() => handleVideoSource("webcam")}
          onFile={(f) => handleVideoSource("file", f)}
          onBlank={() => handleVideoSource("blank")}
          error={videoError}
        />
      )}

      {screen === SCREEN.LANDING && (
        <LandingScreen
          modelId={modelId}
          setModelId={setModelId}
          onStart={handleLoadModel}
          onBack={() => setScreen(SCREEN.SOURCE)}
          onClearCache={handleClearCache}
          webgpuOk={webgpuOk}
          loadError={loadError}
          autoStart={autoLoad}
        />
      )}

      {screen === SCREEN.LOADING && (
        <LoadingScreen progressItems={progressItems} modelLabel={modelLabel} />
      )}

      {screen === SCREEN.CHAT && (
        <Chat
          messages={messages}
          isGenerating={isGenerating}
          isRecording={isRecording}
          isTranscribing={isTranscribing}
          onSend={handleSend}
          onInterrupt={handleInterrupt}
          onReset={handleReset}
          onCapture={handleCapture}
          onStartRecord={startRecording}
          onStopRecord={stopRecording}
          systemPrompt={activeText}
          presets={presets}
          activePresetId={activeId}
          onSelectPreset={selectPreset}
          onSavePreset={savePreset}
          onAddPreset={addPreset}
          onDeletePreset={deletePreset}
          bgVisible={bgVisible}
          onToggleBg={() => setBgVisible((v) => !v)}
          modelLabel={modelLabelFull}
          maxNewTokens={maxNewTokens}
          onMaxNewTokensChange={(v) => { setMaxNewTokens(v); localStorage.setItem("__GEMMA_MAX_TOKENS__", v); }}
          thinking={thinking}
          onThinkingChange={setThinking}
          webSearch={webSearch}
          onWebSearchChange={setWebSearch}
          isSearching={isSearching}
          searchAvailable={searchAvailable}
        />
      )}
    </div>
  );
}
