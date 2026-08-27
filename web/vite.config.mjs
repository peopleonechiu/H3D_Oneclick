import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 4173,
    proxy: {
      "/api": "http://adapter:8787",
    },
  },
});
