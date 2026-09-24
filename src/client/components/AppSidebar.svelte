<script lang="ts">
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard'
  import ShoppingCart from '@lucide/svelte/icons/shopping-cart'
  import ChartNoAxesCombined from '@lucide/svelte/icons/chart-no-axes-combined'
  import ReceiptText from '@lucide/svelte/icons/receipt-text'
  import SettingsIcon from '@lucide/svelte/icons/settings'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import LogOut from '@lucide/svelte/icons/log-out'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'

  export let role: 'admin' | 'cashier'
  export let path: string
  export let navigate: (path: string) => void
  export let logout: () => void

  const sidebar = Sidebar.useSidebar()
  let settingsOpen = path.startsWith('/settings')
  $: if (path.startsWith('/settings')) settingsOpen = true
  const items = [
    { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, adminOnly: true },
    { title: 'POS', url: '/pos', icon: ShoppingCart, adminOnly: false },
    { title: 'Sales', url: '/sales', icon: ChartNoAxesCombined, adminOnly: false },
    { title: 'Expenses', url: '/expenses', icon: ReceiptText, adminOnly: false },
  ]

  function go(event: MouseEvent, url: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(url)
    sidebar.setOpenMobile(false)
  }

  function toggleSettings() {
    settingsOpen = !settingsOpen
    if (settingsOpen) sidebar.setOpen(true)
  }
</script>

<Sidebar.Root variant="inset" collapsible="icon">
  <Sidebar.Header class="border-b border-sidebar-border">
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton size="lg" tooltipContent="Nara TelePOS">
          {#snippet child({ props })}
            <a href="/pos" onclick={(event) => go(event, '/pos')} {...props}>
              <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><ShoppingCart /></span>
              <span class="grid min-w-0 leading-tight"><strong class="truncate">Nara TelePOS</strong><span class="truncate text-xs text-sidebar-foreground/70">Workspace</span></span>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Header>
  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupLabel>Workspace</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <nav aria-label="Main navigation">
          <Sidebar.Menu>
            {#each items as item (item.url)}
              {#if !item.adminOnly || role === 'admin'}
                <Sidebar.MenuItem>
                  <Sidebar.MenuButton tooltipContent={item.title} isActive={path === item.url || (item.url === '/sales' && path.startsWith('/sales/'))}>
                    {#snippet child({ props })}
                      <a href={item.url} onclick={(event) => go(event, item.url)} {...props}>
                        <item.icon />
                        <span>{item.title}</span>
                      </a>
                    {/snippet}
                  </Sidebar.MenuButton>
                </Sidebar.MenuItem>
              {/if}
            {/each}
            {#if role === 'admin'}
              <Sidebar.MenuItem>
                <Sidebar.MenuButton tooltipContent="Settings" isActive={path === '/settings' || path.startsWith('/settings/')} onclick={toggleSettings} aria-expanded={settingsOpen} aria-controls="settings-submenu">
                  <SettingsIcon />
                  <span>Settings</span>
                  <ChevronDown class={`ml-auto transition-transform group-data-[collapsible=icon]:hidden ${settingsOpen ? 'rotate-180' : ''}`} />
                </Sidebar.MenuButton>
                {#if settingsOpen}<Sidebar.MenuSub id="settings-submenu">
                  <Sidebar.MenuSubItem><Sidebar.MenuSubButton href="/settings/catalog" isActive={path === '/settings' || path === '/settings/catalog'} onclick={(event) => go(event, '/settings/catalog')}>Catalog</Sidebar.MenuSubButton></Sidebar.MenuSubItem>
                  <Sidebar.MenuSubItem><Sidebar.MenuSubButton href="/settings/team" isActive={path === '/settings/team'} onclick={(event) => go(event, '/settings/team')}>Team</Sidebar.MenuSubButton></Sidebar.MenuSubItem>
                  <Sidebar.MenuSubItem><Sidebar.MenuSubButton href="/settings/store" isActive={path === '/settings/store'} onclick={(event) => go(event, '/settings/store')}>Store</Sidebar.MenuSubButton></Sidebar.MenuSubItem>
                </Sidebar.MenuSub>{/if}
              </Sidebar.MenuItem>
            {/if}
          </Sidebar.Menu>
        </nav>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>
  <Sidebar.Footer class="border-t border-sidebar-border">
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton size="lg" tooltipContent="Sign out" onclick={logout}>
          <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent font-semibold text-sidebar-accent-foreground">{role === 'admin' ? 'A' : 'C'}</span>
          <span class="grid min-w-0 flex-1 leading-tight"><strong class="truncate capitalize">{role}</strong><span class="truncate text-xs text-sidebar-foreground/70">Sign out</span></span>
          <LogOut class="ml-auto" />
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Footer>
</Sidebar.Root>
