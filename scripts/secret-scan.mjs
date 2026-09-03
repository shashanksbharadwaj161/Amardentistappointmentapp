import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean)

const rules = [
  { name: 'JWT-like credential', pattern: /eyJ[a-zA-Z0-9_-]{18,}\.[a-zA-Z0-9_-]{18,}\.[a-zA-Z0-9_-]{10,}/ },
  { name: 'OpenAI-style secret', pattern: /\bsk-[a-zA-Z0-9_-]{20,}/ },
  { name: 'Private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'Supabase service key value', pattern: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*(?!your-|replace-)[^\s#]{16,}/ },
]

const findings = []
for (const file of files) {
  if (/\.(?:png|jpe?g|gif|ico|mp4|pdf|lock)$/i.test(file)) continue
  let contents
  try { contents = readFileSync(file, 'utf8') } catch { continue }
  for (const rule of rules) if (rule.pattern.test(contents)) findings.push(`${file}: ${rule.name}`)
}

if (findings.length) {
  console.error(`Secret scan failed:\n${findings.join('\n')}`)
  process.exit(1)
}
console.log(`Secret scan passed (${files.length} files checked).`)
