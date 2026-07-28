// Single log format for client and server lifecycle events:
//   [localaction] <scope> — <message>
// Always on (not flag-gated). `console.info/warn/error` exist in both the
// browser and Bun, so server modules share this file (info → stdout,
// warn/error → stderr).
export function logInfo(scope: string, message: string): void {
  console.info(`[localaction] ${scope} — ${message}`);
}

export function logWarn(scope: string, message: string): void {
  console.warn(`[localaction] ${scope} — ${message}`);
}

export function logError(scope: string, message: string): void {
  console.error(`[localaction] ${scope} — ${message}`);
}
