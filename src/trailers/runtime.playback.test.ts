// @ts-nocheck -- the serialized player is exercised through deliberately dynamic CEF/MSE fixtures.
import { it as test } from "vitest";
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./runtime.ts', import.meta.url), 'utf8');
const start = source.indexOf('export function deckyMetadataTrailerRuntimeFactory(');
const end = source.lastIndexOf('\n}') + 2;
assert.ok(start >= 0 && end > start);
const factory = source.slice(start, end).replace(/^export\s+/, '').replace(
  'const existing = window[runtimeKey];',
  'return { Runtime, AdaptiveSession, readPlaybackDisplaySize, resolveQualityTarget }; const existing = window[runtimeKey];'
);

function setup({ width = 1280, height = 800, dpr = 1, quality = 'auto', fetchReply,
  mediaSourceType, urlType, domParserType, clock, pageAppId = 570, sourceAppId = 570 } = {}) {
  const location = new URL(`https://steamloopback.host/routes/library/app/${pageAppId}`);
  const window = {
    screen: { width, height }, innerWidth: width, innerHeight: height, devicePixelRatio: dpr, location,
    setTimeout: clock?.setTimeout.bind(clock) ?? setTimeout,
    clearTimeout: clock?.clearTimeout.bind(clock) ?? clearTimeout,
    setInterval: clock?.setInterval.bind(clock) ?? setInterval,
    clearInterval: clock?.clearInterval.bind(clock) ?? clearInterval,
    addEventListener() {}, removeEventListener() {},
    __deckyMetadataTrailerOwner: { ownerId: 'test-owner', active: true, settingsRevision: 0,
      settings: { enabled: true, audioEnabled: true, quality } },
  };
  const document = {
    URL: location.href, body: {}, documentElement: {},
    getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
  };
  const context = vm.createContext({ window, document, URL: urlType ?? URL, console, navigator: {}, AbortController,
    MediaSource: mediaSourceType ?? { isTypeSupported: () => true }, DOMParser: domParserType, fetch: fetchReply,
  });
  const api = vm.runInContext(`(${factory})({enabled:true,audioEnabled:true,quality:${JSON.stringify(quality)}},
    'test-owner', 0, {en:{}}, ${JSON.stringify({ pageAppId, sourceAppId })})`, context);
  const runtime = new api.Runtime({ enabled: true, audioEnabled: true, quality }, 'test-owner', 0);
  return { runtime, window, document, api, context };
}

const movie = {
  id: 33, highlight: true, name: 'Fixture trailer',
  mp4: { max: 'https://steam.test/movie_max.mp4', 2160: 'https://steam.test/movie2160.mp4', 720: 'https://steam.test/movie720.mp4' },
  webm: { 720: 'https://steam.test/movie720.webm' },
  dash_h264: 'https://steam.test/dash_h264.mpd', hls_h264: 'https://steam.test/hls_h264.m3u8',
  dash_av1: 'https://steam.test/dash_av1.mpd',
};
const urls = (candidates) => Array.from(candidates, candidate => candidate.url.split('/').at(-1));

for (const [display, target, expected] of [
  [{ width: 1280, height: 800, dpr: 1 }, 800, 'dash_h264.mpd'],
  [{ width: 1920, height: 1080, dpr: 1 }, 1080, 'dash_h264.mpd'],
  [{ width: 3840, height: 2160, dpr: 1 }, 2160, 'movie2160.mp4'],
  [{ width: 1280, height: 720, dpr: 1.5 }, 1080, 'dash_h264.mpd'],
]) {
  test(`Auto resolves ${display.width}x${display.height} at DPR ${display.dpr} to ${target}p`, () => {
    const h = setup({ width: display.width, height: display.height, dpr: display.dpr });
    assert.equal(h.runtime.snapshot().targetHeight, target);
    const candidates = h.runtime.orderCandidates([
      { url: movie.mp4[2160], format: 'mp4', height: 2160 },
      { url: movie.mp4[720], format: 'mp4', height: 720 },
      { url: movie.dash_h264, format: 'dash_h264', height: 0 },
    ]);
    assert.equal(urls(candidates)[0], expected);
  });
}

