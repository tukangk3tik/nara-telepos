<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from '../lib/api'
  import { cancellationReason } from '../lib/dialog-validation'
  import { Alert } from '$lib/components/ui/alert/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Card, CardContent, CardHeader } from '$lib/components/ui/card/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import * as Select from '$lib/components/ui/select/index.js'
  import * as Table from '$lib/components/ui/table/index.js'
  import { Textarea } from '$lib/components/ui/textarea/index.js'

  type Category = { id: number; name: string }
  type Expense = { id: number; expenseNumber: string; expenseCategoryId: number; categoryName: string; amount: number; transactionDate: string; notes: string | null; source: string; createdAt: string; deletedAt: string | null; deletionReason: string | null }

  export let actor: { id: number; role: 'admin' | 'cashier' }
  export let deleted = false
  export let navigate: (path: string) => void

  const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
  const today = new Date()
  let categories: Category[] = []
  let expenses: Expense[] = []
  let query = ''
  let page = 1
  const pageSize = 10
  $: filteredExpenses = expenses.filter((expense) => Boolean(expense.deletedAt) === deleted && [expense.expenseNumber, expense.categoryName, expense.transactionDate, expense.notes ?? ''].some((value) => value.toLowerCase().includes(query.trim().toLowerCase())))
  $: totalPages = Math.max(1, Math.ceil(filteredExpenses.length / pageSize))
  $: pagedExpenses = filteredExpenses.slice((page - 1) * pageSize, page * pageSize)
  let selected: Expense | null = null
  let expenseCategoryId = ''
  let amount = 0
  let transactionDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  let notes = ''
  let error = ''
  let submitting = false
  let expenseToDelete: Expense | null = null
  let deleteReason = ''
  let deletionDialogOpen = false
  let deleting = false
  let creationDialogOpen = false

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
      query = ''
      page = 1
      creationDialogOpen = false
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not create expense'
    } finally {
      submitting = false
    }
  }

  async function details(id: number) {
    try {
      error = ''
      selected = await api<Expense>(`/api/expenses/${id}`)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load expense details'
    }
  }

  function closeDetails(open: boolean) {
    if (!open) selected = null
  }

  function openDeletion(expense: Expense) {
    error = ''
    expenseToDelete = expense
    deleteReason = ''
    deletionDialogOpen = true
  }

  async function deleteSelected() {
    if (!expenseToDelete || deleting) return
    const reason = cancellationReason(deleteReason)
    if (!reason) { error = 'A deletion reason is required.'; return }
    error = ''
    deleting = true
    try {
      await api<void>(`/api/expenses/${expenseToDelete.id}`, {
        method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }),
      })
      selected = null
      deletionDialogOpen = false
      expenseToDelete = null
      await load()
      page = 1
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not delete expense'
    } finally {
      deleting = false
    }
  }

  onMount(() => { void load() })
</script>

