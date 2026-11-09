/** Opt-in bookmark link health checks; never imported into site runtime or CI builds. */
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

export const MAX_LINKS_PER_RUN = 10;
const USER_AGENT = 'PeronikoLinkAudit/1.0 (+https://www.peroniko.xyz/)';
const CLOSURE_PATTERNS = [
  /\b(?:our|this|the) (?:website|site|service|platform) (?:has|is|was) (?:now |permanently )?(?:closed|shut down|discontinued)\b/i,
  /\b(?:site|service|platform) you knew as\b[\s\S]{0,120}?\bhas closed its doors\b/i,
  /\bwe (?:have|are) (?:now )?(?:shutting|closing) (?:down|our doors)\b/i,
];

/** Extract readable text nodes, skipping scripts/styles/comments instead of
 * trying to sanitize HTML with regex. This is evidence extraction only; the
 * returned text is never interpreted as HTML or sent to the public site.
 */
export function readableHtmlText(html) {
  const ignored = new Set(['script', 'style', 'noscript', 'template']);
  const space = char => char === ' ' || char === '\t' || char === '\n' ||
    char === '\r' || char === '\f';
  const letter = char => char && ((char >= 'a' && char <= 'z') ||
    (char >= 'A' && char <= 'Z'));
  function tagAt(index) {
    let pos = index + 1;
    const closing = html[pos] === '/';
    if (closing) pos++;
    while (space(html[pos])) pos++;
    const start = pos;
    while (letter(html[pos])) pos++;
    if (pos === start || (html[pos] && !space(html[pos]) &&
        html[pos] !== '>' && html[pos] !== '/')) return null;
    const name = html.slice(start,pos).toLowerCase();
    let quote = '';
    for (; pos < html.length; pos++) {
      const char = html[pos];
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '>') return {name,closing,end:pos+1};
    }
    return null;
  }

  const chunks = [];
  let pos = 0, hidden = null;
  while (pos < html.length) {
    const next = html.indexOf('<',pos);
    if (next === -1) {
      if (!hidden) chunks.push(html.slice(pos));
      break;
    }
    if (!hidden) chunks.push(html.slice(pos,next));
    if (!hidden && html.startsWith('<!--',next)) {
      const end = html.indexOf('-->',next+4);
      pos = end === -1 ? html.length : end+3;
      chunks.push(' ');
      continue;
    }
    if (hidden && html[next+1] !== '/') {
      pos = next+1;
      continue;
    }
    const tag = tagAt(next);
    if (!tag) {
      if (!hidden) chunks.push('<');
      pos = next+1;
      continue;
    }
    if (hidden) {
      if (tag.closing && tag.name === hidden) hidden = null;
    } else if (!tag.closing && ignored.has(tag.name)) hidden = tag.name;
    if (!hidden) chunks.push(' ');
    pos = tag.end;
  }
  return chunks.join('').replace(/&(?:nbsp|amp|lt|gt|quot|apos|#160|#x0*a0);/gi, entity => {
    if (/^&(?:nbsp|#160|#x0*a0);$/i.test(entity)) return ' ';
    return ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"})[entity.toLowerCase()] ?? entity;
  }).replace(/\s+/g,' ').trim();
}

/** An HTTP status alone never proves whether linked functionality remains usable. */
export function classifyResponse({ statusCode, headers = {}, body = '', truncated = false }) {
  const contentType = String(headers['content-type'] ?? '').toLowerCase();
  const encoding = String(headers['content-encoding'] ?? 'identity').toLowerCase();
  if (statusCode === 429) return { status: 'rate-limited', evidence: 'HTTP 429' };
  if (statusCode === 401 || statusCode === 403) return { status: 'access-restricted', evidence: `HTTP ${statusCode}` };
  if (statusCode === 404 || statusCode === 410) return { status: 'http-not-found', evidence: `HTTP ${statusCode}` };
  if (statusCode < 200 || statusCode >= 300) return { status: 'http-error', evidence: `HTTP ${statusCode}` };
  if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml+xml')) {
    return { status: 'non-html-response', evidence: contentType || 'Unidentified media type' };
  }
  if (encoding !== 'identity') return { status: 'uninspected-encoding', evidence: `Content-Encoding: ${encoding}` };
  if (!body.trim()) return { status: 'empty-response', evidence: 'No readable response body' };
  // Ignore closure phrases in JavaScript, markup attributes and comments.
  const text = contentType.includes('text/plain') ? body.replace(/\s+/g,' ').trim()
    : readableHtmlText(body);
  if (/\b(?:just a moment|checking your browser|verify you are human|captcha challenge|access denied)\b/i.test(text.slice(0, 1000))) {
    return { status: 'challenge-suspected', evidence: text.slice(0, 180) };
  }
  const notice = CLOSURE_PATTERNS.map(pattern => text.match(pattern)).find(Boolean);
  if (notice) return { status: 'possible-closure', evidence: notice[0].slice(0, 180), truncated };
  return { status: 'reachable-unverified', evidence: `HTTP ${statusCode}; content does not establish service functionality`, truncated };
}

