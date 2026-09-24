<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from '../lib/api'
  import { cancellationReason } from '../lib/dialog-validation'
  import { Alert } from '$lib/components/ui/alert/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import * as Table from '$lib/components/ui/table/index.js'

  type Actor = { id: number; role: 'admin' | 'cashier' }
  type Sale = { id: number; invoiceNumber: string; totalAmount: number; paymentMethod: string; completedAt: string; cancelledAt: string | null; cancellationReason: string | null }
  type SaleDetail = Sale & { customerId: number | null; items: Array<{ id: number; productName: string; sku: string; quantity: number; unitPrice: number; lineTotal: number }> }

  export let actor: Actor
  export let saleId: number | null = null

  const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
  let sales: Sale[] = []
  let selected: SaleDetail | null = null
  let saleToCancel: Sale | null = null
  let cancelReason = ''
  let cancellationDialogOpen = false
  let error = ''
  let cancelling = false

  async function load() {
    try {
      sales = await api<Sale[]>('/api/sales')
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load sales'
    }
  }

  async function details(id: number) {
    try {
      error = ''
      selected = await api<SaleDetail>(`/api/sales/${id}`)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load sale details'
    }
  }

  function closeDetails(open: boolean) {
    if (open) return
    selected = null
    if (saleId !== null) {
      history.replaceState({}, '', '/sales')
      dispatchEvent(new PopStateEvent('popstate'))
    }
  }

  function openCancellation(sale: Sale) {
    error = ''
    saleToCancel = sale
    cancelReason = ''
    cancellationDialogOpen = true
  }

  async function cancel() {
    if (!saleToCancel || cancelling) return
    const reason = cancellationReason(cancelReason)
    if (!reason) {
      error = 'A cancellation reason is required.'
      return
    }
    error = ''
    cancelling = true
    try {
      await api<void>(`/api/sales/${saleToCancel.id}/cancel`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      closeDetails(false)
      cancellationDialogOpen = false
      saleToCancel = null
      await load()
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not cancel sale'
    } finally {
      cancelling = false
    }
  }

  onMount(() => {
    void load()
    if (saleId !== null) void details(saleId)
  })
</script>

<div class="grid gap-6">
  <Card>
    <CardHeader><CardTitle><h1 class="text-3xl font-semibold tracking-tight">Sales history</h1></CardTitle><p class="text-sm text-muted-foreground">Review completed sales and open their receipts.</p></CardHeader>
    <CardContent class="grid gap-4">
      {#if error}<Alert variant="destructive" onClose={() => error = ''}>{error}</Alert>{/if}
      <Table.Root>
        <Table.Header><Table.Row><Table.Head>Invoice</Table.Head><Table.Head>Completed</Table.Head><Table.Head>Payment</Table.Head><Table.Head>Total</Table.Head><Table.Head><span class="sr-only">Actions</span></Table.Head></Table.Row></Table.Header>
        <Table.Body>{#each sales as sale (sale.id)}
          <Table.Row class={sale.cancelledAt ? 'opacity-60' : undefined}>
            <Table.Cell class="whitespace-normal"><div class="grid gap-1"><strong>{sale.invoiceNumber}</strong>{#if sale.cancelledAt}<span class="text-destructive text-xs">Cancelled: {sale.cancellationReason}</span>{/if}</div></Table.Cell>
            <Table.Cell>{new Date(sale.completedAt).toLocaleString()}</Table.Cell><Table.Cell><Badge variant="secondary">{sale.paymentMethod}</Badge></Table.Cell><Table.Cell>{rupiah(sale.totalAmount)}</Table.Cell>
            <Table.Cell><div class="flex gap-2"><Button variant="outline" size="sm" onclick={() => details(sale.id)}>Details</Button>{#if actor.role === 'admin' && !sale.cancelledAt}<Button variant="destructive" size="sm" onclick={() => openCancellation(sale)}>Cancel</Button>{/if}</div></Table.Cell>
          </Table.Row>
        {/each}</Table.Body>
      </Table.Root>
    </CardContent>
  </Card>

</div>

<Dialog.Root open={selected !== null} onOpenChange={closeDetails}>
  <Dialog.Content class="top-0 right-0 left-auto h-dvh w-full max-w-full content-start overflow-y-auto rounded-none p-6 translate-x-0 translate-y-0 data-open:slide-in-from-right data-closed:slide-out-to-right data-open:zoom-in-100 data-closed:zoom-out-100 sm:max-w-xl">
    {#if selected}
      <Dialog.Header>
        <Dialog.Title>{selected.invoiceNumber}</Dialog.Title>
        <Dialog.Description>Completed {new Date(selected.completedAt).toLocaleString()}</Dialog.Description>
      </Dialog.Header>
      <div class="grid gap-4">
        <p class="flex flex-wrap items-center gap-2"><Badge variant="secondary">{selected.paymentMethod}</Badge><strong>{rupiah(selected.totalAmount)}</strong></p>
        <Table.Root>
          <Table.Header><Table.Row><Table.Head>Product</Table.Head><Table.Head>SKU</Table.Head><Table.Head class="text-right">Quantity</Table.Head><Table.Head class="text-right">Total</Table.Head></Table.Row></Table.Header>
          <Table.Body>{#each selected.items as item (item.id)}<Table.Row><Table.Cell class="font-medium whitespace-normal">{item.productName}</Table.Cell><Table.Cell>{item.sku}</Table.Cell><Table.Cell class="text-right">{item.quantity}</Table.Cell><Table.Cell class="text-right font-medium">{rupiah(item.lineTotal)}</Table.Cell></Table.Row>{/each}</Table.Body>
        </Table.Root>
        {#if selected.cancelledAt}<Alert variant="destructive">Cancelled: {selected.cancellationReason}</Alert>{/if}
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={cancellationDialogOpen}>
  <Dialog.Content showCloseButton={!cancelling}>
    <Dialog.Header>
      <Dialog.Title>Cancel {saleToCancel?.invoiceNumber}</Dialog.Title>
      <Dialog.Description>This cannot be undone. Add a reason before cancelling the sale.</Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-2">
      <label for="cancellation-reason" class="font-medium">Cancellation reason</label>
      <Input id="cancellation-reason" bind:value={cancelReason} disabled={cancelling} aria-invalid={Boolean(error)} />
      {#if error}<Alert variant="destructive" onClose={() => error = ''}>{error}</Alert>{/if}
    </div>
    <Dialog.Footer>
      <Dialog.Close disabled={cancelling}>
        {#snippet child({ props })}
          <Button variant="outline" disabled={cancelling} {...props}>Keep sale</Button>
        {/snippet}
      </Dialog.Close>
      <Button variant="destructive" disabled={cancelling} onclick={cancel}>{cancelling ? 'Cancelling…' : 'Cancel sale'}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
