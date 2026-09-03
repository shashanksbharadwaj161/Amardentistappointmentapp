import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

const detector = join(homedir(), '.agents', 'skills', 'impeccable', 'scripts', 'detect.mjs')
const result = spawnSync(
  process.execPath,
  [detector, '--json', 'apps/mobile/app', 'apps/mobile/src', 'apps/admin/src'],
  { stdio: 'inherit' },
)

if (result.error) {
  console.error(`Unable to run the UI audit: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
