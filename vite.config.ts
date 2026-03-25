import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      exclude: ['src/assets/**', 'src/main.tsx'],
      // Branch threshold at 84: DOM hover-state mutations (onMouseEnter/Leave inline style)
      // are untestable in jsdom; all business logic branches are fully covered.
      thresholds: { lines: 88, functions: 87, branches: 84, statements: 88 },
    },
  },
}));
