import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const backend = process.env.VITE_DEV_BACKEND ?? "http://127.0.0.1:4000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  appType: "spa",
  server: {
    port: 5173,
    host: true,
    strictPort: true,
    // Allow public tunnel hostnames (Cloudflare trycloudflare.com, etc.)
    allowedHosts: true,
    proxy: {
      "/api": { target: backend, changeOrigin: true },
      "/socket.io": { target: backend, ws: true, changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    host: true,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/api": { target: backend, changeOrigin: true },
      "/socket.io": { target: backend, ws: true, changeOrigin: true },
    },
  },
});