test('Invalid display dimensions use the 720p fallback and valid inner size rescues invalid screen', () => {
  const h = setup({ width: Number.NaN, height: 0 });
  assert.equal(h.runtime.snapshot().targetHeight, 720);
  h.window.innerWidth = 1920;
  h.window.innerHeight = 1080;
  assert.equal(h.api.readPlaybackDisplaySize(h.window).height, 1080);
  assert.equal(h.api.resolveQualityTarget('auto', h.api.readPlaybackDisplaySize(h.window)), 1080);
});
test('Auto selects the highest available rendition below the display, then the smallest above it', () => {
  const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,CODECS="avc1.640029,mp4a.40.2",RESOLUTION=1280x720
720.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,CODECS="avc1.640029,mp4a.40.2",RESOLUTION=1920x1080
1080.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=4000000,CODECS="avc1.640029,mp4a.40.2",RESOLUTION=3840x2160
2160.m3u8`;
  for (const [height, expected] of [[800, '720.m3u8'], [1080, '1080.m3u8'], [2160, '2160.m3u8'], [600, '720.m3u8']]) {
    const h = setup({ height });
    assert.equal(h.runtime.selectHlsVariant(master, 'https://steam.test/master.m3u8').url, `https://steam.test/${expected}`);
  }
});


test('Declared direct files outrank adaptive only at an exact height; missing exact prefers adaptive', async () => {
  const h = setup({ quality: 720, fetchReply: async (_url, options) => {
    assert.equal(options.cache, 'default');
    return { ok: true, json: async () => ({ 570: { data: { movies: [{ id: 11, mp4: { 720: 'https://steam.test/other.mp4' } }, movie] } } }) };
  } });
  const result = await h.runtime.getTrailer(570);
  assert.equal(result.name, 'Fixture trailer');
  assert.deepEqual(urls(h.runtime.orderCandidates(result.candidates)).slice(0, 5), [
    'movie720.mp4', 'movie720.webm', 'dash_h264.mpd', 'hls_h264.m3u8', 'dash_av1.mpd',
  ]);
  const withoutExact = result.candidates.filter(candidate => candidate.height !== 720);
  assert.equal(urls(h.runtime.orderCandidates(withoutExact))[0], 'dash_h264.mpd');
  assert.ok(urls(h.runtime.orderCandidates(withoutExact)).indexOf('movie2160.mp4') > 0);
});

test('Same target preserves playback; Auto display change restarts, manual display change does not', () => {
  const h = setup();
  h.runtime.scan = () => {};
  let removed = 0;
  const video = { isConnected: true, dataset: {}, pause() {}, removeAttribute() {}, load() {},
    remove() { removed++; this.isConnected = false; } };
  h.runtime.currentVideo = video;
  h.runtime.currentTarget = { classList: { remove() {} } };
  h.window.screen = { width: 1600, height: 800 };
  h.runtime.update({ enabled: true, audioEnabled: true, quality: 'auto' }, 1);
  assert.equal(removed, 0);
  h.window.screen = { width: 3840, height: 2160 };
  h.runtime.update({ enabled: true, audioEnabled: true, quality: 'auto' }, 2);
  assert.equal(removed, 1);
  assert.equal(h.runtime.snapshot().targetHeight, 2160);
  assert.equal(h.runtime.snapshot().trailerAudioEnabled, true);

  const manual = setup({ quality: 1080 });
  manual.runtime.scan = () => {};
  manual.runtime.currentVideo = { isConnected: true };
  manual.window.screen = { width: 3840, height: 2160 };
  manual.runtime.update({ enabled: true, audioEnabled: true, quality: 1080 }, 1);
  assert.equal(manual.runtime.currentVideo.isConnected, true);
  assert.equal(manual.runtime.snapshot().targetHeight, 1080);
});
test('A quality change aborts pending metadata without poisoning the next page attempt', async () => {
  let release;
  let aborted = false;
  let requests = 0;
  const response = { ok: true, json: async () => ({ 570: { data: { movies: [movie] } } }) };
  const h = setup({ fetchReply: (_url, options) => {
    requests++;
    if (requests > 1) return Promise.resolve(response);
    options.signal.addEventListener('abort', () => { aborted = true; });
    return new Promise(resolve => { release = resolve; });
  } });
  h.runtime.scan = () => {};
  const first = h.runtime.getTrailer(570);
  h.runtime.update({ enabled: true, audioEnabled: true, quality: 1080 }, 1);
  assert.equal(aborted, true);
  release(response);
  assert.equal((await first).ok, false);
  assert.equal(h.runtime.trailerCache.size, 0);
  assert.equal((await h.runtime.getTrailer(570)).ok, true);
  assert.equal(h.runtime.snapshot().targetHeight, 1080);
  assert.equal(h.runtime.snapshot().trailerAudioEnabled, true);
});

