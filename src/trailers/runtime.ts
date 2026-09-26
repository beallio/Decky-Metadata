// @ts-nocheck
// This self-contained function is serialized into Steam's default world.
// Adapted from Decky-TrailerHero by LoZazaMastro; see NOTICE for inherited terms.
export function deckyMetadataTrailerRuntimeFactory(nextSettings, ownerId, settingsRevision, injectedTranslations, identity) {
    const runtimeKey = "__deckyMetadataTrailerRuntime";
    const runtimeVersion = "0.1.0";
    const styleId = "decky-metadata-trailer-style";
    const videoClass = "decky-metadata-trailer-video";
    const targetClass = "decky-metadata-trailer-target";
    const readyClass = "decky-metadata-trailer-ready";
    const visibleClass = "decky-metadata-trailer-visible";
    const audioHintId = "decky-metadata-trailer-audio-hint";
    const audioChangeEvent = "decky-metadata-trailer:audio-change";
    const routeScanIntervalMs = 2400;
    const queuedScanDelayMs = 360;
    const directPlaybackTimeoutMs = 12000;
    const MAX_METADATA_BYTES = 1024 * 1024;
    const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
    const MAX_INIT_BYTES = 4 * 1024 * 1024;
    const MAX_SEGMENT_BYTES = 32 * 1024 * 1024;
    const translations = injectedTranslations || { en: {} };
    const safeMediaUrl = (value, base) => {
        if (typeof value !== "string" || !value.trim()) return null;
        let parsed;
        try { parsed = base ? new URL(value, base) : new URL(value); }
        catch { return null; }
        const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
        if (parsed.protocol !== "https:" || parsed.username || parsed.password || !host ||
            host === "steamloopback.host" || host.endsWith(".steamloopback.host") ||
            host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
            host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home") ||
            host.endsWith(".onion") || /^\[.*\]$/.test(host) || /^\d+(?:\.\d+){0,3}$/.test(host)) return null;
        return parsed.href;
    };
    const readBoundedBody = async (response, maximumBytes, asText) => {
        const contentLength = response.headers?.get?.("content-length");
        const lengthText = contentLength == null ? null : String(contentLength).trim();
        if (lengthText !== null && !/^\d+$/.test(lengthText)) {
            throw new Error("Steam media response has an invalid content length");
        }
        const declaredLength = lengthText === null ? null : Number(lengthText);
        if (declaredLength !== null && !Number.isSafeInteger(declaredLength)) {
            throw new Error("Steam media response has an invalid content length");
        }
        if (declaredLength !== null && declaredLength > maximumBytes) {
            throw new Error("Steam media response is too large");
        }
        const reader = response.body?.getReader?.();
        if (!reader) throw new Error("Steam media response has no bounded streaming body");
        const chunks = [];
        let size = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > maximumBytes) {
                    await reader.cancel();
                    throw new Error("Steam media response is too large");
                }
                chunks.push(value);
            }
        }
        catch (error) {
            try { await reader.cancel(); } catch { }
            throw error;
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return asText ? new TextDecoder().decode(bytes) : bytes.buffer;
    };
    const validateResponseUrl = (response, requestedUrl) => {
        if (response.redirected === true) throw new Error("Steam media redirects are not allowed");
        if (!response.url) return;
        const finalUrl = safeMediaUrl(response.url);
        if (!finalUrl || finalUrl !== requestedUrl) throw new Error("Steam media response URL changed");
    };
    const normalizeSettings = (value) => {
        const parsed = value && typeof value === "object" && !Array.isArray(value) ? value : {};
        const qualityOptions = ["auto", 720, 1080, 1440, 2160];
        return {
            enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : false,
            audioEnabled: typeof parsed.audioEnabled === "boolean" ? parsed.audioEnabled : false,
            quality: qualityOptions.includes(parsed.quality) ? parsed.quality : "auto"
        };
    };
    const findOwnerRecord = () => {
        const candidates = [];
        try { candidates.push(window.opener); } catch { }
        candidates.push(window);
        try { if (window.parent !== window) candidates.push(window.parent); } catch { }
        for (const candidate of candidates) {
            try {
            const record = candidate?.__deckyMetadataTrailerOwner;
                if (record && typeof record === "object") return record;
            }
            catch { }
        }
        return undefined;
    };
    let activeOwnerId = ownerId || "";
    let activeRevision = Number.isSafeInteger(settingsRevision) && settingsRevision >= 0 ? settingsRevision : 0;
    let settings = normalizeSettings(nextSettings);
    const normalizeIdentity = (value) => {
        const pageAppId = Number(value?.pageAppId);
        const sourceAppId = Number(value?.sourceAppId);
        if (!Number.isInteger(pageAppId) || pageAppId <= 0 || pageAppId > 0xffffffff ||
            !Number.isInteger(sourceAppId) || sourceAppId <= 0 || sourceAppId >= 0x80000000) return null;
        return { pageAppId, sourceAppId };
    };
    let activeIdentity = normalizeIdentity(identity);
    const ownerRecord = findOwnerRecord();
    if (activeOwnerId && (!ownerRecord || ownerRecord.ownerId !== activeOwnerId || ownerRecord.active !== true)) {
        return { status: "Steam UI unavailable", runtimeMissing: true };
    }
    if (ownerRecord && ownerRecord.ownerId === activeOwnerId && Number.isSafeInteger(ownerRecord.settingsRevision) && ownerRecord.settingsRevision > activeRevision) {
        activeRevision = ownerRecord.settingsRevision;
        settings = normalizeSettings(ownerRecord.settings);
        activeIdentity = normalizeIdentity(ownerRecord.identity);
    }
    const rt = (key, vars = {}) => {
        const template = translations.en?.[key] ?? key;
        return template.replace(/\{(\w+)\}/g, (_match, name) => String(vars[name] ?? ""));
    };
    const isLikelyNonSteamShortcutAppId = (appId) => Number.isInteger(appId) && appId >= 2147483648;
    const coerceAppId = (value) => {
        if (typeof value !== "number" && (typeof value !== "string" || !/^\d{1,10}$/.test(value))) return undefined;
        const appId = Number(value);
        return Number.isInteger(appId) && appId > 0 && appId <= 0xffffffff ? appId : undefined;
    };
    function getGameDetailsRouteAppId(value) {
        let path;
        try {
            const routeText = String(value || "").trim();
            const hashes = [...routeText.matchAll(/#([^\s]*)/g)].map((match) => match[1].toLowerCase());
            if (hashes.some((hash) => hash && hash !== "quickaccess") ||
                /\b(?:tab|page|section|subpage)=/i.test(routeText)) return undefined;
            const route = new URL(routeText.split(/\s+/, 1)[0], window.location?.href ||
                "https://steamloopback.host/");
            if ((route.hash && route.hash.toLowerCase() !== "#quickaccess") ||
                ["tab", "page", "section", "subpage"].some((key) => route.searchParams.has(key))) return undefined;
            path = route.pathname;
        }
        catch { return undefined; }
        const match = path.match(/^\/(?:routes\/)?library\/(?:(?:app|details)\/)?(\d{1,10})\/?$/i) ??
            path.match(/^\/(?:routes\/)?library\/collection\/[^/]+\/(?:app\/)?(\d{1,10})\/?$/i);
        const appId = coerceAppId(match?.[1]);
        return appId;
    }
    const getLocalRouteText = () => [window.location?.href, window.location?.pathname, window.location?.hash, document.URL].filter(Boolean).join(" ").toLowerCase();
    function getOpenerRouteText() {
        try {
            const opener = window.opener;
            if (!opener?.location || new URL(opener.location.href).hostname !== "steamloopback.host") return "";
            return [opener.location.href, opener.location.pathname, opener.location.hash, opener.document?.URL]
                .filter(Boolean).join(" ").toLowerCase();
        }
        catch { return ""; }
    }
    const activeRouteText = () => getOpenerRouteText() || getLocalRouteText();
    const detectLocationAppId = () => getGameDetailsRouteAppId(activeRouteText());
    const readRootRouteKey = () => {
        try {
            const first = activeRouteText().trim().split(/\s+/, 1)[0];
            return new URL(first, window.location.href).pathname.replace(/^\/routes(?=\/)/, "").replace(/\/$/, "") || "/";
        }
        catch { return ""; }
    };
    const getElementAssetText = (element) => {
        let background = "";
        try { background = getComputedStyle(element).backgroundImage || ""; } catch { }
        return [element.getAttribute("style") || "", element.getAttribute("src") || "", element.getAttribute("href") || "", background].join(" ");
    };
    const extractAppIdFromText = (value) => {
        const text = String(value || "");
        const patterns = [
            /(?:steam\/apps|store_item_assets\/steam\/apps|steamcommunity\/public\/images\/apps|assets)\/(\d{1,10})(?:[\/_?.&#-]|$)/i,
            /(?:config\/grid|\/grid\/)(\d{1,10})(?:[._a-z-]|$)/i,
            /\/customimages\/(\d{1,10})(?:[a-z_]*)(?:[._/?#-]|$)/i,
            /store\.steampowered\.com\/app\/(\d{1,10})(?:[/?#-]|$)/i
        ];
        const match = patterns.map((pattern) => text.match(pattern)).find(Boolean);
        const appId = coerceAppId(match?.[1]);
        return appId;
    };
    const isUsableRect = (rect) => {
        const minWidth = Math.min(420, window.innerWidth * 0.35);
        const minHeight = Math.min(180, window.innerHeight * 0.28);
        return rect.width >= minWidth && rect.height >= minHeight && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
    };
    const scoreHeroElement = (element, assetText) => {
        const rect = element.getBoundingClientRect();
        if (!isUsableRect(rect)) return 0;
        const classText = String(element.className || "").toLowerCase();
        const assetLower = assetText.toLowerCase();
        if (assetLower.includes("movie") || assetLower.includes("trailer")) return 0;
        const areaScore = Math.min(900, rect.width * rect.height / 900);
        const topBias = Math.max(0, 260 - Math.abs(rect.top)) / 2;
        const heroBias = assetLower.includes("library_hero") || classText.includes("hero") ? 500 : 0;
        const customHeroBias = assetLower.includes("/customimages/") && assetLower.includes("_hero") ? 700 : 0;
        const backgroundBias = classText.includes("background") || assetLower.includes("page_bg") ? 180 : 0;
        const smallMediaPenalty = element.tagName === "IMG" && rect.height < window.innerHeight * 0.32 ? 350 : 0;
        const offscreenPenalty = Math.max(0, Math.abs(rect.left) - 4) * 4 + Math.max(0, Math.abs(rect.top) - 8) * 4;
        return areaScore + topBias + heroBias + customHeroBias + backgroundBias - smallMediaPenalty - offscreenPenalty;
    };
    function findHeroCandidate(preferredAppId = detectLocationAppId()) {
        const selector = [
            "[style*='steam/apps']", "[style*='store_item_assets']", "[style*='/assets/']", "[style*='/customimages/']", "[style*='library_hero']",
            "img[src*='steam/apps']", "img[src*='store_item_assets']", "img[src*='/assets/']", "img[src*='/customimages/']", "img[src*='library_hero']", "a[href*='/app/']"
        ].join(",");
        const nodes = Array.from(document.querySelectorAll(selector)).slice(0, 900);
        let best;
        for (const node of nodes) {
            const assetText = getElementAssetText(node);
            const appId = extractAppIdFromText(assetText);
            if (!appId || (preferredAppId && appId !== preferredAppId)) continue;
            const target = node.tagName === "IMG" ? node.parentElement : node;
            if (!(target instanceof HTMLElement)) continue;
            const score = scoreHeroElement(target, assetText);
            if (score > 0 && (!best || score > best.score)) best = { appId, element: target, score, assetText };
        }
        return best;
    }
    function isProbablyGameDetailsPage() {
        if (!document.body) return false;
        const routeText = activeRouteText();
        const routeAppId = getGameDetailsRouteAppId(routeText);
        if (!routeAppId || !activeIdentity || activeIdentity.pageAppId !== routeAppId) return false;
        const hero = findHeroCandidate(routeAppId);
        return Boolean(hero && hero.appId === routeAppId);
    }
    const normalizeActionText = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    function isLaunchActionElement(target) {
        if (!(target instanceof HTMLElement)) return false;
        const control = target.closest("button, a, [role='button'], [tabindex], [class*='Button'], [class*='button']");
        if (!control) return false;
        const rect = control.getBoundingClientRect();
        if (rect.width < 44 || rect.height < 28 || rect.bottom < 0 || rect.top > window.innerHeight) return false;
        const text = normalizeActionText([control.innerText, control.textContent, control.getAttribute("aria-label"), control.getAttribute("title")].filter(Boolean).join(" "));
        return /\b(play|launch|install|resume|update|stream|gioca|avvia|installa|riprendi|aggiorna|jouer|lancer|installer|reprendre|jugar|iniciar|instalar|reanudar|actualizar|jogar|continuar|spielen|installieren|fortsetzen)\b/.test(text) || ["开始游戏", "开始", "安装", "继续", "更新", "プレイ", "起動", "インストール", "再開"].some((word) => text.includes(word));
    }
    const detectGameTitle = (appId) => {
        try {
            const overview = window.appStore?.GetAppOverviewByAppID?.(appId);
            return String(overview?.display_name || overview?.name || overview?.strDisplayName || "");
        }
        catch { return ""; }
    };
    function readPlaybackDisplaySize(hostWindow) {
        const dpr = Number.isFinite(hostWindow.devicePixelRatio) && hostWindow.devicePixelRatio > 0
            ? hostWindow.devicePixelRatio : 1;
        const valid = (width, height) => Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
        const screen = hostWindow.screen;
        const width = valid(screen?.width, screen?.height) ? screen.width : hostWindow.innerWidth;
        const height = valid(screen?.width, screen?.height) ? screen.height : hostWindow.innerHeight;
        if (!valid(width, height)) return null;
        return { width: Math.round(width * dpr), height: Math.round(height * dpr) };
    }
    function resolveQualityTarget(quality, displaySize) {
        return typeof quality === "number" && [720, 1080, 1440, 2160].includes(quality)
            ? quality : displaySize ? Math.min(2160, displaySize.height) : 720;
    }
    function createStyle() {
        return `
      .${targetClass}{position:relative!important;overflow:hidden!important;isolation:isolate!important}
      .${videoClass}{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:cover!important;pointer-events:none!important;opacity:0!important;transform:scale(1.015)!important;transition:opacity 1200ms ease,transform 7000ms ease!important;z-index:1!important;background:#000!important}
      .${videoClass}.${visibleClass}{opacity:1!important;transform:scale(1.04)!important}
      .${targetClass}.${readyClass}::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:2;opacity:.38;background:linear-gradient(90deg,rgba(0,0,0,.7),rgba(0,0,0,.18) 48%,rgba(0,0,0,.52)),linear-gradient(0deg,rgba(0,0,0,.72),rgba(0,0,0,.04) 42%)}
    `;
    }
    class AdaptiveSession {
        constructor(video, presentation, candidate) {
            this.video = video;
            this.presentation = presentation;
            this.candidate = candidate;
            this.requests = new Set();
            this.operation = Promise.resolve();
            this.generation = 0;
            this.pendingPump = false;
            this.starting = true;
            this.disposed = false;
            this.failed = false;
            this.handlers = [];
        }
        assertCurrent() {
            if (this.disposed || !this.candidate.isCurrent()) {
                const error = new Error("Trailer request changed");
                error.name = "AbortError";
                throw error;
            }
        }
        waitFor(target, eventName, timeoutMs, action) {
            return new Promise((resolve, reject) => {
                const signal = this.candidate.controller.signal;
                let timer;
                const cleanup = () => {
                    target.removeEventListener(eventName, done);
                    target.removeEventListener("error", failed);
                    signal.removeEventListener("abort", cancelled);
                    window.clearTimeout(timer);
                };
                const done = () => { cleanup(); resolve(); };
                const failed = () => { cleanup(); reject(new Error(`${eventName} failed`)); };
                const cancelled = () => {
                    cleanup();
                    const error = new Error("Trailer request stopped");
                    error.name = "AbortError";
                    reject(error);
                };
                if (signal.aborted || this.disposed) { cancelled(); return; }
                target.addEventListener(eventName, done);
                target.addEventListener("error", failed);
                signal.addEventListener("abort", cancelled, { once: true });
                timer = window.setTimeout(() => {
                    cleanup();
                    reject(new Error(`${eventName} timed out`));
                }, timeoutMs);
                if (action) {
                    try { action(); } catch (error) { cleanup(); reject(error); }
                }
            });
        }
        async fetchBytes(url, generation, segment = false) {
            this.assertCurrent();
            const requestUrl = safeMediaUrl(url);
            if (!requestUrl) throw new Error("Steam media URL is not safe HTTPS");
            const controller = new AbortController();
            const request = { controller, generation, segment };
            this.requests.add(request);
            const cancel = () => controller.abort();
            this.candidate.controller.signal.addEventListener("abort", cancel, { once: true });
            const timeout = window.setTimeout(() => controller.abort(), 12000);
            try {
                const response = await fetch(requestUrl, { signal: controller.signal, cache: "default", redirect: "error" });
                validateResponseUrl(response, requestUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${requestUrl}`);
                const data = await readBoundedBody(response, segment ? MAX_SEGMENT_BYTES : MAX_INIT_BYTES, false);
                this.assertCurrent();
                if (segment && generation !== this.generation) {
                    const error = new Error("Obsolete seek request");
                    error.name = "AbortError";
                    throw error;
                }
                return data;
            }
            finally {
                window.clearTimeout(timeout);
                this.candidate.controller.signal.removeEventListener("abort", cancel);
                this.requests.delete(request);
            }
        }
        async mutate(buffer, action) {
            const previous = this.operation;
            let release;
            this.operation = new Promise((resolve) => { release = resolve; });
            await previous;
            try {
                this.assertCurrent();
                await this.waitFor(buffer, "updateend", 12000, action);
            }
            finally { release(); }
        }
        async start() {
            try {
                this.assertCurrent();
                if (!Number.isFinite(this.presentation.duration) || this.presentation.duration <= 0 ||
                    !this.presentation.tracks.length || this.presentation.tracks.some((track) =>
                        !track.initUrl || !track.segments.length || track.segments.some((segment) =>
                            !Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.end <= segment.start))) {
                    throw new Error("Invalid adaptive presentation");
                }
                this.mediaSource = new MediaSource();
                this.objectUrl = URL.createObjectURL(this.mediaSource);
                const opened = this.waitFor(this.mediaSource, "sourceopen", 12000);
                this.video.loop = false;
                this.video.src = this.objectUrl;
                this.video.load();
                await opened;
                this.assertCurrent();
                // CEF rejects a second SourceBuffer if any init data was appended
                // before it was allocated. Allocate every track synchronously.
                this.tracks = this.presentation.tracks.map((track) => {
                    const buffer = this.mediaSource.addSourceBuffer(track.mimeType);
                    buffer.mode = "segments";
                    const timestampOffset = Number(track.timestampOffset ?? 0);
                    if (!Number.isFinite(timestampOffset)) throw new Error("Invalid media timestamp offset");
                    buffer.timestampOffset = timestampOffset;
                    return { track, buffer, appended: new Set(),
                        pinned: new Set(track.segments.flatMap((segment, index) => segment.start < 8 ? [index] : [])) };
                });
                this.mediaSource.duration = this.presentation.duration;
                for (const state of this.tracks) {
                    const data = await this.fetchBytes(state.track.initUrl);
                    this.assertCurrent();
                    await this.mutate(state.buffer, () => state.buffer.appendBuffer(data));
                }
                await this.pumpWindow(this.generation, true);
                this.assertCurrent();
                this.starting = false;
                const listen = (target, name, handler) => {
                    target.addEventListener(name, handler);
                    this.handlers.push([target, name, handler]);
                };
                listen(this.video, "timeupdate", () => this.requestPump());
                listen(this.video, "waiting", () => this.requestPump());
                listen(this.video, "play", () => this.requestPump());
                listen(this.video, "seeking", () => this.seek(this.video.currentTime));
                listen(this.video, "ended", () => {
                    if (this.disposed) return;
                    this.video.currentTime = 0;
                    this.seek(0);
                    this.video.play().catch(() => undefined);
                });
                this.pumpTimer = window.setInterval(() => this.requestPump(), 700);
                if (this.pendingPump) this.requestPump();
            }
            catch (error) {
                this.fail(error);
                throw error;
            }
        }
        seek(_time) {
            if (this.disposed) return;
            this.generation++;
            for (const request of this.requests) if (request.segment) request.controller.abort();
            this.requestPump();
        }
        requestPump() {
            if (this.disposed) return;
            this.pendingPump = true;
            if (this.starting || this.pumping) return;
            this.pumping = true;
            void (async () => {
                do {
                    this.pendingPump = false;
                    await this.pumpWindow(this.generation, false);
                } while (this.pendingPump && !this.disposed);
            })().catch((error) => this.fail(error)).finally(() => {
                this.pumping = false;
                if (this.pendingPump && !this.disposed) this.requestPump();
            });
        }
        async pumpWindow(generation, priming) {
            this.assertCurrent();
            const time = Math.min(this.presentation.duration, Math.max(0, Number(this.video.currentTime) || 0));
            const from = Math.max(0, time - 6);
            const until = Math.min(this.presentation.duration, time + 12);
            for (const state of this.tracks) {
                if (generation !== this.generation) return;
                const segments = state.track.segments;
                const wanted = new Set(state.pinned);
                segments.forEach((segment, index) => {
                    if (segment.start < until && segment.end > from) wanted.add(index);
                });
                let removeStart, removeEnd;
                const flushRemoval = async () => {
                    if (removeStart === undefined) return;
                    const start = removeStart, end = removeEnd;
                    removeStart = removeEnd = undefined;
                    await this.mutate(state.buffer, () => state.buffer.remove(start, end));
                };
                for (const index of [...state.appended].sort((a, b) => a - b)) {
                    if (generation !== this.generation) return;
                    if (wanted.has(index)) { await flushRemoval(); continue; }
                    const segment = segments[index];
                    if (removeStart === undefined) removeStart = segment.start;
                    else if (segment.start > removeEnd + 0.0001) {
                        await flushRemoval();
                        removeStart = segment.start;
                    }
                    removeEnd = segment.end;
                    state.appended.delete(index);
                }
                await flushRemoval();
                if (!priming && this.video.paused) continue;
                for (const index of [...wanted].sort((a, b) => a - b)) {
                    if (generation !== this.generation) return;
                    if (state.appended.has(index)) continue;
                    const segment = segments[index];
                    let data;
                    try { data = await this.fetchBytes(segment.url, generation, true); }
                    catch (error) {
                        if (generation !== this.generation && !this.disposed) return;
                        throw error;
                    }
                    if (generation !== this.generation) return;
                    this.assertCurrent();
                    await this.mutate(state.buffer, () => state.buffer.appendBuffer(data));
                    state.appended.add(index);
                }
            }
            if (generation === this.generation && !this.video.seeking &&
                this.mediaSource.readyState === "open" &&
                this.tracks.every(({ track, appended }) => appended.has(track.segments.length - 1)) &&
                this.tracks.every(({ buffer }) => !buffer.updating)) {
                this.mediaSource.endOfStream();
            }
        }
        fail(error) {
            if (this.failed || this.disposed || !this.candidate.isCurrent()) return;
            this.failed = true;
            this.candidate.onFailure(error);
        }
        dispose() {
            if (this.disposed) return;
            this.disposed = true;
            this.candidate.controller.abort();
            for (const request of this.requests) request.controller.abort();
            if (this.pumpTimer) window.clearInterval(this.pumpTimer);
            for (const [target, name, handler] of this.handlers) target.removeEventListener(name, handler);
            this.handlers.length = 0;
            this.video.pause();
            this.video.removeAttribute("src");
            this.video.load();
            if (this.mediaSource?.readyState === "open") {
                for (const { buffer } of this.tracks ?? []) {
                    try { if (!buffer.updating) this.mediaSource.removeSourceBuffer(buffer); } catch { }
                }
            }
            if (this.objectUrl) {
                URL.revokeObjectURL(this.objectUrl);
                this.objectUrl = undefined;
            }
            this.video.remove();
        }
    }
    class Runtime {
        constructor(initialSettings, runtimeOwnerId, revision) {
            this.product = "decky-metadata-trailer";
            this.version = runtimeVersion;
            this.ownerId = runtimeOwnerId || "";
            this.settingsRevision = Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
            this.identity = activeIdentity;
            this.settings = normalizeSettings(initialSettings);
            this.status = rt("waitingGamePage");
            this.requestToken = 0;
            this.trailerCache = new Map();
            this.resumeAttemptCandidate = undefined;
            this.displaySize = readPlaybackDisplaySize(window);
            this.targetHeight = resolveQualityTarget(this.settings.quality, this.displaySize);
            this.trailerAudioEnabled = this.settings.audioEnabled;
            this.lastSecondaryPressAt = -Infinity;
            this.scanQueued = false;
            this.launchHeld = false;
            this.rootRouteKey = readRootRouteKey();
            this.handleResize = () => this.queueScan();
            this.handleRouteChange = () => {
                if (this.checkRootRoute()) void this.scan();
            };
            this.handleVisibilityChange = () => {
                this.failedVisit = undefined;
                if (document.hidden) {
                    this.pageEnteredAt = undefined;
                    this.cleanupVideo(true);
                }
                else {
                    this.launchHeld = false;
                    this.pageEnteredAt = undefined;
                    void this.scan();
                }
            };
            this.handleLaunchIntent = (event) => this.stopTrailerForLaunch(event.target);
            this.handleLaunchKeyDown = (event) => {
                if (event.key === "Enter" || event.key === " ") this.stopTrailerForLaunch(event.target ?? document.activeElement);
            };
            const steamSideMenuVisible = () => {
                try {
                    const store = window.opener?.SteamUIStore?.m_WindowStore ??
                        window.SteamUIStore?.m_WindowStore;
                    return store?.GamepadUIMainWindowInstance?.m_MenuStore?.IsAnySideMenuVisible?.() === true;
                }
                catch { return false; }
            };
            this.handleGamepadButtonDown = (event) => {
                if (Number(event?.detail?.button) !== 3 || event?.detail?.is_repeat ||
                    steamSideMenuVisible()) return;
                const editable = (element) => element instanceof HTMLElement && Boolean(
                    element.closest("input,textarea,select,[contenteditable],[role='dialog'],[role='menu']")
                );
                if (editable(event.target) || editable(document.activeElement)) return;
                const overlayVisible = Array.from(document.querySelectorAll("[role='dialog'],[role='menu']"))
                    .some((element) => {
                        if (!(element instanceof HTMLElement) || element.hidden ||
                            element.getAttribute("aria-hidden") === "true") return false;
                        const rect = element.getBoundingClientRect();
                        const style = getComputedStyle(element);
                        return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
                            style.visibility !== "hidden";
                    });
                if (overlayVisible || Date.now() - this.lastSecondaryPressAt < 350 || !this.toggleTrailerAudio()) return;
                this.lastSecondaryPressAt = Date.now();
                event.preventDefault?.();
                event.stopPropagation?.();
                event.stopImmediatePropagation?.();
            };
        }
        mount() {
            this.installStyle();
            this.cleanupVideo();
            if (document.body) {
                this.observer = new MutationObserver((mutations) => {
                    if (mutations.some((mutation) => this.shouldQueueScanForMutation(mutation))) this.queueScan();
                });
                this.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "src", "href", "class"] });
            }
            document.addEventListener("pointerdown", this.handleLaunchIntent, true);
            document.addEventListener("click", this.handleLaunchIntent, true);
            document.addEventListener("keydown", this.handleLaunchKeyDown, true);
            document.addEventListener("vgp_onbuttondown", this.handleGamepadButtonDown, true);
            this.routeWindows = [window];
            try {
                if (window.opener && new URL(window.opener.location.href).hostname === "steamloopback.host") {
                    this.routeWindows.push(window.opener);
                }
            }
            catch { }
            for (const routeWindow of this.routeWindows) {
                routeWindow.addEventListener("hashchange", this.handleRouteChange);
                routeWindow.addEventListener("popstate", this.handleRouteChange);
            }
            window.addEventListener("resize", this.handleResize);
            document.addEventListener("visibilitychange", this.handleVisibilityChange);
            this.scanTimer = window.setInterval(() => { if (!document.hidden) void this.scan(); }, routeScanIntervalMs);
            void this.scan();
        }
        update(nextSettings, revision = this.settingsRevision, nextIdentity = this.identity) {
            if (Number.isSafeInteger(revision) && revision < this.settingsRevision) return this.snapshot();
            const previous = this.settings;
            const previousIdentity = this.identity;
            this.settings = normalizeSettings(nextSettings);
            this.settingsRevision = Number.isSafeInteger(revision) && revision >= 0 ? revision : this.settingsRevision;
            activeRevision = this.settingsRevision;
            this.identity = normalizeIdentity(nextIdentity);
            activeIdentity = this.identity;
            const identityChanged = previousIdentity?.pageAppId !== this.identity?.pageAppId ||
                previousIdentity?.sourceAppId !== this.identity?.sourceAppId;
            if (identityChanged) {
                this.failedVisit = undefined;
                this.pageEnteredAt = Date.now();
                this.cleanupVideo(true);
            }
            if (previous.audioEnabled !== this.settings.audioEnabled) this.setTrailerAudioEnabled(this.settings.audioEnabled, false);
            if (!this.settings.enabled) {
                this.pageEnteredAt = undefined;
                this.cleanupVideo(true);
                this.status = rt("disabled");
                return this.snapshot();
            }
            if (!previous.enabled) {
                this.launchHeld = false;
                this.failedVisit = undefined;
                this.pageEnteredAt = undefined;
            }
            this.refreshDisplayTarget();
            void this.scan();
            return this.snapshot();
        }
        refreshDisplayTarget() {
            this.displaySize = readPlaybackDisplaySize(window);
            const targetHeight = resolveQualityTarget(this.settings.quality, this.displaySize);
            if (this.targetHeight === targetHeight) return;
            this.targetHeight = targetHeight;
            this.failedVisit = undefined;
            this.pageEnteredAt = Date.now();
            this.cleanupVideo(true);
        }
        checkRootRoute() {
            const key = readRootRouteKey();
            if (key === this.rootRouteKey) return false;
            this.rootRouteKey = key;
            this.launchHeld = false;
            this.failedVisit = undefined;
            this.pageEnteredAt = undefined;
            this.cleanupVideo(true);
            return true;
        }
        snapshot() {
            return {
                appId: this.currentAppId,
                sourceAppId: this.identity?.sourceAppId,
                status: this.status,
                trailerName: this.currentTrailerName,
                gameTitle: this.currentGameTitle,
                trailerAudioEnabled: this.trailerAudioEnabled,
                quality: this.settings.quality,
                displayWidth: this.displaySize?.width ?? null,
                displayHeight: this.displaySize?.height ?? null,
                targetHeight: this.targetHeight
            };
        }
        destroy() {
            this.destroyed = true;
            this.requestToken += 1;
            this.observer?.disconnect();
            if (this.scanTimer) window.clearInterval(this.scanTimer);
            if (this.queuedScanTimer) window.clearTimeout(this.queuedScanTimer);
            for (const routeWindow of this.routeWindows ?? []) {
                routeWindow.removeEventListener("hashchange", this.handleRouteChange);
                routeWindow.removeEventListener("popstate", this.handleRouteChange);
            }
            window.removeEventListener("resize", this.handleResize);
            document.removeEventListener("pointerdown", this.handleLaunchIntent, true);
            document.removeEventListener("click", this.handleLaunchIntent, true);
            document.removeEventListener("keydown", this.handleLaunchKeyDown, true);
            document.removeEventListener("vgp_onbuttondown", this.handleGamepadButtonDown, true);
            document.removeEventListener("visibilitychange", this.handleVisibilityChange);
            this.cleanupVideo(true);
            document.getElementById(styleId)?.remove();
        }
        installStyle() {
            let style = document.getElementById(styleId);
            if (!style) {
                style = document.createElement("style");
                style.id = styleId;
                document.head.appendChild(style);
            }
            style.textContent = createStyle();
        }
        shouldQueueScanForMutation(mutation) {
            const target = mutation.target instanceof HTMLElement ? mutation.target : undefined;
            if (target?.closest(`.${videoClass}`)) return false;
            if (mutation.type === "attributes" && target) {
                const assetText = getElementAssetText(target).toLowerCase();
                return assetText.includes("library_hero") || assetText.includes("_hero") || assetText.includes("customimages");
            }
            return true;
        }
        stopTrailerForLaunch(target) {
            if (!this.currentAppId || !isLaunchActionElement(target)) return;
            this.launchHeld = true;
            this.pageEnteredAt = undefined;
            this.cleanupVideo(true);
            this.status = rt("stoppedForLaunch");
        }
        applyCurrentMediaAudioState() {
            const video = this.currentVideo;
            if (!video) return;
            const audible = this.trailerAudioEnabled && this.currentMediaReady === true;
            video.muted = !audible;
            video.defaultMuted = !audible;
            video.volume = audible ? 1 : 0;
        }
        dispatchAudioChange() {
            const detail = { ownerId: this.ownerId, settingsRevision: this.settingsRevision, audioEnabled: this.trailerAudioEnabled };
            const targets = [window];
            try { if (window.opener && !targets.includes(window.opener)) targets.push(window.opener); } catch { }
            for (const target of targets) {
                try { target.dispatchEvent(new target.CustomEvent(audioChangeEvent, { detail })); } catch { }
            }
        }
        setTrailerAudioEnabled(enabled, notify = true) {
            if (typeof enabled !== "boolean") return false;
            const changed = this.trailerAudioEnabled !== enabled;
            this.trailerAudioEnabled = enabled;
            this.settings = { ...this.settings, audioEnabled: enabled };
            this.applyCurrentMediaAudioState();
            this.updateAudioHint();
            if (notify && changed) this.dispatchAudioChange();
            return true;
        }
        toggleTrailerAudio() {
            if (!isProbablyGameDetailsPage() || !this.currentVideo?.isConnected || !this.currentVideo.classList.contains(visibleClass)) return false;
            return this.setTrailerAudioEnabled(!this.trailerAudioEnabled);
        }
        removeAudioHint() {
            document.getElementById(audioHintId)?.remove();
        }
        updateAudioHint() {
            const hasVideo = Boolean(this.currentVideo?.isConnected &&
                this.currentVideo.classList.contains(visibleClass) && isProbablyGameDetailsPage());
            if (!hasVideo) {
                this.removeAudioHint();
                return;
            }
            const footer = document.querySelector("#Footer > div");
            if (!(footer instanceof HTMLElement)) return;
            let hint = document.getElementById(audioHintId);
            if (!hint || hint.parentElement !== footer) {
                hint?.remove();
                const template = Array.from(footer.children).find((element) => element.querySelector("img[src*='shared_button_a'],img[src*='shared_button_b']")) ?? Array.from(footer.children).find((element) => element.querySelector("img"));
                const nativeGlyph = template?.querySelector("img");
                const nativeLabel = Array.from(template?.children ?? []).find((element) => !element.querySelector("img"));
                if (!(template instanceof HTMLElement) || !nativeGlyph?.parentElement || !nativeLabel) return;
                hint = document.createElement("div");
                hint.id = audioHintId;
                hint.className = template.className;
                hint.style.pointerEvents = "none";
                hint.setAttribute("aria-hidden", "true");
                const iconContainer = document.createElement("div");
                iconContainer.className = nativeGlyph.parentElement.className;
                const glyph = document.createElement("img");
                glyph.className = nativeGlyph.className;
                glyph.src = "/steaminputglyphs/shared_button_x.svg";
                glyph.alt = "";
                iconContainer.appendChild(glyph);
                const label = document.createElement("div");
        label.className = `${nativeLabel.className} decky-metadata-trailer-audio-label`;
                hint.append(iconContainer, label);
                const firstAction = Array.from(footer.children).find((element) => element.querySelector("img[src*='shared_button_a']"));
                footer.insertBefore(hint, firstAction ?? null);
            }
            const label = hint.querySelector(".decky-metadata-trailer-audio-label");
            if (label) label.textContent = rt(this.trailerAudioEnabled ? "muteTrailer" : "audio");
        }
        queueScan() {
            if (this.scanQueued || this.destroyed) return;
            this.scanQueued = true;
            this.queuedScanTimer = window.setTimeout(() => {
                this.queuedScanTimer = undefined;
                this.scanQueued = false;
                void this.scan();
            }, queuedScanDelayMs);
        }
        async scan() {
            if (this.destroyed) return;
            const owner = findOwnerRecord();
            if (!activeOwnerId || !owner || owner.ownerId !== activeOwnerId || owner.active !== true) {
                this.destroy();
                if (window[runtimeKey] === this) delete window[runtimeKey];
                return;
            }
            if (Number.isSafeInteger(owner.settingsRevision) && owner.settingsRevision > this.settingsRevision) {
                this.update(owner.settings, owner.settingsRevision, owner.identity);
                return;
            }
            this.refreshDisplayTarget();
            this.checkRootRoute();
            if (!this.settings.enabled) {
                this.cleanupVideo(true);
                this.status = rt("disabled");
                return;
            }
            if (document.hidden) {
                this.cleanupVideo(true);
                return;
            }
            if (document.getElementById("decky-trailerhero-style") ||
                document.querySelector(".decky-trailerhero-video")) {
                this.cleanupVideo(true);
                this.status = "Another trailer plugin is active; remove it before enabling Metadata trailers";
                return;
            }
            if (this.launchHeld) {
                if (this.currentVideo?.isConnected) this.cleanupVideo(true);
                this.status = rt("stoppedForLaunch");
                return;
            }
            if (!document.body || !isProbablyGameDetailsPage()) {
                this.failedVisit = undefined;
                this.currentAppId = undefined;
                this.currentGameTitle = undefined;
                this.currentTrailerName = undefined;
                this.cleanupVideo(true);
                this.status = rt("waitingGamePage");
                return;
            }
            const appId = detectLocationAppId();
            const hero = appId ? findHeroCandidate(appId) : undefined;
            if (!appId || !this.identity || this.identity.pageAppId !== appId || !hero || hero.appId !== appId) {
                this.currentAppId = undefined;
                this.failedVisit = undefined;
                this.cleanupVideo(true);
                this.status = rt("waitingGamePage");
                return;
            }
            if (this.failedVisit?.appId === appId && this.failedVisit?.hero === hero.element) return;
            if (this.currentTarget === hero.element && this.currentAppId === appId && this.currentMediaSignature === this.getDesiredMediaSignature() && this.currentVideo?.isConnected) {
                this.resumeVisiblePausedVideo(appId, hero.element);
                return;
            }
            if (this.pendingAppId === appId && this.pendingTarget === hero.element && this.pendingRequestToken === this.requestToken) return;
            const priorAppId = this.currentAppId;
            this.cleanupVideo(true);
            const token = ++this.requestToken;
            this.currentAppId = appId;
            this.currentGameTitle = detectGameTitle(appId);
            this.pageEnteredAt = priorAppId === appId ? (this.pageEnteredAt || Date.now()) : Date.now();
            this.currentTarget = hero.element;
            this.pendingAppId = appId;
            this.pendingTarget = hero.element;
            this.pendingRequestToken = token;
            this.status = rt("searchTrailerForApp", { appId });
            const sourceAppId = this.identity.sourceAppId;
            const trailer = await this.getTrailer(sourceAppId);
            if (token !== this.requestToken || this.destroyed) return;
            this.pendingAppId = undefined;
            this.pendingTarget = undefined;
            this.pendingRequestToken = undefined;
            if (!trailer.ok || !trailer.candidates?.length) {
                this.failedVisit = { appId, hero: hero.element };
                this.trailerCache.delete(sourceAppId);
                this.status = trailer.error || rt("steamTrailerNotPlayable");
                return;
            }
            this.currentTrailerName = trailer.name;
            this.attachVideo(hero.element, appId, this.orderCandidates(trailer.candidates), token, { mediaSignature: this.getDesiredMediaSignature() });
        }
        resumeVisiblePausedVideo(appId, hero) {
            const video = this.currentVideo;
            const candidate = this.activeCandidate;
            if (!video?.isConnected || !video.paused || !this.currentMediaReady || document.hidden ||
                this.launchHeld || !this.settings.enabled || !candidate?.isCurrent?.() ||
                this.resumeAttemptCandidate === candidate) return;
            this.resumeAttemptCandidate = candidate;
            let playback;
            try {
                playback = video.play();
            }
            catch (error) {
                playback = Promise.reject(error);
            }
            Promise.resolve(playback).then(() => {
                if (!candidate.isCurrent()) return;
                if (video.paused) throw new Error("Trailer stayed paused after wake");
                this.status = this.currentTrailerName
                    ? rt("trailerLabel", { name: this.currentTrailerName })
                    : rt("trailerActive");
                this.updateAudioHint();
                this.scheduleTrailerReveal(candidate, video, hero);
            }).catch(() => {
                if (!candidate.isCurrent()) return;
                this.failedVisit = { appId, hero };
                this.cleanupVideo(true);
                this.status = rt("autoplayBlocked");
            });
        }
        scheduleTrailerReveal(candidate, video, target) {
            if (!candidate.isCurrent() || !this.currentMediaReady || video.paused ||
                video.classList.contains(visibleClass)) return;
            if (this.fadeTimer) window.clearTimeout(this.fadeTimer);
            const delay = Math.max(0, 3000 - (Date.now() - (this.pageEnteredAt ?? Date.now())));
            this.fadeTimer = window.setTimeout(() => {
                this.fadeTimer = undefined;
                if (!candidate.isCurrent() || video.paused) return;
                target.classList.add(readyClass);
                video.classList.add(visibleClass);
                this.updateAudioHint();
                this.status = this.currentTrailerName ? rt("trailerLabel", { name: this.currentTrailerName }) : rt("trailerActive");
            }, delay);
        }
        getDesiredMediaSignature() {
            return `${this.targetHeight}:${this.identity?.sourceAppId || 0}`;
        }
        async getTrailer(appId) {
            const cached = this.trailerCache.get(appId);
            if (cached) {
                this.trailerCache.delete(appId);
                this.trailerCache.set(appId, cached);
                return cached;
            }
            const controller = new AbortController();
            this.metadataController = controller;
            const timeout = window.setTimeout(() => controller.abort(), 9000);
            try {
                const requestUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=movies`;
                const response = await fetch(requestUrl, {
                    signal: controller.signal, cache: "default", redirect: "error"
                });
                validateResponseUrl(response, requestUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const payload = JSON.parse(await readBoundedBody(response, MAX_METADATA_BYTES, true));
                if (controller.signal.aborted) throw new Error("Steam metadata request stopped");
                const movies = payload?.[String(appId)]?.data?.movies ?? [];
                if (!Array.isArray(movies) || !movies.length) return { ok: false, error: rt("noSteamTrailer") };
                const movie = movies.find((entry) => entry?.highlight) ?? movies[0];
                if (!movie?.id) return { ok: false, error: rt("steamTrailerNotPlayable") };
                const candidates = [];
                const add = (url, format, label = "") => {
                    if (typeof url !== "string") return;
                    const safeUrl = safeMediaUrl(url);
                    if (!safeUrl) return;
                    const height = Number(String(label).match(/(?:^|[^0-9])(2160|1440|1080|720|480|360)(?:p|[^0-9]|$)/i)?.[1]
                        ?? url.match(/movie[_-]?(2160|1440|1080|720|480|360)/i)?.[1] ?? 0);
                    candidates.push({ url: safeUrl, format, height });
                };
                for (const format of ["mp4", "webm"]) {
                    if (!movie[format] || typeof movie[format] !== "object") continue;
                    for (const [label, url] of Object.entries(movie[format])) add(url, format, label);
                }
                for (const format of ["dash_h264", "hls_h264", "dash_av1"]) add(movie[format], format);
                if (!candidates.length) return { ok: false, error: rt("steamTrailerNotPlayable") };
                return this.rememberTrailer(appId, { ok: true, name: movie.name ?? rt("steamTrailer"), candidates });
            }
            catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : rt("steamTrailerNotPlayable") };
            }
            finally {
                window.clearTimeout(timeout);
                if (this.metadataController === controller) this.metadataController = undefined;
            }
        }
        rememberTrailer(appId, result) {
            this.trailerCache.delete(appId);
            this.trailerCache.set(appId, result);
            while (this.trailerCache.size > 32) this.trailerCache.delete(this.trailerCache.keys().next().value);
            return result;
        }
        orderCandidates(candidates) {
            const target = this.targetHeight;
            const formatRank = { mp4: 0, webm: 1, dash_h264: 0, hls_h264: 1, dash_av1: 2 };
            const ranked = candidates.filter((candidate) => {
                if (!safeMediaUrl(candidate.url)) return false;
                if (candidate.format !== "dash_av1") return true;
                return typeof MediaSource !== "undefined" &&
                    MediaSource.isTypeSupported?.('video/mp4; codecs="av01.0.08M.08"');
            }).map((candidate, index) => {
                const adaptive = candidate.format.startsWith("dash_") || candidate.format.startsWith("hls_");
                const height = candidate.height;
                const group = !adaptive && height === target ? 0 : adaptive ? 1 : 2;
                const range = height && height < target ? 0 : !height ? 1 : 2;
                const distance = range === 0 ? -height : range === 2 ? height : index;
                return { candidate, index, group, range, distance };
            });
            ranked.sort((a, b) => a.group - b.group ||
                (a.group === 2 ? a.range - b.range || a.distance - b.distance : 0) ||
                formatRank[a.candidate.format] - formatRank[b.candidate.format] || a.index - b.index);
            const seen = new Set();
            return ranked.map((entry) => entry.candidate).filter((candidate) => {
                if (seen.has(candidate.url)) return false;
                seen.add(candidate.url);
                return true;
            });
        }
        attachVideo(target, appId, candidates, token, options = {}) {
            let index = 0;
            target.classList.add(targetClass);
            this.currentTarget = target;
            this.currentAppId = appId;
            this.currentMediaSignature = options.mediaSignature ?? this.getDesiredMediaSignature();
            const clearWatchdog = () => {
                if (this.candidateWatchdog) window.clearTimeout(this.candidateWatchdog);
                this.candidateWatchdog = undefined;
            };
            const clearAttempt = () => {
                clearWatchdog();
                if (this.fadeTimer) window.clearTimeout(this.fadeTimer);
                this.fadeTimer = undefined;
                this.removeVideoHandlers(this.currentVideo);
                this.activeCandidate?.controller.abort();
                this.activeSession?.dispose();
                this.activeSession = undefined;
                this.currentMediaReady = false;
                this.resumeAttemptCandidate = undefined;
                const video = this.currentVideo;
                if (video?.isConnected) {
                    video.pause();
                    video.removeAttribute("src");
                    video.load();
                    video.remove();
                }
                this.currentVideo = undefined;
                this.activeCandidate = undefined;
                target.classList.remove(readyClass);
                this.removeAudioHint();
            };
            const tryCandidate = () => {
                if (token !== this.requestToken || this.destroyed) return;
                const source = candidates[index++];
                if (!source) {
                    this.failedVisit = { appId, hero: target };
                    this.trailerCache.delete(appId);
                    this.cleanupVideo();
                    this.status = rt("steamTrailerNotPlayable");
                    return;
                }
                const video = document.createElement("video");
                video.className = videoClass;
                video.autoplay = true;
                video.loop = source.format === "mp4" || source.format === "webm";
                video.muted = true;
                video.defaultMuted = true;
                video.playsInline = true;
                video.preload = "auto";
                video.volume = 0;
                video.setAttribute("playsinline", "true");
                video.setAttribute("webkit-playsinline", "true");
                video.setAttribute("aria-hidden", "true");
                target.insertBefore(video, target.firstChild);
                const id = this.attemptId = (this.attemptId || 0) + 1;
                const candidate = {
                    id,
                    controller: new AbortController(),
                    isCurrent: () => !this.destroyed && this.requestToken === token &&
                        this.attemptId === id && this.activeCandidate === candidate &&
                        this.currentVideo === video && video.isConnected,
                    onFailure: (error) => {
                        if (!candidate.isCurrent() || candidate.failed) return;
                        candidate.failed = true;
                        clearAttempt();
                        tryCandidate();
                    }
                };
                this.activeCandidate = candidate;
                this.resumeAttemptCandidate = undefined;
                this.currentVideo = video;
                this.currentMediaReady = false;
                let readyForPlayback = source.format === "mp4" || source.format === "webm";
                let started = false;
                let lastProgress = 0;
                const watchProgress = () => {
                    clearWatchdog();
                    this.candidateWatchdog = window.setTimeout(() => {
                        if (candidate.isCurrent() && !candidate.controller.signal.aborted) {
                            candidate.onFailure(new Error(`Steam video stalled: ${source.url}`));
                        }
                    }, directPlaybackTimeoutMs);
                };
                const onCanPlay = () => {
                    if (!candidate.isCurrent() || !readyForPlayback || started) return;
                    started = true;
                    video.play().then(() => {
                        if (!candidate.isCurrent()) return;
                        this.currentMediaReady = true;
                        this.applyCurrentMediaAudioState();
                        this.scheduleTrailerReveal(candidate, video, target);
                    }).catch(() => {
                        if (!candidate.isCurrent()) return;
                        clearWatchdog();
                        this.status = rt("autoplayBlocked");
                    });
                };
                const handlers = [];
                const listen = (name, handler) => {
                    video.addEventListener(name, handler);
                    handlers.push([name, handler]);
                };
                video.__deckyMetadataTrailerHandlers = handlers;
                listen("canplay", onCanPlay);
                listen("error", () => candidate.onFailure(new Error(`Steam video error ${video.error?.code ?? 0}`)));
                listen("timeupdate", () => {
                    if (!candidate.isCurrent() || video.paused || !Number.isFinite(video.currentTime)) return;
                    if (video.currentTime > lastProgress + 0.05 || video.currentTime + 0.05 < lastProgress) {
                        lastProgress = video.currentTime;
                        if (this.resumeAttemptCandidate === candidate) this.resumeAttemptCandidate = undefined;
                        watchProgress();
                    }
                });
                listen("seeking", () => {
                    if (!candidate.isCurrent()) return;
                    lastProgress = Number.isFinite(video.currentTime) ? video.currentTime : 0;
                    if (!started || !video.paused) watchProgress();
                });
                listen("pause", () => { if (started && candidate.isCurrent()) clearWatchdog(); });
                listen("play", () => { if (candidate.isCurrent()) watchProgress(); });
                listen("playing", () => {
                    if (!candidate.isCurrent()) return;
                    if (this.resumeAttemptCandidate === candidate) this.resumeAttemptCandidate = undefined;
                    watchProgress();
                });
                watchProgress();
                if (readyForPlayback) {
                    // Native direct playback keeps browser-managed buffering. The browser follows
                    // redirects for these declared MP4/WebM URLs without exposing the target here.
                    video.src = source.url;
                    video.load();
                }
                else {
                    const playback = source.format === "hls_h264"
                        ? this.playHls(video, source.url, candidate)
                        : this.playDash(video, source.url, candidate);
                    playback.then(() => {
                        if (!candidate.isCurrent()) return;
                        readyForPlayback = true;
                        if (video.readyState >= 2) onCanPlay();
                    }).catch((error) => candidate.onFailure(error));
                }
            };
            tryCandidate();
        }
        async playAdaptive(video, presentation, candidate) {
            if (this.activeSession) this.activeSession.dispose();
            const session = new AdaptiveSession(video, presentation, candidate);
            this.activeSession = session;
            await session.start();
        }
        async playHls(video, masterUrl, candidate) {
            if (typeof MediaSource === "undefined") throw new Error(rt("mediaSourceUnavailable"));
            const variant = this.selectHlsVariant(await this.fetchText(masterUrl, candidate), masterUrl);
            if (!candidate.isCurrent()) return;
            const media = this.parseHlsMediaPlaylist(await this.fetchText(variant.url, candidate), variant.url);
            const tracks = [{ kind: "video", mimeType: variant.mimeType, initUrl: media.initUrl, segments: media.segments }];
            if (variant.audio) {
                const audio = this.parseHlsMediaPlaylist(await this.fetchText(variant.audio.url, candidate), variant.audio.url);
                if (Math.abs(media.duration - audio.duration) > 0.5) throw new Error("HLS audio timeline differs from video");
                tracks.push({ kind: "audio", mimeType: variant.audio.mimeType, initUrl: audio.initUrl, segments: audio.segments });
            }
            if (!candidate.isCurrent()) return;
            await this.playAdaptive(video, { duration: media.duration, tracks }, candidate);
        }
        async playDash(video, manifestUrl, candidate) {
            if (typeof MediaSource === "undefined") throw new Error(rt("mediaSourceUnavailable"));
            const presentation = this.selectDashVariant(await this.fetchText(manifestUrl, candidate), manifestUrl);
            if (!candidate.isCurrent()) return;
            await this.playAdaptive(video, presentation, candidate);
        }
        async fetchText(url, candidate) {
            const requestUrl = safeMediaUrl(url);
            if (!requestUrl) throw new Error("Steam manifest URL is not safe HTTPS");
            const controller = new AbortController();
            const cancel = () => controller.abort();
            candidate.controller.signal.addEventListener("abort", cancel, { once: true });
            const timeout = window.setTimeout(() => controller.abort(), 9000);
            try {
                if (!candidate.isCurrent()) throw new Error("Trailer request changed");
                const response = await fetch(requestUrl, { signal: controller.signal, cache: "default", redirect: "error" });
                validateResponseUrl(response, requestUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${requestUrl}`);
                const text = await readBoundedBody(response, MAX_MANIFEST_BYTES, true);
                if (controller.signal.aborted || !candidate.isCurrent()) throw new Error("Trailer request changed");
                return text;
            }
            finally {
                window.clearTimeout(timeout);
                candidate.controller.signal.removeEventListener("abort", cancel);
            }
        }
        rankRenditions(left, right) {
            const category = (height) => !Number.isFinite(height) || height <= 0 ? 2 : height <= this.targetHeight ? 0 : 1;
            const leftCategory = category(left.height);
            const rightCategory = category(right.height);
            return leftCategory - rightCategory ||
                (leftCategory === 0 ? right.height - left.height : left.height - right.height) ||
                left.bandwidth - right.bandwidth;
        }
        parseHlsAttributes(value) {
            const attributes = {};
            let start = 0, quoted = false;
            const parse = (field) => {
                const separator = field.indexOf("=");
                if (separator <= 0) throw new Error("Malformed HLS attributes");
                const key = field.slice(0, separator).trim();
                const raw = field.slice(separator + 1).trim();
                if (!/^[A-Z0-9-]+$/.test(key) || !raw) throw new Error("Malformed HLS attributes");
                attributes[key] = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
            };
            for (let index = 0; index < value.length; index++) {
                if (value[index] === '"' && value[index - 1] !== "\\") quoted = !quoted;
                if (value[index] === "," && !quoted) {
                    parse(value.slice(start, index));
                    start = index + 1;
                }
            }
            if (quoted) throw new Error("Unclosed HLS attribute");
            parse(value.slice(start));
            return attributes;
        }
        selectHlsVariant(masterText, masterUrl) {
            const lines = masterText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
            if (lines[0] !== "#EXTM3U") throw new Error("Invalid HLS master playlist");
            const groups = new Map();
            const variants = [];
            for (let index = 1; index < lines.length; index++) {
                const line = lines[index];
                if (line.startsWith("#EXT-X-SESSION-KEY:")) {
                    const attributes = this.parseHlsAttributes(line.slice("#EXT-X-SESSION-KEY:".length));
                    if (attributes.METHOD !== "NONE") throw new Error("Encrypted HLS is unsupported");
                }
                if (line.startsWith("#EXT-X-MEDIA:")) {
                    const attributes = this.parseHlsAttributes(line.slice("#EXT-X-MEDIA:".length));
                    if (attributes.TYPE === "AUDIO") {
                        const group = groups.get(attributes["GROUP-ID"]) ?? [];
                        group.push(attributes);
                        groups.set(attributes["GROUP-ID"], group);
                    }
                    continue;
                }
                if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
                const attributes = this.parseHlsAttributes(line.slice("#EXT-X-STREAM-INF:".length));
                const uri = lines[index + 1];
                if (!uri || uri.startsWith("#")) continue;
                index++;
                const codecs = (attributes.CODECS || "").split(",").map((codec) => codec.trim()).filter(Boolean);
                const videoCodec = codecs.find((codec) => /^avc1\./i.test(codec));
                if (!videoCodec) continue;
                const videoMimeType = `video/mp4; codecs="${attributes.AUDIO ? videoCodec : codecs.join(",")}"`;
                if (!MediaSource.isTypeSupported(videoMimeType)) continue;
                const height = Number(attributes.RESOLUTION?.match(/^\d+x(\d+)$/)?.[1] || 0);
                const bandwidth = Number(attributes.BANDWIDTH || 0);
                const resolvedUrl = safeMediaUrl(uri, masterUrl);
                if (!resolvedUrl) continue;
                variants.push({ url: resolvedUrl, mimeType: videoMimeType,
                    height, bandwidth, audioGroup: attributes.AUDIO, codecs });
            }
            if (!variants.length) throw new Error("HLS playlist has no supported video variants");
            variants.sort((left, right) => this.rankRenditions(left, right));
            const selected = variants[0];
            if (selected.audioGroup) {
                const group = groups.get(selected.audioGroup) || [];
                const rendition = group.find((item) => item.DEFAULT === "YES") ?? group[0];
                const codec = selected.codecs.find((item) => /^mp4a\./i.test(item));
                if (!rendition?.URI || !codec) throw new Error("HLS audio group is unavailable");
                const mimeType = `audio/mp4; codecs="${codec}"`;
                if (!MediaSource.isTypeSupported(mimeType)) throw new Error("Unsupported HLS audio codec");
                const audioUrl = safeMediaUrl(rendition.URI, masterUrl);
                if (!audioUrl) throw new Error("HLS audio URL is not safe HTTPS");
                selected.audio = { url: audioUrl, mimeType };
            }
            return selected;
        }
        selectDashVariant(manifestText, manifestUrl) {
            const xml = new DOMParser().parseFromString(manifestText, "application/xml");
            const root = xml.documentElement;
            if (root?.localName !== "MPD" || xml.querySelector("parsererror") ||
                root.getAttribute("type") !== "static" ||
                xml.getElementsByTagName("SegmentBase").length || xml.getElementsByTagName("SegmentList").length ||
                Array.from(xml.getElementsByTagName("*")).some((element) => element.localName === "ContentProtection")) {
                throw new Error("Unsupported DASH manifest");
            }
            const children = (node, name) => Array.from(node?.children ?? []).filter((child) => child.localName === name);
            const periods = children(root, "Period");
            if (periods.length !== 1) throw new Error("DASH requires a single Period");
            const period = periods[0];
            if (period.hasAttribute("start") && this.parseIsoDurationSeconds(period.getAttribute("start")) !== 0) {
                throw new Error("DASH Period must start at zero");
            }
            const duration = this.parseIsoDurationSeconds(
                period.getAttribute("duration") || root.getAttribute("mediaPresentationDuration") || ""
            );
            if (!Number.isFinite(duration) || duration <= 0) throw new Error("DASH presentation duration is invalid");
            const resolveBase = (node, base) => {
                const relative = children(node, "BaseURL")[0]?.textContent?.trim();
                const resolved = relative ? safeMediaUrl(relative, base) : safeMediaUrl(base);
                if (!resolved) throw new Error("DASH BaseURL is not safe HTTPS");
                return resolved;
            };
            const periodBase = resolveBase(period, resolveBase(root, manifestUrl));
            const videos = [], audio = [];
            let advertisedAudio = false;
            for (const adaptation of children(period, "AdaptationSet")) {
                const contentType = adaptation.getAttribute("contentType") || "";
                const adaptationMime = adaptation.getAttribute("mimeType") || "";
                const isAudio = contentType === "audio" || adaptationMime.startsWith("audio/");
                const isVideo = contentType === "video" || adaptationMime.startsWith("video/") || (!contentType && !adaptationMime);
                if (!isAudio && !isVideo) continue;
                if (isAudio) advertisedAudio = true;
                const adaptationBase = resolveBase(adaptation, periodBase);
                for (const representation of children(adaptation, "Representation")) {
                    const codec = representation.getAttribute("codecs") || adaptation.getAttribute("codecs") || "";
                    const mime = representation.getAttribute("mimeType") || adaptationMime;
                    const supportedCodec = isAudio ? /^mp4a\./i.test(codec) : /^(avc1|av01)\./i.test(codec);
                    const mimeType = `${mime}; codecs="${codec}"`;
                    if (!supportedCodec || mime !== (isAudio ? "audio/mp4" : "video/mp4") ||
                        !MediaSource.isTypeSupported(mimeType)) continue;
                    const templates = [root, period, adaptation, representation]
                        .map((node) => children(node, "SegmentTemplate")[0]).filter(Boolean);
                    const attribute = (name) => {
                        for (let index = templates.length - 1; index >= 0; index--) {
                            if (templates[index].hasAttribute(name)) return templates[index].getAttribute(name);
                        }
                        return null;
                    };
                    const representationId = representation.getAttribute("id") || "";
                    const bandwidth = Number(representation.getAttribute("bandwidth") || 0);
                    const height = Number(representation.getAttribute("height") || adaptation.getAttribute("maxHeight") || 0);
                    if (!representationId || !Number.isFinite(bandwidth) || bandwidth < 0 || !templates.length) continue;
                    const initTemplate = attribute("initialization"), mediaTemplate = attribute("media");
                    if (!initTemplate || !mediaTemplate) continue;
                    const base = resolveBase(representation, adaptationBase);
                    const timeline = [...templates].reverse()
                        .map((template) => children(template, "SegmentTimeline")[0]).find(Boolean);
                    const spec = {
                        media: mediaTemplate,
                        timescale: Number(attribute("timescale") ?? 1),
                        durationTicks: Number(attribute("duration") ?? 0),
                        offset: Number(attribute("presentationTimeOffset") ?? 0),
                        startNumber: Number(attribute("startNumber") ?? 1),
                        timeline: timeline ? children(timeline, "S").map((item) => ({
                            t: item.hasAttribute("t") ? Number(item.getAttribute("t")) : null,
                            d: Number(item.getAttribute("d")),
                            r: Number(item.getAttribute("r") ?? 0)
                        })) : null
                    };
                    let segments;
                    try { segments = this.buildDashSegments(spec, representationId, bandwidth, duration, base); }
                    catch { continue; }
                    if (!segments.length) continue;
                    const initUrl = safeMediaUrl(this.expandDashTemplate(initTemplate, representationId, bandwidth), base);
                    if (!initUrl) continue;
                    const track = {
                        kind: isAudio ? "audio" : "video", mimeType,
                        timestampOffset: -spec.offset / spec.timescale,
                        initUrl,
                        segments
                    };
                    const entry = { track, height, bandwidth };
                    if (isAudio) audio.push(entry);
                    else videos.push(entry);
                }
            }
            if (!videos.length) throw new Error("DASH manifest has no supported video rendition");
            if (advertisedAudio && !audio.length) throw new Error("DASH audio rendition is unsupported");
            videos.sort((left, right) => this.rankRenditions(left, right));
            audio.sort((left, right) => right.bandwidth - left.bandwidth);
            return { duration, tracks: [videos[0].track, ...(audio.length ? [audio[0].track] : [])] };
        }
        buildDashSegments(spec, representationId, bandwidth, duration, base) {
            const { timescale, durationTicks, offset, startNumber, timeline, media } = spec;
            if (!Number.isSafeInteger(timescale) || timescale <= 0 ||
                !Number.isSafeInteger(offset) || offset < 0 ||
                !Number.isSafeInteger(startNumber) || startNumber < 0) throw new Error("Invalid DASH timebase");
            const segments = [];
            let number = startNumber;
            const push = (tick, endTick) => {
                const start = Math.max(0, (tick - offset) / timescale);
                const end = Math.min(duration, (endTick - offset) / timescale);
                if (Number.isFinite(start) && Number.isFinite(end) && end > start && start < duration) {
                    const url = safeMediaUrl(this.expandDashTemplate(media, representationId, bandwidth, number, tick), base);
                    if (!url) throw new Error("DASH segment URL is not safe HTTPS");
                    segments.push({
                        url,
                        start, end
                    });
                }
                number++;
                if (number - startNumber > 100000) throw new Error("DASH timeline is unbounded");
            };
            if (timeline) {
                if (!timeline.length) throw new Error("Empty DASH SegmentTimeline");
                let tick = 0;
                for (let index = 0; index < timeline.length; index++) {
                    const item = timeline[index];
                    if (!Number.isSafeInteger(item.d) || item.d <= 0 ||
                        !Number.isSafeInteger(item.r) || item.r < -1 ||
                        (item.t !== null && (!Number.isSafeInteger(item.t) || item.t < 0))) {
                        throw new Error("Invalid DASH SegmentTimeline");
                    }
                    if (item.t !== null) tick = item.t;
                    const next = timeline.slice(index + 1).find((entry) => entry.t !== null);
                    const boundary = item.r === -1 ? (next?.t ?? offset + duration * timescale) : Infinity;
                    const count = item.r === -1 ? Math.ceil((boundary - tick) / item.d) : item.r + 1;
                    if (!Number.isSafeInteger(count) || count < 1 || count > 100000) throw new Error("Invalid DASH repeat");
                    for (let repeat = 0; repeat < count; repeat++) {
                        push(tick, Math.min(tick + item.d, boundary));
                        tick += item.d;
                    }
                }
            }
            else {
                if (!Number.isSafeInteger(durationTicks) || durationTicks <= 0) throw new Error("Invalid DASH segment duration");
                const count = Math.ceil(duration * timescale / durationTicks);
                if (!Number.isSafeInteger(count) || count < 1 || count > 100000) throw new Error("Invalid DASH segment count");
                for (let index = 0; index < count; index++) {
                    const tick = offset + index * durationTicks;
                    push(tick, tick + durationTicks);
                }
            }
            return segments;
        }
        expandDashTemplate(value, representationId, bandwidth, number, time) {
            return value.replace(/\$RepresentationID\$/g, representationId).replace(/\$Bandwidth\$/g, String(bandwidth)).replace(/\$Time\$/g, String(time ?? 0)).replace(/\$Number(?:%0(\d+)d)?\$/g, (_match, width) => {
                const text = String(number ?? 0);
                return width ? text.padStart(Number(width), "0") : text;
            }).replace(/\$\$/g, "$");
        }
        parseIsoDurationSeconds(value) {
            const match = String(value).match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
            if (!match || !match.slice(1).some(Boolean)) return NaN;
            return Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 +
                Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0);
        }
        parseHlsMediaPlaylist(mediaText, mediaUrl) {
            const lines = mediaText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
            if (lines[0] !== "#EXTM3U" || !lines.includes("#EXT-X-ENDLIST")) throw new Error("HLS requires static VOD");
            let initUrl, duration = 0, pendingDuration, ended = false;
            const segments = [];
            for (const line of lines.slice(1)) {
                if (line.startsWith("#EXT-X-KEY:")) {
                    if (this.parseHlsAttributes(line.slice("#EXT-X-KEY:".length)).METHOD !== "NONE") {
                        throw new Error("Encrypted HLS is unsupported");
                    }
                }
                else if (line.startsWith("#EXT-X-BYTERANGE") || line.startsWith("#EXT-X-DISCONTINUITY") ||
                    line.startsWith("#EXT-X-PART")) throw new Error("Unsupported HLS media timeline");
                else if (line.startsWith("#EXT-X-MAP:")) {
                    const attributes = this.parseHlsAttributes(line.slice("#EXT-X-MAP:".length));
                    if (!attributes.URI || attributes.BYTERANGE || initUrl || segments.length) {
                        throw new Error("Invalid HLS initialization segment");
                    }
                    initUrl = safeMediaUrl(attributes.URI, mediaUrl);
                    if (!initUrl) throw new Error("HLS initialization URL is not safe HTTPS");
                }
                else if (line.startsWith("#EXTINF:")) {
                    if (pendingDuration !== undefined || ended) throw new Error("Malformed HLS segment");
                    pendingDuration = Number(line.slice("#EXTINF:".length).split(",", 1)[0]);
                    if (!Number.isFinite(pendingDuration) || pendingDuration <= 0) throw new Error("Invalid HLS duration");
                }
                else if (line === "#EXT-X-ENDLIST") ended = true;
                else if (!line.startsWith("#")) {
                    if (ended || !initUrl || pendingDuration === undefined) throw new Error("Malformed HLS segment timeline");
                    const end = duration + pendingDuration;
                    if (!Number.isFinite(end) || end <= duration || segments.length >= 100000) throw new Error("Invalid HLS timeline");
                    const url = safeMediaUrl(line, mediaUrl);
                    if (!url) throw new Error("HLS segment URL is not safe HTTPS");
                    segments.push({ url, start: duration, end });
                    duration = end;
                    pendingDuration = undefined;
                }
            }
            if (!initUrl || !segments.length || pendingDuration !== undefined || !ended) {
                throw new Error("Incomplete HLS VOD playlist");
            }
            return { initUrl, duration, segments };
        }
        removeVideoHandlers(video) {
            for (const [name, handler] of video?.__deckyMetadataTrailerHandlers ?? []) {
                video.removeEventListener(name, handler);
            }
            if (video) delete video.__deckyMetadataTrailerHandlers;
        }
        cleanupVideo(cancelPending = false) {
            this.removeAudioHint();
            if (cancelPending) {
                this.metadataController?.abort();
                this.metadataController = undefined;
                this.requestToken += 1;
                this.pendingAppId = undefined;
                this.pendingTarget = undefined;
                this.pendingRequestToken = undefined;
            }
            this.removeVideoHandlers(this.currentVideo);
            this.activeCandidate?.controller.abort();
            this.activeSession?.dispose();
            this.activeCandidate = undefined;
            this.resumeAttemptCandidate = undefined;
            this.activeSession = undefined;
            this.currentMediaReady = false;
            if (this.fadeTimer) window.clearTimeout(this.fadeTimer);
            if (this.candidateWatchdog) window.clearTimeout(this.candidateWatchdog);
            this.fadeTimer = undefined;
            this.candidateWatchdog = undefined;
            const video = this.currentVideo;
            if (video?.isConnected) {
                video.pause();
                video.removeAttribute("src");
                video.load();
                video.remove();
            }
            this.currentVideo = undefined;
            this.currentTarget?.classList.remove(targetClass, readyClass);
            this.currentTarget = undefined;
            this.currentMediaSignature = undefined;
            document.querySelectorAll(`.${videoClass}`).forEach((element) => element.remove());
            document.querySelectorAll(`.${targetClass}`).forEach((element) => element.classList.remove(targetClass, readyClass));
        }
    }
    const existing = window[runtimeKey];
    if (existing) {
        if (existing.product !== "decky-metadata-trailer") {
            return { status: "Metadata trailer runtime conflict", runtimeMissing: true };
        }
        if (existing.ownerId === activeOwnerId && existing.version === runtimeVersion) {
            return existing.update(settings, activeRevision, activeIdentity);
        }
        try { existing.destroy?.(); } catch { }
        if (window[runtimeKey] === existing) delete window[runtimeKey];
    }
    const runtime = new Runtime(settings, activeOwnerId, activeRevision);
    window[runtimeKey] = runtime;
    runtime.mount();
    return runtime.snapshot();
}
