import { test, expect } from '@playwright/test'

test.describe('Teacher Dashboard (authenticated)', () => {
  test('loads dashboard layout with sidebar', async ({ page }) => {
    await page.goto('/dashboard/teacher')
    await expect(page).toHaveURL(/\/dashboard\/teacher/)
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
  })

  test('sidebar shows teacher nav items', async ({ page }) => {
    await page.goto('/dashboard/teacher')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })

    const expectedNavLabels = [
      'Overview', 'Tests & Quizzes', 'Timetable', 'Courses',
      'Assignments', 'Attendance', 'Grades', 'Analytics',
      'Announcements', 'Forums', 'Plagiarism Check',
      'Meetings', 'Risk Alerts', 'Messages',
    ]
    for (const label of expectedNavLabels) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible()
    }
  })

  test('can navigate to Tests & Quizzes tab', async ({ page }) => {
    await page.goto('/dashboard/teacher')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await page.locator('text=Tests & Quizzes').first().click()
    await expect(page).toHaveURL(/\/dashboard\/teacher/)
  })

  test('can navigate to Courses tab', async ({ page }) => {
    await page.goto('/dashboard/teacher')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await page.locator('text=Courses').first().click()
    await expect(page).toHaveURL(/\/dashboard\/teacher/)
  })

  test('can navigate to Announcements tab', async ({ page }) => {
    await page.goto('/dashboard/teacher')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await page.locator('text=Announcements').first().click()
    await expect(page).toHaveURL(/\/dashboard\/teacher/)
  })

  test('profile tab is accessible', async ({ page }) => {
    await page.goto('/dashboard/teacher')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await page.locator('text=My Profile').first().click()
    await expect(page).toHaveURL(/\/dashboard\/teacher/)
  })

  test('logout button is present', async ({ page }) => {
    await page.goto('/dashboard/teacher')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /log\s*out|sign\s*out/i }).or(page.locator('text=Logout')).first()).toBeVisible()
  })
})
