import { test, expect } from '@playwright/test'

test.describe('Register Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register')
  })

  test('renders registration form with all fields', async ({ page }) => {
    await expect(page.locator('text=Create Account').first()).toBeVisible()
    // Name, email, password, confirm-password, phone fields
    const inputs = page.locator('.input')
    await expect(inputs).toHaveCount(5, { timeout: 5000 })
    // Role selector present (select element with Student option)
    await expect(page.locator('select')).toHaveCount(1)
  })

  test('shows error when required fields are empty', async ({ page }) => {
    await page.click('button:has-text("Create Account")')
    await expect(page.locator('text=All fields required')).toBeVisible()
  })

  test('validates email format', async ({ page }) => {
    await page.locator('.input').nth(0).fill('Test User')
    await page.locator('.input').nth(1).fill('bademail')
    await page.locator('.input').nth(2).fill('Password1')
    await page.click('button:has-text("Create Account")')
    await expect(page.locator('text=Invalid email format')).toBeVisible()
  })

  test('validates password strength - minimum length', async ({ page }) => {
    await page.locator('.input').nth(0).fill('Test User')
    await page.locator('.input').nth(1).fill('test@example.com')
    await page.locator('.input').nth(2).fill('short1')
    await page.click('button:has-text("Create Account")')
    await expect(page.locator('text=Password must be at least 8 characters')).toBeVisible()
  })

  test('validates password strength - letter and number', async ({ page }) => {
    await page.locator('.input').nth(0).fill('Test User')
    await page.locator('.input').nth(1).fill('test@example.com')
    await page.locator('.input').nth(2).fill('abcdefgh')
    await page.click('button:has-text("Create Account")')
    await expect(page.locator('text=Password must contain at least one letter and one number')).toBeVisible()
  })

  test('has link to login page', async ({ page }) => {
    const loginLink = page.locator('a[href="/login"]').first()
    await expect(loginLink).toBeVisible()
    await loginLink.click()
    await expect(page).toHaveURL(/\/login/)
  })
})
