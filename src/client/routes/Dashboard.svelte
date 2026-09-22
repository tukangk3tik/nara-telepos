<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from '../lib/api'
  import { Alert } from '$lib/components/ui/alert/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js'
  import * as Table from '$lib/components/ui/table/index.js'

  type DashboardSummary = {
    date: string
    salesTotal: number
    expensesTotal: number
    netProfit: number
    recentTransactions: Array<{ kind: 'sale' | 'expense'; id: number; reference: string; amount: number; occurredAt: string; cancelled: boolean }>
    lowStockProducts: Array<{ id: number; name: string; sku: string; stockQuantity: number }>
  }

  const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
  let summary: DashboardSummary | null = null
  let error = ''

  async function load() {
    try {
      summary = await api<DashboardSummary>('/api/dashboard')
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load dashboard'
    }
  }

  onMount(() => { void load() })
</script>

<div class="grid gap-4">
  <div><h1 class="text-2xl font-bold">Dashboard</h1>{#if summary}<p class="text-sm text-muted-foreground">Summary for {summary.date}</p>{/if}</div>

  {#if error}
    <Alert variant="destructive" role="alert">{error}</Alert>
  {:else if !summary}
    <p>Loading dashboard…</p>
  {:else}
    <div class="grid gap-4 sm:grid-cols-3">
      <Card><CardHeader><CardTitle>Sales</CardTitle></CardHeader><CardContent class="text-2xl font-bold">{rupiah(summary.salesTotal)}</CardContent></Card>
      <Card><CardHeader><CardTitle>Expenses</CardTitle></CardHeader><CardContent class="text-2xl font-bold">{rupiah(summary.expensesTotal)}</CardContent></Card>
      <Card><CardHeader><CardTitle>Net profit</CardTitle></CardHeader><CardContent class="text-2xl font-bold">{rupiah(summary.netProfit)}</CardContent></Card>
    </div>

    <Card>
      <CardHeader><CardTitle>Recent transactions</CardTitle></CardHeader>
      <CardContent>
        {#if summary.recentTransactions.length}
          <Table.Root>
            <Table.Header><Table.Row><Table.Head>Reference</Table.Head><Table.Head>Type</Table.Head><Table.Head>Time</Table.Head><Table.Head class="text-right">Amount</Table.Head></Table.Row></Table.Header>
            <Table.Body>{#each summary.recentTransactions as transaction (`${transaction.kind}-${transaction.id}`)}
              <Table.Row class={transaction.cancelled ? 'opacity-60' : undefined}>
                <Table.Cell class="font-medium">{transaction.reference}</Table.Cell>
                <Table.Cell><div class="flex flex-wrap gap-1"><Badge variant="secondary">{transaction.kind}</Badge>{#if transaction.cancelled}<Badge variant="destructive">Cancelled</Badge>{/if}</div></Table.Cell>
                <Table.Cell>{new Date(transaction.occurredAt).toLocaleString()}</Table.Cell>
                <Table.Cell class="text-right font-medium">{rupiah(transaction.amount)}</Table.Cell>
              </Table.Row>
            {/each}</Table.Body>
          </Table.Root>
        {:else}
          <p class="text-sm text-muted-foreground">No recent transactions.</p>
        {/if}
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Low stock</CardTitle></CardHeader>
      <CardContent>
        {#if summary.lowStockProducts.length}
          <Table.Root>
            <Table.Header><Table.Row><Table.Head>Product</Table.Head><Table.Head>SKU</Table.Head><Table.Head class="text-right">Stock</Table.Head></Table.Row></Table.Header>
            <Table.Body>{#each summary.lowStockProducts as product (product.id)}
              <Table.Row><Table.Cell class="font-medium whitespace-normal">{product.name}</Table.Cell><Table.Cell>{product.sku}</Table.Cell><Table.Cell class="text-right"><Badge variant={product.stockQuantity === 0 ? 'destructive' : 'secondary'}>{product.stockQuantity}</Badge></Table.Cell></Table.Row>
            {/each}</Table.Body>
          </Table.Root>
        {:else}
          <p class="text-sm text-muted-foreground">No low-stock products.</p>
        {/if}
      </CardContent>
    </Card>
  {/if}
</div>
