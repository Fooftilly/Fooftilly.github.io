/** Inspect observed browser requests; this runs in tests, not on visitor pages. */
export function isExternalHttpRequest(requestUrl, siteOrigin) {
  // Browser-internal/data/blob requests are not remote HTTP traffic.
  const request = new URL(requestUrl);
  if (request.protocol !== "http:" && request.protocol !== "https:") return false;
  return request.origin !== new URL(siteOrigin).origin;
}

/** Never put potentially private query strings or credentials in CI logs. */
export function networkAuditLabel(requestUrl) {
  const url = new URL(requestUrl);
  return url.origin + url.pathname;
}
