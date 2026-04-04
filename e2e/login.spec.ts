import { test, expect } from '@playwright/test'

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('renders login form with all elements', async ({ page }) => {
    await expect(page.locator('text=Sign In').first()).toBeVisible()
    await expect(page.locator('input[type="text"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button:has-text("Sign In")')).toBeVisible()
    await expect(page.locator('a[href="/forgot-password"]')).toBeVisible()
    await expect(page.locator('a[href="/register"]')).toBeVisible()
  })

  test('shows error on empty submission', async ({ page }) => {
    await page.click('button:has-text("Sign In")')
    await expect(page.locator('text=Enter email or QGX ID and password')).toBeVisible()
  })

  test('shows error on invalid credentials', async ({ page }) => {
    await page.fill('input[type="text"]', 'invalid@example.com')
    await page.fill('input[type="password"]', 'wrongpassword123')
    await page.click('button:has-text("Sign In")')
    // Supabase returns an auth error
    await expect(page.locator('[style*="danger"]')).toBeVisible({ timeout: 10000 })
  })

  test('password toggle works', async ({ page }) => {
    const pwInput = page.locator('input[type="password"]')
    await pwInput.fill('test123')
    // Click the eye toggle button
    await page.click('button[aria-label="Show password"]')
    await expect(page.locator('input[type="text"]').last()).toHaveValue('test123')
    await page.click('button[aria-label="Hide password"]')
    await expect(page.locator('input[type="password"]')).toHaveValue('test123')
  })

  test('has link back to home', async ({ page }) => {
    const homeLink = page.locator('a[href="/"]')
    await expect(homeLink).toBeVisible()
  })

  test('forgot password link navigates correctly', async ({ page }) => {
    await page.click('a[href="/forgot-password"]')
    await expect(page).toHaveURL(/\/forgot-password/)
  })

  test('register link navigates correctly', async ({ page }) => {
    await page.click('a[href="/register"]')
    await expect(page).toHaveURL(/\/register/)
  })
})
