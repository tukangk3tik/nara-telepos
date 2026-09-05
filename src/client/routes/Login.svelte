<script lang="ts">
  import { api } from '../lib/api'

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

<main class="auth-card">
  <h1>Nara TelePOS</h1>
  <p>Sign in to start a sale or manage the store.</p>
  <form onsubmit={submit}>
    <label>Email <input type="email" bind:value={email} autocomplete="email" required /></label>
    <label>Password <input type="password" bind:value={password} autocomplete="current-password" required /></label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
  </form>
</main>
