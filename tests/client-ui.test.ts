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

test('admins open on dashboard and see it as the first menu item', () => {
  const source = readFileSync(new URL('../src/client/App.svelte', import.meta.url), 'utf8')
  expect(source).toContain("if (path === '/') navigate(actor.role === 'admin' ? '/dashboard' : '/pos')")
  const mobileNav = source.slice(source.indexOf('<nav aria-label="Main navigation" class="flex'), source.indexOf('</nav>', source.indexOf('<nav aria-label="Main navigation" class="flex')))
  const desktopNav = source.slice(source.indexOf('<nav aria-label="Main navigation" class="grid'), source.indexOf('</nav>', source.indexOf('<nav aria-label="Main navigation" class="grid')))
  expect(mobileNav.indexOf("path === '/dashboard'")).toBeLessThan(mobileNav.indexOf("path === '/pos'"))
  expect(desktopNav.indexOf("path === '/dashboard'")).toBeLessThan(desktopNav.indexOf("path === '/pos'"))
})

test('authenticated shell uses theme tokens and a responsive content frame', () => {
  const source = readFileSync(new URL('../src/client/App.svelte', import.meta.url), 'utf8')
  expect(source).toContain('bg-background text-foreground')
  expect(source).toContain('max-w-7xl')
  expect(source).not.toContain('bg-slate-50')
})

test.each([
  ['Dashboard', 2],
  ['Expenses', 1],
  ['Pos', 2],
  ['Sales', 2],
  ['Settings', 5],
])('%s renders its record lists with Table primitives', (name, tables) => {
  const source = route(name)
  expect(source).toContain("$lib/components/ui/table/index.js")
  expect(source.match(/<Table\.Root\b/g)).toHaveLength(tables)
})

test('dashboard uses an overview grid and operations workspace', () => {
  const source = route('Dashboard')
  expect(source).toContain('Today at a glance')
  expect(source).toContain('sm:grid-cols-2 lg:grid-cols-3')
  expect(source).toContain('xl:grid-cols-2')
  expect(source.indexOf('<h1')).toBeLessThan(source.indexOf('{#if error}'))
  expect(source).toContain('{#if summary}<p class="text-sm text-muted-foreground">Today at a glance · {summary.date}</p>{/if}')
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
      checkTelegram,
      input(quantity, reason) { quantityDelta = quantity; adjustmentReason = reason },
      get state() { return { stockToAdjust, quantityDelta, adjustmentReason, stockDialogOpen, telegramChecking, error, message } }
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

test('Telegram checker sends one request while pending and reports success or failure', async () => {
  const source = route('Settings')
  expect(source).toContain("api<{ ok: true }>('/api/settings/telegram/check', { method: 'POST' })")
  expect(source).toContain("telegramChecking ? 'Checking…' : 'Check connection'")
  expect(source).toContain("message = 'Telegram connection OK'")

  let pending = Promise.withResolvers<unknown>()
  const requests: Array<{ path: string; options: RequestInit }> = []
  const page = settings(async (path, options) => {
    if (!options) return []
    requests.push({ path, options })
    return pending.promise
  })

  const first = page.checkTelegram()
  const duplicate = page.checkTelegram()
  expect(requests).toEqual([{ path: '/api/settings/telegram/check', options: { method: 'POST' } }])
  expect(page.state.telegramChecking).toBe(true)
  pending.resolve({ ok: true })
  await Promise.all([first, duplicate])
  expect(page.state).toMatchObject({ telegramChecking: false, message: 'Telegram connection OK', error: '' })

  for (const [code, readable] of [
    ['TELEGRAM_UNAVAILABLE', 'Telegram is unavailable'],
    ['TELEGRAM_NOT_CONFIGURED', 'Telegram bot is not configured'],
    ['Unexpected failure', 'Unexpected failure'],
  ]) {
    pending = Promise.withResolvers<unknown>()
    const failed = page.checkTelegram()
    pending.reject(new Error(code))
    await failed
    expect(page.state).toMatchObject({ telegramChecking: false, message: '', error: readable })
  }
  expect(requests).toHaveLength(4)
})
