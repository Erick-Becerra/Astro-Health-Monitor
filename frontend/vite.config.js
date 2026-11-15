import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on all interfaces so Docker can expose the port
    port: 5173,
    strictPort: true,
    // Polling makes hot reload work with Docker Desktop on Windows/macOS.
    watch: { usePolling: true, interval: 300 },
  },
});