<div class="grid gap-6">
  <div class="flex flex-wrap items-start justify-between gap-4"><div><h1 class="text-3xl font-semibold tracking-tight">{deleted ? 'Deleted expenses' : 'Expenses'}</h1><p class="text-sm text-muted-foreground">{deleted ? 'Review deleted expenses.' : 'Record costs and review recent spending.'}</p></div>{#if deleted}<Button variant="outline" onclick={() => navigate('/expenses')}>Back to expenses</Button>{:else}<Button variant="outline" onclick={() => navigate('/expenses/deleted')}>View deleted expenses</Button>{/if}</div>

{#if error && !creationDialogOpen && !deletionDialogOpen}<Alert variant="destructive" onClose={() => error = ''}>{error}</Alert>{/if}
  <Card>
    <CardHeader class="flex flex-row flex-wrap items-center justify-between gap-4"><div class="flex flex-wrap items-center gap-3"><Label for="expense-search">Search expenses</Label><Input id="expense-search" class="w-80 max-w-full" placeholder="Number, category, date, or notes" bind:value={query} oninput={() => page = 1} /></div>{#if !deleted}<Button onclick={() => { error = ''; creationDialogOpen = true }}>New expense</Button>{/if}</CardHeader>
    <CardContent class="grid gap-4">
      <Table.Root>
        {#if !filteredExpenses.length}<Table.Caption>No data available</Table.Caption>{/if}
        <Table.Header><Table.Row><Table.Head>Expense</Table.Head><Table.Head>Category</Table.Head><Table.Head>Date</Table.Head><Table.Head class="text-right">Amount</Table.Head><Table.Head><span class="sr-only">Actions</span></Table.Head></Table.Row></Table.Header>
        <Table.Body>{#each pagedExpenses as expense (expense.id)}
          <Table.Row><Table.Cell><div class="grid gap-1"><strong>{expense.expenseNumber}</strong>{#if deleted}<span class="text-destructive text-xs">Deleted: {expense.deletionReason}</span>{/if}</div></Table.Cell><Table.Cell class="whitespace-normal">{expense.categoryName}</Table.Cell><Table.Cell>{expense.transactionDate}</Table.Cell><Table.Cell class="text-right font-medium">{rupiah(expense.amount)}</Table.Cell><Table.Cell><div class="flex gap-2"><Button variant="outline" size="sm" onclick={() => details(expense.id)}>Details</Button>{#if actor.role === 'admin' && !deleted}<Button variant="destructive" size="sm" onclick={() => openDeletion(expense)}>Delete</Button>{/if}</div></Table.Cell></Table.Row>
        {/each}</Table.Body>
      </Table.Root>
      <div class="flex items-center justify-between gap-4"><span class="text-muted-foreground text-sm">Page {page} of {totalPages}</span><div class="flex gap-2"><Button variant="outline" size="sm" disabled={page === 1} onclick={() => page -= 1}>Previous</Button><Button variant="outline" size="sm" disabled={page >= totalPages} onclick={() => page += 1}>Next</Button></div></div>
    </CardContent>
  </Card>
</div>

<Dialog.Root open={selected !== null} onOpenChange={closeDetails}>
  <Dialog.Content class="top-0 right-0 left-auto h-dvh w-full max-w-full content-start overflow-y-auto rounded-none p-6 translate-x-0 translate-y-0 data-open:slide-in-from-right data-closed:slide-out-to-right data-open:zoom-in-100 data-closed:zoom-out-100 sm:max-w-xl">
    {#if selected}
      <Dialog.Header><Dialog.Title>{selected.expenseNumber}</Dialog.Title><Dialog.Description>Expense on {selected.transactionDate}</Dialog.Description></Dialog.Header>
      <div class="grid gap-4">
        <p class="flex flex-wrap items-center gap-2"><Badge variant="secondary">{selected.categoryName}</Badge><strong>{rupiah(selected.amount)}</strong></p>
        {#if selected.notes}<div><h3 class="font-medium">Notes</h3><p class="whitespace-pre-wrap">{selected.notes}</p></div>{/if}
        {#if selected.deletedAt}<Alert variant="destructive">Deleted: {selected.deletionReason}</Alert>{/if}
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={creationDialogOpen}>
  <Dialog.Content class="max-h-[calc(100vh-2rem)] overflow-y-auto" showCloseButton={!submitting}>
    <Dialog.Header><Dialog.Title>New expense</Dialog.Title><Dialog.Description>Record a store expense.</Dialog.Description></Dialog.Header>
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
      {#if error}<Alert variant="destructive" onClose={() => error = ''}>{error}</Alert>{/if}
      <Dialog.Footer><Dialog.Close disabled={submitting}>{#snippet child({ props })}<Button variant="outline" type="button" disabled={submitting} {...props}>Cancel</Button>{/snippet}</Dialog.Close><Button type="submit" disabled={submitting || !categories.length}>{submitting ? 'Creating…' : 'Create expense'}</Button></Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={deletionDialogOpen}>
  <Dialog.Content showCloseButton={!deleting}>
    <Dialog.Header><Dialog.Title>Delete {expenseToDelete?.expenseNumber}</Dialog.Title><Dialog.Description>This expense will be excluded from totals and kept in history with your reason.</Dialog.Description></Dialog.Header>
    <div class="grid gap-2"><Label for="expense-deletion-reason">Deletion reason</Label><Input id="expense-deletion-reason" bind:value={deleteReason} disabled={deleting} aria-invalid={Boolean(error)} />{#if error}<Alert variant="destructive" onClose={() => error = ''}>{error}</Alert>{/if}</div>
    <Dialog.Footer><Dialog.Close disabled={deleting}>{#snippet child({ props })}<Button variant="outline" disabled={deleting} {...props}>Keep expense</Button>{/snippet}</Dialog.Close><Button variant="destructive" disabled={deleting} onclick={deleteSelected}>{deleting ? 'Deleting…' : 'Delete expense'}</Button></Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
