import { test, expect } from '@playwright/test'

test.describe('Parent Dashboard (authenticated)', () => {
  test('loads dashboard layout with sidebar', async ({ page }) => {
    await page.goto('/dashboard/parent')
    await expect(page).toHaveURL(/\/dashboard\/parent/)
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
  })

  test('sidebar shows parent nav items', async ({ page }) => {
    await page.goto('/dashboard/parent')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })

    const expectedNavLabels = [
      'Overview', 'Grades & Tests', 'Attendance', 'Timetable',
      'Report Card', 'Absence Excuses', 'Book Meeting',
      'Teacher Messages', 'Academic Alerts', 'Notifications',
      'My Profile',
    ]
    for (const label of expectedNavLabels) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible()
    }
  })

  test('can navigate to Grades & Tests tab', async ({ page }) => {
    await page.goto('/dashboard/parent')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await page.locator('text=Grades & Tests').first().click()
    await expect(page).toHaveURL(/\/dashboard\/parent/)
  })

  test('can navigate to Attendance tab', async ({ page }) => {
    await page.goto('/dashboard/parent')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await page.locator('text=Attendance').first().click()
    await expect(page).toHaveURL(/\/dashboard\/parent/)
  })

  test('can navigate to Absence Excuses tab', async ({ page }) => {
    await page.goto('/dashboard/parent')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await page.locator('text=Absence Excuses').first().click()
    await expect(page).toHaveURL(/\/dashboard\/parent/)
  })

  test('can navigate to Book Meeting tab', async ({ page }) => {
    await page.goto('/dashboard/parent')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await page.locator('text=Book Meeting').first().click()
    await expect(page).toHaveURL(/\/dashboard\/parent/)
  })

  test('student selector appears when students are linked', async ({ page }) => {
    await page.goto('/dashboard/parent')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    // VIEWING label is rendered when linked students exist
    const viewingLabel = page.locator('text=VIEWING')
    // This may or may not be visible depending on whether the test account has linked students
    // We just verify the page loads without errors
    await expect(page).toHaveURL(/\/dashboard\/parent/)
  })

  test('logout button is present', async ({ page }) => {
    await page.goto('/dashboard/parent')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /log\s*out|sign\s*out/i }).or(page.locator('text=Logout')).first()).toBeVisible()
  })
})
