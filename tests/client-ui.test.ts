import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parse } from 'svelte/compiler'
import { stockAdjustment } from '../src/client/lib/dialog-validation'

const route = (name: string) => readFileSync(new URL(`../src/client/routes/${name}.svelte`, import.meta.url), 'utf8')

test.each(['Pos', 'Expenses', 'Settings'])('%s configures string-valued selects as single selection', (name) => {
  const selects = [...route(name).matchAll(/<Select\.Root\b[^>]*>/g)]
  expect(selects.length).toBeGreaterThan(0)
  for (const [select] of selects) expect(select).toContain('type="single"')
})

test('dashboard navigation and route are admin-only', () => {
  const source = readFileSync(new URL('../src/client/App.svelte', import.meta.url), 'utf8')
  expect(source).toContain("import Dashboard from './routes/Dashboard.svelte'")
  expect(source.match(/Dashboard/g)?.length).toBeGreaterThanOrEqual(3)
  expect(source).toContain("actor.role === 'admin'")
  expect(source).toContain("path === '/dashboard'")
})

// Exercise the real route handlers without mounting the UI; only the API boundary is replaced.
function settings(api: (path: string, options?: RequestInit) => Promise<unknown>) {
  const source = route('Settings')
  const script = parse(source).instance!.content.body
    .filter((node) => node.type !== 'ImportDeclaration')
    .map((node) => source.slice(node.start, node.end)).join('\n')
  return new Function('api', 'onMount', 'stockAdjustment', `${new Bun.Transpiler({ loader: 'ts' }).transformSync(script)}
    return {
      openStockDialog, setStockDialogOpen, adjustStock,
      input(quantity, reason) { quantityDelta = quantity; adjustmentReason = reason },
      get state() { return { stockToAdjust, quantityDelta, adjustmentReason, stockDialogOpen, error, message } }
    }
  `)(api, () => {}, stockAdjustment)
}

const product = { id: 7, name: 'Coffee', sku: 'COF', barcode: null, salePrice: 10000, stockQuantity: 10, isActive: true }

test('stock confirmation sends one adjustment while pending and permits another after completion', async () => {
  const pending = Promise.withResolvers<unknown>()
  const requests: Array<{ path: string; options: RequestInit }> = []
  const page = settings(async (path, options) => {
    if (!options) return []
    requests.push({ path, options })
    return pending.promise
  })
  page.openStockDialog(product)
  page.input('-2', ' count correction ')
  const first = page.adjustStock()
  const duplicate = page.adjustStock()
  expect(requests).toHaveLength(1)
  expect(requests[0]).toEqual({
    path: '/api/products/7/stock-adjustments',
    options: { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"quantityDelta":-2,"reason":"count correction"}' },
  })
  pending.resolve(product)
  await Promise.all([first, duplicate])
  expect(page.state).toMatchObject({ stockToAdjust: null, quantityDelta: '', adjustmentReason: '', stockDialogOpen: false, message: 'Stock adjusted' })
  page.openStockDialog(product)
  page.input('1', 'Restock')
  await page.adjustStock()
  expect(requests).toHaveLength(2)
})

test('stock cancellation clears input and a failed request releases the guard for retry', async () => {
  let requests = 0
  const page = settings(async (_path, options) => {
    if (!options) return []
    requests++
    throw new Error('Adjustment rejected')
  })
  page.openStockDialog(product)
  page.input('2', 'Restock')
  page.setStockDialogOpen(false)
  await page.adjustStock()
  expect(requests).toBe(0)
  expect(page.state).toMatchObject({ stockToAdjust: null, quantityDelta: '', adjustmentReason: '', stockDialogOpen: false })
  page.openStockDialog(product)
  page.input('2', 'Restock')
  await page.adjustStock()
  expect(page.state).toMatchObject({ stockDialogOpen: true, quantityDelta: '2', adjustmentReason: 'Restock', error: 'Adjustment rejected' })
  await page.adjustStock()
  expect(requests).toBe(2)
})

test('closing a pending stock dialog cannot replace its target until the request settles', async () => {
  const pending = Promise.withResolvers<unknown>()
  const page = settings(async (_path, options) => options ? pending.promise : [])
  page.openStockDialog(product)
  page.input('2', 'Restock')
  const request = page.adjustStock()
  page.setStockDialogOpen(false)
  page.openStockDialog({ ...product, id: 8 })
  expect(page.state).toMatchObject({ stockDialogOpen: false, stockToAdjust: null })
  pending.reject(new Error('Adjustment rejected'))
  await request
  page.openStockDialog({ ...product, id: 8 })
  expect(page.state).toMatchObject({ stockDialogOpen: true, stockToAdjust: { id: 8 }, error: '' })
})
