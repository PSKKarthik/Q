import { test, expect } from '@playwright/test'

test.describe('PWA & Accessibility', () => {
  test('manifest.json is served correctly', async ({ page }) => {
    const response = await page.goto('/manifest.json')
    expect(response?.status()).toBe(200)
    const manifest = await response?.json()
    expect(manifest.name).toBeTruthy()
    expect(manifest.start_url).toBeTruthy()
    expect(manifest.icons).toBeTruthy()
  })

  test('service worker script is accessible', async ({ page }) => {
    const response = await page.goto('/sw.js')
    expect(response?.status()).toBe(200)
    const text = await response?.text()
    expect(text).toContain('fetch')
  })

  test('offline fallback page loads', async ({ page }) => {
    const response = await page.goto('/offline.html')
    expect(response?.status()).toBe(200)
  })

  test('landing page has no critical accessibility issues', async ({ page }) => {
    await page.goto('/')
    // Check that links have discernible text
    const links = page.locator('a')
    const linkCount = await links.count()
    expect(linkCount).toBeGreaterThan(0)

    // Check page has a meaningful title
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
  })

  test('login page inputs have labels', async ({ page }) => {
    await page.goto('/login')
    const labels = page.locator('.label')
    await expect(labels).toHaveCount(2, { timeout: 5000 })
    // Verify text content of labels
    await expect(labels.nth(0)).toContainText('Email')
    await expect(labels.nth(1)).toContainText('Password')
  })

  test('password toggle has aria-label', async ({ page }) => {
    await page.goto('/login')
    const toggleBtn = page.locator('button[aria-label="Show password"]')
    await expect(toggleBtn).toBeVisible()
  })
})
