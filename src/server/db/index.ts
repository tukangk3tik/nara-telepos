import { Database } from 'bun:sqlite'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { schema } from './schema'

export type DatabaseClient = BunSQLiteDatabase<typeof schema> & { $client: Database }

export function createDatabase(filename: string): DatabaseClient {
  return drizzle(new Database(filename), { schema })
}

export { schema }
