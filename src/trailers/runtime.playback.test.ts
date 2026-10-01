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

function setup({ width = 1280, height = 800, dpr = 1, quality = 'auto', hideLogoDuringTrailer = false, fadeInDelaySeconds = 3, fetchReply,
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
      settings: { enabled: true, audioEnabled: true, quality, hideLogoDuringTrailer, fadeInDelaySeconds } },
  };
  const document = {
    URL: location.href, body: {}, documentElement: {},
    getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
    addEventListener() {}, removeEventListener() {},
  };
  const context = vm.createContext({ window, document, URL: urlType ?? URL, console, navigator: {}, AbortController,
    Date: clock?.Date ?? Date,
    TextEncoder, TextDecoder,
    MediaSource: mediaSourceType ?? { isTypeSupported: () => true }, DOMParser: domParserType, fetch: fetchReply,
  });
  const api = vm.runInContext(`(${factory})({enabled:true,audioEnabled:true,quality:${JSON.stringify(quality)},hideLogoDuringTrailer:${JSON.stringify(hideLogoDuringTrailer)},fadeInDelaySeconds:${fadeInDelaySeconds}},
    'test-owner', 0, {en:{}}, ${JSON.stringify({ pageAppId, sourceAppId })})`, context);
  const runtime = new api.Runtime({ enabled: true, audioEnabled: true, quality, hideLogoDuringTrailer, fadeInDelaySeconds }, 'test-owner', 0);
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
const responseBody = (body, properties = {}) => {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  return {
    ok: true,
    body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
    headers: { get: name => name.toLowerCase() === 'content-length' ? String(bytes.byteLength) : null },
    ...properties,
  };
};

function fakeClock(start = Date.now()) {
  let now = start;
  let timerId = 0;
  const timers = new Map();
  const intervals = new Map();
  const clock = {
    get now() { return now; },
    timers,
    intervals,
    setTimeout(fn, delay) {
      const id = ++timerId;
      timers.set(id, { fn, at: now + delay, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, delay) {
      const id = ++timerId;
      intervals.set(id, { fn, delay });
      return id;
    },
    clearInterval(id) { intervals.delete(id); },
    advance(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at > now) break;
        if (timers.delete(id)) timer.fn();
      }
    },
  };
  clock.Date = class extends Date {
    static now() { return clock.now; }
  };
  return clock;
}

async function readyDirectTrailer({ failWake = false, clock, pageEnteredAt,
  pageAppId = 570, sourceAppId = pageAppId, hideLogoDuringTrailer = false, fadeInDelaySeconds = 3, customLogo = false } = {}) {
  const h = setup({ clock, pageAppId, sourceAppId, hideLogoDuringTrailer, fadeInDelaySeconds });
  let createdVideos = 0;
  let playCalls = 0;
  const classes = new Set();
  class Hero {
    constructor() {
      this.tagName = 'DIV';
      this.className = 'library-hero';
      this.isConnected = true;
      this.asset = customLogo
        ? `url(https://steam.test/customimages/${pageAppId}_hero.png)`
        : `url(https://steam.test/steam/apps/${pageAppId}/library_hero.jpg)`;
      this.classList = {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
      };
    }
    getAttribute(name) { return name === 'style' ? this.asset : ''; }
    getBoundingClientRect() { return { width: 1000, height: 400, top: 0, left: 0, right: 1000, bottom: 400 }; }
  }
  class Logo {
    constructor(src) {
      this.tagName = 'IMG';
      this.src = src;
      this.isConnected = true;
      this.names = new Set();
      this.classList = {
        add: name => this.names.add(name),
        remove: name => this.names.delete(name),
        contains: name => this.names.has(name),
      };
    }
    getAttribute(name) { return name === 'src' ? this.src : ''; }
    getBoundingClientRect() { return { width: 200, height: 100, top: 220, left: 30, right: 230, bottom: 320 }; }
  }
  class Video extends EventTarget {
    constructor() {
      super();
      this.isConnected = false;
      this.paused = true;
      this.readyState = 0;
      this.currentTime = 0;
      this.dataset = {};
      this.names = new Set();
      this.classList = {
        add: name => this.names.add(name),
        remove: name => this.names.delete(name),
        contains: name => this.names.has(name),
      };
    }
    setAttribute() {}
    load() {
      if (this.src) queueMicrotask(() => {
        this.readyState = 3;
        this.dispatchEvent(new Event('canplay'));
      });
    }
    play() {
      playCalls++;
      if (failWake && playCalls > 1) return Promise.reject(new Error('wake playback denied'));
      this.paused = false;
      this.dispatchEvent(new Event('play'));
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    }
    pause() { this.paused = true; }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    remove() { this.parentElement?.removeChild(this); this.isConnected = false; }
  }
  const hero = new Hero();
  const logo = new Logo(customLogo
    ? `/customimages/${pageAppId}_logo.png?v=1`
    : `/assets/${pageAppId}/logo.png`);
  const unrelatedLogo = new Logo(`/assets/${sourceAppId === pageAppId ? pageAppId + 1 : sourceAppId}/logo.png`);
  let logos = [logo, unrelatedLogo];
  h.window.location = new URL(`https://steamloopback.host/routes/library/app/${pageAppId}`);
  h.document.URL = h.window.location.href;
  const bodyChildren = [];
  h.document.body = {
    children: bodyChildren,
    appendChild(element) {
      element.parentElement?.removeChild(element);
      bodyChildren.push(element);
      element.parentElement = this;
      element.isConnected = true;
    },
    removeChild(element) {
      bodyChildren.splice(bodyChildren.indexOf(element), 1);
      element.parentElement = null;
    },
  };
  h.document.querySelectorAll = selector => selector.includes('steam/apps') ? [hero]
    : selector.startsWith('img[src') ? logos : [];
  h.context.HTMLElement = Hero;
  h.context.getComputedStyle = element => ({
    backgroundImage: element.asset, display: 'block', visibility: 'visible',
    opacity: element.classList?.contains('decky-metadata-trailer-logo-hidden') ? '0' : '1',
  });
  h.document.createElement = tag => {
    if (tag === 'video') {
      createdVideos++;
      return new Video();
    }
    return {
      className: '', style: {}, isConnected: false, parentElement: null, children: [],
      appendChild(element) {
        element.parentElement?.removeChild(element);
        this.children.push(element);
        element.parentElement = this;
        element.isConnected = true;
      },
      removeChild(element) {
        this.children.splice(this.children.indexOf(element), 1);
        element.parentElement = null;
      },
      remove() { this.parentElement?.removeChild(this); this.isConnected = false; },
      addEventListener() {},
    };
  };
  hero.insertBefore = video => {
    video.parentElement?.removeChild(video);
    video.parentElement = hero;
    video.isConnected = true;
  };
  hero.removeChild = video => { video.parentElement = null; };
  h.runtime.pageEnteredAt = pageEnteredAt ?? Date.now() - 3000;
  h.runtime.attachVideo(hero, pageAppId, [{ format: 'mp4', url: movie.mp4[720], height: 720 }], h.runtime.requestToken);
  for (let index = 0; index < 20; index++) await Promise.resolve();
  return {
    ...h,
    hero,
    logo,
    unrelatedLogo,
    makeLogo: src => new Logo(src),
    replaceLogo(next) { logos = [next, unrelatedLogo]; },
    get video() { return h.runtime.currentVideo; },
    get playCalls() { return playCalls; },
    get createdVideos() { return createdVideos; },
    classes,
  };
}

