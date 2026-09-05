<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from '../lib/api'

  type Category = { id: number; name: string }
  type Expense = { id: number; expenseNumber: string; expenseCategoryId: number; categoryName: string; amount: number; transactionDate: string; notes: string | null; source: string; createdAt: string }

  const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
  const today = new Date()
  let categories: Category[] = []
  let expenses: Expense[] = []
  let selected: Expense | null = null
  let expenseCategoryId = 0
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
        body: JSON.stringify({ expenseCategoryId, amount, transactionDate, notes }),
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

<div class="two-column">
  <section class="card">
    <h1>New expense</h1>
    <form onsubmit={create}>
      <label>Category <select bind:value={expenseCategoryId} required disabled={!categories.length}><option value={0} disabled>{categories.length ? 'Select category' : 'No active categories'}</option>{#each categories as category}<option value={category.id}>{category.name}</option>{/each}</select></label>
      <label>Amount (IDR) <input type="number" min="1" step="1" bind:value={amount} required /></label>
      <label>Date <input type="date" bind:value={transactionDate} required /></label>
      <label>Notes <textarea bind:value={notes} maxlength="1000"></textarea></label>
      <button disabled={submitting || !categories.length}>{submitting ? 'Creating…' : 'Create expense'}</button>
    </form>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </section>

  <section class="card">
    <h1>Expense history</h1>
    <ul class="record-list">{#each expenses as expense (expense.id)}
      <li><button class="secondary" onclick={() => details(expense.id)}>{expense.expenseNumber}</button><span>{expense.categoryName} · {expense.transactionDate}</span><strong>{rupiah(expense.amount)}</strong></li>
    {/each}</ul>
    {#if selected}<article class="detail"><h2>{selected.expenseNumber}</h2><p>{selected.categoryName} · {rupiah(selected.amount)}</p><p>{selected.transactionDate}</p>{#if selected.notes}<p>{selected.notes}</p>{/if}</article>{/if}
  </section>
</div>
