import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5183,
    strictPort: false,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Keep the heavy 3D + backend SDK out of the initial bundle —
        // LoginHero3D/Bar3DChart are already lazy-loaded, this just stops Vite
        // from inlining three.js + supabase into index-*.js (~500kB → ~180kB).
        manualChunks: {
          three: ["three"],
          vendor: ["react", "react-dom", "@supabase/supabase-js"],
        },
      },
    },
  },
});
