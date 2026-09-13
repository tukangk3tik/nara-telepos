<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from '../lib/api'
  import { Alert } from '$lib/components/ui/alert/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import * as Select from '$lib/components/ui/select/index.js'
  import { Textarea } from '$lib/components/ui/textarea/index.js'

  type Category = { id: number; name: string }
  type Expense = { id: number; expenseNumber: string; expenseCategoryId: number; categoryName: string; amount: number; transactionDate: string; notes: string | null; source: string; createdAt: string }

  const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
  const today = new Date()
  let categories: Category[] = []
  let expenses: Expense[] = []
  let selected: Expense | null = null
  let expenseCategoryId = ''
  let amount = 0
  let transactionDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  let notes = ''
  let error = ''
  let submitting = false

  async function load() {
    try {
      [expenses, categories] = await Promise.all([
        api<Expense[]>('/api/expenses'),
        api<Category[]>('/api/expenses/categories'),
      ])
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load expenses'
    }
  }

  async function create(event: SubmitEvent) {
    event.preventDefault()
    if (submitting) return
    error = ''
    submitting = true
    try {
      await api<Expense>('/api/expenses', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expenseCategoryId: Number(expenseCategoryId), amount, transactionDate, notes }),
      })
      amount = 0
      notes = ''
      await load()
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not create expense'
    } finally {
      submitting = false
    }
  }

  async function details(id: number) {
    try {
      selected = await api<Expense>(`/api/expenses/${id}`)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load expense details'
    }
  }

  onMount(() => { void load() })
</script>

<div class="grid gap-4 lg:grid-cols-[minmax(0,.8fr)_minmax(20rem,1.2fr)]">
  <Card>
    <CardHeader><CardTitle><h1>New expense</h1></CardTitle></CardHeader>
    <CardContent>
      <form class="grid gap-4" onsubmit={create}>
        <div class="grid gap-2">
          <Label for="expense-category">Category</Label>
          <Select.Root type="single" bind:value={expenseCategoryId} items={categories.map((category) => ({ value: String(category.id), label: category.name }))} disabled={!categories.length} name="expenseCategoryId" required>
            <Select.Trigger id="expense-category" aria-label="Category" class="w-full"><Select.Value placeholder={categories.length ? 'Select category' : 'No active categories'} /></Select.Trigger>
            <Select.Content>{#each categories as category}<Select.Item value={String(category.id)} label={category.name} />{/each}</Select.Content>
          </Select.Root>
        </div>
        <div class="grid gap-2"><Label for="expense-amount">Amount (IDR)</Label><Input id="expense-amount" type="number" min="1" step="1" bind:value={amount} required /></div>
        <div class="grid gap-2"><Label for="expense-date">Date</Label><Input id="expense-date" type="date" bind:value={transactionDate} required /></div>
        <div class="grid gap-2"><Label for="expense-notes">Notes</Label><Textarea id="expense-notes" bind:value={notes} maxlength="1000" /></div>
        <Button type="submit" disabled={submitting || !categories.length}>{submitting ? 'Creating…' : 'Create expense'}</Button>
      </form>
      {#if error}<Alert variant="destructive" class="mt-4">{error}</Alert>{/if}
    </CardContent>
  </Card>

  <Card>
    <CardHeader><CardTitle><h2>Expense history</h2></CardTitle></CardHeader>
    <CardContent class="grid gap-4">
      <ul class="divide-y">{#each expenses as expense (expense.id)}
        <li class="flex flex-wrap items-center gap-3 py-3"><Button variant="outline" size="sm" onclick={() => details(expense.id)}>{expense.expenseNumber}</Button><span class="mr-auto text-muted-foreground">{expense.categoryName} · {expense.transactionDate}</span><strong class="whitespace-nowrap">{rupiah(expense.amount)}</strong></li>
      {/each}</ul>
      {#if selected}<article class="grid gap-2 rounded-lg border p-4"><div class="flex flex-wrap items-center gap-2"><h2 class="font-medium">{selected.expenseNumber}</h2><Badge variant="secondary">{selected.categoryName}</Badge><strong>{rupiah(selected.amount)}</strong></div><p class="text-muted-foreground">{selected.transactionDate}</p>{#if selected.notes}<p>{selected.notes}</p>{/if}</article>{/if}
    </CardContent>
  </Card>
</div>
