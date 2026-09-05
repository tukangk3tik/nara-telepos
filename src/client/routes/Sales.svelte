<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from '../lib/api'

  type Actor = { id: number; role: 'admin' | 'cashier' }
  type Sale = { id: number; invoiceNumber: string; totalAmount: number; paymentMethod: string; completedAt: string; cancelledAt: string | null; cancellationReason: string | null }
  type SaleDetail = Sale & { customerId: number | null; items: Array<{ id: number; productName: string; sku: string; quantity: number; unitPrice: number; lineTotal: number }> }

  export let actor: Actor
  export let saleId: number | null = null

  const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
  let sales: Sale[] = []
  let selected: SaleDetail | null = null
  let error = ''

  async function load() {
    try {
      sales = await api<Sale[]>('/api/sales')
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load sales'
    }
  }

  async function details(id: number) {
    try {
      selected = await api<SaleDetail>(`/api/sales/${id}`)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load sale details'
    }
  }

  async function cancel(sale: Sale) {
    const reason = prompt(`Cancel ${sale.invoiceNumber}. Reason:`)
    if (!reason) return
    try {
      await api<void>(`/api/sales/${sale.id}/cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) })
      selected = null
      await load()
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not cancel sale'
    }
  }

  onMount(() => {
    void load()
    if (saleId !== null) void details(saleId)
  })
</script>

<section class="card">
  <h1>Sales history</h1>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="table-wrap"><table>
    <thead><tr><th>Invoice</th><th>Completed</th><th>Payment</th><th>Total</th><th></th></tr></thead>
    <tbody>{#each sales as sale (sale.id)}
      <tr class:cancelled={Boolean(sale.cancelledAt)}>
        <td>{sale.invoiceNumber}{#if sale.cancelledAt}<small>Cancelled: {sale.cancellationReason}</small>{/if}</td>
        <td>{new Date(sale.completedAt).toLocaleString()}</td><td>{sale.paymentMethod}</td><td>{rupiah(sale.totalAmount)}</td>
        <td><button class="secondary" onclick={() => details(sale.id)}>Details</button>{#if actor.role === 'admin' && !sale.cancelledAt}<button class="danger" onclick={() => cancel(sale)}>Cancel</button>{/if}</td>
      </tr>
    {/each}</tbody>
  </table></div>
</section>

{#if selected}
  <section class="card">
    <h2>{selected.invoiceNumber}</h2>
    <p>{selected.paymentMethod} · {rupiah(selected.totalAmount)}</p>
    <ul class="line-list">{#each selected.items as item (item.id)}<li><span>{item.productName} ({item.sku}) × {item.quantity}</span><strong>{rupiah(item.lineTotal)}</strong></li>{/each}</ul>
    {#if selected.cancelledAt}<p class="error">Cancelled: {selected.cancellationReason}</p>{/if}
  </section>
{/if}
