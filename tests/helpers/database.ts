import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { createDatabase } from '../../src/server/db'

export function createTestDatabase() {
  const db = createDatabase(':memory:')
  migrate(db, { migrationsFolder: 'drizzle' })
  return db
}
