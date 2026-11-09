import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyResponse, publicWebUrl, isPublicAddress, resolvePublicHost,
  robotsPermission, inspectDestination, createRequestDeadline,
} from '../scripts/link-health.mjs';

const html = (body, statusCode=200, headers={}) => ({statusCode,headers:{'content-type':'text/html',...headers},body});
const robots = (body='User-agent: *\nAllow: /\n') => ({statusCode:200,headers:{'content-type':'text/plain'},body});

function fakeHttp({robotsText, response, url='https://public.example.org/link'}={}) {
  const calls=[];
  const requestPage=async target=>{
    calls.push(target.href);
    if (target.pathname==='/robots.txt') return robots(robotsText);
    if (typeof response==='function') return response(target);
    return response ?? html('<html><title>Working example</title></html>');
  };
  return {calls,requestPage,url};
}

test('HTTP 200 and a generic goodbye sentence never prove an operational site or closure',()=>{
  assert.equal(classifyResponse(html('Thanks and goodbye to last year!')).status,'reachable-unverified');
  assert.equal(classifyResponse(html('This is a story about a site that has closed')).status,'reachable-unverified');
  assert.equal(classifyResponse(html('This service has permanently shut down.')).status,'possible-closure');
  assert.equal(classifyResponse(html('<h1>Thank you, and goodbye</h1><p>The live camera site you knew as TrafficVision.Live has closed its doors.</p>')).status,'possible-closure');
});

test('HTTP and browser-challenge classifications remain cautious',()=>{
  assert.equal(classifyResponse(html('Gone',410)).status,'http-not-found');
  assert.equal(classifyResponse(html('Not found',404)).status,'http-not-found');
  assert.equal(classifyResponse(html('Forbidden',403)).status,'access-restricted');
  assert.equal(classifyResponse(html('Slow down',429)).status,'rate-limited');
  assert.equal(classifyResponse(html('Just a moment ... verify you are human')).status,'challenge-suspected');
  assert.equal(classifyResponse(html('')).status,'empty-response');
  assert.equal(classifyResponse({statusCode:200,headers:{'content-type':'application/pdf'},body:'%PDF'}).status,'non-html-response');
  assert.equal(classifyResponse(html('plain text',200,{'content-encoding':'gzip'})).status,'uninspected-encoding');
});

