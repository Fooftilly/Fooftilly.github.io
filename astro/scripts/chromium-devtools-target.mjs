/** Validate Chrome's DevTools page target before connecting the smoke test.
 *
 * Runtime.evaluate may use values derived from local build fixtures. Never
 * forward its CDP commands to a WebSocket origin supplied by an untrusted
 * /json/new response: only the loopback debugger started by this test is valid.
 */
export function chromiumPageWebSocketUrl(rawUrl, debuggerPort, targetId) {
  if (!Number.isInteger(debuggerPort) || debuggerPort < 1 || debuggerPort > 65535)
    throw new Error("Invalid local Chromium debugger port");
  if (typeof rawUrl !== "string" || typeof targetId !== "string" ||
      !/^[A-Za-z0-9-]{1,128}$/.test(targetId))
    throw new Error("Invalid Chromium page target");

  let url;
  try { url = new URL(rawUrl); }
  catch { throw new Error("Invalid Chromium DevTools WebSocket URL"); }
  if (url.protocol !== "ws:" || url.hostname !== "127.0.0.1" ||
      url.port !== String(debuggerPort) || url.username || url.password ||
      url.search || url.hash ||
      url.pathname !== "/devtools/page/" + targetId) {
    throw new Error("Chromium DevTools must use the expected loopback page target");
  }
  return url.href;
}