test('HLS audio groups retain the selected variant codec and timed separate tracks', () => {
  const h = setup();
  const master = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="english",NAME="Stereo",DEFAULT=YES,URI="audio/stream.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=500000,CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=1280x720,AUDIO="english"
video/720.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,CODECS="avc1.640029,mp4a.40.2",RESOLUTION=1920x1080,AUDIO="english"
video/1080.m3u8`;
  const variant = h.runtime.selectHlsVariant(master, 'https://steam.test/root/master.m3u8');
  assert.equal(variant.height, 720);
  assert.equal(variant.mimeType, 'video/mp4; codecs="avc1.4d401f"');
  assert.equal(variant.audio.mimeType, 'audio/mp4; codecs="mp4a.40.2"');
  assert.equal(variant.audio.url, 'https://steam.test/root/audio/stream.m3u8');
  const playlist = `#EXTM3U
#EXT-X-MAP:URI="../init.m4s"
#EXTINF:2.5,
chunk-1.m4s
#EXTINF:3.25,
chunk-2.m4s
#EXT-X-ENDLIST`;
  const media = h.runtime.parseHlsMediaPlaylist(playlist, variant.url);
  assert.equal(media.initUrl, 'https://steam.test/root/init.m4s');
  assert.deepEqual(Array.from(media.segments, segment => [segment.start, segment.end]), [[0, 2.5], [2.5, 5.75]]);
  assert.equal(media.duration, 5.75);
});

test('HLS rejects unsupported audio and non-VOD, encrypted, ranged or discontinuous media', () => {
  const h = setup();
  assert.throws(() => h.runtime.selectHlsVariant(`#EXTM3U
#EXT-X-STREAM-INF:CODECS="avc1.640029",RESOLUTION=1280x720,AUDIO="missing"
720.m3u8`, 'https://steam.test/master.m3u8'), /audio group/);
  assert.throws(() => h.runtime.selectHlsVariant(`#EXTM3U
#EXT-X-SESSION-KEY:METHOD=AES-128,URI="key.bin"
#EXT-X-STREAM-INF:CODECS="avc1.640029",RESOLUTION=1280x720
720.m3u8`, 'https://steam.test/master.m3u8'), /Encrypted HLS/);
  const base = `#EXTM3U
#EXT-X-MAP:URI="init.m4s"
#EXTINF:3,
segment.m4s
#EXT-X-ENDLIST`;
  for (const change of [
    base.replace('#EXT-X-ENDLIST', ''),
    base.replace('#EXTINF:3,', '#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:3,'),
    base.replace('#EXTINF:3,', '#EXT-X-BYTERANGE:500@0\n#EXTINF:3,'),
    base.replace('#EXTINF:3,', '#EXT-X-DISCONTINUITY\n#EXTINF:3,'),
    base.replace('#EXTINF:3,', '#EXTINF:NaN,'),
  ]) assert.throws(() => h.runtime.parseHlsMediaPlaylist(change, 'https://steam.test/video.m3u8'));
});

test('DASH content protection is rejected before any segment is selected', () => {
  class ProtectedManifestParser {
    parseFromString() {
      return {
        documentElement: { localName: 'MPD', getAttribute: name => name === 'type' ? 'static' : null },
        querySelector: () => null,
        getElementsByTagName: name => name === '*' ? [{ localName: 'ContentProtection' }] : [],
      };
    }
  }
  const h = setup({ domParserType: ProtectedManifestParser });
  assert.throws(() => h.runtime.selectDashVariant('<MPD/>', 'https://steam.test/manifest.mpd'), /Unsupported DASH/);
});

test('DASH descriptors honor fixed duration, template padding, offset and bounded negative repeats', () => {
  const h = setup();
  const fixed = h.runtime.buildDashSegments({
    media: 'track/$RepresentationID$/chunk-$Number%05d$-$Time$.m4s',
    timescale: 1000, durationTicks: 3000, offset: 1000, startNumber: 7, timeline: null,
  }, 'v', 2000, 85.5, 'https://steam.test/');
  assert.equal(fixed.length, 29);
  assert.equal(fixed[0].url, 'https://steam.test/track/v/chunk-00007-1000.m4s');
  assert.equal(fixed.at(-1).end, 85.5);
  const long = h.runtime.buildDashSegments({
    media: '$Number$.m4s', timescale: 1, durationTicks: 1, offset: 0, startNumber: 1, timeline: null,
  }, 'v', 0, 600, 'https://steam.test/');
  assert.equal(long.length, 600);
  const timeline = h.runtime.buildDashSegments({
    media: '$Time$.m4s', timescale: 1000, durationTicks: 0, offset: 1000, startNumber: 1,
    timeline: [{ t: 1000, d: 2000, r: -1 }, { t: 7000, d: 3000, r: 0 }],
  }, 'v', 0, 9, 'https://steam.test/');
  assert.deepEqual(Array.from(timeline, segment => [segment.start, segment.end]), [[0, 2], [2, 4], [4, 6], [6, 9]]);
});


