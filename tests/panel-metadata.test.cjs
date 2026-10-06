const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const path = require('node:path');
const dependencyRequire = createRequire(path.join(process.env.DEVICE_INFO_NODE_MODULES, '..', 'package.json'));
const { JSDOM } = dependencyRequire('jsdom');
const React = dependencyRequire('react');
const { act } = React;

// Establish the browser globals before loading ReactDOM. No jsdom resource
// loader or script execution is enabled, and every transport below is denied.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://renderer.invalid/' });
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = dependencyRequire('react-dom/client');

const LOADING = 'Loading device details. Showing the selected device summary.';
const ERROR = 'Device details unavailable. Showing the selected device summary.';
const A = { diskNumber: 11, driveLetter: 'X:', label: 'Summary A', size: 32, freeSpace: 10, fileSystem: 'FAT32' };
const B = { diskNumber: 22, driveLetter: 'Y:', label: 'Summary B', size: 64, freeSpace: 40, fileSystem: 'exFAT' };
const P = { diskNumber: 0, driveLetter: null, label: 'Summary physical zero', size: 96, freeSpace: 0, fileSystem: 'RAW', partitionStyle: 'GPT' };
const INFO_A = { ...A, label: 'Metadata A', size: 137, freeSpace: 27, fileSystem: 'META_A', isProtected: true };
const INFO_B = { ...B, label: 'Metadata B', size: 251, freeSpace: 51, fileSystem: 'META_B', isProtected: false };
const INFO_P = { ...P, label: 'Metadata physical zero', size: 379, partitionStyle: 'META_GPT', status: 'Metadata online' };

