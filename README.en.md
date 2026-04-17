# Gemma 4 WebGPU — React Edition

A multimodal AI chat powered by Gemma 4 E2B / E4B that runs entirely in the browser. No server required. No API key required.

**Original**: https://huggingface.co/spaces/onnx-community/gemma-4-it-webgpu  
This repository is a rebuild of the original using **React + Vite + Tailwind CSS v4**.

**Demo**: [https://dev.iwh12.jp/Gemma4-WebGPU/](https://dev.iwh12.jp/Gemma4-WebGPU/)

---

## Requirements

- Chrome 113+ (desktop recommended)
- WebGPU-capable browser
- 8 GB+ RAM recommended (especially for the E4B model)
- Note: On Windows, WebGPU tends to be slower than on macOS. macOS is more practical for everyday use.

## Setup

```bash
npm install
cp .env.example .env          # Change the port if needed
npm run dev                   # Start the dev server
npm run build                 # Production build → dist/
npm run preview               # Preview the build
```

When serving from a subdirectory, set the public path in `.env`:

```bash
VITE_BASE_PATH=/Gemma4-WebGPU/
```

To use the web-search proxy, see [proxy/README.en.md](./proxy/README.en.md).

## Features

| Feature | Description |
|---|---|
| Text Chat | Multi-turn conversation with Gemma 4 |
| Image Input | Drag-and-drop or capture a frame via the camera button |
| Voice Input | Record via the mic button → transcribed by the Gemma 4 audio encoder (on-device) |
| Video Background | Choose from Webcam / Video file / None |
| System Prompt | Manage and edit presets via the ⚙ button (saved in localStorage) |
| Markdown Rendering | Headings, code blocks, tables, lists, etc. |
| Mermaid Diagrams | ` ```mermaid ` code blocks rendered as flowcharts, sequence diagrams, etc. |
| Thinking Mode | Toggle thinking on/off with the lightbulb button; thought process shown in a collapsible section (off by default) |
| Web Search | Toggle with the magnifying-glass button (shown only when the proxy is running). Search results are injected into the LLM context. Auto-disables after each send (one-shot) |
| Interrupt Generation | The send button becomes an interrupt button while generating |
| Context Remaining | Progress bar displayed above the input field |
| Max Tokens | Adjustable via the number input in the header (64–4096) |
| Font Size | Adjustable with the A- / A+ buttons |
| BG Toggle | Show/hide the video background with the BG button |
| Clear Cache | Delete the model cache from the landing screen |

## Models

Models are downloaded and cached in the browser on first launch.

| Model | Details |
|---|---|
| E2B (faster) | Lightweight and fast. Estimated VRAM requirement: ~4 GB |
| E4B (smarter) | Higher accuracy (default). Estimated VRAM requirement: ~8 GB |

Note:

- The VRAM figures above are rough estimates. Actual usage varies depending on the browser, GPU, driver, and other running applications.

## Tech Stack

- [Transformers.js](https://github.com/huggingface/transformers.js) v4 — WebGPU inference
- React 18 + Vite 6
- Tailwind CSS v4
- react-markdown + remark-gfm — Markdown rendering
- Mermaid — In-chat diagram rendering
- Web Workers — Non-blocking UI inference
