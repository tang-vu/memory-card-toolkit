const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDeviceInfoRequests, getDeviceInfoTarget } = require(process.env.DEVICE_INFO_REQUESTS_BUNDLE);

// This file exercises only the metadata ownership seam. It never imports App's
// assignment handler, simulates a disk mutation, or exposes an electronAPI.
test('metadata target validation accepts logical drives and physical disk zero', () => {
    assert.deepEqual(getDeviceInfoTarget({ driveLetter: 'X:', diskNumber: 4 }), { method: 'getInfo', value: 'X:' });
    assert.deepEqual(getDeviceInfoTarget({ driveLetter: 'x:' }), { method: 'getInfo', value: 'x:' });
    assert.deepEqual(getDeviceInfoTarget({ diskNumber: 0 }), { method: 'getPhysicalInfo', value: 0 });
    for (const device of [null, undefined, {}, { diskNumber: -1 }, { diskNumber: 1.5 }, { diskNumber: NaN },
        { diskNumber: Infinity }, { diskNumber: '4' }, { driveLetter: 'X' }, { driveLetter: 'XY:' },
        { driveLetter: 'X:\\' }, { driveLetter: 'invalid', diskNumber: 4 }, { driveLetter: 7, diskNumber: 4 }]) {
        assert.equal(getDeviceInfoTarget(device), null, 'Unsupported identity has no metadata IPC target');
    }
});

test('post-assignment metadata seam cannot publish an updated object before selection commits', () => {
    const states = [];
    const requests = createDeviceInfoRequests(state => states.push(state));
    const original = { diskNumber: 3 };
    const updated = { diskNumber: 3, driveLetter: 'Z:' };
    const originalOwner = { device: original };
    requests.activate(originalOwner);
    const token = requests.begin(originalOwner, updated);
    assert.equal(token, null, 'Updated selection is not owned by the pre-commit renderer');
    requests.complete(token, { label: 'Pre-commit metadata must stay hidden' });
    requests.fail(token);
    assert.deepEqual(states, []);

    const committedOwner = { device: updated };
    requests.activate(committedOwner);
    const committed = requests.begin(committedOwner, updated);
    assert.ok(committed);
    const info = { label: 'Committed metadata' };
    requests.complete(committed, info);
    assert.deepEqual(states.at(-1), { owner: committedOwner, status: 'ready', info });
});

test('post-assignment metadata seam admits only the latest read for the committed owner', () => {
    const states = [];
    const requests = createDeviceInfoRequests(state => states.push(state));
    const updated = { diskNumber: 3, driveLetter: 'Z:' };
    const owner = { device: updated };
    requests.activate(owner);
    const earlier = requests.begin(owner, updated);
    const latest = requests.begin(owner, updated);
    const info = { label: 'Latest committed metadata' };
    requests.complete(latest, info);
    const count = states.length;
    requests.complete(earlier, { label: 'Obsolete direct metadata' });
    requests.complete(earlier, null);
    requests.complete(earlier, undefined);
    requests.fail(earlier);
    assert.equal(states.length, count);
    assert.deepEqual(states.at(-1), { owner, status: 'ready', info });
});

for (const absent of [null, undefined]) {
    test(`${String(absent)} awaited metadata records unavailable state without throwing or changing the continuation result`, async () => {
        const states = [];
        const requests = createDeviceInfoRequests(state => states.push(state));
        const device = { diskNumber: 3, driveLetter: 'Z:' };
        const owner = { device };
        requests.activate(owner);
        const token = requests.begin(owner, device);

        // Only the metadata continuation is exercised. An absent read result
        // remains a resolved value, even though the panel reports unavailable.
        const continuation = async () => {
            const info = await Promise.resolve(absent);
            requests.complete(token, info);
            return info;
        };
        assert.equal(await continuation(), absent);
        assert.equal(states.length, 2);
        assert.deepEqual(states.at(-1), { owner, status: 'error', info: null });
    });
}

test('rejected awaited metadata keeps its error identity while the seam records failure', async () => {
    const states = [];
    const requests = createDeviceInfoRequests(state => states.push(state));
    const device = { diskNumber: 3, driveLetter: 'Z:' };
    const owner = { device };
    requests.activate(owner);
    const token = requests.begin(owner, device);
    const error = new Error('Synthetic direct metadata read rejection');

    // This is the isolated read continuation contract, not the assignment
    // handler: a rejected read stays rejected when fail(token) records status.
    const rejectedRead = Promise.reject(error);
    await assert.rejects(async () => {
        try {
            const info = await rejectedRead;
            requests.complete(token, info);
        } catch (caught) {
            requests.fail(token);
            throw caught;
        }
    }, caught => caught === error);
    assert.deepEqual(states.at(-1), { owner, status: 'error', info: null });
});

test('deactivation and replacement owners reject retained metadata continuations', () => {
    const states = [];
    const requests = createDeviceInfoRequests(state => states.push(state));
    const device = { driveLetter: 'Z:' };
    const owner = { device };
    requests.activate(owner);
    const old = requests.begin(owner, device);
    requests.deactivate(owner);
    const count = states.length;
    requests.complete(old, { label: 'Unmounted metadata' });
    requests.fail(old);
    assert.equal(requests.begin(owner, device), null);
    assert.equal(states.length, count);

    const replacement = { device };
    requests.activate(replacement);
    const current = requests.begin(replacement, device);
    requests.deactivate(owner);
    requests.complete(current, { label: 'Current owner metadata' });
    assert.equal(states.at(-1).status, 'ready', 'Stale cleanup does not deactivate the current owner');
    assert.equal(requests.begin(owner, device), null);
});
