import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './test/playwright',
    timeout: 30000,
    use: {
        headless: true,
        viewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true,
    },
});
