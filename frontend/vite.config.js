import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Required on Windows + Docker: container FS events don't propagate
    // without polling, so HMR won't trigger on file saves.
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      // Use the Docker service name, not localhost — inside the container
      // localhost resolves to the frontend container itself, not backend.
      "/api": {
        target: "http://backend:5000",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
