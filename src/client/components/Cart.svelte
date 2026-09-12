<script lang="ts">
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table/index.js'

  export type CartLine = { id: number; name: string; salePrice: number; stockQuantity: number; quantity: number }
  export let items: CartLine[] = []
  export let onQuantity: (id: number, quantity: number) => void
  export let onRemove: (id: number) => void
  const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
</script>

<Card>
  <CardHeader><CardTitle>Cart</CardTitle></CardHeader>
  <CardContent>
    {#if !items.length}
      <p class="text-muted-foreground">Search and add products to start a sale.</p>
    {:else}
      <Table>
        <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Quantity</TableHead><TableHead class="text-right">Total</TableHead><TableHead><span class="sr-only">Actions</span></TableHead></TableRow></TableHeader>
        <TableBody>
          {#each items as item (item.id)}
            <TableRow>
              <TableCell><div class="grid gap-1"><strong>{item.name}</strong><span class="text-muted-foreground text-xs">{rupiah(item.salePrice)}</span><Badge variant="secondary">{item.stockQuantity} in stock</Badge></div></TableCell>
              <TableCell><Label class="sr-only" for={`quantity-${item.id}`}>Quantity for {item.name}</Label><Input id={`quantity-${item.id}`} aria-label={`Quantity for ${item.name}`} class="w-20" type="number" min="1" max={item.stockQuantity} value={item.quantity} onchange={(event) => onQuantity(item.id, Number(event.currentTarget.value))} /></TableCell>
              <TableCell class="text-right font-medium">{rupiah(item.salePrice * item.quantity)}</TableCell>
              <TableCell class="text-right"><Button variant="ghost" size="sm" aria-label={`Remove ${item.name}`} onclick={() => onRemove(item.id)}>Remove</Button></TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
      <p class="mt-4 flex justify-between border-t-2 pt-3">Total <strong>{rupiah(items.reduce((sum, item) => sum + item.salePrice * item.quantity, 0))}</strong></p>
    {/if}
  </CardContent>
</Card>
