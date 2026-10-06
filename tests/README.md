# Renderer metadata regression tests

Run `npm ci --ignore-scripts`, then `npm run test:renderer`. The runner verifies
the locked React 18.3.1, ReactDOM 18.3.1, esbuild 0.21.5, and jsdom 26.1.0
versions. It bundles the real renderer into an operating-system temporary
directory, runs Node's test runner, and removes the temporary output.

Only renderer-local source imports and the shared external React instance are
permitted. Tests mount the real App, click its real Sidebar and panel actions,
and assert main-panel labels, paths, capacity, free space, file system,
protection, loading, error, and retry state. React Profiler records the first
committed selection frame, before passive effects can hide a transient mismatch.
StrictMode covers App's initial effect replay plus later selection races.
Null metadata results show the selected summary with an unavailable status and
retry action; stale null results cannot disturb the current request. The
controller suite also checks undefined results and preserves the resolved
metadata continuation value without throwing.

Every allowed synthetic IPC read has an exact expected method and argument
list. Unexpected reads, all mutation commands, window-control commands, alerts,
confirms, browser network APIs, and Node network transports fail the tests.
jsdom loads no external resources. Electron, backend code, real disk discovery,
formatting, partition operations, and packaged builds are never run.

Completion tests call callback props from the mounted React tree directly. They
exercise only App's renderer list/metadata refresh continuation, without
submitting or simulating a successful disk operation. Fiber access is also used
for deselection and unsupported identities because Sidebar has no buttons for
those cases. Format, Extend, and Shrink tests only open and cancel previews.
The separate controller suite tests the metadata ownership seam; it does not
execute the drive-letter assignment handler or claim mutation coverage.

To compare the unchanged App tests against a separate baseline source tree:

```sh
DEVICE_INFO_SOURCE_ROOT=/absolute/path/to/baseline/source npm run test:renderer -- --panel-only
```

The baseline tree is read only. `--panel-only` omits controller tests because the
controller does not exist before the fix. Expected regression failures produce
a nonzero exit status; they are not inverted into passing assertions. Redirect
test logs outside the source tree when collecting evidence. Optionally set
`DEVICE_INFO_NODE_MODULES` to an existing directory containing the same locked
dependencies; by default the current checkout's dependencies are used.

These are renderer DOM regression tests, not native Windows or Electron disk
operation validation, visual screenshot tests, or end-to-end device tests.
