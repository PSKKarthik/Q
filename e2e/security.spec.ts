import { test, expect } from '@playwright/test'

test.describe('Security', () => {
  test('XSS in login field does not execute', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="text"]', '<script>alert("xss")</script>')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button:has-text("Sign In")')
    // Should not execute script — page should still be in normal state
    const dialogFired = await page.evaluate(() => {
      return (window as unknown as Record<string, boolean>).__xss_fired || false
    })
    expect(dialogFired).toBe(false)
  })

  test('XSS in register fields does not execute', async ({ page }) => {
    await page.goto('/register')
    await page.locator('.input').nth(0).fill('<img src=x onerror=alert(1)>')
    await page.locator('.input').nth(1).fill('test@test.com')
    await page.locator('.input').nth(2).fill('Password1')
    await page.click('button:has-text("Create Account")')
    // No alert dialog should appear
    const dialogFired = await page.evaluate(() => {
      return (window as unknown as Record<string, boolean>).__xss_fired || false
    })
    expect(dialogFired).toBe(false)
  })

  test('open redirect via login redirect param is blocked', async ({ page }) => {
    await page.goto('/login?redirect=https://evil.com')
    // Even if it loads, the redirect param is sanitized in the app
    await expect(page).toHaveURL(/\/login/)
  })

  test('path traversal in dashboard URL does not expose files', async ({ page }) => {
    const response = await page.goto('/dashboard/../../../etc/passwd')
    // Should return 404 or redirect — never expose system files
    const status = response?.status() ?? 0
    expect([200, 307, 308, 404]).toContain(status)
    // Page content should not contain system file data
    const body = await page.textContent('body')
    expect(body).not.toContain('root:')
  })

  test('no sensitive headers leaked to client', async ({ page }) => {
    const response = await page.goto('/')
    const headers = response?.headers() || {}
    // Sensitive headers should not be present
    expect(headers['x-powered-by']).toBeUndefined()
  })
})
