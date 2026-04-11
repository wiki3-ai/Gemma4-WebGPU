import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react(), tailwindcss()],
  server: { port: parseInt(process.env.VITE_PORT || "5173") },
  preview: { port: parseInt(process.env.VITE_PORT || "5173") },
  worker: { format: "es" },
});
