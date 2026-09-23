<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from './lib/api'
  import Login from './routes/Login.svelte'
  import Pos from './routes/Pos.svelte'
  import Sales from './routes/Sales.svelte'
  import Expenses from './routes/Expenses.svelte'
  import Settings from './routes/Settings.svelte'
  import Dashboard from './routes/Dashboard.svelte'
  import ShoppingCart from '@lucide/svelte/icons/shopping-cart'
  import ChartNoAxesCombined from '@lucide/svelte/icons/chart-no-axes-combined'
  import ReceiptText from '@lucide/svelte/icons/receipt-text'
  import SettingsIcon from '@lucide/svelte/icons/settings'
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard'
  import LogOut from '@lucide/svelte/icons/log-out'
  import { Button } from '$lib/components/ui/button/index.js'

  type Actor = { id: number; role: 'admin' | 'cashier' }

  let actor: Actor | null = null
  let loading = true
  let path = window.location.pathname

  async function loadActor() {
    try {
      actor = await api<Actor>('/api/auth/me')
      if (path === '/') navigate(actor.role === 'admin' ? '/dashboard' : '/pos')
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
  <main class="mx-auto my-[12vh] max-w-md p-6">Loading…</main>
{:else if !actor}
  <Login onSuccess={loadActor} />
{:else}
  <div class="min-h-screen bg-background text-foreground">
    <header class="sticky top-0 z-20 border-b border-border bg-background">
      <div class="flex min-h-14 items-center gap-3 px-4 md:px-6">
        <a class="mr-auto text-sm font-bold tracking-tight text-foreground no-underline" href="/pos" onclick={(event) => { event.preventDefault(); navigate('/pos') }}>Nara TelePOS</a>
        <Button variant="outline" size="sm" onclick={logout}><LogOut /> <span>Sign out</span></Button>
      </div>
      <nav aria-label="Main navigation" class="flex gap-1 overflow-x-auto border-t border-border px-3 py-2 md:hidden">
        {#if actor.role === 'admin'}
          <a class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground no-underline hover:bg-accent hover:text-accent-foreground" class:bg-accent={path === '/dashboard'} class:text-accent-foreground={path === '/dashboard'} href="/dashboard" onclick={(event) => { event.preventDefault(); navigate('/dashboard') }}><LayoutDashboard /> <span>Dashboard</span></a>
        {/if}
        <a class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground no-underline hover:bg-accent hover:text-accent-foreground" class:bg-accent={path === '/pos'} class:text-accent-foreground={path === '/pos'} href="/pos" onclick={(event) => { event.preventDefault(); navigate('/pos') }}><ShoppingCart /> <span>POS</span></a>
        <a class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground no-underline hover:bg-accent hover:text-accent-foreground" class:bg-accent={path === '/sales' || path.startsWith('/sales/')} class:text-accent-foreground={path === '/sales' || path.startsWith('/sales/')} href="/sales" onclick={(event) => { event.preventDefault(); navigate('/sales') }}><ChartNoAxesCombined /> <span>Sales</span></a>
        <a class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground no-underline hover:bg-accent hover:text-accent-foreground" class:bg-accent={path === '/expenses'} class:text-accent-foreground={path === '/expenses'} href="/expenses" onclick={(event) => { event.preventDefault(); navigate('/expenses') }}><ReceiptText /> <span>Expenses</span></a>
        {#if actor.role === 'admin'}
          <a class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground no-underline hover:bg-accent hover:text-accent-foreground" class:bg-accent={path === '/settings'} class:text-accent-foreground={path === '/settings'} href="/settings" onclick={(event) => { event.preventDefault(); navigate('/settings') }}><SettingsIcon /> <span>Settings</span></a>
        {/if}
      </nav>
    </header>

    <div class="md:flex">
      <aside class="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 border-r border-border bg-muted p-3 md:block">
        <nav aria-label="Main navigation" class="grid gap-1">
          {#if actor.role === 'admin'}
            <a class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground no-underline hover:bg-accent hover:text-accent-foreground" class:bg-accent={path === '/dashboard'} class:text-accent-foreground={path === '/dashboard'} href="/dashboard" onclick={(event) => { event.preventDefault(); navigate('/dashboard') }}><LayoutDashboard /> <span>Dashboard</span></a>
          {/if}
          <a class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground no-underline hover:bg-accent hover:text-accent-foreground" class:bg-accent={path === '/pos'} class:text-accent-foreground={path === '/pos'} href="/pos" onclick={(event) => { event.preventDefault(); navigate('/pos') }}><ShoppingCart /> <span>POS</span></a>
          <a class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground no-underline hover:bg-accent hover:text-accent-foreground" class:bg-accent={path === '/sales' || path.startsWith('/sales/')} class:text-accent-foreground={path === '/sales' || path.startsWith('/sales/')} href="/sales" onclick={(event) => { event.preventDefault(); navigate('/sales') }}><ChartNoAxesCombined /> <span>Sales</span></a>
          <a class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground no-underline hover:bg-accent hover:text-accent-foreground" class:bg-accent={path === '/expenses'} class:text-accent-foreground={path === '/expenses'} href="/expenses" onclick={(event) => { event.preventDefault(); navigate('/expenses') }}><ReceiptText /> <span>Expenses</span></a>
          {#if actor.role === 'admin'}
            <a class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground no-underline hover:bg-accent hover:text-accent-foreground" class:bg-accent={path === '/settings'} class:text-accent-foreground={path === '/settings'} href="/settings" onclick={(event) => { event.preventDefault(); navigate('/settings') }}><SettingsIcon /> <span>Settings</span></a>
          {/if}
        </nav>
      </aside>

      <main class="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {#if path === '/sales' || /^\/sales\/[1-9]\d*$/.test(path)}
          {#key path}<Sales {actor} saleId={path === '/sales' ? null : Number(path.split('/')[2])} />{/key}
        {:else if path === '/expenses'}
          <Expenses {actor} />
        {:else if path === '/settings' && actor.role === 'admin'}
          <Settings />
        {:else if path === '/dashboard' && actor.role === 'admin'}
          <Dashboard />
        {:else}
          <Pos />
        {/if}
      </main>
    </div>
  </div>
{/if}
