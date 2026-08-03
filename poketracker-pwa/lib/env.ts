import 'server-only'

export function requireServerEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Fehlende Umgebungsvariable: ${name}`)
  return value
}

export function allowedUserEmail(): string {
  return requireServerEnv('ALLOWED_USER_EMAIL').toLowerCase()
}
