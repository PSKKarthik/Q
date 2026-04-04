import { test as setup, expect } from '@playwright/test'

/**
 * Auth setup: logs in as each role and saves session state.
 *
 * Requires these env vars (set in .env.test or CI secrets):
 *   TEST_STUDENT_EMAIL, TEST_STUDENT_PASSWORD
 *   TEST_TEACHER_EMAIL, TEST_TEACHER_PASSWORD
 *   TEST_ADMIN_EMAIL,   TEST_ADMIN_PASSWORD
 *   TEST_PARENT_EMAIL,  TEST_PARENT_PASSWORD  (optional)
 *
 * If credentials are missing, the setup is skipped and
 * authenticated tests will be skipped too.
 */

const roles = ['student', 'teacher', 'admin', 'parent'] as const

for (const role of roles) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    const email = process.env[`TEST_${role.toUpperCase()}_EMAIL`]
    const password = process.env[`TEST_${role.toUpperCase()}_PASSWORD`]

    if (!email || !password) {
      setup.skip()
      return
    }

    await page.goto('/login')
    await page.locator('input[type="text"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.getByRole('button', { name: /sign in/i }).click()

    // Wait for redirect to the role's dashboard
    await expect(page).toHaveURL(new RegExp(`/dashboard/${role}`), { timeout: 15_000 })

    // Save session state for this role
    await page.context().storageState({ path: `playwright/.auth/${role}.json` })
  })
}
