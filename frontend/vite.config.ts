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
    // Disable HMR WebSocket — it fails behind tunnels (tunnelmole, cloudflare)
    // because they don't proxy the Vite HMR ws connection. Game works fine
    // without it; just refresh the browser manually when editing frontend code.
    hmr: false,
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
