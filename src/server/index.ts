import type { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { createApp } from './app'
import { loadConfig } from './config'
import { createDatabase } from './db'

function isServicePath(path: string) {
  return path === '/api' || path.startsWith('/api/') || path === '/telegram' || path.startsWith('/telegram/')
}

export function createServerApp(app: Hono, staticRoot = 'dist') {
  app.get('/health', (c) => c.json({ ok: true }))
  app.use('*', serveStatic({ root: staticRoot }))
  app.get('*', async (c) => isServicePath(c.req.path) ? c.notFound() : c.html(await Bun.file(`${staticRoot}/index.html`).text()))
  return app
}

if (import.meta.main) {
  const config = loadConfig(process.env)
  const app = createServerApp(createApp({
    db: createDatabase(config.databaseUrl),
    sessionSecret: config.sessionSecret,
    appBaseUrl: config.appBaseUrl,
    telegramEnabled: config.telegramEnabled,
    telegramBotToken: config.telegramBotToken,
    telegramWebhookSecret: config.telegramWebhookSecret,
  }))
  Bun.serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) })
}
