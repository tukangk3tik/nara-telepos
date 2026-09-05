<script lang="ts">
  import { onMount } from 'svelte'
  import Cart, { type CartLine } from '../components/Cart.svelte'
  import CustomerForm from '../components/CustomerForm.svelte'
  import { api } from '../lib/api'

  type Product = Omit<CartLine, 'quantity'> & { sku: string; barcode: string | null }
  type Customer = { id: number; name: string; phone: string | null; email: string | null }
  type Receipt = { id: number; invoiceNumber: string; totalAmount: number; paymentMethod: string; customerId: number | null; lines: Array<{ productName: string; quantity: number; unitPrice: number; lineTotal: number }> }

  const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
  let query = ''
  let products: Product[] = []
  let cart: CartLine[] = []
  let customer: Customer | null = null
  let paymentMethod: 'cash' | 'transfer' | 'qris' = 'cash'
  let receipt: Receipt | null = null
  let error = ''
  let submitting = false

  async function search() {
    try {
      products = await api<Product[]>(`/api/products?q=${encodeURIComponent(query)}`)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load products'
    }
  }

  function add(product: Product) {
    const existing = cart.find((item) => item.id === product.id)
    if (existing) {
      if (existing.quantity < product.stockQuantity) cart = cart.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
      return
    }
    if (product.stockQuantity > 0) cart = [...cart, { ...product, quantity: 1 }]
  }

  function changeQuantity(id: number, quantity: number) {
    cart = cart.flatMap((item) => item.id !== id ? [item] : quantity > 0 ? [{ ...item, quantity: Math.min(Math.floor(quantity) || 1, item.stockQuantity) }] : [])
  }

  async function confirmSale() {
    if (!cart.length || !confirm(`Confirm ${rupiah(cart.reduce((sum, item) => sum + item.salePrice * item.quantity, 0))} payment?`)) return
    error = ''
    submitting = true
    try {
      receipt = await api<Receipt>('/api/sales', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: cart.map(({ id, quantity }) => ({ productId: id, quantity })), customerId: customer?.id, paymentMethod }),
      })
      cart = []
      customer = null
      await search()
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not complete sale'
    } finally {
      submitting = false
    }
  }

  onMount(() => { void search() })
</script>

<div class="pos-grid">
  <section class="card">
    <h1>New sale</h1>
    <label>Search products <input bind:value={query} oninput={search} placeholder="Name, SKU, or barcode" /></label>
    <ul class="product-list">
      {#each products as product (product.id)}
        <li>
          <div><strong>{product.name}</strong><small>{product.sku} · {product.stockQuantity} in stock</small></div>
          <strong>{rupiah(product.salePrice)}</strong>
          <button disabled={!product.stockQuantity} onclick={() => add(product)}>Add</button>
        </li>
      {/each}
    </ul>
  </section>

  <div class="stack">
    <Cart items={cart} onQuantity={changeQuantity} onRemove={(id) => cart = cart.filter((item) => item.id !== id)} />
    <CustomerForm onSelect={(selected) => customer = selected} />
    {#if customer}<p class="selected">Customer: <strong>{customer.name}</strong> <button class="secondary" onclick={() => customer = null}>Clear</button></p>{/if}
    <section class="card">
      <label>Payment method
        <select bind:value={paymentMethod}><option value="cash">Cash</option><option value="transfer">Transfer</option><option value="qris">QRIS</option></select>
      </label>
      <button disabled={!cart.length || submitting} onclick={confirmSale}>{submitting ? 'Saving…' : 'Confirm payment'}</button>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </section>
  </div>
</div>

{#if receipt}
  <section class="card receipt">
    <h2>Receipt</h2>
    <p><strong>{receipt.invoiceNumber}</strong> · {receipt.paymentMethod}</p>
    <ul class="line-list">{#each receipt.lines as line}<li><span>{line.productName} × {line.quantity}</span><strong>{rupiah(line.lineTotal)}</strong></li>{/each}</ul>
    <p class="total">Total <strong>{rupiah(receipt.totalAmount)}</strong></p>
  </section>
{/if}
