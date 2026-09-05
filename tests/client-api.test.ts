import { afterEach, expect, test } from 'bun:test'
import { api } from '../src/client/lib/api'

const originalFetch = globalThis.fetch

function mockFetch(status: number, body: unknown) {
  globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  }))) as unknown as typeof fetch
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('api turns a structured API failure into a readable Error', async () => {
  mockFetch(422, { code: 'INSUFFICIENT_STOCK', message: 'Insufficient stock' })

  await expect(api('/api/sales', { method: 'POST' })).rejects.toThrow('Insufficient stock')
})
