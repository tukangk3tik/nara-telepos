<script lang="ts">
  import { api } from '../lib/api'

  type Customer = { id: number; name: string; phone: string | null; email: string | null }

  export let onSelect: (customer: Customer) => void

  let query = ''
  let customers: Customer[] = []
  let name = ''
  let phone = ''
  let email = ''
  let error = ''

  async function search() {
    try {
      customers = await api<Customer[]>(`/api/customers?q=${encodeURIComponent(query)}`)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not find customers'
    }
  }

  async function create(event: SubmitEvent) {
    event.preventDefault()
    error = ''
    try {
      const customer = await api<Customer>('/api/customers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, phone, email }),
      })
      onSelect(customer)
      name = phone = email = ''
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not create customer'
    }
  }
</script>

<section class="card">
  <h2>Customer <span class="muted">(optional)</span></h2>
  <div class="inline-form">
    <label>Find customer <input bind:value={query} oninput={search} placeholder="Name, phone, or email" /></label>
  </div>
  {#if customers.length}
    <ul class="choice-list">
      {#each customers as customer (customer.id)}
        <li><button class="secondary" onclick={() => onSelect(customer)}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</button></li>
      {/each}
    </ul>
  {/if}
  <details>
    <summary>Create customer</summary>
    <form onsubmit={create} class="inline-form">
      <label>Name <input bind:value={name} required /></label>
      <label>Phone <input bind:value={phone} inputmode="tel" /></label>
      <label>Email <input bind:value={email} type="email" /></label>
      <button>Add customer</button>
    </form>
  </details>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>