function disk(summary) {
    return {
        ...summary,
        name: `Synthetic disk ${summary.diskNumber}`,
        isRemovable: true,
        layout: { items: [{ type: 'partition', partitionNumber: 1, sizeGB: summary.size, ...summary }] },
    };
}
const DEVICES = [A, B, P].map(disk);

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function createReadOnlyBoundary() {
    const expected = [];
    const calls = [];
    const violations = [];
    const allowed = new Set(['getAllIncludingInternal', 'getInfo', 'getPhysicalInfo', 'getResizeLimits', 'canExtend']);
    const deny = label => (...args) => {
        const error = new Error(`Forbidden test side effect: ${label}`);
        violations.push({ label, args });
        throw error;
    };
    const api = new Proxy({}, {
        get(_target, method) {
            return (...args) => {
                calls.push({ method, args });
                if (!allowed.has(method)) return deny(`disk.${String(method)}`)(...args);
                const next = expected.shift();
                try {
                    assert.ok(next, `Unexpected read: disk.${String(method)}(${JSON.stringify(args)})`);
                    assert.equal(method, next.method, 'Exact synthetic IPC method');
                    assert.deepEqual(args, next.args, 'Exact synthetic IPC arguments');
                } catch (error) {
                    violations.push({ label: error.message, args });
                    throw error;
                }
                return next.response.promise;
            };
        },
    });
    window.electronAPI = new Proxy({ disk: api }, {
        get(target, property) { return property === 'disk' ? target.disk : deny(`electronAPI.${String(property)}`); },
    });
    const restore = [];
    function patch(target, property, value) {
        const descriptor = Object.getOwnPropertyDescriptor(target, property);
        Object.defineProperty(target, property, { value, configurable: true, writable: true });
        restore.push(() => descriptor ? Object.defineProperty(target, property, descriptor) : delete target[property]);
    }
    for (const target of [global, window]) {
        for (const name of ['alert', 'confirm', 'prompt', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) {
            patch(target, name, deny(name));
        }
    }
    patch(window, 'open', deny('window.open'));
    patch(navigator, 'sendBeacon', deny('navigator.sendBeacon'));
    for (const [moduleName, methods] of [
        ['node:http', ['request', 'get']], ['node:https', ['request', 'get']],
        ['node:net', ['connect', 'createConnection']], ['node:tls', ['connect']],
        ['node:dgram', ['createSocket']], ['node:dns', ['lookup', 'resolve']],
    ]) {
        const module = require(moduleName);
        for (const method of methods) patch(module, method, deny(`${moduleName}.${method}`));
    }
    patch(require('node:net').Socket.prototype, 'connect', deny('net.Socket.connect'));
    return {
        calls,
        expect(method, args, value) {
            assert.ok(allowed.has(method), 'Tests may expect read-only methods only');
            const response = deferred();
            expected.push({ method, args, response });
            if (arguments.length === 3) response.resolve(value);
            return response;
        },
        assertClean() {
            assert.deepEqual(violations, [], 'No mutations, unexpected reads, alerts, confirms, or network');
            assert.deepEqual(expected.map(({ method, args }) => ({ method, args })), [], 'All expected reads occurred');
        },
        restore() { restore.reverse().forEach(callback => callback()); delete window.electronAPI; },
    };
}

async function flush(callback = () => {}) {
    await act(async () => { await callback(); await Promise.resolve(); });
}

async function mounted(t, { strict = false } = {}) {
    const boundary = createReadOnlyBoundary();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    let unmounted = false;
    const consoleErrors = [];
    const commits = [];
    const originalError = console.error;
    console.error = (...args) => { consoleErrors.push(args); };
    async function unmount() {
        if (unmounted) return;
        await flush(() => root.unmount());
        unmounted = true;
    }
    t.after(async () => {
        try {
            await unmount();
            boundary.assertClean();
            const unexpected = consoleErrors.filter(args => !String(args[0]).startsWith('Error fetching device info:'));
            assert.deepEqual(unexpected, [], 'No unexpected renderer errors or React warnings');
        } finally {
            console.error = originalError;
            boundary.restore();
            host.remove();
        }
    });
    boundary.expect('getAllIncludingInternal', [], DEVICES);
    if (strict) boundary.expect('getAllIncludingInternal', [], DEVICES);
    // Load application code only after side-effect guards are installed.
    const App = require(process.env.DEVICE_INFO_APP_BUNDLE).default;
    const app = React.createElement(React.Profiler, {
        id: 'real-app-panel',
        onRender() {
            const currentPanel = host.querySelector('main.content-panel');
            commits.push({
                label: currentPanel?.querySelector('.device-header__name')?.textContent,
                path: currentPanel?.querySelector('.device-header__path')?.textContent,
                text: currentPanel?.textContent,
            });
        },
    }, React.createElement(App));
    await flush(() => root.render(strict ? React.createElement(React.StrictMode, null, app) : app));
    const panel = () => {
        const result = host.querySelector('main.content-panel');
        assert.ok(result, 'Real App main panel is mounted');
        return result;
    };
    function fiberProps(name) {
        function find(node) {
            if (!node) return null;
            if (node.type?.name === name) return node.memoizedProps;
            return find(node.child) || find(node.sibling);
        }
        const props = find(root._internalRoot.current);
        assert.ok(props, `Mounted ${name} callback boundary exists`);
        return props;
    }
    async function select(summary) {
        const button = [...host.querySelectorAll('.device-item__main')]
            .find(element => element.querySelector('.device-item__name')?.textContent === (summary.driveLetter ? summary.label : 'Partition 1'));
        assert.ok(button, `Real Sidebar selection exists for ${summary.label}`);
        await flush(() => button.click());
    }
    async function action(title) {
        const button = [...panel().querySelectorAll('.action-card')]
            .find(element => element.querySelector('.action-card__title')?.textContent === title);
        assert.ok(button, `Real panel action ${title} exists`);
        await flush(() => button.click());
    }
    return { host, panel, boundary, select, action, fiberProps, unmount, commits };
}

function assertPanel(ui, selected, displayed) {
    const panel = ui.panel();
    assert.equal(panel.querySelector('.device-header__name')?.textContent, displayed.label);
    assert.equal(panel.querySelector('.device-header__path')?.textContent, selected.driveLetter || `Disk ${selected.diskNumber}`);
    const stats = Object.fromEntries([...panel.querySelectorAll('.stat-card')].map(card => [
        card.querySelector('.stat-card__label').textContent.trim(), card.querySelector('.stat-card__value').textContent.trim(),
    ]));
    assert.equal(stats['Total Capacity'], `${displayed.size}GB`);
    if (selected.driveLetter) {
        assert.equal(stats['Free Space'], `${displayed.freeSpace}GB`);
        assert.equal(stats['File System'], displayed.fileSystem);
        assert.equal(stats['Storage Used'], `${displayed.freeSpace ? Math.round((displayed.size - displayed.freeSpace) / displayed.size * 100) : 0}%`);
    } else {
        assert.equal(stats['Partition Style'], displayed.partitionStyle || 'RAW');
        assert.equal(stats['Disk Number'], `#${selected.diskNumber ?? ''}`);
    }
    assert.equal(panel.textContent.includes('Protected Drive'), Boolean(displayed.isProtected));
}

function assertStatus(ui, message) {
    const status = ui.panel().querySelector('[role="status"]');
    assert.ok(status, 'Main panel exposes metadata status');
    const textOnly = status.cloneNode(true);
    textOnly.querySelectorAll('button').forEach(button => button.remove());
    assert.equal(textOnly.textContent.trim(), message);
}

function assertReady(ui) {
    assert.equal(ui.panel().querySelector('[role="status"]'), null);
    assert.equal([...ui.panel().querySelectorAll('button')].some(button => button.textContent.trim() === 'Retry details'), false);
}

async function retry(ui) {
    const button = [...ui.panel().querySelectorAll('button')].find(element => element.textContent.trim() === 'Retry details');
    assert.ok(button, 'Visible retry action exists in main panel');
    await flush(() => button.click());
}

test('A to B: late A success cannot replace B metadata', async t => {
    const ui = await mounted(t);
    const a = ui.boundary.expect('getInfo', ['X:']);
    await ui.select(A);
    const b = ui.boundary.expect('getInfo', ['Y:']);
    await ui.select(B);
    await flush(() => b.resolve(INFO_B));
    assertPanel(ui, B, INFO_B);
    await flush(() => a.resolve(INFO_A));
    assertPanel(ui, B, INFO_B);
    assertReady(ui);
});

test('A to B to A: both first-A and B responses lose to the newest A request', async t => {
    const ui = await mounted(t);
    const a1 = ui.boundary.expect('getInfo', ['X:']);
    await ui.select(A);
    const b = ui.boundary.expect('getInfo', ['Y:']);
    await ui.select(B);
    const a2 = ui.boundary.expect('getInfo', ['X:']);
    await ui.select(A);
    const latest = { ...INFO_A, label: 'Newest metadata A', size: 449, freeSpace: 149 };
    await flush(() => a2.resolve(latest));
    await flush(() => b.resolve(INFO_B));
    await flush(() => a1.resolve(INFO_A));
    assertPanel(ui, A, latest);
    assertReady(ui);
});

test('loaded A to B: immediately show only B summary while B loads', async t => {
    const ui = await mounted(t);
    ui.boundary.expect('getInfo', ['X:'], INFO_A);
    await ui.select(A);
    assertPanel(ui, A, INFO_A);
    ui.commits.length = 0;
    const b = ui.boundary.expect('getInfo', ['Y:']);
    await ui.select(B);
    assert.ok(ui.commits.length > 0, 'Profiler observes the selection commit before passive effects');
    for (const commit of ui.commits) {
        assert.equal(commit.path, B.driveLetter);
        assert.equal(commit.label, B.label, 'Every committed B frame uses B summary, including before effects');
        assert.equal(commit.text.includes(INFO_A.label), false);
        assert.equal(commit.text.includes('Protected Drive'), false);
    }
    assertPanel(ui, B, B);
    assertStatus(ui, LOADING);
    await flush(() => b.resolve(INFO_B));
    assertPanel(ui, B, INFO_B);
    assertReady(ui);
});

test('loaded A to B error: keep B summary and retry only the current B target', async t => {
    const ui = await mounted(t);
    ui.boundary.expect('getInfo', ['X:'], INFO_A);
    await ui.select(A);
    const b = ui.boundary.expect('getInfo', ['Y:']);
    await ui.select(B);
    await flush(() => b.reject(new Error('Synthetic current B read failure')));
    assertPanel(ui, B, B);
    assertStatus(ui, ERROR);
    const retryRead = ui.boundary.expect('getInfo', ['Y:']);
    await retry(ui);
    assertPanel(ui, B, B);
    assertStatus(ui, LOADING);
    await flush(() => retryRead.resolve(INFO_B));
    assertPanel(ui, B, INFO_B);
    assertReady(ui);
});

for (const [selected, metadata] of [[B, INFO_B], [P, INFO_P]]) {
    test(`current ${selected.driveLetter ? 'logical' : 'physical'} null metadata shows unavailable summary and retries successfully`, async t => {
        const ui = await mounted(t);
        ui.boundary.expect('getInfo', ['X:'], INFO_A);
        await ui.select(A);
        const method = selected.driveLetter ? 'getInfo' : 'getPhysicalInfo';
        const args = [selected.driveLetter || selected.diskNumber];
        const missing = ui.boundary.expect(method, args);
        await ui.select(selected);
        await flush(() => missing.resolve(null));
        assertPanel(ui, selected, selected);
        assertStatus(ui, ERROR);
        const retried = ui.boundary.expect(method, args);
        await retry(ui);
        assertPanel(ui, selected, selected);
        assertStatus(ui, LOADING);
        await flush(() => retried.resolve(metadata));
        assertPanel(ui, selected, metadata);
        assertReady(ui);
    });
}

for (const moment of ['loading', 'loaded']) {
    test(`stale A null metadata cannot change B ${moment} state`, async t => {
        const ui = await mounted(t);
        const a = ui.boundary.expect('getInfo', ['X:']);
        await ui.select(A);
        const b = ui.boundary.expect('getInfo', ['Y:']);
        await ui.select(B);
        if (moment === 'loaded') await flush(() => b.resolve(INFO_B));
        await flush(() => a.resolve(null));
        assertPanel(ui, B, moment === 'loaded' ? INFO_B : B);
        if (moment === 'loaded') assertReady(ui);
        else {
            assertStatus(ui, LOADING);
            await flush(() => b.resolve(INFO_B));
            assertPanel(ui, B, INFO_B);
            assertReady(ui);
        }
    });
}

test('late A success cannot clear B current error or replace its summary', async t => {
    const ui = await mounted(t);
    const a = ui.boundary.expect('getInfo', ['X:']);
    await ui.select(A);
    const b = ui.boundary.expect('getInfo', ['Y:']);
    await ui.select(B);
    await flush(() => b.reject(new Error('Synthetic current B failure')));
    await flush(() => a.resolve(INFO_A));
    assertPanel(ui, B, B);
    assertStatus(ui, ERROR);
});

test('retry started for A cannot replace B after the selection changes', async t => {
    const ui = await mounted(t);
    const first = ui.boundary.expect('getInfo', ['X:']);
    await ui.select(A);
    await flush(() => first.reject(new Error('Synthetic A retryable failure')));
    const retried = ui.boundary.expect('getInfo', ['X:']);
    await retry(ui);
    ui.boundary.expect('getInfo', ['Y:'], INFO_B);
    await ui.select(B);
    await flush(() => retried.resolve(INFO_A));
    assertPanel(ui, B, INFO_B);
    assertReady(ui);
});

for (const moment of ['loading', 'loaded']) {
    test(`stale A rejection cannot change B ${moment} state`, async t => {
        const ui = await mounted(t);
        const a = ui.boundary.expect('getInfo', ['X:']);
        await ui.select(A);
        const b = ui.boundary.expect('getInfo', ['Y:']);
        await ui.select(B);
        if (moment === 'loaded') await flush(() => b.resolve(INFO_B));
        await flush(() => a.reject(new Error('Synthetic stale A failure')));
        assertPanel(ui, B, moment === 'loaded' ? INFO_B : B);
        if (moment === 'loaded') assertReady(ui);
        else {
            assertStatus(ui, LOADING);
            await flush(() => b.resolve(INFO_B));
            assertPanel(ui, B, INFO_B);
        }
    });
}

for (const [first, second, firstInfo, secondInfo] of [[P, B, INFO_P, INFO_B], [A, P, INFO_A, INFO_P]]) {
    test(`${first.driveLetter || 'physical disk 0'} to ${second.driveLetter || 'physical disk 0'}: metadata cannot cross target kinds`, async t => {
        const ui = await mounted(t);
        const read = summary => ui.boundary.expect(summary.driveLetter ? 'getInfo' : 'getPhysicalInfo', [summary.driveLetter || summary.diskNumber]);
        const old = read(first);
        await ui.select(first);
        const current = read(second);
        await ui.select(second);
        await flush(() => current.resolve(secondInfo));
        await flush(() => old.resolve(firstInfo));
        assertPanel(ui, second, secondInfo);
        assertReady(ui);
    });
}

for (const olderResult of ['success', 'error']) {
    test(`same-target renderer completion refresh: newest metadata wins over older ${olderResult}`, async t => {
        const ui = await mounted(t);
        ui.boundary.expect('getInfo', ['X:'], INFO_A);
        await ui.select(A);
        // This invokes App's renderer refresh callback directly. It never runs
        // ExtendModal's mutation handler or simulates a successful disk operation.
        const complete = ui.fiberProps('ExtendModal').onExtend;
        ui.boundary.expect('getAllIncludingInternal', [], DEVICES);
        const first = ui.boundary.expect('getInfo', ['X:']);
        let completion1;
        await flush(() => { completion1 = complete(); });
        ui.boundary.expect('getAllIncludingInternal', [], DEVICES);
        const second = ui.boundary.expect('getInfo', ['X:']);
        let completion2;
        await flush(() => { completion2 = complete(); });
        const latest = { ...INFO_A, label: 'Newest completion metadata', size: 503, freeSpace: 103 };
        await flush(() => second.resolve(latest));
        await flush(() => olderResult === 'success' ? first.resolve(INFO_A) : first.reject(new Error('Synthetic older refresh failure')));
        await flush(() => Promise.all([completion1, completion2]));
        assertPanel(ui, A, latest);
        assertReady(ui);
    });
}

test('current completion refresh failure clears previous details and keeps retry available', async t => {
    const ui = await mounted(t);
    ui.boundary.expect('getInfo', ['X:'], INFO_A);
    await ui.select(A);
    const complete = ui.fiberProps('ExtendModal').onExtend;
    ui.boundary.expect('getAllIncludingInternal', [], DEVICES);
    const refreshed = ui.boundary.expect('getInfo', ['X:']);
    let completion;
    await flush(() => { completion = complete(); });
    assertPanel(ui, A, A);
    assertStatus(ui, LOADING);
    await flush(() => refreshed.reject(new Error('Synthetic current completion refresh failure')));
    await flush(() => completion);
    assertPanel(ui, A, A);
    assertStatus(ui, ERROR);
    ui.boundary.expect('getInfo', ['X:'], INFO_A);
    await retry(ui);
    assertPanel(ui, A, INFO_A);
    assertReady(ui);
});

test('captured old Format completion after A to B cannot issue an A metadata read', async t => {
    const ui = await mounted(t);
    ui.boundary.expect('getInfo', ['X:'], INFO_A);
    await ui.select(A);
    await ui.action('Format');
    const complete = ui.fiberProps('FormatModal').onComplete;
    const cancel = [...ui.host.querySelectorAll('.modal button')].find(button => button.textContent.trim() === 'Cancel');
    await flush(() => cancel.click());
    ui.boundary.expect('getInfo', ['Y:'], INFO_B);
    await ui.select(B);
    ui.boundary.expect('getAllIncludingInternal', [], DEVICES);
    // The captured callback is the renderer-only completion boundary, not the
    // format submit button, handler, IPC command, or success simulation.
    await flush(() => complete());
    assertPanel(ui, B, INFO_B);
    assertReady(ui);
});

test('selection changes while old completion awaits inventory: no old-target metadata read', async t => {
    const ui = await mounted(t);
    ui.boundary.expect('getInfo', ['X:'], INFO_A);
    await ui.select(A);
    const complete = ui.fiberProps('ExtendModal').onExtend;
    const inventory = ui.boundary.expect('getAllIncludingInternal', []);
    let completion;
    await flush(() => { completion = complete(); });
    ui.boundary.expect('getInfo', ['Y:'], INFO_B);
    await ui.select(B);
    await flush(() => inventory.resolve(DEVICES));
    await flush(() => completion);
    assertPanel(ui, B, INFO_B);
    assertReady(ui);
});

test('unsupported identifiers invalidate pending metadata without making an IPC read', async t => {
    const ui = await mounted(t);
    const a = ui.boundary.expect('getInfo', ['X:']);
    await ui.select(A);
    const unsupported = { label: 'Unsupported selected summary', size: 17, freeSpace: 3, fileSystem: 'RAW' };
    // Sidebar has no deselect/invalid-target button. Use its mounted callback,
    // leaving the real App, hook and DeviceDetails rendering intact.
    await flush(() => ui.fiberProps('Sidebar').onDeviceSelect(unsupported));
    await flush(() => a.resolve(INFO_A));
    assertPanel(ui, unsupported, unsupported);
    assert.equal(ui.panel().textContent.includes('Metadata A'), false);
    for (const diskNumber of [-1, 1.5, Infinity, '11']) {
        await flush(() => ui.fiberProps('Sidebar').onDeviceSelect({ ...unsupported, diskNumber }));
        assert.equal(ui.panel().querySelector('.device-header__name').textContent, unsupported.label);
    }
});

for (const result of ['success', 'error']) {
    test(`deselection ignores pending ${result} and stays empty`, async t => {
        const ui = await mounted(t);
        const a = ui.boundary.expect('getInfo', ['X:']);
        await ui.select(A);
        await flush(() => ui.fiberProps('Sidebar').onDeviceSelect(null));
        await flush(() => result === 'success' ? a.resolve(INFO_A) : a.reject(new Error('Synthetic deselected failure')));
        assert.equal(ui.panel().querySelector('.empty-state__title')?.textContent, 'No Device Selected');
        assert.equal(ui.panel().querySelector('.device-header'), null);
        assert.equal(ui.panel().querySelector('[role="status"]'), null);
    });
    test(`unmount ignores pending ${result} without extra reads or React errors`, async t => {
        const ui = await mounted(t);
        const a = ui.boundary.expect('getInfo', ['X:']);
        await ui.select(A);
        await ui.unmount();
        await flush(() => result === 'success' ? a.resolve(INFO_A) : a.reject(new Error('Synthetic unmounted failure')));
        assert.equal(ui.host.childElementCount, 0);
    });
}

test('StrictMode mount replay and rapid selection retain current metadata ownership', async t => {
    const ui = await mounted(t, { strict: true });
    const a = ui.boundary.expect('getInfo', ['X:']);
    await ui.select(A);
    const b = ui.boundary.expect('getInfo', ['Y:']);
    await ui.select(B);
    await flush(() => b.resolve(INFO_B));
    await flush(() => a.resolve(INFO_A));
    assertPanel(ui, B, INFO_B);
    assertReady(ui);
});

test('Format, Extend and Shrink previews open and cancel with the selected B target', async t => {
    const ui = await mounted(t);
    const a = ui.boundary.expect('getInfo', ['X:']);
    await ui.select(A);
    ui.boundary.expect('getInfo', ['Y:'], INFO_B);
    await ui.select(B);
    await flush(() => a.resolve(INFO_A));
    const limits = { minSize: 32 * 1024 ** 3, maxSize: 64 * 1024 ** 3, minSizeGB: 32, maxSizeGB: 64 };
    for (const action of ['Format', 'Extend', 'Shrink']) {
        if (action !== 'Format') ui.boundary.expect('getResizeLimits', ['Y:'], limits);
        if (action === 'Extend') ui.boundary.expect('canExtend', ['Y:'], { canExtend: false, availableSpaceGB: 0, reason: 'Synthetic preview only' });
        await ui.action(action);
        const modal = ui.host.querySelector('.modal');
        assert.ok(modal, `${action} preview opened`);
        if (action === 'Format') {
            assert.ok(modal.textContent.includes('Formatting Y: (Summary B)'));
            assert.equal(modal.querySelector('input[placeholder="SDCARD"]').value, B.label);
            assert.ok(modal.querySelector('input[placeholder="Type Y to confirm"]'));
        } else assert.equal(modal.querySelector('.modal__title').textContent, `${action} Volume Y:`);
        const cancel = [...modal.querySelectorAll('button')].find(button => button.textContent.trim() === 'Cancel');
        assert.ok(cancel, 'Only cancel is clicked; no preview is submitted');
        await flush(() => cancel.click());
        assert.equal(ui.host.querySelector('.modal'), null);
        assertPanel(ui, B, INFO_B);
    }
});
