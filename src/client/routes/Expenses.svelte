<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from '../lib/api'

  type Actor = { id: number; role: 'admin' | 'cashier' }
  type Category = { id: number; name: string }
  type Expense = { id: number; expenseNumber: string; expenseCategoryId: number; categoryName: string; amount: number; transactionDate: string; notes: string | null; source: string; createdAt: string }

  export let actor: Actor

  const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
  let categories: Category[] = []
  let expenses: Expense[] = []
  let selected: Expense | null = null
  let expenseCategoryId = 0
  let amount = 0
  let transactionDate = new Date().toISOString().slice(0, 10)
  let notes = ''
  let error = ''

  async function load() {
    try {
      expenses = await api<Expense[]>('/api/expenses')
      if (actor.role === 'admin') categories = await api<Category[]>('/api/settings/expense-categories/active')
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load expenses'
    }
  }

  async function create(event: SubmitEvent) {
    event.preventDefault()
    error = ''
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
      {#if categories.length}
        <label>Category <select bind:value={expenseCategoryId} required><option value={0} disabled>Select category</option>{#each categories as category}<option value={category.id}>{category.name}</option>{/each}</select></label>
      {:else}
        <label>Category ID <input type="number" min="1" bind:value={expenseCategoryId} required /></label>
        <p class="muted">Ask an administrator for an expense-category ID.</p>
      {/if}
      <label>Amount (IDR) <input type="number" min="1" step="1" bind:value={amount} required /></label>
      <label>Date <input type="date" bind:value={transactionDate} required /></label>
      <label>Notes <textarea bind:value={notes} maxlength="1000"></textarea></label>
      <button>Create expense</button>
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