test('A matched shortcut requests movies by Steam source ID and attaches only to the shortcut hero', async () => {
  const pageAppId = 2147483649, sourceAppId = 15200;
  const requested = [];
  const h = setup({ pageAppId, sourceAppId, fetchReply: async (url) => {
    requested.push(url);
    return { ok: true, json: async () => ({ [sourceAppId]: { data: { movies: [
      { id: 7, name: 'Matched trailer', highlight: true, mp4: { 720: 'https://steam.test/matched720.mp4' } },
    ] } } }) };
  } });
  class Hero {
    constructor() {
      this.tagName = 'DIV';
      this.className = 'library-hero';
      this.asset = `url(https://steam.test/customimages/${pageAppId}_hero.png)`;
      this.classList = { add() {}, remove() {} };
    }
    getAttribute(name) { return name === 'style' ? this.asset : ''; }
    getBoundingClientRect() { return { width: 1000, height: 400, top: 0, left: 0, right: 1000, bottom: 400 }; }
  }
  const hero = new Hero();
  h.window.location = new URL(`https://steamloopback.host/routes/library/app/${pageAppId}`);
  h.document.URL = h.window.location.href;
  h.document.body = {};
  h.document.querySelectorAll = selector => selector.includes('steam/apps') ? [hero] : [];
  h.context.HTMLElement = Hero;
  h.context.getComputedStyle = element => ({ backgroundImage: element.asset, display: 'block', visibility: 'visible' });
  let attached;
  h.runtime.attachVideo = (target, appId, candidates) => { attached = { target, appId, candidates }; };

  await h.runtime.scan();

  assert.deepEqual(requested, [`https://store.steampowered.com/api/appdetails?appids=${sourceAppId}&filters=movies`]);
  assert.equal(attached.target, hero);
  assert.equal(attached.appId, pageAppId);
  assert.equal(attached.candidates[0].url, 'https://steam.test/matched720.mp4');
});

test('Native Steam pages use their own ID; subpages and mismatched heroes make no movie request', async () => {
  const prepareHero = (pageAppId, heroAppId, fetchReply) => {
    const h = setup({ pageAppId, sourceAppId: pageAppId, fetchReply });
    class Hero {
      constructor() {
        this.tagName = 'DIV';
        this.className = 'library-hero';
        this.asset = `url(https://steam.test/steam/apps/${heroAppId}/library_hero.jpg)`;
        this.classList = { add() {}, remove() {} };
      }
      getAttribute(name) { return name === 'style' ? this.asset : ''; }
      getBoundingClientRect() { return { width: 1000, height: 400, top: 0, left: 0, right: 1000, bottom: 400 }; }
    }
    const hero = new Hero();
    h.document.body = {};
    h.document.querySelectorAll = selector => selector.includes('steam/apps') ? [hero] : [];
    h.context.HTMLElement = Hero;
    h.context.getComputedStyle = element => ({ backgroundImage: element.asset, display: 'block', visibility: 'visible' });
    let attached;
    h.runtime.attachVideo = (target, appId, candidates) => { attached = { target, appId, candidates }; };
    return { ...h, hero, getAttached: () => attached };
  };

  for (const [route, heroAppId] of [
    ['/routes/library/app/570/activity', 570],
    ['/routes/library/app/570', 571],
    ['/routes/library/app/571', 571],
  ]) {
    const requested = [];
    const h = prepareHero(570, heroAppId, async url => {
      requested.push(url);
      return { ok: true, json: async () => ({ 570: { data: { movies: [movie] } } }) };
    });
    h.window.location = new URL(`https://steamloopback.host${route}`);
    h.document.URL = h.window.location.href;
    await h.runtime.scan();
    assert.deepEqual(requested, [], `${route} with hero ${heroAppId} must not fetch Steam movies`);
    assert.equal(h.getAttached(), undefined);
  }

  const requested = [];
  const h = prepareHero(570, 570, async url => {
    requested.push(url);
    return { ok: true, json: async () => ({ 570: { data: { movies: [movie] } } }) };
  });
  await h.runtime.scan();
  assert.deepEqual(requested, ['https://store.steampowered.com/api/appdetails?appids=570&filters=movies']);
  assert.equal(h.getAttached().target, h.hero);
  assert.equal(h.getAttached().appId, 570);
});

test('An active standalone trailer marker blocks the Metadata overlay without taking ownership', async () => {
  for (const marker of ['style', 'video']) {
    const h = setup();
    h.document.getElementById = id => marker === 'style' && id === 'decky-trailerhero-style' ? {} : null;
    h.document.querySelector = selector => marker === 'video' && selector === '.decky-trailerhero-video' ? {} : null;
    await h.runtime.scan();
    assert.match(h.runtime.snapshot().status, /Another trailer plugin is active/);
    assert.equal(h.runtime.currentVideo, undefined);
  }
});

