import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'

// Load test-specific env vars (credentials for authenticated tests)
dotenv.config({ path: path.resolve(__dirname, '.env.test') })

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    /* ── public (unauthenticated) tests ── */
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /authenticated\//,
    },

    /* ── auth setup (runs once, saves storage state per role) ── */
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    /* ── authenticated tests (depend on setup) ── */
    {
      name: 'student-auth',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/student.json' },
      testMatch: /authenticated\/student/,
      dependencies: ['setup'],
    },
    {
      name: 'teacher-auth',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/teacher.json' },
      testMatch: /authenticated\/teacher/,
      dependencies: ['setup'],
    },
    {
      name: 'admin-auth',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/admin.json' },
      testMatch: /authenticated\/admin/,
      dependencies: ['setup'],
    },
    {
      name: 'parent-auth',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/parent.json' },
      testMatch: /authenticated\/parent/,
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
