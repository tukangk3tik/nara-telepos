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
  const sidebar = readFileSync(new URL('../src/client/components/AppSidebar.svelte', import.meta.url), 'utf8')
  expect(source).toContain("import Dashboard from './routes/Dashboard.svelte'")
  expect(source).toContain("actor.role === 'admin'")
  expect(source).toContain("path === '/dashboard'")
  expect(sidebar).toContain("{ title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, adminOnly: true }")
  expect(sidebar).toContain("!item.adminOnly || role === 'admin'")
})

test('admins open on dashboard and see it as the first menu item', () => {
  const source = readFileSync(new URL('../src/client/App.svelte', import.meta.url), 'utf8')
  const sidebar = readFileSync(new URL('../src/client/components/AppSidebar.svelte', import.meta.url), 'utf8')
  expect(source).toContain("if (path === '/') navigate(actor.role === 'admin' ? '/dashboard' : '/pos')")
  expect(sidebar.indexOf("url: '/dashboard'")).toBeLessThan(sidebar.indexOf("url: '/pos'"))
})

test('authenticated shell uses theme tokens and a responsive content frame', () => {
  const source = readFileSync(new URL('../src/client/App.svelte', import.meta.url), 'utf8')
  expect(source).toContain('<Sidebar.Provider>')
  expect(source).toContain('<Sidebar.Inset class="min-w-0">')
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

test('POS keeps its checkout workspace responsive', () => {
  const source = route('Pos')
  expect(source).toContain('xl:grid-cols-2')
  expect(source).toContain('Catalogue')
  expect(source).toContain('<h1 class="text-2xl font-semibold tracking-tight">New sale</h1>')
  expect(source).toContain('<h2 class="text-2xl font-semibold tracking-tight">Checkout</h2>')
  expect(source).not.toContain('Build the order, choose a customer, and take payment.')
})

test('Cart uses an accessible remove icon', () => {
  const source = readFileSync(new URL('../src/client/components/Cart.svelte', import.meta.url), 'utf8')
  expect(source).toContain("import Trash2 from '@lucide/svelte/icons/trash-2'")
  expect(source).toContain('size="icon-sm" aria-label={`Remove ${item.name}`}')
  expect(source).toContain('<Trash2 />')
})

test('Expenses filters its full-width table and paginates ten rows at a time', () => {
  const source = route('Expenses')
  expect(source).toContain('const pageSize = 10')
  expect(source).toContain('expense.expenseNumber, expense.categoryName, expense.transactionDate, expense.notes ??')
  expect(source).toContain('filteredExpenses.slice((page - 1) * pageSize, page * pageSize)')
  expect(source).toContain('oninput={() => page = 1}')
  expect(source).toContain('{#each pagedExpenses as expense (expense.id)}')
  expect(source).toContain('<Table.Caption>No data available</Table.Caption>')
  expect(source).toContain('>Previous</Button>')
  expect(source).toContain('>Next</Button>')
})

test('Expenses creates records from a dialog', () => {
  const source = route('Expenses')
  expect(source).toContain('creationDialogOpen = true')
  expect(source).toContain('>New expense</Button>')
  expect(source).toContain('<Dialog.Root bind:open={creationDialogOpen}>')
  expect(source).toContain('<Dialog.Title>New expense</Dialog.Title>')
  expect(source.indexOf('<Dialog.Root bind:open={creationDialogOpen}>')).toBeLessThan(source.indexOf('<form class="grid gap-4" onsubmit={create}>'))
  expect(source).toContain('creationDialogOpen = false')
})

test('deleted expenses has its own route and keeps Expenses active in the sidebar', () => {
  const app = readFileSync(new URL('../src/client/App.svelte', import.meta.url), 'utf8')
  const sidebar = readFileSync(new URL('../src/client/components/AppSidebar.svelte', import.meta.url), 'utf8')
  expect(app).toContain("path === '/expenses' || path === '/expenses/deleted'")
  expect(app).toContain("path === '/expenses/deleted' ? 'Deleted expenses' : 'Expenses'")
  expect(app).toContain('<Expenses {actor} deleted={path === \'/expenses/deleted\'} {navigate} />')
  expect(sidebar).toContain("item.url === '/expenses' && path.startsWith('/expenses/')")
})

test('Expenses separates active and deleted rows and puts Details in actions', () => {
  const source = route('Expenses')
  expect(source).toContain('Boolean(expense.deletedAt) === deleted')
  expect(source).toContain('View deleted expenses</Button>')
  expect(source).toContain('Back to expenses</Button>')
  expect(source).toContain('<strong>{expense.expenseNumber}</strong>')
  expect(source).toContain('<Button variant="outline" size="sm" onclick={() => details(expense.id)}>Details</Button>')
  expect(source).toContain("{#if actor.role === 'admin' && !deleted}")
})

test('Expense Details opens in the right-side dialog used by Sales', () => {
  const source = route('Expenses')
  expect(source).toContain('<Dialog.Root open={selected !== null} onOpenChange={closeDetails}>')
  expect(source).toContain('data-open:slide-in-from-right')
  expect(source).toContain('<Dialog.Title>{selected.expenseNumber}</Dialog.Title>')
  expect(source).not.toContain('{#if selected}<article')
})

test('Expenses navigation and inline search sit outside and inside the card respectively', () => {
  const source = route('Expenses')
  expect(source.indexOf('View deleted expenses</Button>')).toBeLessThan(source.indexOf('<Card>'))
  expect(source.indexOf('Back to expenses</Button>')).toBeLessThan(source.indexOf('<Card>'))
  expect(source).toContain('<CardHeader class="flex flex-row flex-wrap items-center justify-between gap-4">')
  expect(source).toContain('<div class="flex flex-wrap items-center gap-3"><Label for="expense-search">Search expenses</Label><Input id="expense-search"')
  expect(source).not.toContain('<CardTitle>')
})

test.each(['Sales', 'Expenses'])('%s has a history workspace header', (name) => {
  const source = route(name)
  expect(source).toContain('text-3xl font-semibold tracking-tight')
  expect(source).toContain('gap-6')
})

test('settings has a responsive administration workspace', () => {
  const source = route('Settings')
  expect(source).toContain("section === 'catalog' ? 'Catalog' : section === 'team' ? 'Team' : 'Store'")
  expect(source).toContain('<Tabs.Trigger value="products">Products</Tabs.Trigger>')
  expect(source).toContain('<Tabs.Trigger value="customers">Customers</Tabs.Trigger>')
  expect(source).toContain('<Tabs.Trigger value="categories">Expense categories</Tabs.Trigger>')
  expect(source).toContain('<Tabs.Trigger value="users">Users</Tabs.Trigger>')
  expect(source).toContain('<Tabs.Trigger value="telegram">Telegram staff links</Tabs.Trigger>')
  expect(source).toContain('<Tabs.Trigger value="profile">Store profile</Tabs.Trigger>')
  expect(source).toContain('<Dialog.Title>{productForm.id ? \'Edit product\' : \'New product\'}</Dialog.Title>')
  expect(source).toContain('<Dialog.Title>{customerForm.id ? \'Edit customer\' : \'New customer\'}</Dialog.Title>')
  expect(source).toContain('<Dialog.Title>{categoryForm.id ? \'Edit category\' : \'New category\'}</Dialog.Title>')
  expect(source).toContain('<Dialog.Title>New user</Dialog.Title>')
  expect(source).toContain('<Dialog.Title>Link Telegram user</Dialog.Title>')
})

test('settings submenu names appear in the workspace header', () => {
  const source = readFileSync(new URL('../src/client/App.svelte', import.meta.url), 'utf8')
  expect(source).toContain("const settingsTitles: Record<string, string> = { catalog: 'Catalog', team: 'Team', store: 'Store' }")
  expect(source).toContain("path.startsWith('/settings') ? (settingsTitles[path.split('/')[2]] ?? 'Catalog')")
})

test('empty settings tables show a no-data caption', () => {
  const source = route('Settings')
  for (const list of ['products', 'customers', 'categories', 'users', 'telegramLinks']) {
    expect(source).toContain(`<Table.Root>{#if !${list}.length}<Table.Caption>No data available</Table.Caption>{/if}`)
  }
})

// Exercise the real route handlers without mounting the UI; only the API boundary is replaced.
function settings(api: (path: string, options?: RequestInit) => Promise<unknown>) {
  const source = route('Settings')
  const script = parse(source).instance!.content.body
    .filter((node) => node.type !== 'ImportDeclaration' && node.type !== 'ExportNamedDeclaration')
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
