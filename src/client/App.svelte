<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from './lib/api'
  import Login from './routes/Login.svelte'
  import Pos from './routes/Pos.svelte'
  import Sales from './routes/Sales.svelte'
  import Expenses from './routes/Expenses.svelte'
  import Settings from './routes/Settings.svelte'
  import Dashboard from './routes/Dashboard.svelte'
  import AppSidebar from './components/AppSidebar.svelte'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'

  type Actor = { id: number; role: 'admin' | 'cashier' }

  let actor: Actor | null = null
  let loading = true
  let path = window.location.pathname
  $: pageTitle = path.startsWith('/sales') ? 'Sales' : path === '/expenses' ? 'Expenses' : path.startsWith('/settings') ? 'Settings' : path === '/dashboard' ? 'Dashboard' : 'POS'

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
  <Sidebar.Provider>
    <AppSidebar role={actor.role} {path} {navigate} {logout} />
    <Sidebar.Inset class="min-w-0">
      <header class="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b border-border bg-background px-4 md:px-6">
        <Sidebar.Trigger />
        <span class="h-4 w-px bg-border" aria-hidden="true"></span>
        <span class="hidden text-sm text-muted-foreground sm:inline">Workspace</span>
        <ChevronRight class="hidden size-4 text-muted-foreground sm:inline" aria-hidden="true" />
        <strong class="text-sm font-medium">{pageTitle}</strong>
      </header>
      <div class="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {#if path === '/sales' || /^\/sales\/[1-9]\d*$/.test(path)}
          {#key path}<Sales {actor} saleId={path === '/sales' ? null : Number(path.split('/')[2])} />{/key}
        {:else if path === '/expenses'}
          <Expenses {actor} />
        {:else if (path === '/settings' || /^\/settings\/(catalog|team|store)$/.test(path)) && actor.role === 'admin'}
          <Settings section={path.split('/')[2] === 'team' ? 'team' : path.split('/')[2] === 'store' ? 'store' : 'catalog'} />
        {:else if path === '/dashboard' && actor.role === 'admin'}
          <Dashboard />
        {:else}
          <Pos />
        {/if}
      </div>
    </Sidebar.Inset>
  </Sidebar.Provider>
{/if}