test('A failed Steam metadata visit stays terminal until the page is left or re-enabled', async () => {
  const h = setup();
  class Hero {
    constructor() {
      this.tagName = 'DIV';
      this.className = 'hero';
      this.asset = 'url(https://steam.test/steam/apps/570/library_hero.jpg)';
      this.classList = { add() {}, remove() {} };
    }
    getAttribute(name) { return name === 'style' ? this.asset : ''; }
    getBoundingClientRect() { return { width: 1000, height: 400, top: 0, left: 0, right: 1000, bottom: 400 }; }
  }
  const hero = new Hero();
  h.context.HTMLElement = Hero;
  h.context.getComputedStyle = element => ({ backgroundImage: element.asset });
  h.document.querySelectorAll = selector => selector.includes('steam/apps') ? [hero] : [];
  let requests = 0;
  h.runtime.getTrailer = async () => { requests++; return { ok: false, error: 'No movie' }; };
  await h.runtime.scan();
  await h.runtime.scan();
  assert.equal(requests, 1);
  h.window.location = new URL('https://steamloopback.host/routes/library/home');
  await h.runtime.scan();
  h.window.location = new URL('https://steamloopback.host/routes/library/app/570');
  await h.runtime.scan();
  assert.equal(requests, 2);
  h.runtime.update({ enabled: false, audioEnabled: true, quality: 'auto' }, 1);
  h.runtime.update({ enabled: true, audioEnabled: true, quality: 'auto' }, 2);
  await Promise.resolve();
  assert.equal(requests, 3);
});

function adaptiveFixture({ sourceOpen = true, holdUrl, stallUpdate = false, quotaAtUrl } = {}) {
  const timers = new Map(), intervals = new Map();
  let timerId = 0;
  const clock = {
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, ms) { const id = ++timerId; intervals.set(id, { fn, ms }); return id; },
    clearInterval(id) { intervals.delete(id); },
    fire(ms) { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } },
    get intervals() { return intervals; },
  };
  const urls = new Map(), segmentTimes = new Map(), requested = [], removed = [];
  let revoked = 0, allocations = 0, releaseHeld, heldSignal;
  class FixtureURL extends URL {
    static createObjectURL(source) { const url = `blob:fixture-${urls.size + 1}`; urls.set(url, source); return url; }
    static revokeObjectURL(url) { assert.ok(urls.delete(url)); revoked++; }
  }
  class FixtureBuffer extends EventTarget {
    constructor(source) { super(); this.source = source; this.updating = false; this.ranges = []; this.initialized = false; }
    appendBuffer(data) {
      if (this.source.readyState === 'ended') this.source.readyState = 'open';
      const url = new TextDecoder().decode(data);
      if (url === quotaAtUrl) throw new DOMException('Buffer quota exceeded', 'QuotaExceededError');
      if (url.endsWith('/init')) this.initialized = true;
      else {
        const segment = segmentTimes.get(url);
        assert.ok(segment, `Known segment ${url}`);
        this.ranges.push(segment);
      }
      this.updating = true;
      if (!stallUpdate) queueMicrotask(() => { this.updating = false; this.dispatchEvent(new Event('updateend')); });
    }
    remove(start, end) {
      if (this.source.readyState === 'ended') this.source.readyState = 'open';
      removed.push([start, end]);
      this.ranges = this.ranges.filter(segment => segment.end <= start || segment.start >= end);
      this.updating = true;
      queueMicrotask(() => { this.updating = false; this.dispatchEvent(new Event('updateend')); });
    }
  }
  class FixtureMediaSource extends EventTarget {
    static isTypeSupported() { return true; }
    constructor() { super(); this.readyState = 'closed'; this.sourceBuffers = []; }
    addSourceBuffer(_mimeType) {
      if (this.sourceBuffers.some(buffer => buffer.initialized)) throw new Error('CEF quota: second buffer after init');
      allocations++;
      const buffer = new FixtureBuffer(this);
      this.sourceBuffers.push(buffer);
      return buffer;
    }
    removeSourceBuffer(buffer) { this.sourceBuffers.splice(this.sourceBuffers.indexOf(buffer), 1); }
    endOfStream() { this.readyState = 'ended'; }
  }
  class FixtureVideo extends EventTarget {
    constructor() {
      super();
      this.isConnected = true;
      this.currentTime = 0;
      this.paused = true;
      this.readyState = 0;
      this.seeking = false;
    }
    load() {
      const source = urls.get(this.src);
      if (source && sourceOpen) queueMicrotask(() => {
        source.readyState = 'open';
        source.dispatchEvent(new Event('sourceopen'));
        this.readyState = 3;
        this.dispatchEvent(new Event('canplay'));
      });
    }
    play() { this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    remove() { this.isConnected = false; }
  }
  function makeSegments(kind, durations) {
    let cursor = 0;
    return durations.map((duration, index) => {
      const segment = { url: `https://steam.test/${kind}/${index}.m4s`, start: cursor, end: cursor + duration };
      cursor += duration;
      segmentTimes.set(segment.url, segment);
      return segment;
    });
  }
  const videoSegments = makeSegments('video', Array(5).fill([3, 3, 2, 4]).flat());
  const audioSegments = makeSegments('audio', Array(5).fill([2, 3, 4, 3]).flat());
  const presentation = { duration: 60, tracks: [
    { kind: 'video', mimeType: 'video/mp4; codecs="avc1.640029"', initUrl: 'https://steam.test/video/init', segments: videoSegments },
    { kind: 'audio', mimeType: 'audio/mp4; codecs="mp4a.40.2"', initUrl: 'https://steam.test/audio/init', segments: audioSegments },
  ] };
  const fetchReply = (url, { signal, cache }) => {
    assert.equal(cache, 'default');
    requested.push(url);
    if (url === holdUrl) {
      heldSignal = signal;
      return new Promise(resolve => {
        releaseHeld = () => resolve({ ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer });
      });
    }
    return Promise.resolve({ ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer });
  };
  const { api, runtime } = setup({ mediaSourceType: FixtureMediaSource, urlType: FixtureURL, fetchReply, clock });
  const video = new FixtureVideo();
  const candidate = { controller: new AbortController(), isCurrent: () => video.isConnected && !candidate.controller.signal.aborted,
    onFailure: () => { failures++; session.dispose(); } };
  let failures = 0;
  const session = new api.AdaptiveSession(video, presentation, candidate);
  const flush = async () => { for (let index = 0; index < 350; index++) await Promise.resolve(); };
  return { runtime, session, video, presentation, clock, requested, removed, urls,
    get source() { return session.mediaSource; },
    get allocations() { return allocations; },
    get revoked() { return revoked; },
    get failures() { return failures; },
    get heldSignal() { return heldSignal; },
    releaseHeld: () => releaseHeld?.(),
    flush };
}