test('URL and DNS selection refuse internal/reserved destinations, credentials, ports and IP literals',async()=>{
  for(const url of [
    'http://127.0.0.1/','http://[::1]/','http://10.1.1.1/','http://example.com:8888/',
    'http://user:password@example.com/', 'http://localhost/', 'http://host.internal/',
    'http://a.test/','file:///etc/passwd','javascript:alert(1)',
  ]) assert.equal(publicWebUrl(url),null,url);
  assert.equal(publicWebUrl('https://example.org/path#section').href,'https://example.org/path');
  for(const address of ['127.0.0.1','10.0.0.8','172.20.0.2','192.168.1.1',
    '169.254.169.254','100.64.0.7','192.0.2.1','198.51.100.2','203.0.113.3',
    '198.19.0.1','::1','fc00::1','2001:db8::1','2002:c0a8:0101::','::ffff:127.0.0.1']) {
    assert.equal(isPublicAddress(address),false,address);
  }
  assert.equal(isPublicAddress('1.1.1.1'),true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'),true);
  await assert.rejects(resolvePublicHost(new URL('https://public.example.org'),async()=>[
    {address:'1.1.1.1',family:4},{address:'127.0.0.1',family:4},
  ]),/not exclusively publicly routable/);
});

test('robots rules respect longest match, user-agent precedence and wildcards',()=>{
  const policy='User-agent: *\nDisallow: /private\nAllow: /private/public\n\nUser-agent: PeronikoLinkAudit\nDisallow: /audit\nAllow: /audit/allowed\n';
  assert.equal(robotsPermission(policy,'/audit/secret').allowed,false);
  assert.equal(robotsPermission(policy,'/audit/allowed').allowed,true);
  assert.equal(robotsPermission(policy,'/private/secrets').allowed,true,'more specific agent group overrides wildcard group');
  assert.equal(robotsPermission('User-agent: *\nDisallow: /private\nAllow: /private/public','/private/secrets').allowed,false);
  assert.equal(robotsPermission('User-agent: *\nDisallow: /*.pdf$','/book.pdf').allowed,false);
  assert.equal(robotsPermission('User-agent: *\nDisallow: /*.pdf$','/book.pdf/cover').allowed,true);
});

test('manual audit follows safe redirects and checks robots on every origin',async()=>{
  const calls=[];
  const response=async url=>{
    calls.push(url.href);
    if(url.pathname==='/robots.txt') return robots();
    if(url.hostname==='public.example.org') return {statusCode:302,headers:{location:'https://second.example.org/destination'},body:''};
    return html('The service has permanently shut down.');
  };
  const result=await inspectDestination('https://public.example.org/start',{requestPage:response});
  assert.equal(result.status,'possible-closure');
  assert.equal(result.redirect_count,1);
  assert.deepEqual(calls,[
    'https://public.example.org/robots.txt','https://public.example.org/start',
    'https://second.example.org/robots.txt','https://second.example.org/destination',
  ]);
});

test('redirects to local host, unsafe ports and HTTPS downgrades are not fetched',async()=>{
  for(const location of ['http://127.0.0.1/admin','https://localhost/','https://public.example.org:9000/',
    'http://public.example.org/']) {
    const {requestPage,calls}=fakeHttp({response:{statusCode:302,headers:{location},body:''}});
    const result=await inspectDestination('https://public.example.org/start',{requestPage});
    assert.equal(result.status,'unsafe-redirect');
    assert.equal(calls.length,2);
  }
});

test('robots disallow is respected without touching the target',async()=>{
  const {requestPage,calls}=fakeHttp({robotsText:'User-agent: *\nDisallow: /blocked'});
  const result=await inspectDestination('https://public.example.org/blocked',{requestPage});
  assert.equal(result.status,'robots-disallowed');
  assert.deepEqual(calls,['https://public.example.org/robots.txt']);
});

test('robots failure, timeouts and rate limits are observations, not dead-link claims',async()=>{
  const skipped=await inspectDestination('https://public.example.org/a',{requestPage:async()=>html('Oops',503)});
  assert.equal(skipped.status,'robots-inconclusive');
  const {requestPage}=fakeHttp({response:html('Slow down',429)});
  assert.equal((await inspectDestination('https://public.example.org/a',{requestPage})).status,'rate-limited');
  const timeout=await inspectDestination('https://public.example.org/a',{requestPage:async url=>{
    if(url.pathname==='/robots.txt') return robots();
    throw Object.assign(new Error('timed out'),{code:'ETIMEDOUT'});
  }});
  assert.deepEqual([timeout.status,timeout.evidence],['network-inconclusive','Timeout']);
});


test('robot crawl-delay is honored or safely skipped when excessively long', async()=>{
  const controls=robotsPermission('User-agent: *\nCrawl-delay: 2\nAllow: /','/');
  assert.equal(controls.allowed,true);
  assert.equal(controls.delayMs,2000);
  let called=0;
  const result=await inspectDestination('https://public.example.org/path',{requestPage:async url=>{
    called++;
    if(url.pathname==='/robots.txt') return robots('User-agent: *\nCrawl-delay: 300');
    throw new Error('Target must not be requested when crawl-delay is too high');
  }});
  assert.equal(result.status,'robots-crawl-delay');
  assert.equal(called,1);
});

test('reused robots policy avoids unnecessary repeated requests for a sampled host',async()=>{
  const {calls,requestPage}=fakeHttp({});
  const cache=new Map();
  const one=await inspectDestination('https://public.example.org/one',{requestPage,robotsCache:cache});
  const two=await inspectDestination('https://public.example.org/two',{requestPage,robotsCache:cache});
  assert.equal(one.status,'reachable-unverified');
  assert.equal(two.status,'reachable-unverified');
  assert.deepEqual(calls,[
    'https://public.example.org/robots.txt','https://public.example.org/one',
    'https://public.example.org/two',
  ]);
});


test('DNS resolution is bounded even if an upstream resolver stalls',async()=>{
  await assert.rejects(resolvePublicHost(new URL('https://public.example.org'),
    async()=>new Promise(()=>{}),12), {code:'ETIMEDOUT'});
});

test('absolute request deadline fires even during continuous data activity, and can be cancelled', async()=>{
  const { EventEmitter } = await import('node:events');
  const fake = new EventEmitter();
  let destroyed = 0;
  fake.destroy = error => {destroyed++;fake.emit('error',error);};
  const stream = setInterval(()=>fake.emit('data','x'),5);
  const failure = new Promise(resolve=>fake.once('error',resolve));
  const cancel = createRequestDeadline(fake,35);
  const error = await failure;
  clearInterval(stream);
  cancel();
  assert.equal(error.code,'ETIMEDOUT');
  assert.equal(destroyed,1);
  let cancelled=false;
  const stop=createRequestDeadline({destroy:()=>{cancelled=true;}},20);
  stop();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(cancelled,false,'a completed request must not be destroyed afterward');
});

test('adversarial robots wildcards terminate without regex backtracking',()=>{
  const policy='User-agent: *\\nDisallow: /'+'*a'.repeat(25)+'b';
  const path='/'+'a'.repeat(60);
  const start=performance.now();
  assert.equal(robotsPermission(policy,path).allowed,true);
  assert.ok(performance.now()-start < 200,'robots matching must be bounded');
  assert.equal(robotsPermission('User-agent: *\\nDisallow: /*a*b$','/helloab').allowed,false);
  assert.equal(robotsPermission('User-agent: *\\nDisallow: /*a*b$','/helloabc').allowed,true);
});
