<script lang="ts">
  import { onMount } from 'svelte'
  import Cart, { type CartLine } from '../components/Cart.svelte'
  import CustomerForm from '../components/CustomerForm.svelte'
  import { api } from '../lib/api'
  import { Alert } from '$lib/components/ui/alert/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import * as Select from '$lib/components/ui/select/index.js'
  import * as Table from '$lib/components/ui/table/index.js'

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
  let saleDialogOpen = false

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

  function openSaleConfirmation() {
    if (!cart.length) return
    saleDialogOpen = true
  }

  async function confirmSale() {
    if (!cart.length) return
    error = ''
    submitting = true
    try {
      receipt = await api<Receipt>('/api/sales', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: cart.map(({ id, quantity }) => ({ productId: id, quantity })), customerId: customer?.id, paymentMethod }),
      })
      saleDialogOpen = false
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

<div class="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,.9fr)]">
  <Card>
    <CardHeader><CardTitle><h1>New sale</h1></CardTitle></CardHeader>
    <CardContent class="grid gap-4">
      <div class="grid gap-2">
        <Label for="product-search">Search products</Label>
        <Input id="product-search" bind:value={query} oninput={search} placeholder="Name, SKU, or barcode" />
      </div>
      <Table.Root>
        <Table.Header><Table.Row><Table.Head>Product</Table.Head><Table.Head>Stock</Table.Head><Table.Head class="text-right">Price</Table.Head><Table.Head><span class="sr-only">Actions</span></Table.Head></Table.Row></Table.Header>
        <Table.Body>{#each products as product (product.id)}
          <Table.Row><Table.Cell class="whitespace-normal"><div class="grid gap-1"><strong>{product.name}</strong><span class="text-muted-foreground text-sm">{product.sku}</span></div></Table.Cell><Table.Cell><Badge variant={product.stockQuantity ? 'secondary' : 'destructive'}>{product.stockQuantity} in stock</Badge></Table.Cell><Table.Cell class="text-right font-medium">{rupiah(product.salePrice)}</Table.Cell><Table.Cell><Button disabled={!product.stockQuantity} onclick={() => add(product)}>Add</Button></Table.Cell></Table.Row>
        {/each}</Table.Body>
      </Table.Root>
    </CardContent>
  </Card>

  <div class="grid content-start gap-4">
    <Cart items={cart} onQuantity={changeQuantity} onRemove={(id) => cart = cart.filter((item) => item.id !== id)} />
    <CustomerForm onSelect={(selected) => customer = selected} />
    {#if customer}
      <Card><CardContent class="flex items-center justify-between gap-3"><p>Customer: <strong>{customer.name}</strong></p><Button variant="ghost" size="sm" onclick={() => customer = null}>Clear</Button></CardContent></Card>
    {/if}
    <Card>
      <CardHeader><CardTitle><h2>Payment</h2></CardTitle></CardHeader>
      <CardContent class="grid gap-4">
        <div class="grid gap-2">
          <div class="flex items-center justify-between gap-2"><Label for="payment-method">Payment method</Label><Badge variant="secondary">{paymentMethod.toUpperCase()}</Badge></div>
          <Select.Root type="single" bind:value={paymentMethod}>
            <Select.Trigger id="payment-method" class="w-full"><Select.Value /></Select.Trigger>
            <Select.Content><Select.Item value="cash">Cash</Select.Item><Select.Item value="transfer">Transfer</Select.Item><Select.Item value="qris">QRIS</Select.Item></Select.Content>
          </Select.Root>
        </div>
        <Button disabled={!cart.length || submitting} onclick={openSaleConfirmation}>{submitting ? 'Saving…' : 'Confirm payment'}</Button>
        {#if error && !saleDialogOpen}<Alert variant="destructive" role="alert">{error}</Alert>{/if}
      </CardContent>
    </Card>
  </div>
</div>

<Dialog.Root bind:open={saleDialogOpen}>
  <Dialog.Content showCloseButton={!submitting}>
    <Dialog.Header>
      <Dialog.Title>Confirm payment</Dialog.Title>
      <Dialog.Description>Complete this {paymentMethod.toUpperCase()} payment for {rupiah(cart.reduce((sum, item) => sum + item.salePrice * item.quantity, 0))}?</Dialog.Description>
    </Dialog.Header>
    {#if error}<Alert variant="destructive" role="alert">{error}</Alert>{/if}
    <Dialog.Footer>
      <Dialog.Close disabled={submitting}>
        {#snippet child({ props })}
          <Button variant="outline" disabled={submitting} {...props}>Cancel</Button>
        {/snippet}
      </Dialog.Close>
      <Button disabled={submitting} onclick={confirmSale}>{submitting ? 'Saving…' : 'Complete sale'}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

{#if receipt}
  <Card class="mt-4 max-w-2xl">
    <CardHeader><CardTitle><h2>Receipt</h2></CardTitle></CardHeader>
    <CardContent class="grid gap-4">
      <p class="flex flex-wrap items-center gap-2"><strong>{receipt.invoiceNumber}</strong><Badge variant="secondary">{receipt.paymentMethod}</Badge></p>
      <Table.Root>
        <Table.Header><Table.Row><Table.Head>Product</Table.Head><Table.Head class="text-right">Quantity</Table.Head><Table.Head class="text-right">Total</Table.Head></Table.Row></Table.Header>
        <Table.Body>{#each receipt.lines as line}<Table.Row><Table.Cell class="font-medium whitespace-normal">{line.productName}</Table.Cell><Table.Cell class="text-right">{line.quantity}</Table.Cell><Table.Cell class="text-right font-medium">{rupiah(line.lineTotal)}</Table.Cell></Table.Row>{/each}</Table.Body>
      </Table.Root>
      <p class="flex justify-between border-t-2 pt-3">Total <strong>{rupiah(receipt.totalAmount)}</strong></p>
    </CardContent>
  </Card>
{/if}
