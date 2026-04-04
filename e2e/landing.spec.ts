import { test, expect } from '@playwright/test'

test.describe('Landing Page', () => {
  test('loads and renders hero section', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/QGX/i)
    await expect(page.getByRole('heading', { name: 'QGX' })).toBeVisible()
  })

  test('has sign-in link that navigates to /login', async ({ page }) => {
    await page.goto('/')
    const signInLink = page.locator('a[href="/login"]').first()
    await expect(signInLink).toBeVisible()
    await signInLink.click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('has register link that navigates to /register', async ({ page }) => {
    await page.goto('/')
    const registerLink = page.locator('a[href="/register"]').first()
    await expect(registerLink).toBeVisible()
    await registerLink.click()
    await expect(page).toHaveURL(/\/register/)
  })
})
