import { expect, test } from 'bun:test'
import { loadConfig } from '../src/server/config'

test('requires session and Telegram secrets when Telegram is enabled', () => {
  expect(() => loadConfig({ DATABASE_URL: ':memory:', APP_BASE_URL: 'http://localhost:3000' }))
    .toThrow('SESSION_SECRET is required')
})

test('requires Telegram secrets when Telegram is enabled', () => {
  expect(() => loadConfig({
    DATABASE_URL: ':memory:',
    SESSION_SECRET: 'test-secret',
    APP_BASE_URL: 'http://localhost:3000',
    TELEGRAM_ENABLED: 'true',
  })).toThrow('TELEGRAM_BOT_TOKEN is required')

  expect(() => loadConfig({
    DATABASE_URL: ':memory:',
    SESSION_SECRET: 'test-secret',
    APP_BASE_URL: 'http://localhost:3000',
    TELEGRAM_ENABLED: 'true',
    TELEGRAM_BOT_TOKEN: 'bot-token',
  })).toThrow('TELEGRAM_WEBHOOK_SECRET is required')
})
