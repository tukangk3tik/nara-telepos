<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from '../lib/api'
  import { stockAdjustment } from '../lib/dialog-validation'
  import { Alert } from '$lib/components/ui/alert/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import * as Select from '$lib/components/ui/select/index.js'
  import * as Table from '$lib/components/ui/table/index.js'
  import * as Tabs from '$lib/components/ui/tabs/index.js'
  import { Textarea } from '$lib/components/ui/textarea/index.js'

  type Product = { id: number; name: string; sku: string; barcode: string | null; salePrice: number; stockQuantity: number; isActive: boolean }
  type Customer = { id: number; name: string; phone: string | null; email: string | null }
  type Category = { id: number; name: string; isActive: boolean }
  type User = { id: number; name: string; email: string; role: 'admin' | 'cashier' }
  type TelegramLink = { id: number; userId: number; telegramUserId: number; isActive: boolean; name: string; email: string; role: string }
  type Profile = { storeName: string; receiptFooter: string }

  const newProduct = () => ({ id: 0, name: '', sku: '', barcode: '', salePrice: 0, stockQuantity: 0, isActive: true })
  const newCustomer = () => ({ id: 0, name: '', phone: '', email: '' })
  const newCategory = () => ({ id: 0, name: '', isActive: true })
  const newUser = () => ({ name: '', email: '', password: '', role: 'cashier' as 'admin' | 'cashier' })
  const telegramErrorMessages: Record<string, string> = {
    TELEGRAM_UNAVAILABLE: 'Telegram is unavailable',
    TELEGRAM_NOT_CONFIGURED: 'Telegram bot is not configured',
  }

  let products: Product[] = []
  let customers: Customer[] = []
  let categories: Category[] = []
  let users: User[] = []
  let telegramLinks: TelegramLink[] = []
  let profile: Profile = { storeName: '', receiptFooter: '' }
  let productForm = newProduct()
  let customerForm = newCustomer()
  let categoryForm = newCategory()
  let userForm = newUser()
  let telegramUserId = ''
  let linkedUserId = ''
  let stockToAdjust: Product | null = null
  let quantityDelta = ''
  let adjustmentReason = ''
  let stockDialogOpen = false
  let adjustingStock = false
  let linkToRemove: TelegramLink | null = null
  let unlinkDialogOpen = false
  let telegramChecking = false
  let error = ''
  let message = ''

  async function load() {
    try {
      [products, customers, categories, users, telegramLinks, profile] = await Promise.all([
        api<Product[]>('/api/products?all=true'), api<Customer[]>('/api/customers'), api<Category[]>('/api/settings/expense-categories'),
        api<User[]>('/api/settings/users'), api<TelegramLink[]>('/api/settings/telegram-staff'), api<Profile>('/api/settings/profile'),
      ])
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load settings'
    }
  }

  async function saveProduct(event: SubmitEvent) {
    event.preventDefault()
    try {
      await api<Product>(productForm.id ? `/api/products/${productForm.id}` : '/api/products', { method: productForm.id ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(productForm) })
      productForm = newProduct(); message = 'Product saved'; await load()
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not save product' }
  }

  function openStockDialog(product: Product) {
    if (adjustingStock) return
    error = ''
    stockToAdjust = product
    quantityDelta = ''
    adjustmentReason = ''
    stockDialogOpen = true
  }

  function resetStockDialog() {
    stockToAdjust = null
    quantityDelta = ''
    adjustmentReason = ''
  }

  function setStockDialogOpen(open: boolean) {
    stockDialogOpen = open
    if (!open) resetStockDialog()
  }

  async function adjustStock() {
    if (!stockToAdjust || adjustingStock) return
    const result = stockAdjustment({ quantityDelta, reason: adjustmentReason })
    if (!result) {
      error = adjustmentReason.trim() ? 'Enter a non-zero whole-number stock adjustment' : 'Stock adjustment reason is required'
      return
    }
    error = ''
    adjustingStock = true
    try {
      await api<Product>(`/api/products/${stockToAdjust.id}/stock-adjustments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quantityDelta: result.quantityDelta, reason: result.reason }) })
      message = 'Stock adjusted'; setStockDialogOpen(false); await load()
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not adjust stock' }
    finally { adjustingStock = false }
  }

  async function saveCustomer(event: SubmitEvent) {
    event.preventDefault()
    try {
      await api<Customer>(customerForm.id ? `/api/customers/${customerForm.id}` : '/api/customers', { method: customerForm.id ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(customerForm) })
      customerForm = newCustomer(); message = 'Customer saved'; await load()
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not save customer' }
  }

  async function saveCategory(event: SubmitEvent) {
    event.preventDefault()
    try {
      await api<Category>(categoryForm.id ? `/api/settings/expense-categories/${categoryForm.id}` : '/api/settings/expense-categories', { method: categoryForm.id ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(categoryForm) })
      categoryForm = newCategory(); message = 'Category saved'; await load()
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not save category' }
  }

  async function saveUser(event: SubmitEvent) {
    event.preventDefault()
    try {
      await api<User>('/api/settings/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(userForm) })
      userForm = newUser(); message = 'User saved'; await load()
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not save user' }
  }

  async function setRole(user: User, role: 'admin' | 'cashier') {
    try { await api<User>(`/api/settings/users/${user.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role }) }); await load() }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Could not update role' }
  }

  async function linkTelegram(event: SubmitEvent) {
    event.preventDefault()
    try {
      await api<TelegramLink>('/api/settings/telegram-staff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: Number(linkedUserId), telegramUserId }) })
      telegramUserId = ''; message = 'Telegram user linked'; await load()
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not link Telegram user' }
  }

  async function updateLink(link: TelegramLink, isActive: boolean) {
    try { await api<TelegramLink>(`/api/settings/telegram-staff/${link.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ isActive }) }); await load() }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Could not update Telegram link' }
  }

  async function checkTelegram() {
    if (telegramChecking) return
    telegramChecking = true
    error = ''
    message = ''
    try {
      await api<{ ok: true }>('/api/settings/telegram/check', { method: 'POST' })
      message = 'Telegram connection OK'
    } catch (cause) {
      error = cause instanceof Error ? telegramErrorMessages[cause.message] ?? cause.message : 'Could not check Telegram connection'
    } finally {
      telegramChecking = false
    }
  }

  function openUnlinkDialog(link: TelegramLink) {
    error = ''
    linkToRemove = link
    unlinkDialogOpen = true
  }

  function setUnlinkDialogOpen(open: boolean) {
    unlinkDialogOpen = open
    if (!open) linkToRemove = null
  }

  async function removeLink() {
    if (!linkToRemove) return
    try {
      await api<void>(`/api/settings/telegram-staff/${linkToRemove.id}`, { method: 'DELETE' })
      setUnlinkDialogOpen(false); await load()
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not remove Telegram link' }
  }

  async function saveProfile(event: SubmitEvent) {
    event.preventDefault()
    try { profile = await api<Profile>('/api/settings/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile) }); message = 'Store profile saved' }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Could not save store profile' }
  }

  onMount(() => { void load() })
</script>

<div class="grid gap-6">
  <div><h1 class="text-3xl font-semibold tracking-tight">Settings</h1><p class="text-muted-foreground">Manage catalogue, staff, and store settings.</p></div>
  {#if message}<Alert variant="success" role="status" onClose={() => message = ''}>{message}</Alert>{/if}
  {#if error && !stockDialogOpen && !unlinkDialogOpen}<Alert variant="destructive" onClose={() => error = ''}>{error}</Alert>{/if}

  <Tabs.Root value="catalog" class="gap-6">
    <Tabs.List class="w-full justify-start sm:w-fit">
      <Tabs.Trigger value="catalog">Catalog</Tabs.Trigger>
      <Tabs.Trigger value="team">Team</Tabs.Trigger>
      <Tabs.Trigger value="store">Store</Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value="catalog">
      <div class="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle><h2>Products</h2></CardTitle></CardHeader>
          <CardContent class="grid gap-4">
            <form onsubmit={saveProduct} class="grid gap-4">
              <div class="grid gap-2"><Label for="product-name">Name</Label><Input id="product-name" bind:value={productForm.name} required /></div>
              <div class="grid gap-2"><Label for="product-sku">SKU</Label><Input id="product-sku" bind:value={productForm.sku} required /></div>
              <div class="grid gap-2"><Label for="product-barcode">Barcode</Label><Input id="product-barcode" bind:value={productForm.barcode} /></div>
              <div class="grid gap-2"><Label for="product-price">Price (IDR)</Label><Input id="product-price" type="number" min="0" step="1" bind:value={productForm.salePrice} required /></div>
              {#if productForm.id}<p class="text-muted-foreground text-sm">Use “Adjust stock” below; every change is audited.</p>{:else}<div class="grid gap-2"><Label for="product-stock">Opening stock</Label><Input id="product-stock" type="number" min="0" step="1" bind:value={productForm.stockQuantity} required /></div>{/if}
              <Label class="flex items-center gap-2"><input type="checkbox" bind:checked={productForm.isActive} /> Active</Label>
              <div class="flex flex-wrap gap-2"><Button type="submit">{productForm.id ? 'Update product' : 'Add product'}</Button>{#if productForm.id}<Button variant="outline" type="button" onclick={() => productForm = newProduct()}>New</Button>{/if}</div>
            </form>
            <Table.Root><Table.Header><Table.Row><Table.Head>Product</Table.Head><Table.Head>SKU</Table.Head><Table.Head class="text-right">Stock</Table.Head><Table.Head><span class="sr-only">Actions</span></Table.Head></Table.Row></Table.Header><Table.Body>{#each products as product (product.id)}<Table.Row><Table.Cell class="font-medium whitespace-normal">{product.name}</Table.Cell><Table.Cell>{product.sku}</Table.Cell><Table.Cell class="text-right">{product.stockQuantity}</Table.Cell><Table.Cell><div class="flex gap-2"><Button variant="outline" size="sm" onclick={() => productForm = { ...product, barcode: product.barcode ?? '' }}>Edit</Button><Button variant="outline" size="sm" onclick={() => openStockDialog(product)}>Adjust stock</Button></div></Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><h2>Customers</h2></CardTitle></CardHeader>
          <CardContent class="grid gap-4">
            <form onsubmit={saveCustomer} class="grid gap-4"><div class="grid gap-2"><Label for="customer-name">Name</Label><Input id="customer-name" bind:value={customerForm.name} required /></div><div class="grid gap-2"><Label for="customer-phone">Phone</Label><Input id="customer-phone" bind:value={customerForm.phone} /></div><div class="grid gap-2"><Label for="customer-email">Email</Label><Input id="customer-email" type="email" bind:value={customerForm.email} /></div><div class="flex flex-wrap gap-2"><Button type="submit">{customerForm.id ? 'Update customer' : 'Add customer'}</Button>{#if customerForm.id}<Button variant="outline" type="button" onclick={() => customerForm = newCustomer()}>New</Button>{/if}</div></form>
            <Table.Root><Table.Header><Table.Row><Table.Head>Customer</Table.Head><Table.Head>Contact</Table.Head><Table.Head><span class="sr-only">Actions</span></Table.Head></Table.Row></Table.Header><Table.Body>{#each customers as customer (customer.id)}<Table.Row><Table.Cell class="font-medium whitespace-normal">{customer.name}</Table.Cell><Table.Cell class="whitespace-normal">{customer.phone ?? '—'}</Table.Cell><Table.Cell><Button variant="outline" size="sm" onclick={() => customerForm = { ...customer, phone: customer.phone ?? '', email: customer.email ?? '' }}>Edit</Button></Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><h2>Expense categories</h2></CardTitle></CardHeader>
          <CardContent class="grid gap-4">
            <form onsubmit={saveCategory} class="grid gap-4"><div class="grid gap-2"><Label for="category-name">Name</Label><Input id="category-name" bind:value={categoryForm.name} required /></div><Label class="flex items-center gap-2"><input type="checkbox" bind:checked={categoryForm.isActive} /> Active</Label><div class="flex flex-wrap gap-2"><Button type="submit">{categoryForm.id ? 'Update category' : 'Add category'}</Button>{#if categoryForm.id}<Button variant="outline" type="button" onclick={() => categoryForm = newCategory()}>New</Button>{/if}</div></form>
            <Table.Root><Table.Header><Table.Row><Table.Head>Category</Table.Head><Table.Head>Status</Table.Head><Table.Head><span class="sr-only">Actions</span></Table.Head></Table.Row></Table.Header><Table.Body>{#each categories as category (category.id)}<Table.Row><Table.Cell class="font-medium whitespace-normal">{category.name}</Table.Cell><Table.Cell>{category.isActive ? 'Active' : 'Inactive'}</Table.Cell><Table.Cell><Button variant="outline" size="sm" onclick={() => categoryForm = { ...category }}>Edit</Button></Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
          </CardContent>
        </Card>
      </div>
    </Tabs.Content>

    <Tabs.Content value="team">
      <div class="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle><h2>Users</h2></CardTitle></CardHeader>
          <CardContent class="grid gap-4">
            <form onsubmit={saveUser} class="grid gap-4"><div class="grid gap-2"><Label for="user-name">Name</Label><Input id="user-name" bind:value={userForm.name} required /></div><div class="grid gap-2"><Label for="user-email">Email</Label><Input id="user-email" type="email" bind:value={userForm.email} required /></div><div class="grid gap-2"><Label for="user-password">Password</Label><Input id="user-password" type="password" bind:value={userForm.password} required /></div><div class="grid gap-2"><Label for="user-role">Role</Label><Select.Root type="single" bind:value={userForm.role} name="role"><Select.Trigger id="user-role" aria-label="Role" class="w-full"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="cashier">Cashier</Select.Item><Select.Item value="admin">Admin</Select.Item></Select.Content></Select.Root></div><Button type="submit">Add user</Button></form>
            <Table.Root><Table.Header><Table.Row><Table.Head>User</Table.Head><Table.Head>Email</Table.Head><Table.Head>Role</Table.Head></Table.Row></Table.Header><Table.Body>{#each users as user (user.id)}<Table.Row><Table.Cell class="font-medium whitespace-normal">{user.name}</Table.Cell><Table.Cell class="whitespace-normal">{user.email}</Table.Cell><Table.Cell><Select.Root type="single" value={user.role} onValueChange={(role) => setRole(user, role === 'admin' ? 'admin' : 'cashier')}><Select.Trigger aria-label={`Role for ${user.name}`}><Select.Value /></Select.Trigger><Select.Content><Select.Item value="cashier">Cashier</Select.Item><Select.Item value="admin">Admin</Select.Item></Select.Content></Select.Root></Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><h2>Telegram staff links</h2></CardTitle></CardHeader>
          <CardContent class="grid gap-4">
            <Button variant="outline" disabled={telegramChecking} onclick={checkTelegram}>{telegramChecking ? 'Checking…' : 'Check connection'}</Button>
            <form onsubmit={linkTelegram} class="grid gap-4"><div class="grid gap-2"><Label for="telegram-user">User</Label><Select.Root type="single" bind:value={linkedUserId} items={users.map((user) => ({ value: String(user.id), label: user.name }))} name="userId" required><Select.Trigger id="telegram-user" aria-label="User" class="w-full"><Select.Value placeholder="Select user" /></Select.Trigger><Select.Content>{#each users as user}<Select.Item value={String(user.id)} label={user.name} />{/each}</Select.Content></Select.Root></div><div class="grid gap-2"><Label for="telegram-user-id">Telegram user ID</Label><Input id="telegram-user-id" bind:value={telegramUserId} inputmode="numeric" required /></div><Button type="submit">Link Telegram user</Button></form>
            <Table.Root><Table.Header><Table.Row><Table.Head>User</Table.Head><Table.Head>Telegram ID</Table.Head><Table.Head>Status</Table.Head><Table.Head><span class="sr-only">Actions</span></Table.Head></Table.Row></Table.Header><Table.Body>{#each telegramLinks as link (link.id)}<Table.Row><Table.Cell class="font-medium whitespace-normal">{link.name}</Table.Cell><Table.Cell>{link.telegramUserId}</Table.Cell><Table.Cell>{link.isActive ? 'Active' : 'Inactive'}</Table.Cell><Table.Cell><div class="flex gap-2"><Button variant="outline" size="sm" onclick={() => updateLink(link, !link.isActive)}>{link.isActive ? 'Deactivate' : 'Activate'}</Button><Button variant="destructive" size="sm" onclick={() => openUnlinkDialog(link)}>Unlink</Button></div></Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
          </CardContent>
        </Card>
      </div>
    </Tabs.Content>

    <Tabs.Content value="store">
      <Card class="max-w-2xl">
        <CardHeader><CardTitle><h2>Store profile</h2></CardTitle></CardHeader>
        <CardContent><form onsubmit={saveProfile} class="grid gap-4"><div class="grid gap-2"><Label for="store-name">Store name</Label><Input id="store-name" bind:value={profile.storeName} required /></div><div class="grid gap-2"><Label for="receipt-footer">Receipt footer</Label><Textarea id="receipt-footer" bind:value={profile.receiptFooter} /></div><Button type="submit">Save profile</Button></form></CardContent>
      </Card>
    </Tabs.Content>
  </Tabs.Root>
</div>

<Dialog.Root bind:open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
  <Dialog.Content>
    <Dialog.Header><Dialog.Title>Adjust stock for {stockToAdjust?.name}</Dialog.Title><Dialog.Description>Use a negative number to reduce stock. Every change is audited.</Dialog.Description></Dialog.Header>
    <div class="grid gap-4"><div class="grid gap-2"><Label for="stock-quantity-delta">Quantity adjustment</Label><Input id="stock-quantity-delta" type="number" step="1" bind:value={quantityDelta} aria-invalid={Boolean(error)} /></div><div class="grid gap-2"><Label for="stock-adjustment-reason">Reason</Label><Textarea id="stock-adjustment-reason" bind:value={adjustmentReason} aria-invalid={Boolean(error)} /></div>{#if error}<Alert variant="destructive" onClose={() => error = ''}>{error}</Alert>{/if}</div>
    <Dialog.Footer><Dialog.Close>{#snippet child({ props })}<Button variant="outline" {...props}>Cancel</Button>{/snippet}</Dialog.Close><Button disabled={adjustingStock} onclick={adjustStock}>{adjustingStock ? 'Saving…' : 'Adjust stock'}</Button></Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={unlinkDialogOpen} onOpenChange={setUnlinkDialogOpen}>
  <Dialog.Content>
    <Dialog.Header><Dialog.Title>Unlink Telegram user</Dialog.Title><Dialog.Description>Remove the Telegram link for {linkToRemove?.name}? This action cannot be undone.</Dialog.Description></Dialog.Header>
    {#if error}<Alert variant="destructive" onClose={() => error = ''}>{error}</Alert>{/if}
    <Dialog.Footer><Dialog.Close>{#snippet child({ props })}<Button variant="outline" {...props}>Cancel</Button>{/snippet}</Dialog.Close><Button variant="destructive" onclick={removeLink}>Unlink</Button></Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