test('A visible status band reveals the hero behind it without moving the band or growing on rescans', async () => {
  const h = await readyDirectTrailer();
  const naturalHeight = 400;
  let statusTop = 400;
  let scale = 0.95;
  let bandHeight = 52;
  let bandOpacity = '1';
  let bandPosition = 'static';
  let nativeBand = true;
  let bandClipped = false;
  h.window.DFL = { playSectionClasses: { CloudStatusRow: 'native-cloud-row' } };
  let visible = false;
  let suppressed = false;
  const originalHeight = '400px';
  h.hero.style = {
    height: originalHeight,
    getPropertyValue(name) { return this[name] || ''; },
    getPropertyPriority() { return ''; },
    setProperty(name, value) { this[name] = value; },
    removeProperty(name) { this[name] = ''; },
  };
  Object.defineProperty(h.hero, 'offsetHeight', {
    get: () => Number.parseFloat(h.hero.style.height) || naturalHeight,
  });
  h.hero.getBoundingClientRect = () => {
    const height = h.hero.offsetHeight * scale;
    return { width: 1000 * scale, height, top: 0, left: 0, right: 1000 * scale, bottom: height };
  };
  const bandParent = {
    parentElement: null,
    getBoundingClientRect: () => ({
      left: 0, top: 0, right: 1000 * scale, bottom: (statusTop + 8) * scale,
    }),
  };
  const band = {
    textContent: 'Steam Cloud: Up to date',
    parentElement: bandParent,
    classList: { contains: name => nativeBand && name === 'native-cloud-row' },
    matches: selector => selector.includes('native-cloud-row'),
    get offsetHeight() { return bandHeight; },
    getBoundingClientRect: () => ({
      width: 1000 * scale, height: bandHeight * scale, top: statusTop * scale, left: 0,
      right: 1000 * scale, bottom: (statusTop + bandHeight) * scale,
    }),
    getAttribute: name => name === 'aria-hidden' && suppressed ? 'true' : null,
  };
  const label = {
    parentElement: band,
    getBoundingClientRect: () => ({
      width: 180 * scale, height: 22 * scale, top: (statusTop + 4) * scale,
      left: 410 * scale, right: 590 * scale, bottom: (statusTop + 26) * scale,
    }),
  };
  const computedStyle = h.context.getComputedStyle;
  h.context.getComputedStyle = element => element === band
    ? { display: 'flex', visibility: 'visible', opacity: bandOpacity, position: bandPosition }
    : element === bandParent
      ? { ...computedStyle(element), overflowY: bandClipped ? 'hidden' : 'visible' }
      : computedStyle(element);
  // Steam's footer can cover the middle of the row at the default scroll position.
  h.document.elementFromPoint = (x, y) =>
    visible && x === 500 * scale && y >= statusTop * scale && y < (statusTop + 6) * scale ? label : null;

  await h.runtime.scan();
  assert.equal(h.hero.offsetHeight, 400, 'no status band leaves the hero unchanged');
  visible = true;
  await h.runtime.scan();
  assert.equal(h.hero.getBoundingClientRect().bottom, band.getBoundingClientRect().bottom,
    'the trailer reaches the status-band edge during Steam entry scaling');
  await h.runtime.scan();
  assert.equal(h.hero.offsetHeight, naturalHeight + bandHeight, 'rescanning must not add a second band height');
  for (scale of [0.97, 0.99, 1]) {
    await h.runtime.scan();
    assert.equal(h.hero.offsetHeight, naturalHeight + bandHeight, 'page scaling must not change the trailer layout height');
    assert.equal(h.hero.getBoundingClientRect().bottom, band.getBoundingClientRect().bottom);
  }
  suppressed = true;
  await h.runtime.scan();
  assert.equal(h.hero.getBoundingClientRect().bottom, 400, 'an aria-hidden row must not extend the trailer');
  suppressed = false;
  await h.runtime.scan();
  assert.equal(h.hero.getBoundingClientRect().bottom, naturalHeight + bandHeight);
  bandOpacity = '0';
  await h.runtime.scan();
  assert.equal(h.hero.offsetHeight, naturalHeight, 'a theme-hidden row must not extend the trailer');
  bandOpacity = '1';
  await h.runtime.scan();
  assert.equal(h.hero.offsetHeight, naturalHeight + bandHeight);
  bandHeight = 44;
  await h.runtime.scan();
  assert.equal(h.hero.offsetHeight, naturalHeight + 44, 'a shorter theme band must shrink the backdrop without cumulative growth');
  bandPosition = 'fixed';
  await h.runtime.scan();
  assert.equal(h.hero.offsetHeight, naturalHeight, 'a relocated overlay is not an in-flow artwork band');
  bandPosition = 'static';
  bandClipped = true;
  await h.runtime.scan();
  assert.equal(h.hero.offsetHeight, naturalHeight, 'a theme-clipped row must not reserve its hidden height');
  bandClipped = false;
  nativeBand = false;
  await h.runtime.scan();
  assert.equal(h.hero.offsetHeight, naturalHeight, 'an unrelated full-width row must not extend the trailer');
  nativeBand = true;

  visible = false;
  await h.runtime.scan();
  assert.equal(h.hero.style.height, originalHeight, 'a hidden band restores the original inline height');
  visible = true;
  statusTop = 445;
  await h.runtime.scan();
  assert.equal(h.hero.getBoundingClientRect().bottom, 400, 'a distant row is not the hero status band');

  statusTop = 400;
  await h.runtime.scan();
  h.window.location = new URL('https://steamloopback.host/routes/library/home');
  h.document.URL = h.window.location.href;
  await h.runtime.scan();
  assert.equal(h.hero.style.height, originalHeight, 'leaving the page restores the original inline height');
});

