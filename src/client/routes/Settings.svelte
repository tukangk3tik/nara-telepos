<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from '../lib/api'

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
  let linkedUserId = 0
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

  async function adjustStock(product: Product) {
    const quantityDelta = Number(prompt(`Adjust stock for ${product.name} (use a negative number to reduce):`))
    if (!quantityDelta) return
    try {
      await api<Product>(`/api/products/${product.id}/stock-adjustments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quantityDelta }) })
      message = 'Stock adjusted'; await load()
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not adjust stock' }
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
      await api<TelegramLink>('/api/settings/telegram-staff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: linkedUserId, telegramUserId }) })
      telegramUserId = ''; message = 'Telegram user linked'; await load()
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not link Telegram user' }
  }

  async function updateLink(link: TelegramLink, isActive: boolean) {
    try { await api<TelegramLink>(`/api/settings/telegram-staff/${link.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ isActive }) }); await load() }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Could not update Telegram link' }
  }

  async function removeLink(id: number) {
    if (!confirm('Remove this Telegram link?')) return
    try { await api<void>(`/api/settings/telegram-staff/${id}`, { method: 'DELETE' }); await load() }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Could not remove Telegram link' }
  }

  async function saveProfile(event: SubmitEvent) {
    event.preventDefault()
    try { profile = await api<Profile>('/api/settings/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile) }); message = 'Store profile saved' }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Could not save store profile' }
  }

  onMount(() => { void load() })
</script>

<h1>Settings</h1>
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if message}<p class="success" role="status">{message}</p>{/if}

<div class="settings-grid">
  <section class="card"><h2>Products</h2>
    <form onsubmit={saveProduct} class="compact-form">
      <label>Name <input bind:value={productForm.name} required /></label><label>SKU <input bind:value={productForm.sku} required /></label><label>Barcode <input bind:value={productForm.barcode} /></label>
      <label>Price (IDR) <input type="number" min="0" step="1" bind:value={productForm.salePrice} required /></label>{#if productForm.id}<p class="muted">Use “Adjust stock” below; every change is audited.</p>{:else}<label>Opening stock <input type="number" min="0" step="1" bind:value={productForm.stockQuantity} required /></label>{/if}
      <label><input type="checkbox" bind:checked={productForm.isActive} /> Active</label><button>{productForm.id ? 'Update product' : 'Add product'}</button>{#if productForm.id}<button class="secondary" type="button" onclick={() => productForm = newProduct()}>New</button>{/if}
    </form>
    <ul class="record-list">{#each products as product (product.id)}<li><span>{product.name} · {product.sku} · {product.stockQuantity}</span><button class="secondary" onclick={() => productForm = { ...product, barcode: product.barcode ?? '' }}>Edit</button><button class="secondary" onclick={() => adjustStock(product)}>Adjust stock</button></li>{/each}</ul>
  </section>

  <section class="card"><h2>Customers</h2>
    <form onsubmit={saveCustomer} class="compact-form"><label>Name <input bind:value={customerForm.name} required /></label><label>Phone <input bind:value={customerForm.phone} /></label><label>Email <input type="email" bind:value={customerForm.email} /></label><button>{customerForm.id ? 'Update customer' : 'Add customer'}</button>{#if customerForm.id}<button class="secondary" type="button" onclick={() => customerForm = newCustomer()}>New</button>{/if}</form>
    <ul class="record-list">{#each customers as customer (customer.id)}<li><span>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</span><button class="secondary" onclick={() => customerForm = { ...customer, phone: customer.phone ?? '', email: customer.email ?? '' }}>Edit</button></li>{/each}</ul>
  </section>

  <section class="card"><h2>Expense categories</h2>
    <form onsubmit={saveCategory} class="compact-form"><label>Name <input bind:value={categoryForm.name} required /></label><label><input type="checkbox" bind:checked={categoryForm.isActive} /> Active</label><button>{categoryForm.id ? 'Update category' : 'Add category'}</button>{#if categoryForm.id}<button class="secondary" type="button" onclick={() => categoryForm = newCategory()}>New</button>{/if}</form>
    <ul class="record-list">{#each categories as category (category.id)}<li><span>{category.name} · {category.isActive ? 'Active' : 'Inactive'}</span><button class="secondary" onclick={() => categoryForm = { ...category }}>Edit</button></li>{/each}</ul>
  </section>

  <section class="card"><h2>Store profile</h2><form onsubmit={saveProfile} class="compact-form"><label>Store name <input bind:value={profile.storeName} required /></label><label>Receipt footer <textarea bind:value={profile.receiptFooter}></textarea></label><button>Save profile</button></form></section>

  <section class="card"><h2>Users</h2>
    <form onsubmit={saveUser} class="compact-form"><label>Name <input bind:value={userForm.name} required /></label><label>Email <input type="email" bind:value={userForm.email} required /></label><label>Password <input type="password" bind:value={userForm.password} required /></label><label>Role <select bind:value={userForm.role}><option value="cashier">Cashier</option><option value="admin">Admin</option></select></label><button>Add user</button></form>
    <ul class="record-list">{#each users as user (user.id)}<li><span>{user.name} · {user.email}</span><select value={user.role} onchange={(event) => setRole(user, event.currentTarget.value === 'admin' ? 'admin' : 'cashier')}><option value="cashier">Cashier</option><option value="admin">Admin</option></select></li>{/each}</ul>
  </section>

  <section class="card"><h2>Telegram staff links</h2>
    <form onsubmit={linkTelegram} class="compact-form"><label>User <select bind:value={linkedUserId} required><option value={0} disabled>Select user</option>{#each users as user}<option value={user.id}>{user.name}</option>{/each}</select></label><label>Telegram user ID <input bind:value={telegramUserId} inputmode="numeric" required /></label><button>Link Telegram user</button></form>
    <ul class="record-list">{#each telegramLinks as link (link.id)}<li><span>{link.name} · {link.telegramUserId} · {link.isActive ? 'Active' : 'Inactive'}</span><button class="secondary" onclick={() => updateLink(link, !link.isActive)}>{link.isActive ? 'Deactivate' : 'Activate'}</button><button class="danger" onclick={() => removeLink(link.id)}>Unlink</button></li>{/each}</ul>
  </section>
</div>
