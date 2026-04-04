import { test, expect } from '@playwright/test'

test.describe('Student Dashboard (authenticated)', () => {
  test('loads dashboard layout with sidebar', async ({ page }) => {
    await page.goto('/dashboard/student')
    // Should not be redirected to login
    await expect(page).toHaveURL(/\/dashboard\/student/)
    // DashboardLayout sidebar renders with QGX branding
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
  })

  test('sidebar shows student nav items', async ({ page }) => {
    await page.goto('/dashboard/student')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })

    const expectedNavLabels = [
      'Overview', 'Tests', 'Courses', 'Assignments',
      'Attendance', 'Grades', 'Timetable', 'XP Hub',
      'Forums', 'AI Tutor', 'Code Lab', 'Messages',
    ]
    for (const label of expectedNavLabels) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible()
    }
  })

  test('default tab is home / overview', async ({ page }) => {
    await page.goto('/dashboard/student')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    // The Overview nav item should be active (first loaded tab)
    await expect(page.locator('text=Overview').first()).toBeVisible()
  })

  test('can switch tabs via sidebar navigation', async ({ page }) => {
    await page.goto('/dashboard/student')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })

    await page.locator('text=Tests').first().click()
    // After clicking Tests, page should still be on student dashboard
    await expect(page).toHaveURL(/\/dashboard\/student/)
  })

  test('logout button is present', async ({ page }) => {
    await page.goto('/dashboard/student')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    // DashboardLayout always renders a logout button
    await expect(page.getByRole('button', { name: /log\s*out|sign\s*out/i }).or(page.locator('text=Logout')).first()).toBeVisible()
  })

  test('profile section is accessible', async ({ page }) => {
    await page.goto('/dashboard/student')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await page.locator('text=My Profile').first().click()
    await expect(page).toHaveURL(/\/dashboard\/student/)
  })

  test('offline banner appears when offline', async ({ page, context }) => {
    await page.goto('/dashboard/student')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await context.setOffline(true)
    // Trigger offline event
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    await expect(page.locator('text=You are offline')).toBeVisible({ timeout: 5_000 })
    await context.setOffline(false)
  })
})
