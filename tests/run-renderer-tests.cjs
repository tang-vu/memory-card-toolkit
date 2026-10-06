const assert = require('node:assert/strict');
const { mkdtempSync, realpathSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');

// Compile only App's renderer dependency graph. This never launches Electron,
// Vite, a development server, a packaged application, or a real disk API.
const sourceRoot = realpathSync(process.env.DEVICE_INFO_SOURCE_ROOT || path.join(__dirname, '..'));
const moduleRoot = realpathSync(process.env.DEVICE_INFO_NODE_MODULES || path.join(__dirname, '..', 'node_modules'));
const dependencyRequire = createRequire(path.join(moduleRoot, '..', 'package.json'));
for (const [name, version] of Object.entries({
    react: '18.3.1', 'react-dom': '18.3.1', esbuild: '0.21.5', jsdom: '26.1.0',
})) {
    assert.equal(dependencyRequire(`${name}/package.json`).version, version, `Use locked ${name} ${version}`);
}
const esbuild = dependencyRequire('esbuild');
const rendererRoot = realpathSync(path.join(sourceRoot, 'src', 'renderer'));
const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'disk-panel-renderer-test-'));
const bundle = path.join(temporaryDirectory, 'app.cjs');
const controllerBundle = path.join(temporaryDirectory, 'device-info-requests.cjs');
const panelOnly = process.argv.includes('--panel-only');

function localRendererPath(candidate) {
    const options = [candidate, `${candidate}.js`, `${candidate}.jsx`, path.join(candidate, 'index.js')];
    const found = options.find(file => existsSync(file));
    assert.ok(found, `Renderer module not found: ${candidate}`);
    const resolved = realpathSync(found);
    assert.ok(resolved.startsWith(`${rendererRoot}${path.sep}`), `Non-renderer import forbidden: ${resolved}`);
    return resolved;
}

const rendererOnlyImports = {
    name: 'renderer-only-imports',
    setup(build) {
        build.onResolve({ filter: /.*/ }, args => {
            if (args.path === 'react') return { path: args.path, external: true };
            assert.ok(args.kind === 'entry-point' || args.path.startsWith('.'),
                `External renderer import forbidden: ${args.path}`);
            return { path: localRendererPath(path.resolve(args.resolveDir, args.path)) };
        });
    },
};

(async () => {
    try {
        await esbuild.build({
            entryPoints: [path.join(rendererRoot, 'App.jsx')],
            outfile: bundle,
            bundle: true,
            platform: 'node',
            format: 'cjs',
            jsx: 'transform',
            keepNames: true,
            sourcemap: false,
            logLevel: 'silent',
            plugins: [rendererOnlyImports],
        });
        if (!panelOnly) {
            await esbuild.build({
                entryPoints: [localRendererPath(path.join(rendererRoot, 'hooks', 'deviceInfoRequests.js'))],
                outfile: controllerBundle,
                bundle: true,
                platform: 'node',
                format: 'cjs',
                logLevel: 'silent',
                plugins: [rendererOnlyImports],
            });
        }
        const result = spawnSync(process.execPath, [
            '--test', '--test-concurrency=1', ...process.argv.slice(2).filter(arg => arg !== '--panel-only'),
            path.join(__dirname, 'panel-metadata.test.cjs'),
            ...(!panelOnly ? [path.join(__dirname, 'device-info-requests.test.cjs')] : []),
        ], {
            stdio: 'inherit',
            env: {
                ...process.env,
                NODE_ENV: 'test',
                NODE_PATH: moduleRoot,
                DEVICE_INFO_NODE_MODULES: moduleRoot,
                DEVICE_INFO_APP_BUNDLE: bundle,
                DEVICE_INFO_REQUESTS_BUNDLE: controllerBundle,
            },
        });
        if (result.error) throw result.error;
        process.exitCode = result.status === null ? 1 : result.status;
    } finally {
        rmSync(temporaryDirectory, { recursive: true, force: true });
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
