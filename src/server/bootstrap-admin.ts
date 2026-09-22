import { createBootstrapAdmin } from './auth'
import { loadConfig } from './config'
import { createDatabase } from './db'

type Credentials = { name: string; email: string; password: string }

async function readPassword() {
  const process = Bun.spawn(['sh', '-c', 'stty -echo; trap "stty echo" EXIT; printf "Password: " >&2; IFS= read -r password; printf "\\n" >&2; printf "%s" "$password"'], { stdin: 'inherit', stdout: 'pipe', stderr: 'inherit' })
  const password = await new Response(process.stdout).text()
  if (await process.exited) throw new Error('Could not read password')
  return password
}

export async function bootstrapCredentials(args: string[], ask: (label: string) => string | Promise<string> = (label) => prompt(label) ?? '', askPassword = readPassword): Promise<Credentials> {
  if (args.length) return { name: args[0] ?? '', email: args[1] ?? '', password: args[2] ?? '' }
  return { name: await ask('Name: '), email: await ask('Email: '), password: await askPassword() }
}

if (import.meta.main) {
  const config = loadConfig(process.env)
  const admin = await createBootstrapAdmin(createDatabase(config.databaseUrl), await bootstrapCredentials(process.argv.slice(2)))
  console.log(`Created administrator ${admin.email}`)
}
