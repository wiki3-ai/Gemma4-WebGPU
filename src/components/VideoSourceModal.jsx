import { useRef } from "react";

function CameraIcon() {
  return (
    <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <rect x={2} y={6} width={14} height={12} rx={2} />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x={2} y={3} width={20} height={14} rx={2} />
      <line x1={8} y1={21} x2={16} y2={21} />
      <line x1={12} y1={17} x2={12} y2={21} />
    </svg>
  );
}

export default function VideoSourceModal({ onWebcam, onFile, onBlank, error }) {
  const fileInputRef = useRef(null);

  return (
    <div className="absolute inset-0 flex flex-col bg-[#0f0f12]">
      {/* Project info banner — top ~25% of screen */}
      <section className="h-[25vh] shrink-0 flex items-center justify-between px-8 border-b border-white/10">
        <div className="flex flex-col justify-center gap-3">
          <div className="flex items-center gap-4 flex-wrap text-[clamp(1rem,2.2vw,1.75rem)] text-white/70">
            <a href="https://gemma4.wiki3.cc" className="hover:text-white transition-colors font-medium" title="Gemma 4 WebGPU live site">gemma4.wiki3.cc</a>
            <span className="text-white/20">·</span>
            <a href="https://github.com/wiki3-ai/Gemma4-WebGPU" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors" title="Source code on GitHub">GitHub</a>
          </div>
          <div className="text-[clamp(0.7rem,1.4vw,1.1rem)] text-white/40">
            Based on{" "}
            <a href="https://huggingface.co/spaces/webml-community/Gemma-4-WebGPU" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors" title="Original HuggingFace Space">HF webml-community/Gemma-4-WebGPU</a>
          </div>
          <div className="flex items-center gap-4 flex-wrap text-[clamp(0.85rem,1.6vw,1.25rem)] text-white/50">
            <a href="https://wiki3.ai/" target="_blank" rel="noopener noreferrer" className="hover:text-white/80 transition-colors" title="wiki3.ai">wiki3.ai</a>
            <a href="https://www.linkedin.com/in/jamespaulwhite" target="_blank" rel="noopener noreferrer" className="hover:text-white/80 transition-colors" title="James Paul White on LinkedIn">in/jamespaulwhite</a>
            <a href="mailto:jim@wiki3.ai" className="hover:text-white/80 transition-colors" title="Email jim@wiki3.ai">jim@wiki3.ai</a>
          </div>
        </div>
        <a href="https://gemma4.wiki3.cc" title="gemma4.wiki3.cc" className="shrink-0 h-[calc(25vh-2rem)] ml-6">
          <img src="/qr-gemma4.png" alt="QR code for gemma4.wiki3.cc" className="h-full w-auto rounded-lg" />
        </a>
      </section>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-white tracking-tight mb-3">Gemma 4</h1>
          <p className="text-base text-white/50">Multimodal AI · Runs entirely in your browser</p>
        </div>
        {error && <p className="text-sm text-white/50">{error}</p>}
        <div className="flex gap-4 flex-wrap justify-center">
          <button
            onClick={() => onWebcam().catch(() => {})}
            title="Use your webcam as video input for multimodal AI"
            className="flex w-44 flex-col items-center gap-3 rounded-2xl py-6 px-4 text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <CameraIcon />
            <span className="text-base font-medium">Start Webcam</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            title="Choose a video file from your device"
            className="flex w-44 flex-col items-center gap-3 rounded-2xl py-6 px-4 text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <FolderIcon />
            <span className="text-base font-medium">Select Video</span>
          </button>

          <button
            onClick={onBlank}
            title="Continue without video — text and image chat only"
            className="flex w-44 flex-col items-center gap-3 rounded-2xl py-6 px-4 text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <MonitorIcon />
            <span className="text-base font-medium">No Video</span>
          </button>
        </div>
        <p className="text-xs text-white/30">Everything runs locally — no data leaves your device (* if you enable the search tool it will use cloud search service)</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
