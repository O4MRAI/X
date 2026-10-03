import { defineConfig } from '@playwright/test';
const base = process.env.VITE_BASE_PATH || '/';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', fullyParallel: false, workers: 1, timeout: 45000,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:5173${base}`, viewport: { width: 1440, height: 1000 },
    headless: true, screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: [
    { command: 'npm run dev -- --port 5173', url: `http://localhost:5173${base}`, reuseExistingServer: !process.env.CI },
    { command: 'npm run preview -- --port 4173', url: `http://localhost:4173${base}`, reuseExistingServer: !process.env.CI },
  ],
});
