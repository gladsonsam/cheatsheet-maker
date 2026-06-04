// Bundles the Electron main and preload TypeScript into CommonJS files under
// dist-electron/. They're emitted as .cjs so Node/Electron treat them as
// CommonJS even though the package is "type": "module". chokidar (and any other
// node deps) are inlined, so the packaged app needs no runtime node_modules.
import { build } from 'esbuild'

const common = {
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    sourcemap: true,
    // Electron is provided by the runtime; everything else gets bundled in.
    external: ['electron'],
    logLevel: 'info',
}

export async function buildElectron() {
    await Promise.all([
        build({
            ...common,
            entryPoints: ['electron/main.ts'],
            outfile: 'dist-electron/main.cjs',
        }),
        build({
            ...common,
            entryPoints: ['electron/preload.ts'],
            outfile: 'dist-electron/preload.cjs',
        }),
    ])
}

// Run directly: `node scripts/build-electron.mjs`
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-electron.mjs')) {
    buildElectron().catch((error) => {
        console.error(error)
        process.exit(1)
    })
}
