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
  <main class="mx-auto my-[12vh] max-w-md p-6">Loading…</main>
{:else if !actor}
  <Login onSuccess={loadActor} />
{:else}
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <header class="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <div class="flex min-h-14 items-center gap-3 px-4 md:px-6">
        <a class="mr-auto text-sm font-bold tracking-tight text-slate-900 no-underline" href="/pos" onclick={(event) => { event.preventDefault(); navigate('/pos') }}>Nara TelePOS</a>
        <Button variant="outline" size="sm" onclick={logout}><LogOut /> <span>Sign out</span></Button>
      </div>
      <nav aria-label="Main navigation" class="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 py-2 md:hidden">
        <a class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 no-underline hover:bg-slate-100 hover:text-slate-900" class:bg-slate-200={path === '/pos'} class:text-slate-900={path === '/pos'} href="/pos" onclick={(event) => { event.preventDefault(); navigate('/pos') }}><ShoppingCart /> <span>POS</span></a>
        <a class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 no-underline hover:bg-slate-100 hover:text-slate-900" class:bg-slate-200={path === '/sales' || path.startsWith('/sales/')} class:text-slate-900={path === '/sales' || path.startsWith('/sales/')} href="/sales" onclick={(event) => { event.preventDefault(); navigate('/sales') }}><ChartNoAxesCombined /> <span>Sales</span></a>
        <a class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 no-underline hover:bg-slate-100 hover:text-slate-900" class:bg-slate-200={path === '/expenses'} class:text-slate-900={path === '/expenses'} href="/expenses" onclick={(event) => { event.preventDefault(); navigate('/expenses') }}><ReceiptText /> <span>Expenses</span></a>
        {#if actor.role === 'admin'}
          <a class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 no-underline hover:bg-slate-100 hover:text-slate-900" class:bg-slate-200={path === '/dashboard'} class:text-slate-900={path === '/dashboard'} href="/dashboard" onclick={(event) => { event.preventDefault(); navigate('/dashboard') }}><LayoutDashboard /> <span>Dashboard</span></a>
          <a class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 no-underline hover:bg-slate-100 hover:text-slate-900" class:bg-slate-200={path === '/settings'} class:text-slate-900={path === '/settings'} href="/settings" onclick={(event) => { event.preventDefault(); navigate('/settings') }}><SettingsIcon /> <span>Settings</span></a>
        {/if}
      </nav>
    </header>

    <div class="md:flex">
      <aside class="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 border-r border-slate-200 bg-white p-3 md:block">
        <nav aria-label="Main navigation" class="grid gap-1">
          <a class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 no-underline hover:bg-slate-100 hover:text-slate-900" class:bg-slate-200={path === '/pos'} class:text-slate-900={path === '/pos'} href="/pos" onclick={(event) => { event.preventDefault(); navigate('/pos') }}><ShoppingCart /> <span>POS</span></a>
          <a class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 no-underline hover:bg-slate-100 hover:text-slate-900" class:bg-slate-200={path === '/sales' || path.startsWith('/sales/')} class:text-slate-900={path === '/sales' || path.startsWith('/sales/')} href="/sales" onclick={(event) => { event.preventDefault(); navigate('/sales') }}><ChartNoAxesCombined /> <span>Sales</span></a>
          <a class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 no-underline hover:bg-slate-100 hover:text-slate-900" class:bg-slate-200={path === '/expenses'} class:text-slate-900={path === '/expenses'} href="/expenses" onclick={(event) => { event.preventDefault(); navigate('/expenses') }}><ReceiptText /> <span>Expenses</span></a>
          {#if actor.role === 'admin'}
            <a class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 no-underline hover:bg-slate-100 hover:text-slate-900" class:bg-slate-200={path === '/dashboard'} class:text-slate-900={path === '/dashboard'} href="/dashboard" onclick={(event) => { event.preventDefault(); navigate('/dashboard') }}><LayoutDashboard /> <span>Dashboard</span></a>
            <a class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 no-underline hover:bg-slate-100 hover:text-slate-900" class:bg-slate-200={path === '/settings'} class:text-slate-900={path === '/settings'} href="/settings" onclick={(event) => { event.preventDefault(); navigate('/settings') }}><SettingsIcon /> <span>Settings</span></a>
          {/if}
        </nav>
      </aside>

      <main class="mx-auto w-full max-w-[1200px] min-w-0 flex-1 p-4">
        {#if path === '/sales' || /^\/sales\/[1-9]\d*$/.test(path)}
          {#key path}<Sales {actor} saleId={path === '/sales' ? null : Number(path.split('/')[2])} />{/key}
        {:else if path === '/expenses'}
          <Expenses />
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
