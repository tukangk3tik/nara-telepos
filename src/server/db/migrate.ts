import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { createDatabase } from './index'

const db = createDatabase(process.env.DATABASE_URL ?? 'telepos.sqlite')
migrate(db, { migrationsFolder: 'drizzle' })
db.$client.close()
