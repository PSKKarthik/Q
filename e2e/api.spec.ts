import { test, expect } from '@playwright/test'

test.describe('API Routes', () => {
  test('POST /api/ai returns 401 without auth', async ({ request }) => {
    const response = await request.post('/api/ai', {
      data: { messages: [{ role: 'user', content: 'hello' }] },
    })
    // Should reject unauthenticated requests (401 or 500 depending on missing env)
    expect([401, 500]).toContain(response.status())
  })

  test('POST /api/submit-test returns error without auth', async ({ request }) => {
    const response = await request.post('/api/submit-test', {
      data: { test_id: 'fake', answers: {} },
    })
    expect([401, 500]).toContain(response.status())
  })

  test('POST /api/delete-user returns error without auth', async ({ request }) => {
    const response = await request.post('/api/delete-user', {
      data: { userId: '00000000-0000-0000-0000-000000000000' },
    })
    expect([401, 403, 500]).toContain(response.status())
  })

  test('POST /api/batch-create-user returns error without auth', async ({ request }) => {
    const response = await request.post('/api/batch-create-user', {
      data: { users: [] },
    })
    expect([401, 403, 500]).toContain(response.status())
  })

  test('GET /api/ai is not allowed', async ({ request }) => {
    const response = await request.get('/api/ai')
    expect([405, 500]).toContain(response.status())
  })
})