test('Y toggles a clean trailer view without restarting playback and restores the game page on exit', async () => {
  const clock = fakeClock();
  const h = await readyDirectTrailer({ clock, pageEnteredAt: clock.now });
  const video = h.video;
  const press = (button, repeat = false) => {
    let consumed = false;
    h.runtime.handleGamepadButtonDown({
      detail: { button, is_repeat: repeat }, target: null,
      preventDefault() { consumed = true; }, stopPropagation() {}, stopImmediatePropagation() {},
    });
    return consumed;
  };

  assert.equal(press(4), false, 'Y retains its native action until the trailer is visible');
  clock.advance(3000);
  assert.equal(press(4), true);
  const overlay = h.document.body.children[0];
  assert.equal(overlay.style.position, 'fixed');
  assert.equal(overlay.style.inset, '0');
  assert.equal(video.parentElement, overlay);
  assert.equal(h.video, video);
  assert.equal(h.playCalls, 1);
  assert.equal(press(4, true), false, 'repeated button-downs do not exit clean viewing');
  assert.equal(press(4), true);
  assert.equal(h.document.body.children.length, 0);
  assert.equal(video.parentElement, h.hero);
  assert.equal(h.playCalls, 1);
  assert.equal(press(4), true);
  assert.equal(press(3), true, 'X still controls audio while the page is covered');
  assert.equal(press(2), true, 'B returns to the normal game page');
  assert.equal(h.document.body.children.length, 0);
  assert.equal(press(2), false, 'B keeps its native action outside clean viewing');


  assert.equal(press(4), true);
  h.window.location = new URL('https://steamloopback.host/routes/library/home');
  h.document.URL = h.window.location.href;
  await h.runtime.scan();
  assert.equal(h.document.body.children.length, 0, 'leaving the game page removes the overlay');
  assert.equal(h.video, undefined);
});
test('Clean viewing restores the page on menu opening, playback failure, and trailer disable', async () => {
  for (const exit of ['menu', 'failure', 'disable']) {
    const clock = fakeClock();
    const h = await readyDirectTrailer({ clock, pageEnteredAt: clock.now });
    clock.advance(3000);
    h.runtime.handleGamepadButtonDown({
      detail: { button: 4 }, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {},
    });
    assert.equal(h.document.body.children.length, 1);
    if (exit === 'menu') {
      h.window.location.hash = '#quickaccess';
      h.runtime.handleRouteChange();
      assert.equal(h.video?.parentElement, h.hero);
    } else if (exit === 'failure') {
      h.runtime.activeCandidate.onFailure(new Error('stream stopped'));
    } else {
      h.runtime.update({ enabled: false, audioEnabled: true, quality: 'auto' }, 1);
    }
    assert.equal(h.document.body.children.length, 0, `${exit} must not leave a black overlay`);
  }
});


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
    return responseBody(JSON.stringify({ 570: { data: { movies: [{ id: 11, mp4: { 720: 'https://steam.test/other.mp4' } }, movie] } } }));
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

test('A visible paused trailer resumes the same video after wake without allocating another session', async () => {
  const h = await readyDirectTrailer();
  const video = h.video;
  assert.ok(video);
  assert.equal(video.paused, false);
  assert.equal(h.runtime.currentMediaReady, true);

  video.paused = true;
  video.dispatchEvent(new Event('pause'));
  await h.runtime.scan();
  for (let index = 0; index < 10; index++) await Promise.resolve();
  await h.runtime.scan();

  assert.equal(h.runtime.currentVideo, video);
  assert.equal(video.paused, false);
  assert.equal(h.playCalls, 2);
  assert.equal(h.createdVideos, 1);

  h.document.hidden = true;
  h.runtime.handleVisibilityChange();
  assert.equal(h.runtime.currentVideo, undefined, 'hidden playback is cleaned up instead of resumed');
  assert.equal(h.playCalls, 2);
});

test('Trailer reveal follows a 0–10 second setting and updates a pending reveal without restarting playback', async () => {
  for (const seconds of [0, 10]) {
    const clock = fakeClock();
    const h = await readyDirectTrailer({ clock, pageEnteredAt: clock.now, fadeInDelaySeconds: seconds });
    assert.equal(clock.timers.get(h.runtime.fadeTimer)?.delay, seconds * 1000);
    if (seconds) {
      clock.advance(9999);
      assert.equal(h.video.classList.contains('decky-metadata-trailer-visible'), false);
    }
    clock.advance(seconds ? 1 : 0);
    assert.equal(h.video.classList.contains('decky-metadata-trailer-visible'), true);
  }
  const clock = fakeClock();
  const h = await readyDirectTrailer({ clock, pageEnteredAt: clock.now });
  const video = h.video;
  h.runtime.update({ ...h.runtime.settings, fadeInDelaySeconds: 10 }, 1, h.runtime.identity);
  assert.equal(clock.timers.get(h.runtime.fadeTimer)?.delay, 10000);
  clock.advance(3000);
  assert.equal(video.classList.contains('decky-metadata-trailer-visible'), false);
  h.runtime.update({ ...h.runtime.settings, fadeInDelaySeconds: 0 }, 2, h.runtime.identity);
  clock.advance(0);
  assert.equal(video.classList.contains('decky-metadata-trailer-visible'), true);
  assert.equal(h.runtime.currentVideo, video);
  assert.equal(h.createdVideos, 1);
});

