type ApiFailure = { error?: unknown; code?: unknown; message?: unknown }

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init })
  const body = await response.json().catch(() => null) as T | ApiFailure | null

  if (!response.ok) {
    const failure = body as ApiFailure | null
    const message = typeof failure?.message === 'string' ? failure.message
      : typeof failure?.error === 'string' ? failure.error
        : typeof failure?.code === 'string' ? failure.code
          : `Request failed (${response.status})`
    throw new Error(message)
  }

  return body as T
}
