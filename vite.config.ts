import "dotenv/config";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev API port follows the server's .env PORT (8098 while the old Python
// faucet still owns 8097; 8097 after cutover).
const apiPort = process.env.PORT || "8098";

export default defineConfig({
  root: "client",
  plugins: [react()],
  build: { outDir: "../dist/client", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false },
    },
  },
});
