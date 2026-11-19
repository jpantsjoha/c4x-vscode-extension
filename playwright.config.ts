import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './test/playwright',
    outputDir: process.env.C4X_PLAYWRIGHT_OUTPUT_DIR ?? 'test-results',
    timeout: 30000,
    use: {
        headless: true,
        viewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        // Screenshot policy: strict (zero tolerance) by default. Set a tolerance per test,
        // with a reason, only where needed. A toHaveScreenshot setting under `use` is ignored by
        // Playwright; it belongs under `expect`, and is deliberately not set.
    },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } },
    ],
});
