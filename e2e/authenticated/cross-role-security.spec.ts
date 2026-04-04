import { test, expect } from '@playwright/test'

/**
 * Cross-role security tests — verifies that authenticated users
 * cannot access dashboards belonging to other roles.
 *
 * Uses the student auth state to attempt accessing admin/teacher/parent dashboards.
 * The middleware should redirect to the correct role-based dashboard.
 */
test.describe('Role-based access control', () => {
  test.use({ storageState: 'playwright/.auth/student.json' })

  test('student cannot access /dashboard/admin', async ({ page }) => {
    await page.goto('/dashboard/admin')
    // Middleware should redirect student away from admin dash
    await page.waitForURL(/\/dashboard\/student|\/login/, { timeout: 10_000 })
    expect(page.url()).not.toContain('/dashboard/admin')
  })

  test('student cannot access /dashboard/teacher', async ({ page }) => {
    await page.goto('/dashboard/teacher')
    await page.waitForURL(/\/dashboard\/student|\/login/, { timeout: 10_000 })
    expect(page.url()).not.toContain('/dashboard/teacher')
  })

  test('student cannot access /dashboard/parent', async ({ page }) => {
    await page.goto('/dashboard/parent')
    await page.waitForURL(/\/dashboard\/student|\/login/, { timeout: 10_000 })
    expect(page.url()).not.toContain('/dashboard/parent')
  })
})

test.describe('Session persistence', () => {
  test.use({ storageState: 'playwright/.auth/student.json' })

  test('refreshing the page keeps the user logged in', async ({ page }) => {
    await page.goto('/dashboard/student')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
    await page.reload()
    await expect(page).toHaveURL(/\/dashboard\/student/)
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Logout flow', () => {
  test.use({ storageState: 'playwright/.auth/student.json' })

  test('clicking logout redirects to login page', async ({ page }) => {
    await page.goto('/dashboard/student')
    await expect(page.locator('text=QGX')).toBeVisible({ timeout: 15_000 })

    // Click the logout button in the sidebar
    const logoutBtn = page.getByRole('button', { name: /log\s*out|sign\s*out/i }).or(page.locator('text=Logout')).first()
    await logoutBtn.click()

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })
})