test('Trailer audio stays silent behind the hero and fades in with the video', async () => {
  const clock = fakeClock();
  const h = await readyDirectTrailer({ clock, pageEnteredAt: clock.now });
  const video = h.video;
  assert.equal(video.paused, false);
  assert.equal(video.classList.contains('decky-metadata-trailer-visible'), false);
  assert.equal(video.muted, true, 'the hidden, playing video must stay silent');
  assert.equal(video.volume, 0);
  h.runtime.setTrailerAudioEnabled(false, false);
  h.runtime.setTrailerAudioEnabled(true, false);
  assert.equal(video.muted, true, 'changing audio before reveal must not expose it early');

  clock.advance(3000);
  assert.equal(video.classList.contains('decky-metadata-trailer-visible'), true);
  assert.equal(video.muted, false);
  assert.equal(video.volume, 0, 'sound starts at zero when the video begins its fade');
  const fade = clock.intervals.get(h.runtime.audioFadeTimer);
  assert.ok(fade);
  clock.advance(600);
  fade.fn();
  assert.equal(video.volume, 0.5);
  clock.advance(600);
  fade.fn();
  assert.equal(video.volume, 1);
  assert.equal(h.runtime.audioFadeTimer, undefined);
  assert.equal(clock.intervals.size, 0);
});

test('Muting or stopping a trailer cancels an in-progress audio fade', async () => {
  const clock = fakeClock();
  const h = await readyDirectTrailer({ clock, pageEnteredAt: clock.now });
  clock.advance(3000);
  const video = h.video;
  const fadeId = h.runtime.audioFadeTimer;
  assert.ok(clock.intervals.has(fadeId));
  h.runtime.setTrailerAudioEnabled(false, false);
  assert.equal(video.muted, true);
  assert.equal(video.volume, 0);
  assert.equal(clock.intervals.has(fadeId), false);

  h.runtime.setTrailerAudioEnabled(true, false);
  assert.equal(video.volume, 1, 'unmuting an already visible trailer acts immediately');
  const next = await readyDirectTrailer({ clock, pageEnteredAt: clock.now - 3000 });
  clock.advance(0);
  const nextFadeId = next.runtime.audioFadeTimer;
  assert.ok(clock.intervals.has(nextFadeId));
  next.runtime.cleanupVideo(true);
  assert.equal(clock.intervals.has(nextFadeId), false);
  assert.equal(next.runtime.audioFadeTimer, undefined);
});

test('A trailer paused before its reveal resumes and appears after the original artwork delay', async () => {
  const clock = fakeClock();
  const h = await readyDirectTrailer({ clock, pageEnteredAt: clock.now });
  const video = h.video;
  const revealTimer = h.runtime.fadeTimer;
  assert.equal(clock.timers.get(revealTimer)?.delay, 3000);
  assert.equal(video.classList.contains('decky-metadata-trailer-visible'), false);
  assert.equal(h.classes.has('decky-metadata-trailer-ready'), false);
  video.paused = true;
  video.dispatchEvent(new Event('pause'));

  clock.advance(3000);
  assert.equal(video.classList.contains('decky-metadata-trailer-visible'), false);
  assert.equal(h.classes.has('decky-metadata-trailer-ready'), false);

  const makeElement = () => ({
    children: [], parentElement: null, className: '', style: {},
    append(...children) { children.forEach(child => this.appendChild(child)); },
    appendChild(child) {
      child.parentElement?.children?.splice(child.parentElement.children.indexOf(child), 1);
      child.parentElement = this;
      this.children.push(child);
    },
    setAttribute() {},
    querySelector(selector) {
      const matches = element => selector.startsWith('img')
        ? element.tagName === 'IMG'
        : selector.startsWith('.') && element.className.split(/\s+/).includes(selector.slice(1));
      const visit = element => {
        for (const child of element.children) {
          if (matches(child)) return child;
          const found = visit(child);
          if (found) return found;
        }
        return null;
      };
      return visit(this);
    },
    remove() {
      if (this.parentElement) {
        const siblings = this.parentElement.children;
        siblings.splice(siblings.indexOf(this), 1);
      }
      this.parentElement = null;
    },
  });
  const footer = makeElement();
  const template = makeElement();
  template.className = 'native-action';
  const glyphContainer = makeElement();
  glyphContainer.className = 'native-glyph-container';
  const nativeGlyph = makeElement();
  nativeGlyph.tagName = 'IMG';
  nativeGlyph.src = '/steaminputglyphs/shared_button_a.svg';
  nativeGlyph.className = 'native-glyph';
  glyphContainer.appendChild(nativeGlyph);
  const nativeLabel = makeElement();
  nativeLabel.className = 'native-label';
  template.append(glyphContainer, nativeLabel);
  footer.appendChild(template);
  footer.insertBefore = (element, before) => {
    const index = before ? footer.children.indexOf(before) : -1;
    if (index < 0) footer.appendChild(element);
    else {
      element.parentElement = footer;
      footer.children.splice(index, 0, element);
    }
  };
  h.document.querySelector = selector => selector === '#Footer > div' ? footer : null;
  h.document.getElementById = id => {
    const visit = element => element.id === id ? element : element.children.map(visit).find(Boolean) ?? null;
    return visit(footer);
  };
  h.document.createElement = tagName => {
    const element = makeElement();
    element.tagName = tagName.toUpperCase();
    return element;
  };
  h.context.HTMLElement = Object;

  await h.runtime.scan();
  for (let index = 0; index < 10; index++) await Promise.resolve();
  assert.equal(h.runtime.currentVideo, video);
  assert.equal(video.paused, false);
  assert.equal(video.classList.contains('decky-metadata-trailer-visible'), false);
  assert.equal(h.document.getElementById('decky-metadata-trailer-audio-hint'), null);
  const resumedReveal = clock.timers.get(h.runtime.fadeTimer);
  assert.ok(resumedReveal, 'wake playback rearms the consumed reveal timer');
  assert.equal(resumedReveal.delay, 0, 'the artwork delay already elapsed during suspend');
  clock.advance(0);

  assert.equal(video.classList.contains('decky-metadata-trailer-visible'), true);
  assert.equal(h.classes.has('decky-metadata-trailer-ready'), true);
  const hint = h.document.getElementById('decky-metadata-trailer-audio-hint');
  assert.ok(hint, 'the audio hint appears only after the trailer becomes visible');
  assert.equal(hint.querySelector('img')?.src, '/steaminputglyphs/shared_button_x.svg');
  const viewHint = h.document.getElementById('decky-metadata-trailer-view-hint');
  assert.ok(viewHint, 'Y is shown in Steam’s native footer when the trailer is ready');
  assert.equal(viewHint.querySelector('img')?.src, '/steaminputglyphs/shared_button_y.svg');
  // Steam can replace the native Footer after the trailer becomes visible.
  hint.remove();
  assert.equal(h.document.getElementById('decky-metadata-trailer-audio-hint'), null);
  viewHint.remove();
  await h.runtime.scan();
  assert.ok(h.document.getElementById('decky-metadata-trailer-audio-hint'),
    'a late Footer refresh restores the X action without restarting playback');
  assert.ok(h.document.getElementById('decky-metadata-trailer-view-hint'),
    'a late Footer refresh restores the Y action without restarting playback');
  assert.equal(h.playCalls, 2);
  assert.equal(h.createdVideos, 1);
});

