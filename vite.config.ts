import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works on GitHub Pages project sites and itch.io alike.
  base: './',
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          pixi: ['pixi.js'],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
