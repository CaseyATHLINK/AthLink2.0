import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Read the existing .env.local at the repo root (VITE_SUPABASE_URL etc.).
  envDir: "../..",
  // Single React copy across workspace packages — required so hooks work.
  resolve: { dedupe: ["react", "react-dom"] },
  server: {
    // Allow Vite to read workspace packages outside apps/web.
    fs: { allow: ["../.."] },
    proxy: {
      "/api": { target: "https://athlink20.vercel.app", changeOrigin: true },
    },
  },
});
