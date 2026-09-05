<script lang="ts">
  export type CartLine = { id: number; name: string; salePrice: number; stockQuantity: number; quantity: number }

  export let items: CartLine[] = []
  export let onQuantity: (id: number, quantity: number) => void
  export let onRemove: (id: number) => void

  const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
</script>

<section class="card cart">
  <h2>Cart</h2>
  {#if !items.length}
    <p class="muted">Search and add products to start a sale.</p>
  {:else}
    <ul class="line-list">
      {#each items as item (item.id)}
        <li>
          <div><strong>{item.name}</strong><small>{rupiah(item.salePrice)} · {item.stockQuantity} in stock</small></div>
          <label>Qty <input aria-label={`Quantity for ${item.name}`} type="number" min="1" max={item.stockQuantity} value={item.quantity} onchange={(event) => onQuantity(item.id, Number(event.currentTarget.value))} /></label>
          <strong>{rupiah(item.salePrice * item.quantity)}</strong>
          <button class="secondary" aria-label={`Remove ${item.name}`} onclick={() => onRemove(item.id)}>Remove</button>
        </li>
      {/each}
    </ul>
    <p class="total">Total <strong>{rupiah(items.reduce((sum, item) => sum + item.salePrice * item.quantity, 0))}</strong></p>
  {/if}
</section>
