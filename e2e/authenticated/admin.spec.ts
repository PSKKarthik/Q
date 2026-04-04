import { test, expect } from '@playwright/test'

test.describe('Admin Dashboard (authenticated)', () => {
  test('loads dashboard layout with sidebar', async ({ page }) => {
    await page.goto('/dashboard/admin')
    await expect(page).toHaveURL(/\/dashboard\/admin/)
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
  })

  test('sidebar shows admin nav items', async ({ page }) => {
    await page.goto('/dashboard/admin')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })

    const expectedNavLabels = [
      'Overview', 'Users', 'Announcements', 'Tests',
      'Courses', 'Assignments', 'Attendance', 'Forums',
      'Analytics', 'Activity Log', 'Settings', 'Batch Create',
    ]
    for (const label of expectedNavLabels) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible()
    }
  })

  test('can navigate to Users tab', async ({ page }) => {
    await page.goto('/dashboard/admin')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await page.locator('text=Users').first().click()
    await expect(page).toHaveURL(/\/dashboard\/admin/)
  })

  test('can navigate to Activity Log tab', async ({ page }) => {
    await page.goto('/dashboard/admin')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await page.locator('text=Activity Log').first().click()
    await expect(page).toHaveURL(/\/dashboard\/admin/)
  })

  test('can navigate to Settings tab', async ({ page }) => {
    await page.goto('/dashboard/admin')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await page.locator('text=Settings').first().click()
    await expect(page).toHaveURL(/\/dashboard\/admin/)
  })

  test('can navigate to Batch Create tab', async ({ page }) => {
    await page.goto('/dashboard/admin')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await page.locator('text=Batch Create').first().click()
    await expect(page).toHaveURL(/\/dashboard\/admin/)
  })

  test('profile tab is accessible', async ({ page }) => {
    await page.goto('/dashboard/admin')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await page.locator('text=Profile').first().click()
    await expect(page).toHaveURL(/\/dashboard\/admin/)
  })

  test('logout button is present', async ({ page }) => {
    await page.goto('/dashboard/admin')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /log\s*out|sign\s*out/i }).or(page.locator('text=Logout')).first()).toBeVisible()
  })
})
