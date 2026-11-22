import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const development = process.argv.includes('--dev')
let phpServer, viteServer

function findPhp() {
  const candidates = [process.env.BRENNWERK_PHP, join(root, '.runtime', 'php', 'php.exe'), 'php'].filter(Boolean)
  for (const binary of candidates) {
    try {
      const inspect = 'echo json_encode([PHP_VERSION_ID, extension_loaded("pdo_sqlite"), ini_get("extension_dir")]);'
      const [version, sqlite, extensionDir] = JSON.parse(execFileSync(binary, ['-r', inspect], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 }))
      if (version < 80100) continue
      const flags = []
      if (!sqlite) {
        const extensions = existsSync(join(dirname(binary), 'ext')) ? join(dirname(binary), 'ext') : extensionDir
        flags.push('-d', `extension_dir=${extensions}`, '-d', 'extension=pdo_sqlite')
        execFileSync(binary, [...flags, '-r', 'exit(extension_loaded("pdo_sqlite") ? 0 : 1);'], { windowsHide: true, stdio: 'pipe', timeout: 10000 })
      }
      return { binary, flags }
    } catch { /* Try the next installed PHP runtime. */ }
  }
  throw new Error('PHP 8.1+ mit PDO_SQLite fehlt. PHP installieren oder BRENNWERK_PHP auf die php.exe setzen.')
}

async function unusedPort(requested = 0) {
  const socket = createNetServer()
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(requested, '127.0.0.1', resolve) })
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  return port
}

function close() {
  phpServer?.kill()
  return viteServer?.close()
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { close(); process.exit(0) })
process.once('exit', () => phpServer?.kill())

try {
  const { binary, flags } = findPhp()
  const requestedPort = Number(process.env.BRENNWERK_PORT || 8080)
  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) throw new Error('BRENNWERK_PORT muss eine gültige Portnummer sein.')
  const port = await unusedPort(development ? 0 : requestedPort)
  const sessions = join(root, '.runtime', 'sessions')
  mkdirSync(sessions, { recursive: true })
  phpServer = spawn(binary, [...flags, '-d', `session.save_path=${sessions}`, '-d', 'default_socket_timeout=5', '-S', `127.0.0.1:${port}`, '-t', root, join(root, 'scripts', 'router.php')], { cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  let serverError = ''
  phpServer.stderr.on('data', chunk => { serverError = (serverError + chunk).slice(-2000) })
  phpServer.on('error', error => { serverError = error.message })
  const url = `http://127.0.0.1:${port}`
  let listening = false
  for (let attempt = 0; attempt < 50; attempt++) {
    if (phpServer.exitCode !== null || phpServer.signalCode !== null) break
    try {
      const response = await fetch(`${url}/api/index.php?action=availability`, { signal: AbortSignal.timeout(1000) })
      await response.json()
      if (phpServer.exitCode !== null || phpServer.signalCode !== null) break
      listening = true
      break
    } catch { await new Promise(resolve => setTimeout(resolve, 100)) }
  }
  if (!listening) throw new Error(`PHP-Buchungsserver konnte nicht starten. ${serverError.trim()}`)

  if (development) {
    const { createServer } = await import('vite')
    viteServer = await createServer({
      root,
      server: {
        host: '127.0.0.1',
        proxy: { '/api': { target: url } },
        fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/private/**', '**/.runtime/**', '**/*.zip'] },
      },
      plugins: [{
        name: 'protect-booking-data',
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            let path
            try { path = decodeURIComponent((request.url || '/').split('?')[0]).replaceAll('\\', '/') } catch { response.writeHead(400).end(); return }
            if (/(^|\/)(private|\.runtime|\.git)(\/|$)/i.test(path) || (/\.php(?:\/|$)/i.test(path) && path !== '/api/index.php')) {
              response.writeHead(403).end('Zugriff verweigert.'); return
            }
            next()
          })
        },
      }],
    })
    await viteServer.listen()
    viteServer.printUrls()
    console.log('  Buchungskalender: PHP und SQLite sind angebunden. E-Mail-Versand benötigt eine konfigurierte Server-Mailadresse.')
  } else {
    console.log(`Website mit Buchungskalender: ${url}/`)
    console.log(`Buchungsverwaltung: ${url}/admin.html`)
  }
  phpServer.once('exit', code => { if (code !== null) { console.error('PHP-Buchungsserver wurde beendet.'); close(); process.exitCode = code || 1 } })
} catch (error) {
  console.error(error.message)
  await close()
  process.exitCode = 1
}