test('Trailer cleanup cancels a pending reveal timer', async () => {
  const clock = fakeClock();
  const h = await readyDirectTrailer({ clock, pageEnteredAt: clock.now });
  const revealTimer = h.runtime.fadeTimer;
  assert.ok(clock.timers.has(revealTimer));
  h.runtime.cleanupVideo(true);
  assert.equal(clock.timers.has(revealTimer), false);
  assert.equal(h.runtime.fadeTimer, undefined);
});

test('Native logo stays visible by default and toggles during playback without restarting the trailer', async () => {
  const clock = fakeClock();
  const h = await readyDirectTrailer({ clock, pageEnteredAt: clock.now });
  const video = h.video;
  const opacity = element => h.context.getComputedStyle(element).opacity;
  assert.equal(opacity(h.logo), '1');
  clock.advance(3000);
  assert.equal(video.classList.contains('decky-metadata-trailer-visible'), true);
  assert.equal(opacity(h.logo), '1');

  h.runtime.update({ enabled: true, audioEnabled: true, quality: 'auto', hideLogoDuringTrailer: true }, 1);
  assert.equal(opacity(h.logo), '0');
  assert.equal(opacity(h.unrelatedLogo), '1');
  assert.equal(h.video, video);
  assert.equal(h.playCalls, 1);
  assert.equal(h.createdVideos, 1);

  h.runtime.update({ enabled: true, audioEnabled: true, quality: 'auto', hideLogoDuringTrailer: false }, 2);
  assert.equal(opacity(h.logo), '1');
  assert.equal(h.video, video);
  h.runtime.update({ enabled: true, audioEnabled: true, quality: 'auto', hideLogoDuringTrailer: true }, 3);
  h.runtime.activeCandidate.onFailure(new Error('video failed'));
  assert.equal(opacity(h.logo), '1', 'failed playback restores the original game logo');
  assert.equal(h.video, undefined);
});

test('A matched shortcut hides only its own custom logo after reveal and restores it on route exit', async () => {
  const pageAppId = 2147483649;
  const clock = fakeClock();
  const h = await readyDirectTrailer({
    clock, pageEnteredAt: clock.now, pageAppId, sourceAppId: 15200,
    hideLogoDuringTrailer: true, customLogo: true,
  });
  const opacity = element => h.context.getComputedStyle(element).opacity;
  assert.equal(opacity(h.logo), '1', 'the logo stays visible while the trailer is preparing');
  clock.advance(3000);
  assert.equal(opacity(h.logo), '0');
  assert.equal(opacity(h.unrelatedLogo), '1', 'the matched Steam source logo is not changed');

  const replacement = h.makeLogo(`/customimages/${pageAppId}_logo.png?v=2`);
  h.logo.isConnected = false;
  h.replaceLogo(replacement);
  await h.runtime.scan();
  assert.equal(opacity(h.logo), '1', 'a detached logo loses the plugin-owned hidden class');
  assert.equal(opacity(replacement), '0', 'a Steam redraw keeps the new active logo hidden');

  h.window.location = new URL('https://steamloopback.host/routes/library/home');
  h.document.URL = h.window.location.href;
  await h.runtime.scan();
  assert.equal(opacity(replacement), '1');
  assert.equal(h.video, undefined);
});

test('Sleep, disabling trailers, and unload each restore a hidden native logo', async () => {
  for (const exit of ['sleep', 'disable', 'unload']) {
    const clock = fakeClock();
    const h = await readyDirectTrailer({ hideLogoDuringTrailer: true, clock, pageEnteredAt: clock.now });
    clock.advance(3000);
    const opacity = () => h.context.getComputedStyle(h.logo).opacity;
    assert.equal(opacity(), '0');
    if (exit === 'sleep') {
      h.document.hidden = true;
      h.runtime.handleVisibilityChange();
    } else if (exit === 'disable') {
      h.runtime.update({ enabled: false, audioEnabled: true, quality: 'auto', hideLogoDuringTrailer: true }, 1);
    } else {
      h.runtime.destroy();
    }
    assert.equal(opacity(), '1', `${exit} restores the logo`);
    assert.equal(h.video, undefined);
  }
});