test('One A/V MediaSource primes only its forward window, evicts, seeks and loops pinned opening segments', async () => {
  const h = adaptiveFixture();
  await h.session.start();
  assert.equal(h.allocations, 2);
  assert.equal(h.source.sourceBuffers.length, 2);
  h.source.dispatchEvent(new Event('sourceopen'));
  assert.equal(h.allocations, 2, 'Reopening an existing MediaSource must not allocate a second set');
  assert.ok(h.requested.length < 16, 'Initial playback must not download the presentation');
  assert.equal(h.clock.intervals.size, 1);
  h.video.play();
  h.video.currentTime = 35;
  h.video.dispatchEvent(new Event('seeking'));
  await h.flush();
  assert.ok(h.removed.length > 0, 'Played ranges must be evicted');
  for (const buffer of h.source.sourceBuffers) {
    const seconds = buffer.ranges.reduce((sum, segment) => sum + segment.end - segment.start, 0);
    assert.ok(seconds <= 35, `Retained media ${seconds}s exceeds measured 3-second fixture bound`);
  }
  const pinned = h.presentation.tracks.flatMap(track => track.segments.filter(segment => segment.start < 8).map(segment => segment.url));
  h.video.currentTime = 0;
  h.video.dispatchEvent(new Event('seeking'));
  await h.flush();
  for (const url of pinned) assert.equal(h.requested.filter(request => request === url).length, 1);
  h.video.currentTime = 55;
  h.video.dispatchEvent(new Event('seeking'));
  await h.flush();
  assert.equal(h.source.readyState, 'ended', 'All final segments permit reliable end detection');
  h.video.currentTime = 60;
  h.video.dispatchEvent(new Event('ended'));
  await h.flush();
  assert.equal(h.video.currentTime, 0);
  assert.equal(h.video.paused, false);
  h.session.dispose();
  assert.equal(h.revoked, 1);
  assert.equal(h.clock.intervals.size, 0);
});

test('Paused adaptive playback does not start destination fetches until play resumes', async () => {
  const h = adaptiveFixture();
  await h.session.start();
  const before = h.requested.length;
  h.video.currentTime = 30;
  h.video.dispatchEvent(new Event('seeking'));
  await h.flush();
  assert.equal(h.requested.length, before);
  h.video.play();
  await h.flush();
  assert.ok(h.requested.length > before);
  h.session.dispose();
});

