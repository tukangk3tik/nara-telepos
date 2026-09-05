import { createBootstrapAdmin } from './auth'
import { loadConfig } from './config'
import { createDatabase } from './db'

const [name, email, password] = process.argv.slice(2)
const config = loadConfig(process.env)
const admin = await createBootstrapAdmin(createDatabase(config.databaseUrl), { name: name ?? '', email: email ?? '', password: password ?? '' })
console.log(`Created administrator ${admin.email}`)