test('A denied wake resume restores artwork and does not retry on every scan', async () => {
  const h = await readyDirectTrailer({ failWake: true });
  const video = h.video;
  video.paused = true;
  video.dispatchEvent(new Event('pause'));

  await h.runtime.scan();
  for (let index = 0; index < 10; index++) await Promise.resolve();
  assert.equal(h.runtime.currentVideo, undefined);
  assert.equal(h.classes.has('decky-metadata-trailer-ready'), false);
  assert.equal(h.playCalls, 2);

  await h.runtime.scan();
  await h.runtime.scan();
  assert.equal(h.playCalls, 2);
  assert.equal(h.createdVideos, 1);
});
test('A quality change aborts pending metadata without poisoning the next page attempt', async () => {
  let release;
  let aborted = false;
  let requests = 0;
  const response = () => responseBody(JSON.stringify({ 570: { data: { movies: [movie] } } }));
  const h = setup({ fetchReply: (_url, options) => {
    requests++;
    if (requests > 1) return Promise.resolve(response());
    options.signal.addEventListener('abort', () => { aborted = true; });
    return new Promise(resolve => { release = resolve; });
  } });
  h.runtime.scan = () => {};
  const first = h.runtime.getTrailer(570);
  h.runtime.update({ enabled: true, audioEnabled: true, quality: 1080 }, 1);
  assert.equal(aborted, true);
  release(response());
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
    return responseBody(JSON.stringify({ [sourceAppId]: { data: { movies: [
      { id: 7, name: 'Matched trailer', highlight: true, mp4: { 720: 'https://steam.test/matched720.mp4' } },
    ] } } }));
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
async function trailerScanHarness(pageAppId, sourceAppId, steamResult) {
  const h = setup({ pageAppId, sourceAppId });
  class Hero {
    constructor() {
      this.tagName = 'DIV';
      this.className = 'library-hero';
      this.asset = `url(https://steam.test/${pageAppId >= 0x80000000 ? 'customimages' : 'steam/apps'}/${pageAppId}/library_hero.jpg)`;
      this.classList = { add() {}, remove() {} };
    }
    getAttribute(name) { return name === 'style' ? this.asset : ''; }
    getBoundingClientRect() { return { width: 1000, height: 400, top: 0, left: 0, right: 1000, bottom: 400 }; }
  }
  const hero = new Hero();
  h.document.body = {};
  h.document.querySelectorAll = selector => selector.includes('steam/apps') || selector.includes('customimages') ? [hero] : [];
  h.context.HTMLElement = Hero;
  h.context.getComputedStyle = element => ({ backgroundImage: element.asset, display: 'block', visibility: 'visible' });
  const attached = [];
  let steamLookups = 0;
  h.runtime.getTrailer = async () => { steamLookups++; return steamResult; };
  h.runtime.attachVideo = (target, appId, candidates) => { attached.push({ target, appId, candidates }); };
  await h.runtime.scan();
  return { ...h, hero, attached, get steamLookups() { return steamLookups; } };
}

test('An unmatched shortcut uses the IGN trailer only after its verified hero appears', async () => {
  const shortcutId = 0x80000010;
  const h = await trailerScanHarness(shortcutId, null, { ok: false });
  assert.equal(h.runtime.identity?.sourceAppId, null);
  assert.equal(h.runtime.snapshot().needsIgnFallback, true);
  assert.equal(h.steamLookups, 0);
  assert.equal(h.attached.length, 0);

  h.runtime.update(h.runtime.settings, 1, h.runtime.identity, {
    name: 'Bloodborne Story Trailer',
    candidates: [{ format: 'mp4', url: 'https://assets14.ign.com/bloodborne.mp4', height: 720 }],
  });
  await Promise.resolve();
  assert.equal(h.attached.length, 1);
  assert.equal(h.attached[0].target, h.hero);
  assert.equal(h.attached[0].appId, shortcutId);
  assert.equal(h.attached[0].candidates[0].url, 'https://assets14.ign.com/bloodborne.mp4');
  assert.equal(h.runtime.snapshot().needsIgnFallback, false);
});

test('The Steam default-world owner update delivers a completed IGN lookup', async () => {
  const shortcutId = 0x80000010;
  const h = await trailerScanHarness(shortcutId, null, { ok: false });
  assert.equal(h.runtime.snapshot().needsIgnFallback, true);
  h.window.__deckyMetadataTrailerOwner.settingsRevision = 1;
  h.window.__deckyMetadataTrailerOwner.ignFallback = {
    name: 'Bloodborne Story Trailer',
    candidates: [{ format: 'mp4', url: 'https://assets14.ign.com/bloodborne.mp4', height: 720 }],
  };

  await h.runtime.scan();
  await Promise.resolve();
  assert.equal(h.attached.length, 1);
  assert.equal(h.attached[0].candidates[0].url, 'https://assets14.ign.com/bloodborne.mp4');
});

test('Steam success never requests IGN; Steam miss uses it without repeating Steam lookup', async () => {
  const steamMovie = { ok: true, name: 'Steam movie', candidates: [{ format: 'mp4', url: movie.mp4[720], height: 720 }] };
  const success = await trailerScanHarness(570, 570, steamMovie);
  assert.equal(success.attached[0].candidates[0].url, movie.mp4[720]);
  assert.equal(success.runtime.snapshot().needsIgnFallback, false);

  const miss = await trailerScanHarness(570, 570, { ok: false, error: 'No Steam trailer' });
  assert.equal(miss.runtime.snapshot().needsIgnFallback, true);
  assert.equal(miss.steamLookups, 1);
  miss.runtime.update(miss.runtime.settings, 1, miss.runtime.identity, {
    name: 'IGN game trailer',
    candidates: [{ format: 'mp4', url: 'https://assets14.ign.com/game.mp4', height: 720 }],
  });
  await Promise.resolve();
  assert.equal(miss.attached[0].candidates[0].url, 'https://assets14.ign.com/game.mp4');
  await miss.runtime.scan();
  assert.equal(miss.steamLookups, 1);
});

test('An IGN miss leaves the artwork alone and a later route cannot reuse its result', async () => {
  const h = await trailerScanHarness(0x80000010, null, { ok: false });
  h.runtime.update(h.runtime.settings, 1, h.runtime.identity, null);
  await Promise.resolve();
  assert.equal(h.attached.length, 0);
  assert.equal(h.runtime.snapshot().needsIgnFallback, false);
  h.runtime.update(h.runtime.settings, 2, { pageAppId: 0x80000011, sourceAppId: null });
  assert.equal(h.runtime.snapshot().needsIgnFallback, false);
  assert.equal(h.runtime.ignFallback, undefined);
});


test('An unplayable Steam video falls back to IGN once and restores artwork if IGN also fails', async () => {
  const h = await readyDirectTrailer();
  const steamVideo = h.video;
  steamVideo.dispatchEvent(new Event('error'));
  assert.equal(h.runtime.snapshot().needsIgnFallback, true);
  assert.equal(h.video, undefined);
  assert.equal(h.classes.has('decky-metadata-trailer-ready'), false);

  const url = 'https://assets14.ign.com/deadpool.mp4';
  h.runtime.update(h.runtime.settings, 1, h.runtime.identity, {
    name: 'Deadpool Official Trailer',
    candidates: [{ format: 'mp4', url, height: 720 }],
  });
  for (let index = 0; index < 20; index++) await Promise.resolve();
  assert.equal(h.createdVideos, 2);
  assert.equal(h.video.src, url);
  assert.equal(h.runtime.snapshot().needsIgnFallback, false);

  h.video.dispatchEvent(new Event('error'));
  assert.equal(h.video, undefined);
  assert.equal(h.classes.has('decky-metadata-trailer-ready'), false);
  await h.runtime.scan();
  assert.equal(h.createdVideos, 2, 'a failed IGN asset must not start an endless retry');
});

test('After Steam media fails, a later visit can use refreshed Steam assets', async () => {
  const h = await readyDirectTrailer();
  h.runtime.trailerCache.set(570, {
    ok: true, name: 'Broken Steam movie',
    candidates: [{ format: 'mp4', url: movie.mp4[720], height: 720 }],
  });
  h.video.dispatchEvent(new Event('error'));
  assert.equal(h.runtime.snapshot().needsIgnFallback, true);
  let requests = 0;
  const fixedUrl = 'https://steam.test/fixed1080.mp4';
  h.context.fetch = async () => {
    requests++;
    return responseBody(JSON.stringify({ 570: { data: { movies: [
      { id: 8, name: 'Fixed Steam movie', highlight: true, mp4: { 1080: fixedUrl } },
    ] } } }));
  };
  h.runtime.update({ ...h.runtime.settings, quality: 1080 }, 1, h.runtime.identity, null);
  for (let index = 0; index < 30; index++) await Promise.resolve();
  assert.equal(requests, 1);
  assert.equal(h.video?.src, fixedUrl);
});

test('A QAM hash keeps the current root-page trailer attached during a runtime scan', async () => {
  const h = setup();
  class Hero {
    constructor() {
      this.tagName = 'DIV';
      this.className = 'library-hero';
      this.asset = 'url(https://steam.test/steam/apps/570/library_hero.jpg)';
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
  let requests = 0;
  h.runtime.getTrailer = async () => {
    requests++;
    return { ok: true, name: 'Fixture', candidates: [{ format: 'mp4', url: movie.mp4[720], height: 720 }] };
  };
  h.runtime.attachVideo = (target, appId, _candidates, _token, options) => {
    const video = { isConnected: true, currentTime: 17, classList: { contains: () => false } };
    h.runtime.currentTarget = target;
    h.runtime.currentAppId = appId;
    h.runtime.currentMediaSignature = options.mediaSignature;
    h.runtime.currentVideo = video;
  };

  await h.runtime.scan();
  const video = h.runtime.currentVideo;
  h.window.location.hash = '#quickaccess';
  h.runtime.handleRouteChange();
  await h.runtime.scan();

  assert.equal(h.runtime.currentVideo, video);
  assert.equal(video.currentTime, 17);
  assert.equal(requests, 1);
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
      return responseBody(JSON.stringify({ 570: { data: { movies: [movie] } } }));
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
    return responseBody(JSON.stringify({ 570: { data: { movies: [movie] } } }));
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
  const initOffsets = [];
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
      if (url.endsWith('/init')) {
        this.initialized = true;
        initOffsets.push(this.timestampOffset);
      }
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
        releaseHeld = () => resolve(responseBody(new TextEncoder().encode(url)));
      });
    }
    return Promise.resolve(responseBody(new TextEncoder().encode(url)));
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
    initOffsets,
    get failures() { return failures; },
    get heldSignal() { return heldSignal; },
    releaseHeld: () => releaseHeld?.(),
    flush };
}

test('DASH track timestamp correction is applied before init data is appended', async () => {
  const h = adaptiveFixture();
  const element = (localName, attributes = {}, children = []) => ({
    localName,
    children,
    getAttribute: name => attributes[name] ?? null,
    hasAttribute: name => Object.hasOwn(attributes, name),
  });
  const template = element('SegmentTemplate', {
    timescale: '1000', duration: '2000', presentationTimeOffset: '1000', startNumber: '1',
    initialization: 'init.mp4', media: 'segment-$Time$.m4s',
  });
  const representation = element('Representation', { id: 'video', bandwidth: '500000', height: '720' }, [template]);
  const adaptation = element('AdaptationSet', {
    contentType: 'video', mimeType: 'video/mp4', codecs: 'avc1.640029',
  }, [representation]);
  const period = element('Period', { duration: 'PT6S' }, [adaptation]);
  const root = element('MPD', { type: 'static', mediaPresentationDuration: 'PT6S' }, [period]);
  class ManifestParser {
    parseFromString() {
      return { documentElement: root, querySelector: () => null, getElementsByTagName: () => [] };
    }
  }
  const parsed = setup({ domParserType: ManifestParser }).runtime.selectDashVariant(
    '<MPD/>', 'https://steam.test/manifest.mpd');
  assert.equal(parsed.tracks[0].timestampOffset, -1);
  h.presentation.tracks[0].timestampOffset = parsed.tracks[0].timestampOffset;
  await h.session.start();
  assert.deepEqual(h.initOffsets.slice(0, 2), [-1, 0]);
  h.session.dispose();
});

test('Changing trailer audio keeps the current media time and adaptive session', () => {
  const h = setup();
  const video = { isConnected: true, currentTime: 13.5, muted: false, defaultMuted: false, volume: 1,
    classList: { contains: () => false } };
  const session = { dispose: () => assert.fail('audio changes must not dispose MSE') };
  h.runtime.currentVideo = video;
  h.runtime.activeSession = session;
  h.runtime.currentMediaReady = true;

  h.runtime.setTrailerAudioEnabled(false, false);

  assert.equal(h.runtime.currentVideo, video);
  assert.equal(video.currentTime, 13.5);
  assert.equal(video.muted, true);
  assert.equal(h.runtime.activeSession, session);
});

test('A runtime destroys all Metadata-owned resources when its controller owner disappears', async () => {
  const h = setup();
  let clearedScanTimer = false, disconnected = false, removedStyle = false;
  const documentListeners = new Map();
  const windowListeners = new Map();
  const style = { id: 'decky-metadata-trailer-style', textContent: '', remove() { removedStyle = true; } };
  h.window.setInterval = () => 41;
  h.window.clearInterval = id => { if (id === 41) clearedScanTimer = true; };
  h.window.addEventListener = (name, listener) => windowListeners.set(name, listener);
  h.window.removeEventListener = name => windowListeners.delete(name);
  h.document.body = {};
  h.document.head = { appendChild() {} };
  h.document.createElement = () => style;
  h.document.getElementById = id => id === style.id ? style : null;
  h.document.addEventListener = (name, listener) => documentListeners.set(name, listener);
  h.document.removeEventListener = name => documentListeners.delete(name);
  h.document.querySelectorAll = () => [];
  h.context.MutationObserver = class {
    observe() {}
    disconnect() { disconnected = true; }
  };
  h.runtime.mount();
  h.window.__deckyMetadataTrailerRuntime = h.runtime;
  const video = { isConnected: true, pause() {}, removeAttribute() {}, load() {}, remove() { this.isConnected = false; } };
  h.runtime.currentVideo = video;
  h.window.__deckyMetadataTrailerOwner.active = false;

  await h.runtime.scan();

  assert.equal(h.runtime.destroyed, true);
  assert.equal(h.window.__deckyMetadataTrailerRuntime, undefined);
  assert.equal(video.isConnected, false);
  assert.equal(clearedScanTimer, true);
  assert.equal(disconnected, true);
  assert.equal(removedStyle, true);
  assert.equal(documentListeners.size, 0);
  assert.equal(windowListeners.size, 0);
});

test('Media request validation rejects an unsafe redirect and an HTTP child URI', async () => {
  const redirected = setup({ fetchReply: async () => ({
    ok: true, redirected: true, url: 'https://127.0.0.1/private.m3u8',
    body: null,
  }) });
  const candidate = { controller: new AbortController(), isCurrent: () => true };
  await assert.rejects(redirected.runtime.fetchText('https://steam.test/master.m3u8', candidate), /URL|redirect/i);

  const h = setup();
  assert.throws(() => h.runtime.selectHlsVariant(`#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000,CODECS="avc1.640029",RESOLUTION=1280x720
http://127.0.0.1/private.m3u8`,
  'https://steam.test/master.m3u8'), /supported video/i);
});

test('Movie metadata cannot supply an HTTP or private direct candidate', async () => {
  const h = setup({ fetchReply: async () => responseBody(JSON.stringify({ 570: { data: { movies: [{
    id: 5,
    mp4: {
      720: 'http://cdn.steam.test/movie720.mp4',
      1080: 'https://127.0.0.1/private.mp4',
    },
  }] } } })) });

  const result = await h.runtime.getTrailer(570);

  assert.equal(result.ok, false);
  assert.equal(result.candidates, undefined);
});

test('Steam loopback URLs are rejected as direct files and HLS child playlists', async () => {
  const requestedUrls = [];
  const h = setup({ fetchReply: async url => {
    requestedUrls.push(url);
    return responseBody(JSON.stringify({ 570: { data: { movies: [{
      id: 6,
      mp4: { 720: 'https://steamloopback.host/movie.mp4' },
    }] } } }));
  } });

  const result = await h.runtime.getTrailer(570);

  assert.equal(result.ok, false);
  assert.deepEqual(requestedUrls, ['https://store.steampowered.com/api/appdetails?appids=570&filters=movies']);
  assert.throws(() => h.runtime.selectHlsVariant(`#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000,CODECS="avc1.640029",RESOLUTION=1280x720
https://cdn.steamloopback.host/child.m3u8`,
  'https://steam.test/master.m3u8'), /supported video/i);
});

test('A response without a streaming reader fails closed without reading an unbounded fallback', async () => {
  for (const contentLength of [null, '4']) {
    let bodyRead = false;
    const h = setup({ fetchReply: async () => ({
      ok: true,
      headers: { get: name => name.toLowerCase() === 'content-length' ? contentLength : null },
      body: null,
      text: async () => { bodyRead = true; return 'oversized response'; },
      arrayBuffer: async () => { bodyRead = true; return new ArrayBuffer(128); },
    }) });
    const candidate = { controller: new AbortController(), isCurrent: () => true };

    await assert.rejects(h.runtime.fetchText('https://steam.test/manifest.m3u8', candidate), /stream|bounded/i);

    assert.equal(bodyRead, false);
  }
});

test('An oversized short segment fails before the response body is read', async () => {
  let bodyRead = false;
  const h = setup({ fetchReply: async () => ({
    ok: true,
    headers: { get: name => name.toLowerCase() === 'content-length' ? String(32 * 1024 * 1024 + 1) : null },
    body: null,
    arrayBuffer: async () => { bodyRead = true; return new ArrayBuffer(0); },
  }) });
  const candidate = { controller: new AbortController(), isCurrent: () => true };
  const session = new h.api.AdaptiveSession({ pause() {}, removeAttribute() {}, load() {} },
    { duration: 3, tracks: [] }, candidate);
  await assert.rejects(session.fetchBytes('https://steam.test/short.m4s', 0, true), /too large|size/i);
  assert.equal(bodyRead, false);
});

test('An oversized chunked short segment is cancelled at the streaming byte cap', async () => {
  let chunksRead = 0, cancelled = false;
  const h = setup({ fetchReply: async () => ({
    ok: true,
    headers: { get: () => null },
    body: new ReadableStream({
      pull(controller) {
        chunksRead++;
        controller.enqueue(new Uint8Array(8 * 1024 * 1024));
      },
      cancel() { cancelled = true; },
    }),
  }) });
  const candidate = { controller: new AbortController(), isCurrent: () => true };
  const session = new h.api.AdaptiveSession({ pause() {}, removeAttribute() {}, load() {} },
    { duration: 3, tracks: [] }, candidate);

  await assert.rejects(session.fetchBytes('https://steam.test/short.m4s', 0, true), /too large/i);

  assert.ok(chunksRead >= 5 && chunksRead <= 6);
  assert.equal(cancelled, true);
});

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
  const h = setup({ fetchReply: async () => responseBody('#EXTM3U\n#EXT-X-ENDLIST') });
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
