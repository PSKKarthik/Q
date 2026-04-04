import { test, expect } from '@playwright/test'

test.describe('Navigation & Routing', () => {
  test('404 page shows for unknown route', async ({ page }) => {
    await page.goto('/this-page-does-not-exist')
    await expect(page.locator('text=404')).toBeVisible()
    await expect(page.locator('text=Page not found')).toBeVisible()
    await expect(page.locator('a[href="/"]')).toBeVisible()
    await expect(page.locator('a[href="/login"]')).toBeVisible()
  })

  test('dashboard route redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/dashboard/student')
    await expect(page).toHaveURL(/\/login/)
    // Should have redirect param preserved
    await expect(page).toHaveURL(/redirect/)
  })

  test('admin dashboard redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/dashboard/admin')
    await expect(page).toHaveURL(/\/login/)
  })

  test('teacher dashboard redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/dashboard/teacher')
    await expect(page).toHaveURL(/\/login/)
  })

  test('parent dashboard redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/dashboard/parent')
    await expect(page).toHaveURL(/\/login/)
  })
})