/** Conservatively refuse IP literals, credentials, private hostnames and custom ports. */
export function publicWebUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (isIP(host) || host.includes(':') || !host.includes('.') || host.endsWith('.') ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|onion|lan|home|corp)$/.test(host)) return null;
  if (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80')) return null;
  url.hash = '';
  return url;
}

/** Deny known private, link-local, metadata, shared, documentation and tunnel addresses. */
export function isPublicAddress(address) {
  const kind = isIP(address);
  if (kind === 4) {
    const [a,b,c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (kind === 6) {
    const parts = address.toLowerCase().split(':');
    const first = parseInt(parts[0], 16);
    const second = parseInt(parts[1] || '0', 16);
    // Global unicast only; refuse 6to4/Teredo and documentation ranges.
    return first >= 0x2000 && first <= 0x3fff && first !== 0x2002 &&
      !(first === 0x2001 && (second === 0 || second === 0xdb8));
  }
  return false;
}

export async function resolvePublicHost(url, resolve = dnsLookup, timeoutMs = 7000) {
  let timer;
  let answers;
  try {
    answers = await Promise.race([resolve(url.hostname, { all: true, verbatim: true }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('DNS timed out'), { code: 'ETIMEDOUT' })), timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
  if (!answers.length || answers.some(answer => !isPublicAddress(answer.address))) {
    throw Object.assign(new Error('DNS destination is not exclusively publicly routable'), { code: 'UNSAFE_DNS' });
  }
  return answers.find(answer => answer.family === 4) ?? answers[0];
}

/** Total deadline, independent of whether a remote peer keeps streaming bytes. */
export function createRequestDeadline(request, timeoutMs) {
  const timeout = setTimeout(() => request.destroy(Object.assign(
    new Error('Request deadline exceeded'), {code:'ETIMEDOUT'})),timeoutMs);
  return () => clearTimeout(timeout);
}

/** Pin a validated public DNS answer for each individual request, including robots. */
export async function requestPinnedPage(url, { timeoutMs = 7000, maxBytes = 65536, resolve = dnsLookup } = {}) {
  const selected = publicWebUrl(url.toString());
  if (!selected) throw Object.assign(new Error('Unsafe URL or port'), { code: 'UNSAFE_URL' });
  const { address, family } = await resolvePublicHost(selected, resolve, timeoutMs);
  return new Promise((done, fail) => {
    let finished = false;
    let cancelDeadline = () => {};
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      cancelDeadline();
      if (error) fail(error); else done(value);
    };
    const request = (selected.protocol === 'https:' ? httpsRequest : httpRequest)(selected, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,text/plain;q=0.8,*/*;q=0.1',
        'Accept-Encoding': 'identity',
      },
      autoSelectFamily: false,
      lookup: (_hostname, _options, callback) => callback(null, address, family),
    }, response => {
      let count = 0;
      const chunks = [];
      let truncated = false;
      const finishResponse = () => finish(null, {
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
        truncated,
      });
      response.on('data', chunk => {
        const take = Math.min(maxBytes - count, chunk.length);
        if (take > 0) chunks.push(chunk.subarray(0, take));
        count += take;
        if (count >= maxBytes) {
          truncated = true;
          finishResponse();
          response.destroy();
        }
      });
      response.on('end', finishResponse);
      response.on('error', error => finish(error));
    });
    cancelDeadline = createRequestDeadline(request,timeoutMs);
    request.setTimeout(timeoutMs, () => request.destroy(Object.assign(new Error('Request timed out'), { code: 'ETIMEDOUT' })));
    request.on('error', error => finish(error));
    request.end();
  });
}

/** Normalize robots paths to comparable octets: decode only escaped ASCII
 * unreserved characters and encode raw Unicode as percent-escaped UTF-8.
 * Reserved escapes stay encoded, so they cannot become * or $ operators.
 */
export function normalizeRobotsOctets(value) {
  return value.replace(/%[0-9a-fA-F]{2}|[^\x00-\x7F]/gu, token => {
    if (token[0] === '%') {
      const char = String.fromCharCode(Number.parseInt(token.slice(1),16));
      return /^[A-Za-z0-9._~-]$/.test(char) ? char : token.toUpperCase();
    }
    return encodeURIComponent(token).toUpperCase();
  });
}

/** Prefix glob matcher. Two-pointer backtracking has a bounded number of
 * steps and cannot explode exponentially on untrusted robots.txt wildcards.
 */
function robotPatternMatch(pattern, target) {
  if (!pattern) return false;
  const rule = normalizeRobotsOctets(pattern);
  const path = normalizeRobotsOctets(target);
  const anchored = rule.endsWith('$');
  const glob = anchored ? rule.slice(0,-1) : rule + '*';
  let i = 0, j = 0, star = -1, retry = 0;
  while (j < path.length) {
    // Wildcard syntax takes precedence even if the URL contains a literal *.
    if (i < glob.length && glob[i] === '*') { star = i++; retry = j; }
    else if (i < glob.length && glob[i] === path[j]) { i++; j++; }
    else if (star >= 0) { i = star + 1; j = ++retry; }
    else return false;
  }
  while (i < glob.length && glob[i] === '*') i++;
  return i === glob.length;
}

/** Standard longest-match precedence; unknown/non-200 robots are handled fail-closed upstream. */
export function robotsPermission(text, path, agent = 'PeronikoLinkAudit') {
  const groups = [];
  let agents = [], rules = [], startedRules = false;
  function push() {
    if (agents.length) groups.push({agents,rules});
    agents = []; rules = []; startedRules = false;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s*#.*$/, '').trim();
    if (!line) continue;
    const match = /^([\w-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const [,key,value] = match;
    if (key.toLowerCase() === 'user-agent') {
      if (startedRules) push();
      agents.push(value.toLowerCase());
    } else if (agents.length && (key.toLowerCase() === 'allow' || key.toLowerCase() === 'disallow')) {
      startedRules = true;
      if (value.length <= 256) rules.push({type:key.toLowerCase(),pattern:value});
      else rules.push({type:'unparsed-rule'});
    } else if (agents.length && key.toLowerCase() === 'crawl-delay') {
      startedRules = true;
      if (/^\d{1,3}(?:\.\d{1,2})?$/.test(value)) rules.push({type:'crawl-delay',seconds:Number(value)});
      else if (value) rules.push({type:'unparsed-rule'});
    }
  }
  push();
  const query = agent.toLowerCase();
  const applicable = groups.filter(group => group.agents.some(a => query.includes(a) && a !== '*'));
  const active = applicable.length ? applicable : groups.filter(group => group.agents.includes('*'));
  const activeRules = active.flatMap(group => group.rules);
  // Never convert a parser resource limit into permission to crawl a URL.
  if (activeRules.some(rule => rule.type === 'unparsed-rule'))
    return {allowed:false, indeterminate:true,rule:null,delayMs:0};
  const delaySeconds = Math.max(0,...activeRules
    .filter(rule => rule.type === 'crawl-delay').map(rule => rule.seconds));
  const matching = activeRules
    .filter(rule => (rule.type === 'allow' || rule.type === 'disallow') && robotPatternMatch(rule.pattern,path));
  // Compare canonical octets rather than mixed literal/percent encodings.
  // A longer matched path wins; Allow wins only if lengths are equal.
  const specificity = rule => normalizeRobotsOctets(rule.pattern)
    .replace(/\*/g,'').replace(/\$$/,'').length;
  matching.sort((a,b) => specificity(b)-specificity(a) ||
    (a.type === b.type ? 0 : (a.type === 'allow' ? -1 : 1)));
  return { allowed: !matching.length || matching[0].type === 'allow',
    rule: matching[0]?.pattern ?? null, delayMs:delaySeconds*1000 };
}

/** Every redirect undergoes URL, DNS and robots checks again; no deletion/rewrite. */
export async function inspectDestination(raw, { requestPage = requestPinnedPage, maxRedirects = 3,
  robotsCache = new Map(), lastVisitCache = new Map() } = {}) {
  let url = publicWebUrl(raw);
  if (!url) return { status: 'unsafe-target', evidence: 'Non-public URL or forbidden URL syntax' };
  const visited = new Set();
  const robots = robotsCache;
  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    if (visited.has(url.href)) return { status: 'redirect-loop', evidence: 'Redirect cycle' };
    visited.add(url.href);
    try {
      if (!robots.has(url.origin)) {
        const robotsUrl = new URL('/robots.txt',url);
        // A robots request counts toward this host's crawl pacing budget.
        lastVisitCache.set(url.origin,Date.now());
        const response = await requestPage(robotsUrl,{ maxBytes:16384 });
        if (response.statusCode === 404 || response.statusCode === 410) {
          robots.set(url.origin, { allowed:true });
        } else if (response.statusCode === 200 && !response.truncated &&
                   (!response.headers['content-encoding'] || response.headers['content-encoding'] === 'identity') &&
                   String(response.headers['content-type'] ?? '').toLowerCase().includes('text/plain')) {
          robots.set(url.origin, { text:response.body });
        } else {
          return { status: 'robots-inconclusive', evidence: `Robots response HTTP ${response.statusCode}; skipped target` };
        }
      }
      const policy = robots.get(url.origin);
      const permission = policy.text ? robotsPermission(policy.text, url.pathname + url.search) : { allowed:true };
      if (permission.indeterminate) return { status: 'robots-inconclusive',
        evidence: 'Unparseable robots rule; skipped target' };
      if (!permission.allowed) return { status: 'robots-disallowed', evidence: permission.rule ?? 'Robots disallow' };
      if (permission.delayMs > 15000) return { status:'robots-crawl-delay',
        evidence:'Crawl-delay exceeds the bounded manual-check interval; skipped target' };
      const prior = lastVisitCache.get(url.origin);
      if (prior && permission.delayMs > 0) {
        const remaining = Math.max(0,prior+permission.delayMs-Date.now());
        if (remaining) await new Promise(done=>setTimeout(done,remaining));
      }
      lastVisitCache.set(url.origin,Date.now());
      const result = await requestPage(url);
      if (result.statusCode >= 300 && result.statusCode < 400) {
        const location = result.headers.location;
        if (!location || redirects === maxRedirects) return { status: 'redirect-inconclusive', http_status:result.statusCode, evidence:'Missing target or redirect limit exceeded' };
        const next = publicWebUrl(new URL(location,url).href);
        if (!next || (url.protocol === 'https:' && next.protocol !== 'https:')) {
          return { status: 'unsafe-redirect', http_status:result.statusCode, evidence:'Redirect to blocked URL or HTTPS downgrade' };
        }
        url = next;
        continue;
      }
      return { ...classifyResponse(result), final_url:url.href, http_status:result.statusCode, redirect_count:redirects };
    } catch (error) {
      return { status: error?.code === 'UNSAFE_DNS' || error?.code === 'UNSAFE_URL' ? 'unsafe-target' : 'network-inconclusive',
        evidence: error?.code === 'ETIMEDOUT' ? 'Timeout' : String(error?.code ?? 'Request failure'),
        final_url:url.href };
    }
  }
  return { status: 'redirect-inconclusive', evidence:'Redirect limit exceeded' };
}
