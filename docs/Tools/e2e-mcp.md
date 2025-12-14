## MCP TESTING TOOLS SETUP

### Installation Requirements
```bash
# Selenium MCP for Browser Automation
npm install -g @angiejones/mcp-selenium

# Playwright MCP for E2E Testing  
npx '@playwright/mcp@latest'

# Supabase MCP for Database Operations
npx -y @supabase/mcp-server-supabase@latest --access-token <your-token>

# Additional Testing Tools
npm install --save-dev @testing-library/jest-dom
npm install --save-dev @vitest/ui
npm install --save-dev eslint-plugin-testing-library
```

### MCP Configuration
```json
// Add to MCP settings.json
{
  "mcpServers": {
    "selenium": {
      "command": "npx",
      "args": ["@angiejones/mcp-selenium"],
      "env": {
        "SELENIUM_BROWSER": "chrome",
        "SELENIUM_HEADLESS": "true"
      }
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp"],
      "env": {
        "PLAYWRIGHT_BROWSER": "chromium"
      }
    },
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--access-token",
        "${SUPABASE_ACCESS_TOKEN}"
      ]
    }
  }
}
```

## DEVELOPMENT WORKFLOW

### Daily Development Cycle
```bash
# Morning Setup (Required)
git pull origin main
npm install  # Check for dependency updates
npm run lint # Fix any linting issues
npm test     # Ensure all tests pass

# Development Process (Per Feature)
1. Create feature branch: git checkout -b feature/description
2. Implement changes with tests
3. Run quality checks: npm run validate
4. Visual testing with Playwright MCP
5. E2E testing with Selenium MCP
6. Security scanning: npm audit
7. Performance check: npm run perf-test

# Pre-Commit Validation (Automated)
npm run pre-commit-check  # Runs all validations
```

### Testing Strategy Implementation
```typescript
// Unit Testing Requirements
describe('Component Tests', () => {
  - Test all user interactions
  - Test error states and edge cases  
  - Test accessibility compliance
  - Mock external dependencies
  - Achieve >90% code coverage
})

// Integration Testing
describe('API Integration', () => {
  - Test wallet connections
  - Test blockchain transactions
  - Test IPFS uploads
  - Test error handling
  - Test timeout scenarios
})

// E2E Testing with MCP Tools
describe('User Journeys', () => {
  - Wallet connection flow
  - Token creation complete flow
  - NFT minting complete flow
  - Error recovery scenarios
  - Cross-browser compatibility
})
```

## VISUAL VALIDATION REQUIREMENTS

### Playwright MCP Usage
```javascript
// Visual Testing Script
const { test, expect } = require('@playwright/test');

test.describe('Visual Regression Tests', () => {
  test('Homepage renders correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Test responsive design
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page).toHaveScreenshot('homepage-desktop.png');
    
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page).toHaveScreenshot('homepage-mobile.png');
  });

  test('Wallet connection flow', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="wallet-connect-button"]');
    await expect(page).toHaveScreenshot('wallet-modal.png');
  });
});
```

### Selenium MCP Usage
```python
# Selenium Test Examples
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

class WalletConnectionTests:
    def test_ethereum_wallet_connection(self):
        """Test Ethereum wallet connection flow"""
        driver.get("http://localhost:3000")
        
        # Click Ethereum tab
        ethereum_tab = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Ethereum')]"))
        )
        ethereum_tab.click()
        
        # Verify connection button exists
        connect_button = driver.find_element(By.XPATH, "//button[contains(text(), 'Connect Ethereum Wallet')]")
        assert connect_button.is_displayed()
        
        # Test responsive behavior
        driver.set_window_size(375, 667)  # Mobile viewport
        assert connect_button.is_displayed()

    def test_solana_wallet_connection(self):
        """Test Solana wallet connection flow"""
        driver.get("http://localhost:3000")
        
        # Click Solana tab
        solana_tab = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Solana')]"))
        )
        solana_tab.click()
        
        # Verify wallet adapter button exists
        wallet_button = driver.find_element(By.CLASS_NAME, "wallet-adapter-dropdown")
        assert wallet_button.is_displayed()
```
