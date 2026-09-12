<script lang="ts">
  import { api } from '../lib/api'
  import { Alert } from '$lib/components/ui/alert/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Label } from '$lib/components/ui/label/index.js'

  export let onSuccess: () => void

  let email = ''
  let password = ''
  let error = ''
  let submitting = false

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    error = ''
    submitting = true
    try {
      await api<void>('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      onSuccess()
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not sign in'
    } finally {
      submitting = false
    }
  }
</script>

<main class="mx-auto mt-[12vh] max-w-md px-4">
  <Card>
    <CardHeader>
      <CardTitle>Nara TelePOS</CardTitle>
      <p class="text-sm text-slate-500">Sign in to start a sale or manage the store.</p>
    </CardHeader>
    <CardContent>
      <form class="grid gap-4" onsubmit={submit}>
        <div class="grid gap-2">
          <Label for="email">Email</Label>
          <Input id="email" type="email" bind:value={email} autocomplete="email" required />
        </div>
        <div class="grid gap-2">
          <Label for="password">Password</Label>
          <Input id="password" type="password" bind:value={password} autocomplete="current-password" required />
        </div>
        {#if error}<Alert variant="destructive" role="alert">{error}</Alert>{/if}
        <Button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</Button>
      </form>
    </CardContent>
  </Card>
</main>
