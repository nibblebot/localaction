// Applies DevTools-style touch emulation to a running Chromium instance
// over CDP and STAYS RESIDENT holding the session open. There is no
// command-line flag for this — the DevTools device toolbar works by
// sending these same Emulation.* commands — and Chromium scopes
// emulation overrides to the CDP session that set them: if this client
// disconnects, the overrides reset (verified: maxTouchPoints drops back
// to 0). So this process must live as long as the demo instance.
//
//   bun scripts/demo-touch-emulate.ts --debug-port 9222 \
//     [--url http://localhost:5173] [--ready-file /tmp/x.ready]
//
// What it turns on (re-applied on reconnect, e.g. after a renderer crash):
//   Emulation.setTouchEmulationEnabled   — navigator.maxTouchPoints = 5
//   Emulation.setEmitTouchEventsForMouse — mouse press/drag/release are
//     translated into touchstart/touchmove/touchend, followed by the
//     compatibility mouse events + click ("mobile" configuration, same
//     as DevTools), so the app's long-press drag path is exercisable
//     with an ordinary mouse while plain clicks keep working.
//
// Pointer media (pointer: coarse, hover: none) is NOT set here — the
// launcher covers it with --blink-settings so it's right from the first
// paint, before any CDP client could attach. Exits 0 once the browser's
// DevTools endpoint is gone (instance closed); exits 1 if no page target
// appears within the attach window.

const args = process.argv.slice(2);
let debugPort: number | undefined;
let urlPrefix: string | undefined;
let readyFile: string | undefined;
for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;
  if (arg === '--debug-port') {
    debugPort = Number(args[++i]);
  } else if (arg.startsWith('--debug-port=')) {
    debugPort = Number(arg.slice('--debug-port='.length));
  } else if (arg === '--url') {
    urlPrefix = args[++i];
  } else if (arg.startsWith('--url=')) {
    urlPrefix = arg.slice('--url='.length);
  } else if (arg === '--ready-file') {
    readyFile = args[++i];
  } else if (arg.startsWith('--ready-file=')) {
    readyFile = arg.slice('--ready-file='.length);
  } else {
    process.stderr.write(`unknown argument: ${arg}\n`);
    process.exit(2);
  }
}
if (!debugPort || !Number.isInteger(debugPort)) {
  process.stderr.write(
    'usage: demo-touch-emulate.ts --debug-port <n> [--url <prefix>] [--ready-file <path>]\n',
  );
  process.exit(2);
}

type Target = { type: string; url: string; webSocketDebuggerUrl: string };

const endpoint = `http://127.0.0.1:${debugPort}`;
const sleep = (ms: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
};

const endpointAlive = async (): Promise<boolean> =>
  fetch(`${endpoint}/json/version`)
    .then((r) => r.ok)
    .catch(() => false);

const findPage = async (): Promise<Target | undefined> => {
  const targets = (await fetch(`${endpoint}/json`)
    .then((r) => r.json())
    .catch(() => [])) as Target[];
  return targets.find(
    (t) => t.type === 'page' && (urlPrefix === undefined || t.url.startsWith(urlPrefix)),
  );
};

// Attaches to the page target, applies the emulation, then blocks until
// the WebSocket closes. Resolves false if the browser itself is gone.
const attachUntilClosed = async (): Promise<boolean> => {
  const page = await findPage();
  if (!page) return true; // caller retries while the browser is alive

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map<number, (msg: { error?: { message: string } }) => void>();
  const closed = Promise.withResolvers<void>();
  ws.onclose = () => closed.resolve();
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data)) as {
      id?: number;
      error?: { message: string };
    };
    if (msg.id !== undefined) {
      pending.get(msg.id)?.(msg);
      pending.delete(msg.id);
    }
  };

  const send = (method: string, params: Record<string, unknown>): Promise<void> => {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const id = nextId++;
    pending.set(id, (msg) =>
      msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(),
    );
    ws.send(JSON.stringify({ id, method, params }));
    return promise;
  };

  const opened = Promise.withResolvers<void>();
  ws.onopen = () => opened.resolve();
  ws.onerror = () => opened.reject(new Error('WebSocket connect failed'));
  await opened.promise;

  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
  console.log(`touch emulation applied  port=${debugPort}  target=${page.url}`);
  if (readyFile) await Bun.write(readyFile, 'ok\n');

  // Hold the session open (overrides are session-scoped) until the tab
  // or the browser goes away.
  const browserGone = (async () => {
    for (;;) {
      await sleep(2000);
      if (!(await endpointAlive())) return;
    }
  })();
  await Promise.race([closed.promise, browserGone]);
  const alive = await endpointAlive();
  try {
    ws.close();
  } catch {
    // already closed
  }
  return alive;
};

// Initial attach: fail loudly (launcher surfaces this) if no page target
// shows up within 10s of the DevTools endpoint being reachable.
const attachDeadline = Date.now() + 10_000;
for (;;) {
  if (!(await endpointAlive())) {
    process.stderr.write(`demo-touch-emulate: no DevTools endpoint on port ${debugPort}\n`);
    process.exit(1);
  }
  if (await findPage()) break;
  if (Date.now() > attachDeadline) {
    process.stderr.write(
      `demo-touch-emulate: no page target${urlPrefix ? ` matching ${urlPrefix}` : ''} after 10s\n`,
    );
    process.exit(1);
  }
  await sleep(250);
}

while (await endpointAlive()) {
  try {
    if (!(await attachUntilClosed())) break;
  } catch (e) {
    console.log(`demo-touch-emulate: ${(e as Error).message}; retrying`);
  }
  await sleep(1000);
}
process.exit(0);
