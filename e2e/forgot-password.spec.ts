import { test, expect } from '@playwright/test'

test.describe('Forgot Password Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/forgot-password')
  })

  test('renders the reset password form', async ({ page }) => {
    await expect(page.locator('text=Reset Password').first()).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('button:has-text("Send Reset Link")')).toBeVisible()
  })

  test('shows error when email is empty', async ({ page }) => {
    await page.click('button:has-text("Send Reset Link")')
    await expect(page.locator('text=Enter your email')).toBeVisible()
  })

  test('has back to login link', async ({ page }) => {
    const loginLink = page.locator('a[href="/login"]').first()
    await expect(loginLink).toBeVisible()
  })
})
