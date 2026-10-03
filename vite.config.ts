import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || "/",
  server: { host: "0.0.0.0" },
  optimizeDeps: {
    include: [
      "three",
      "three/addons/utils/BufferGeometryUtils.js",
      "three/addons/geometries/RoundedBoxGeometry.js",
    ],
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: (id) =>
          id.includes("/node_modules/three/")
            ? "three"
            : id.includes("/node_modules/@dimforge/")
              ? "physics"
              : undefined,
      },
    },
  },
});
