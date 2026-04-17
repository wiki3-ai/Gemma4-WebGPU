import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import hljs from "highlight.js/lib/common";
import "highlight.js/styles/atom-one-dark.css";
import SystemPromptModal from "./SystemPromptModal";

const FONT_SIZES = ["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl"];

// Mermaid: 動的インポート + 初期化フラグ (dynamic import + initialization flag)
let mermaidInitialized = false;
let mermaidCounter = 0;

async function getMermaid() {
  const mermaid = (await import("mermaid")).default;
  if (!mermaidInitialized) {
    mermaid.initialize({ startOnLoad: false, theme: "dark" });
    mermaidInitialized = true;
  }
  return mermaid;
}

function MermaidBlock({ code }) {
  const [svg, setSvg] = useState(null);
  const [error, setError] = useState(null);
  const id = useRef(`mermaid-${++mermaidCounter}`).current;

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setError(null);
    // ストリーミング中に何度も呼ばれないよう300msデバウンス
    // (300ms debounce to avoid repeated calls during streaming)
    const timer = setTimeout(async () => {
      try {
        const mermaid = await getMermaid();
        const { svg: rendered } = await mermaid.render(id, code);
        if (!cancelled) setSvg(rendered);
      } catch (e) {
        if (!cancelled) setError(e.message || "Mermaid render error");
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [code, id]);

  if (error) return (
    <div className="text-xs text-red-400/70 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 my-2 font-mono whitespace-pre-wrap">
      {error}
    </div>
  );
  if (!svg) return (
    <div className="text-xs text-white/30 my-2 px-2 animate-pulse">Rendering diagram…</div>
  );
  return (
    <div
      className="my-2 flex justify-center bg-white/5 rounded-xl p-4 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function CodeBlock({ className, children }) {
  const code = String(children).replace(/\n$/, "");
  const lang = /language-(\w+)/.exec(className || "")?.[1] || "";
  const [copied, setCopied] = useState(false);
  const isMermaid = lang === "mermaid";

  const highlighted = useMemo(() => {
    if (isMermaid) return "";

    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    // 言語不明の場合は自動判定 (auto-detect when language is unknown)
    return hljs.highlightAuto(code).value;
  }, [code, isMermaid, lang]);

  // Mermaid は専用コンポーネントで描画 (render Mermaid with a dedicated component)
  if (isMermaid) return <MermaidBlock code={code} />;

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="relative group my-2">
      <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-t-lg px-3 py-1">
        <span className="text-[10px] text-white/30">{lang || "code"}</span>
        <button onClick={copy}
          className="text-[10px] text-white/30 hover:text-white/70 transition-colors flex items-center gap-1">
          {copied ? (
            <>
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x={9} y={9} width={13} height={13} rx={2} /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="bg-[#282c34] border border-t-0 border-white/10 rounded-b-lg px-4 py-3 overflow-x-auto m-0">
        <code
          className={`hljs text-[0.85rem] leading-relaxed${lang ? ` language-${lang}` : ""}`}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
}

const MD_COMPONENTS = {
  code({ className, children, ...props }) {
    const isBlock = /language-/.test(className || "") || String(children).includes("\n");
    if (isBlock) return <CodeBlock className={className}>{children}</CodeBlock>;
    return <code className="bg-white/10 px-1.5 py-0.5 rounded text-[0.9em] font-mono" {...props}>{children}</code>;
  },
  pre({ children }) {
    // pre は CodeBlock 内で処理済みなのでそのまま返す (already handled inside CodeBlock, pass through)
    return <>{children}</>;
  },
};
const CONTEXT_MAX = 8192;

function estimateTokens(messages) {
  const chars = messages.reduce((s, m) => s + (m.text?.length || 0) + (m.response?.length || 0), 0);
  return Math.round(chars / 3) + 300;
}

function ContextBar({ messages }) {
  if (messages.length === 0) return null;
  const used = estimateTokens(messages);
  const pct = Math.min(100, Math.round((used / CONTEXT_MAX) * 100));
  const remaining = 100 - pct;
  const color = pct > 80 ? "#ef4444" : pct > 60 ? "#f97316" : "#60a5fa";
  return (
    <div className="px-4 py-1 flex items-center gap-2">
      <div className="flex-1 h-[3px] bg-white/10 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] text-white/30 shrink-0">ctx: {remaining}% left</span>
    </div>
  );
}

function ThinkBlock({ text }) {
  const [open, setOpen] = useState(false);
  if (!text?.trim()) return null;
  return (
    <div className="mb-2 border border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
      >
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
          <path d="M9 18h6M10 22h4" />
        </svg>
        {open ? "思考を隠す (Hide thinking)" : "思考を表示 (Show thinking)"}
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="px-3 py-2 border-t border-white/10 text-xs text-white/40 whitespace-pre-wrap leading-relaxed">
          {text.trim()}
        </div>
      )}
    </div>
  );
}

// Gemma 4 の特殊トークンパターン (Gemma 4 special-token patterns)
// 思考: [内容]<channel|>  回答: [内容]<turn|>
// (Thinking: [content]<channel|>  Answer: [content]<turn|>)
const SPECIAL_TOKEN_RE = /<\|[^>]*\|?>|<[^>|]*\|>/g;

function parseGemmaResponse(raw) {
  const text = raw || "";
  // <channel|> で分割: 前半=思考、後半=回答
  // (Split on <channel|>: first half = thinking, second half = answer)
  const channelIdx = text.indexOf("<channel|>");
  if (channelIdx !== -1) {
    const thinkRaw = text.slice(0, channelIdx).replace(SPECIAL_TOKEN_RE, "").trim();
    const answerRaw = text.slice(channelIdx + "<channel|>".length).replace(SPECIAL_TOKEN_RE, "").trim();
    return { thinkText: thinkRaw, mainText: answerRaw };
  }
  // <channel|> なし（thinking OFF）: 特殊トークンを除去して本文のみ
  // (No <channel|> (thinking OFF): strip special tokens and return body only)
  return { thinkText: null, mainText: text.replace(SPECIAL_TOKEN_RE, "").trim() };
}

function AssistantContent({ response, generating }) {
  const text = response || "";
  const hasChannel = text.includes("<channel|>");

  // 生成中かつ <channel|> 未到達 = まだ思考フェーズ
  // (Generating but <channel|> not reached yet = still in thinking phase)
  if (generating && !hasChannel) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-white/30">
        <span className="inline-flex gap-1">
          {[0,1,2].map(i => (
            <span key={i} className="w-1 h-1 bg-white/30 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </span>
        思考中… (Thinking…)
      </span>
    );
  }

  // 生成完了、または <channel|> 到達済み
  // (Generation complete, or <channel|> already reached)
  const { thinkText, mainText } = parseGemmaResponse(text);

  return (
    <>
      {thinkText && <ThinkBlock text={thinkText} />}
      {mainText ? (
        <div className="markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={MD_COMPONENTS}>{mainText}</ReactMarkdown>
        </div>
      ) : generating ? (
        // <channel|> 到達後、回答がまだ来ていない場合
        // (After <channel|>, but the answer hasn't arrived yet)
        <span className="inline-flex gap-1">
          {[0,1,2].map(i => (
            <span key={i} className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </span>
      ) : null}
    </>
  );
}

function MessageBubble({ msg, fontSize }) {
  return (
    <div className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${fontSize} ${
        msg.role === "user"
          ? "bg-blue-600/30 text-white"
          : "bg-white/5 text-white/90"
      }`}>
        {msg.image && (
          <img src={msg.image} alt="" className="max-w-[200px] rounded-lg mb-2 object-cover" />
        )}
        {msg.role === "user" ? (
          <div>
            {msg.isVoice && !msg.isTranscribing && (
              <div className="flex items-center gap-1 mb-1">
                {[3,5,7,5,4,6,3,5,4].map((h, i) => (
                  <div key={i} className="w-0.5 bg-blue-400/70 rounded-full"
                    style={{ height: `${h * 2}px` }} />
                ))}
              </div>
            )}
            {msg.isTranscribing ? (
              <span className="flex items-center gap-1.5 text-xs text-white/50">
                <span className="inline-flex gap-1">
                  {[0,1,2].map(i => (
                    <span key={i} className="w-1 h-1 bg-white/50 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </span>
                書き起こし中… (Transcribing…)
              </span>
            ) : (
              <p className="whitespace-pre-wrap">{msg.text}</p>
            )}
          </div>
        ) : (
          <AssistantContent response={msg.response} generating={msg.generating} />
        )}
      </div>
      {msg.tps && (
        <span className="text-[10px] text-white/20 px-2">
          {msg.numTokens} tokens · {msg.tps.toFixed(1)} tok/s
        </span>
      )}
    </div>
  );
}

export default function Chat({
  messages,
  isGenerating,
  isRecording,
  isTranscribing,
  onSend,
  onInterrupt,
  onReset,
  onCapture,
  onStartRecord,
  onStopRecord,
  systemPrompt,
  presets,
  activePresetId,
  onSelectPreset,
  onSavePreset,
  onAddPreset,
  onDeletePreset,
  bgVisible,
  onToggleBg,
  modelLabel,
  maxNewTokens,
  onMaxNewTokensChange,
  thinking,
  onThinkingChange,
  webSearch,
  onWebSearchChange,
  isSearching,
  searchAvailable,
}) {
  const [input, setInput] = useState("");
  const [dropImg, setDropImg] = useState(null);
  const [fontSize, setFontSize] = useState(
    () => localStorage.getItem("__GEMMA_FS__") || "text-sm"
  );
  const [showSysModal, setShowSysModal] = useState(false);
  const [crashed, setCrashed] = useState(false);
  const [searchDismissed, setSearchDismissed] = useState(false);

  const inputRef = useRef(null);
  const chatRef = useRef(null);
  const isComposing = useRef(false);

  useEffect(() => {
    localStorage.setItem("__GEMMA_FS__", fontSize);
  }, [fontSize]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  // Resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // Drag & drop on full screen
  useEffect(() => {
    const prevent = (e) => e.preventDefault();
    document.addEventListener("dragover", prevent, true);
    document.addEventListener("drop", prevent, true);
    return () => {
      document.removeEventListener("dragover", prevent, true);
      document.removeEventListener("drop", prevent, true);
    };
  }, []);

  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => setDropImg(ev.target.result);
    reader.readAsDataURL(file);
  }

  function changeFontSize(dir) {
    const idx = FONT_SIZES.indexOf(fontSize);
    const next = idx + dir;
    if (next >= 0 && next < FONT_SIZES.length) setFontSize(FONT_SIZES[next]);
  }

  async function handleSend() {
    if (isGenerating) return;
    const text = input.trim();
    if (!text && !dropImg) return;
    const img = dropImg;
    setInput("");
    setDropImg(null);
    try {
      await onSend({ text, image: img });
    } catch (e) {
      if (e?.message?.includes("memory access")) setCrashed(true);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey && !isComposing.current) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleScan() {
    const frame = onCapture();
    if (!frame) return;
    const text = input.trim() || "What do you see?";
    setInput("");
    await onSend({ text, image: frame });
  }

  async function handleMicClick() {
    if (isGenerating || isTranscribing) return;
    if (isRecording) {
      const audio = await onStopRecord(); // Float32Array | null
      if (!audio) return;
      const img = dropImg;
      setDropImg(null);
      await onSend({ audio, image: img, isVoice: true });
    } else {
      try {
        await onStartRecord();
      } catch (e) {
        console.error("Mic error:", e);
        alert("Microphone access denied or unavailable.");
      }
    }
  }

  return (
    <div
      className="fixed inset-0 flex flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-10 px-4 py-2
        bg-gradient-to-b from-black/60 via-black/30 to-transparent">
        <div className="flex items-center justify-between gap-3 text-xs text-white/40 flex-wrap">
          <div className="flex items-center gap-3">
            <a href="https://gemma4.wiki3.cc" className="hover:text-white/70 transition-colors" title="Gemma 4 WebGPU live site">gemma4.wiki3.cc</a>
            <a href="https://github.com/wiki3-ai/Gemma4-WebGPU" target="_blank" rel="noopener noreferrer" className="hover:text-white/70 transition-colors" title="Source code on GitHub">GitHub</a>
          </div>
          <div className="text-[10px] text-white/25">
            Based on{" "}
            <a href="https://huggingface.co/spaces/webml-community/Gemma-4-WebGPU" target="_blank" rel="noopener noreferrer" className="hover:text-white/50 transition-colors" title="Original HuggingFace Space">HF webml-community/Gemma-4-WebGPU</a>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://wiki3.ai/" target="_blank" rel="noopener noreferrer" className="hover:text-white/70 transition-colors" title="wiki3.ai">wiki3.ai</a>
            <a href="https://www.linkedin.com/in/jamespaulwhite" target="_blank" rel="noopener noreferrer" className="hover:text-white/70 transition-colors" title="James Paul White on LinkedIn">in/jamespaulwhite</a>
            <a href="mailto:jim@wiki3.ai" className="hover:text-white/70 transition-colors" title="Email jim@wiki3.ai">jim@wiki3.ai</a>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <h1 className="font-semibold text-white text-sm">Gemma 4 {modelLabel}</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => changeFontSize(-1)} className="btn-ctrl" title="Decrease font size">A-</button>
            <button onClick={() => changeFontSize(1)} className="btn-ctrl" title="Increase font size">A+</button>
            {onMaxNewTokensChange && (
              <input
                type="number"
                value={maxNewTokens}
                min={64}
                max={4096}
                onChange={(e) => onMaxNewTokensChange(Math.max(64, Math.min(4096, Number(e.target.value))))}
                className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/50 text-center outline-none focus:border-white/20"
                title="Max new tokens (64–4096)"
              />
            )}
            <button onClick={() => setShowSysModal(true)} className="btn-ctrl" title="System prompt settings">⚙</button>
            <button onClick={onToggleBg} className={`btn-ctrl ${bgVisible ? "text-white/60" : "text-white/20"}`} title={bgVisible ? "Hide video background" : "Show video background"}>BG</button>
            <button onClick={onReset} className="btn-ctrl" title="Clear chat history">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Recording indicator */}
      {isRecording && (
        <div className="absolute top-24 inset-x-0 z-10 flex justify-center">
          <span className="flex items-center gap-1.5 text-xs text-red-400 bg-black/40 rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            Recording...
          </span>
        </div>
      )}

      {/* Searching indicator */}
      {isSearching && (
        <div className="absolute top-24 inset-x-0 z-10 flex justify-center">
          <span className="flex items-center gap-1.5 text-xs text-blue-400 bg-black/40 rounded-full px-3 py-1">
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="animate-spin">
              <circle cx={12} cy={12} r={10} strokeDasharray="32" strokeDashoffset="10" />
            </svg>
            検索中... (Searching...)
          </span>
        </div>
      )}

      {/* Messages */}
      <div ref={chatRef} className={`flex-1 overflow-y-auto px-4 pt-24 pb-4 space-y-4 ${fontSize}`}>
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} fontSize={fontSize} />
        ))}
      </div>

      {/* Context bar */}
      <ContextBar messages={messages} />

      {/* Image preview */}
      {dropImg && (
        <div className="px-4 pb-1 flex items-center gap-2">
          <img src={dropImg} alt="" className="h-12 w-12 rounded-lg object-cover border border-white/10" />
          <button onClick={() => setDropImg(null)} className="text-white/40 hover:text-white text-lg">&times;</button>
        </div>
      )}

      {/* Input bar: [mic/stop] [camera] [textarea] [scan] [send] */}
      <div className="px-4 pb-4 flex items-end gap-2">
        {/* Mic / Stop-recording button — leftmost, matches original layout */}
        <button onClick={handleMicClick}
          disabled={isTranscribing}
          title={isRecording ? "Stop recording" : isTranscribing ? "Transcribing audio…" : "Record voice input"}
          className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-2xl transition-colors ${
            isRecording
              ? "bg-red-500 text-white shadow-lg shadow-red-500/30"
              : isTranscribing
              ? "bg-white/5 text-white/20 cursor-default"
              : "bg-white/10 hover:bg-white/20 text-white/60 hover:text-white"
          }`}>
          {isRecording ? (
            <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><rect x={4} y={4} width={16} height={16} rx={2} /></svg>
          ) : (
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" />
            </svg>
          )}
        </button>

        {/* Camera = scan (capture frame from video) */}
        <button onClick={handleScan}
          title="Capture a frame from the video feed and send it to the AI"
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors">
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
            <circle cx={12} cy={13} r={3} />
          </svg>
        </button>

        {/* Thinking toggle */}
        <button
          onClick={() => onThinkingChange?.(!thinking)}
          title={thinking ? "Thinking ON" : "Thinking OFF"}
          className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
            thinking
              ? "bg-yellow-400/20 text-yellow-300 hover:bg-yellow-400/30"
              : "bg-white/10 text-white/30 hover:bg-white/20 hover:text-white/60"
          }`}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
            <path d="M9 18h6M10 22h4" />
          </svg>
        </button>

        {/* Web search toggle — always visible; struck out when proxy is unavailable */}
        <button
          onClick={() => {
            if (searchAvailable) {
              onWebSearchChange?.(!webSearch);
            } else if (!searchDismissed) {
              alert("Web search is unavailable. The search proxy server is not running. See proxy/README.md for setup instructions.");
              setSearchDismissed(true);
            }
          }}
          title={searchAvailable
            ? (webSearch ? "Web Search ON — click to disable" : "Web Search OFF — click to enable")
            : (searchDismissed
              ? "Web search unavailable — proxy not running"
              : "Web search — click for details"
            )
          }
          className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
            searchDismissed && !searchAvailable
              ? "bg-white/5 text-white/15 cursor-default"
              : webSearch
              ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
              : searchAvailable
              ? "bg-white/10 text-white/30 hover:bg-white/20 hover:text-white/60"
              : "bg-white/10 text-white/30 hover:bg-white/20 hover:text-white/60"
          }`}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
            className={searchDismissed && !searchAvailable ? "opacity-40" : ""}>
            <circle cx={11} cy={11} r={8} />
            <path d="m21 21-4.35-4.35" />
            {searchDismissed && !searchAvailable && (
              <line x1={4} y1={4} x2={20} y2={20} strokeWidth={2.5} className="text-red-400" stroke="currentColor" />
            )}
          </svg>
        </button>

        <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-3 py-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { isComposing.current = true; }}
            onCompositionEnd={() => { isComposing.current = false; }}
            placeholder="Ask Gemma anything…"
            className={`w-full bg-transparent text-white placeholder-white/20 resize-none outline-none ${fontSize}`}
          />
        </div>

        {/* Send / interrupt */}
        <button
          onClick={isGenerating ? onInterrupt : handleSend}
          disabled={!isGenerating && !input.trim() && !dropImg}
          title={isGenerating ? "Stop generation" : "Send message"}
          className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
            isGenerating
              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              : "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-30 disabled:cursor-default"
          }`}>
          {isGenerating ? (
            <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><rect x={4} y={4} width={16} height={16} rx={2} /></svg>
          ) : (
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <line x1={22} y1={2} x2={11} y2={13} /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>

      {showSysModal && (
        <SystemPromptModal
          presets={presets}
          activeId={activePresetId}
          onSelect={onSelectPreset}
          onSave={onSavePreset}
          onAdd={onAddPreset}
          onDelete={onDeletePreset}
          onClose={() => setShowSysModal(false)}
        />
      )}
    </div>
  );
}