test('Late segment completion after disposal cannot append or restart a candidate', async () => {
  const held = 'https://steam.test/video/10.m4s';
  const h = adaptiveFixture({ holdUrl: held });
  await h.session.start();
  h.video.play();
  h.video.currentTime = 30;
  h.video.dispatchEvent(new Event('seeking'));
  await h.flush();
  assert.ok(h.heldSignal);
  const buffer = h.source.sourceBuffers[0], before = buffer.ranges.length;
  h.session.dispose();
  assert.equal(h.heldSignal.aborted, true);
  h.releaseHeld();
  await h.flush();
  assert.equal(buffer.ranges.length, before);
  assert.equal(h.revoked, 1);
  assert.equal(h.video.isConnected, false);
  assert.equal(h.failures, 0);
  const fresh = adaptiveFixture();
  await fresh.session.start();
  assert.equal(fresh.source.sourceBuffers.length, 2);
  fresh.session.dispose();
});

test('Quality change aborts an obsolete segment, retains audio and permits a fresh session', async () => {
  const h = adaptiveFixture({ holdUrl: 'https://steam.test/video/10.m4s' });
  await h.session.start();
  h.runtime.scan = () => {};
  h.runtime.currentVideo = h.video;
  h.runtime.activeSession = h.session;
  h.video.play();
  h.video.currentTime = 30;
  h.video.dispatchEvent(new Event('seeking'));
  await h.flush();
  assert.ok(h.heldSignal);
  const buffer = h.source.sourceBuffers[0], before = buffer.ranges.length;
  h.runtime.update({ enabled: true, audioEnabled: true, quality: 1080 }, 1);
  assert.equal(h.heldSignal.aborted, true);
  h.releaseHeld();
  await h.flush();
  assert.equal(buffer.ranges.length, before);
  assert.equal(h.runtime.snapshot().trailerAudioEnabled, true);
  assert.equal(h.runtime.snapshot().targetHeight, 1080);
  const fresh = adaptiveFixture();
  await fresh.session.start();
  assert.equal(fresh.source.sourceBuffers.length, 2);
  fresh.session.dispose();
});

test('Source-open and SourceBuffer-update timeouts release resources and signal one fallback', async () => {
  for (const fixture of [{ sourceOpen: false }, { stallUpdate: true }]) {
    const h = adaptiveFixture(fixture);
    const pending = h.session.start();
    await h.flush();
    h.clock.fire(12000);
    await assert.rejects(pending, /timed out/);
    assert.equal(h.failures, 1);
    assert.equal(h.revoked, 1);
    assert.equal(h.video.isConnected, false);
  }
});

test('QuotaExceededError after eviction fails the active candidate once', async () => {
  const h = adaptiveFixture({ quotaAtUrl: 'https://steam.test/video/10.m4s' });
  await h.session.start();
  h.video.play();
  h.video.currentTime = 35;
  h.video.dispatchEvent(new Event('seeking'));
  await h.flush();
  assert.ok(h.removed.length > 0);
  assert.equal(h.failures, 1);
  assert.equal(h.revoked, 1);
  assert.equal(h.video.isConnected, false);
});

test('Unsupported Steam HLS source falls back to a declared direct file, not a guessed URL', async () => {
  const direct = 'https://steam.test/declared.mp4';
  const h = setup({ fetchReply: async () => ({ ok: true, text: async () => '#EXTM3U\n#EXT-X-ENDLIST' }) });
  const classes = new Set();
  const target = { classList: { add: (...names) => names.forEach(name => classes.add(name)),
    remove: (...names) => names.forEach(name => classes.delete(name)) },
    firstChild: null, insertBefore(video) { video.isConnected = true; } };
  class Video extends EventTarget {
    constructor() {
      super();
      this.dataset = {};
      this.isConnected = false;
      this.paused = true;
      this.readyState = 0;
      this.currentTime = 0;
      const names = new Set();
      this.classList = { add: name => names.add(name), remove: name => names.delete(name), contains: name => names.has(name) };
    }
    setAttribute() {}
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() {
      if (this.src === direct) queueMicrotask(() => {
        this.readyState = 3;
        this.dispatchEvent(new Event('canplay'));
      });
    }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    remove() { this.isConnected = false; }
  }
  h.document.createElement = () => new Video();
  h.runtime.pageEnteredAt = Date.now() - 3000;
  h.runtime.attachVideo(target, 570, [
    { format: 'hls_h264', url: 'https://steam.test/broken.m3u8', height: 0 },
    { format: 'mp4', url: direct, height: 720 },
  ], h.runtime.requestToken);
  for (let index = 0; index < 30; index++) await Promise.resolve();
  assert.equal(h.runtime.currentVideo.src, direct);
  assert.equal(h.runtime.currentVideo.paused, false);
  assert.equal(h.runtime.failedVisit, undefined);
  h.runtime.cleanupVideo(true);
  assert.equal(h.runtime.currentVideo, undefined);
});

