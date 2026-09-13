export type AppConfig = {
  databaseUrl: string
  sessionSecret: string
  appBaseUrl: string
  telegramEnabled: boolean
  telegramBotToken?: string
  telegramWebhookSecret?: string
}

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const telegramEnabled = env.TELEGRAM_ENABLED === 'true'

  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    sessionSecret: required(env, 'SESSION_SECRET'),
    appBaseUrl: required(env, 'APP_BASE_URL'),
    telegramEnabled,
    ...(telegramEnabled && {
      telegramBotToken: required(env, 'TELEGRAM_BOT_TOKEN'),
      telegramWebhookSecret: required(env, 'TELEGRAM_WEBHOOK_SECRET'),
    }),
  }
}
