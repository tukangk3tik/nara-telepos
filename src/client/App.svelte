<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from './lib/api'
  import Login from './routes/Login.svelte'
  import Pos from './routes/Pos.svelte'
  import Sales from './routes/Sales.svelte'
  import Expenses from './routes/Expenses.svelte'
  import Settings from './routes/Settings.svelte'

  type Actor = { id: number; role: 'admin' | 'cashier' }

  let actor: Actor | null = null
  let loading = true
  let path = window.location.pathname === '/' ? '/pos' : window.location.pathname

  async function loadActor() {
    try {
      actor = await api<Actor>('/api/auth/me')
    } catch {
      actor = null
    } finally {
      loading = false
    }
  }

  function navigate(next: string) {
    history.pushState({}, '', next)
    path = next
  }

  async function logout() {
    await api<void>('/api/auth/logout', { method: 'POST' })
    actor = null
    navigate('/login')
  }

  onMount(() => {
    void loadActor()
    const onPopState = () => path = window.location.pathname
    addEventListener('popstate', onPopState)
    return () => removeEventListener('popstate', onPopState)
  })
</script>

{#if loading}
  <main class="centered">Loading…</main>
{:else if !actor}
  <Login onSuccess={loadActor} />
{:else}
  <header class="app-header">
    <a class="brand" href="/pos" onclick={(event) => { event.preventDefault(); navigate('/pos') }}>Nara TelePOS</a>
    <nav aria-label="Main navigation">
      <a class:active={path === '/pos'} href="/pos" onclick={(event) => { event.preventDefault(); navigate('/pos') }}>POS</a>
      <a class:active={path === '/sales' || path.startsWith('/sales/')} href="/sales" onclick={(event) => { event.preventDefault(); navigate('/sales') }}>Sales</a>
      <a class:active={path === '/expenses'} href="/expenses" onclick={(event) => { event.preventDefault(); navigate('/expenses') }}>Expenses</a>
      {#if actor.role === 'admin'}
        <a class:active={path === '/settings'} href="/settings" onclick={(event) => { event.preventDefault(); navigate('/settings') }}>Settings</a>
      {/if}
    </nav>
    <button class="secondary" onclick={logout}>Sign out</button>
  </header>

  <main class="page">
    {#if path === '/sales' || /^\/sales\/[1-9]\d*$/.test(path)}
      {#key path}<Sales {actor} saleId={path === '/sales' ? null : Number(path.split('/')[2])} />{/key}
    {:else if path === '/expenses'}
      <Expenses />
    {:else if path === '/settings' && actor.role === 'admin'}
      <Settings />
    {:else}
      <Pos />
    {/if}
  </main>
{/if}
