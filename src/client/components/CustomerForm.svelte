<script lang="ts">
  import { api } from '../lib/api'
  import { Alert } from '$lib/components/ui/alert/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Label } from '$lib/components/ui/label/index.js'

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

<Card>
  <CardHeader><CardTitle><h2>Customer <span class="text-muted-foreground font-normal">(optional)</span></h2></CardTitle></CardHeader>
  <CardContent class="grid gap-4">
    <div class="grid gap-2"><Label for="customer-search">Find customer</Label><Input id="customer-search" bind:value={query} oninput={search} placeholder="Name, phone, or email" /></div>
    {#if customers.length}
      <ul class="flex flex-wrap gap-2">{#each customers as customer (customer.id)}<li><Button variant="secondary" onclick={() => onSelect(customer)}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</Button></li>{/each}</ul>
    {/if}
    <details class="rounded-lg border p-3">
      <summary class="cursor-pointer font-medium">Create customer</summary>
      <form onsubmit={create} class="mt-4 grid gap-4 sm:grid-cols-3">
        <div class="grid gap-2"><Label for="customer-name">Name</Label><Input id="customer-name" bind:value={name} required /></div>
        <div class="grid gap-2"><Label for="customer-phone">Phone</Label><Input id="customer-phone" bind:value={phone} inputmode="tel" /></div>
        <div class="grid gap-2"><Label for="customer-email">Email</Label><Input id="customer-email" bind:value={email} type="email" /></div>
        <Button class="sm:col-span-3 sm:w-fit" type="submit">Add customer</Button>
      </form>
    </details>
    {#if error}<Alert variant="destructive" role="alert">{error}</Alert>{/if}
  </CardContent>
</Card>
