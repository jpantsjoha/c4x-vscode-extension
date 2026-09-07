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
        // Snapshot goldens were captured on macOS. Linux Chromium renders
        // fonts and anti-aliasing differently, so we allow up to 5% pixel
        // deviation. This is wide enough to absorb cross-OS rendering
        // differences without masking genuine regressions in layout or colour.
        // Once CI has been running on a Linux golden for 5 consecutive green
        // runs, regenerate the goldens on Linux and tighten this to 0.02.
        toHaveScreenshot: { maxDiffPixelRatio: 0.05 },
    },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } },
    ],
});
