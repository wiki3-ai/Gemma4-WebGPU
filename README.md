# Gemma 4 WebGPU — React版

ブラウザだけで動く Gemma 4 E2B / E4B 対応マルチモーダル AI チャット。サーバー不要・API キー不要。

**オリジナル**: https://huggingface.co/spaces/onnx-community/gemma-4-it-webgpu  
本リポジトリはオリジナルを **React + Vite + Tailwind CSS v4** でリビルドしたもの。

**デモサイト**: [https://dev.iwh12.jp/Gemma4-WebGPU/](https://dev.iwh12.jp/Gemma4-WebGPU/)

---

## 動作環境

- Chrome 113以降（デスクトップ推奨）
- WebGPU 対応ブラウザ
- RAM 8GB以上推奨（E4Bモデルは特に）
- 注: Windows 環境は WebGPU の挙動上、macOS より遅めになる傾向があります。macOS のほうが実用的です。

## セットアップ

```bash
npm install
cp .env.example .env          # 必要に応じてポートを変更
npm run dev                   # 開発サーバー起動
npm run build                 # 本番ビルド → dist/
npm run preview               # ビルド確認
```

サブディレクトリ配信する場合は `.env` に公開パスを設定:

```bash
VITE_BASE_PATH=/Gemma4-WebGPU/
```

Web検索 Proxy を使う場合は [proxy/README.md](./proxy/README.md) を参照。

## 機能

| 機能 | 内容 |
|---|---|
| テキストチャット | Gemma 4 によるマルチターン会話 |
| 画像入力 | ドラッグ＆ドロップ または カメラボタンでフレームキャプチャ |
| 音声入力 | マイクボタンで録音 → Gemma 4 audio encoder で書き起こし（モデル処理） |
| 動画背景 | Webcam / 動画ファイル / なし から選択 |
| システムプロンプト | ⚙ ボタンでプリセット管理・編集（localStorage 保存） |
| Markdown表示 | 見出し・コード・表・リスト等をレンダリング |
| Mermaid図表示 | ` ```mermaid ` コードブロックをフローチャートやシーケンス図として描画 |
| Thinking モード | 電球ボタンで思考ON/OFF。思考内容は折りたたみ表示（デフォルトOFF） |
| Web検索 | 虫眼鏡ボタンでON（プロキシ起動時のみ表示）。ローカルプロキシ経由で検索し結果をLLMに渡す。1回送信ごとに自動OFF（ワンショット） |
| 生成中断 | 送信ボタンが中断ボタンに切り替わる |
| コンテキスト残量 | 入力欄上部にバー表示 |
| Max Tokens | ヘッダーの数値入力で調整（64〜4096） |
| フォントサイズ | A- / A+ ボタンで調整 |
| BGトグル | BG ボタンで動画背景の表示/非表示 |
| キャッシュクリア | ランディング画面からモデルキャッシュを削除 |

## モデル

初回起動時にブラウザへダウンロード・キャッシュされます。

| モデル | 特徴 |
|---|---|
| E2B (faster) | 軽量・高速。推定必要VRAMの目安は約4GB前後 |
| E4B (smarter) | 高精度（デフォルト）。推定必要VRAMの目安は約8GB前後 |

注:

- 上記VRAM値はあくまで目安です。ブラウザ、GPU、ドライバ、同時使用中の他アプリ状況によって前後します。

## 技術スタック

- [Transformers.js](https://github.com/huggingface/transformers.js) v4 — WebGPU推論
- React 18 + Vite 6
- Tailwind CSS v4
- react-markdown + remark-gfm — Markdownレンダリング
- Mermaid — チャット内の図表レンダリング
- Web Workers — UIブロッキングなしの推論