test('A full-trailer loop resets the progress watchdog instead of falling back while video advances', async () => {
  let now = 0, timerId = 0;
  const timers = new Map();
  const clock = {
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval: () => 0, clearInterval() {},
    advance(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
    },
  };
  const h = setup({ clock });
  const target = { classList: { add() {}, remove() {} }, firstChild: null,
    insertBefore(video) { video.isConnected = true; } };
  class Video extends EventTarget {
    constructor() {
      super();
      this.isConnected = false;
      this.paused = true;
      this.readyState = 0;
      this.currentTime = 0;
      this.dataset = {};
      this.classList = { add() {}, remove() {}, contains: () => false };
    }
    setAttribute() {}
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() {
      if (this.src) queueMicrotask(() => {
        this.readyState = 3;
        this.dispatchEvent(new Event('canplay'));
      });
    }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    remove() { this.isConnected = false; }
  }
  h.document.createElement = () => new Video();
  h.runtime.attachVideo(target, 570, [{ format: 'mp4', url: 'https://steam.test/movie.mp4', height: 720 }],
    h.runtime.requestToken);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  const video = h.runtime.currentVideo;
  video.currentTime = 80;
  video.dispatchEvent(new Event('timeupdate'));
  clock.advance(1000);
  video.currentTime = 0;
  video.dispatchEvent(new Event('seeking'));
  video.dispatchEvent(new Event('timeupdate'));
  clock.advance(7000);
  video.currentTime = 5;
  video.dispatchEvent(new Event('timeupdate'));
  clock.advance(5000);
  assert.equal(h.runtime.currentVideo, video);
  assert.equal(video.isConnected, true);
  h.runtime.cleanupVideo(true);
});

test('Play intent stops immediately and holds the page beyond 22 seconds until a real route or visibility transition', async () => {
  const h = setup();
  class Element {
    constructor(asset = '') {
      this.tagName = 'DIV';
      this.className = 'hero';
      this.asset = asset;
      this.classList = { add() {}, remove() {} };
    }
    getAttribute(name) { return name === 'style' ? this.asset : ''; }
    getBoundingClientRect() { return { width: 1000, height: 400, top: 0, left: 0, right: 1000, bottom: 400 }; }
    closest() { return null; }
  }
  class PlayButton extends Element {
    constructor() { super(); this.innerText = 'Play'; this.textContent = 'Play'; }
    closest() { return this; }
  }
  const hero = new Element('url(https://steam.test/steam/apps/570/library_hero.jpg)');
  h.context.HTMLElement = Element;
  h.context.getComputedStyle = element => ({ backgroundImage: element.asset });
  h.document.querySelectorAll = selector => selector.includes('steam/apps') ? [hero] : [];
  h.document.body = {};
  let now = 1000, requests = 0;
  h.context.Date = class extends Date { static now() { return now; } };
  const video = { isConnected: true, dataset: {}, pause() {}, removeAttribute() {}, load() {},
    remove() { this.isConnected = false; } };
  h.runtime.currentVideo = video;
  h.runtime.currentTarget = hero;
  h.runtime.currentAppId = 570;
  h.runtime.currentMediaSignature = h.runtime.targetHeight;
  h.runtime.getTrailer = async () => { requests++; return { ok: false, error: 'No movie' }; };
  h.window.location.hash = '#quickaccess';
  h.runtime.handleRouteChange();
  assert.equal(video.isConnected, true, 'Opening a menu on the same root route does not restart media');
  h.runtime.handleLaunchIntent({ target: new PlayButton() });
  assert.equal(video.isConnected, false);
  assert.equal(h.runtime.launchHeld, true);
  now += 30000;
  await h.runtime.scan();
  assert.equal(requests, 0);
  h.window.location = new URL('https://steamloopback.host/routes/library/home');
  await h.runtime.scan();
  assert.equal(h.runtime.launchHeld, false);
  h.window.location = new URL('https://steamloopback.host/routes/library/app/570');
  await h.runtime.scan();
  assert.equal(requests, 1, 'A real page re-entry allows a fresh request');
  h.runtime.launchHeld = true;
  h.document.hidden = true;
  h.runtime.handleVisibilityChange();
  h.document.hidden = false;
  h.runtime.handleVisibilityChange();
  await Promise.resolve();
  assert.equal(h.runtime.launchHeld, false);
});
