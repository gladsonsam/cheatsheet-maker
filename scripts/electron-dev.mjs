// Dev launcher: bundles main/preload, starts the Vite dev server, waits for it
// to listen, then launches Electron pointed at the dev URL. Closing Electron
// tears down Vite. Editing the renderer hot-reloads via Vite; editing
// electron/*.ts requires re-running this script.
import { spawn } from 'node:child_process'
import net from 'node:net'
import electronPath from 'electron'
import { buildElectron } from './build-electron.mjs'

const PORT = 5173
const HOST = '127.0.0.1'

function waitForPort(port, host, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now()
        const attempt = () => {
            const socket = net.createConnection(port, host)
            socket.once('connect', () => {
                socket.destroy()
                resolve()
            })
            socket.once('error', () => {
                socket.destroy()
                if (Date.now() - startedAt > timeoutMs) {
                    reject(new Error(`Timed out waiting for Vite at http://${host}:${port}`))
                    return
                }
                setTimeout(attempt, 300)
            })
        }
        attempt()
    })
}

async function main() {
    await buildElectron()

    const vite = spawn(
        'npm',
        ['run', 'dev', '--', '--host', HOST, '--port', String(PORT), '--strictPort'],
        { stdio: 'inherit', shell: true },
    )

    await waitForPort(PORT, HOST)

    const electron = spawn(electronPath, ['.'], {
        stdio: 'inherit',
        env: { ...process.env, ELECTRON_RENDERER_URL: `http://${HOST}:${PORT}` },
    })

    const shutdown = () => {
        if (!vite.killed) vite.kill()
        process.exit(0)
    }

    electron.on('close', shutdown)
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
