//! HowLongToBeat lookups. HLTB has no public API; this follows the requests its
//! own website makes (search token, site search, game page data), validated
//! against the live site on 2026-10-30.

use crate::{
    http::{Http, Redirects},
    logging, matching,
    providers::steam,
};
use regex::Regex;
use reqwest::Method;
use serde_json::{Value, json};
use std::{
    sync::{Arc, LazyLock},
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

const BASE: &str = "https://howlongtobeat.com";
const DEFAULT_SEARCH_PATH: &str = "/api/search/site";
const REFERER: &str = "https://howlongtobeat.com/";
/// Observed token lifetime is 12-15 minutes.
const TOKEN_LIFETIME: Duration = Duration::from_secs(10 * 60);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const PAGE_LIMIT: usize = 2 << 20;
const SCRIPT_LIMIT: usize = 8 << 20;
const MAX_SCRIPTS: usize = 40;
const MAX_STEAM_CANDIDATES: usize = 5;

static RX_NEXT_DATA: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?s)<script id="__NEXT_DATA__" type="application/json"[^>]*>(.*?)</script>"#)
        .expect("fixed next-data regex")
});
static RX_SCRIPT_SRC: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"<script\b[^>]*\bsrc=["']([^"']+)["']"#).expect("fixed script-src regex")
});
static RX_SEARCH_FETCH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)fetch\s*\(\s*["'`]/api/([a-zA-Z0-9_/]+)[^"'`]*["'`]\s*,\s*\{[^}]*method:\s*["'`]POST["'`]"#)
        .expect("fixed search-fetch regex")
});

#[derive(Clone, Debug, PartialEq)]
pub struct GamePage {
    pub game_id: i64,
    pub game_name: String,
    pub comp_main: i64,
    pub comp_plus: i64,
    pub comp_100: i64,
    pub comp_all: i64,
    pub profile_steam: i64,
    pub profile_steam_alt: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SearchResult {
    pub page: GamePage,
    pub comp_all_count: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MatchVia {
    Pinned,
    SteamId,
    Title,
}

#[derive(Clone, Debug, PartialEq)]
pub enum LookupOutcome {
    Matched { page: GamePage, via: MatchVia },
    NoMatch,
}

#[derive(Clone, Debug, PartialEq)]
pub enum RefreshOutcome {
    Updated(GamePage),
    /// The saved game is gone or no longer lists the expected Steam ID.
    Invalid,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Error {
    /// Network, server, or response-shape failure; try again later.
    Transient(String),
    /// HLTB asked us to slow down; no request is sent until `retry_after` passes.
    RateLimited { retry_after: Duration },
}

#[derive(Clone, Debug)]
pub struct LookupInput {
    pub steam_appid: Option<i64>,
    pub title: String,
    pub pinned_id: Option<i64>,
    /// A native Steam game (not a shortcut); allows the English Steam name retry.
    pub native_steam: bool,
}

#[derive(Clone)]
struct Auth {
    token: String,
    hp: Option<(String, String)>,
    acquired: Instant,
}

struct Session {
    search_path: String,
    auth: Option<Auth>,
    last_search: Option<Instant>,
    cooldown_until: Option<Instant>,
}

struct Config {
    search_interval: Duration,
    cooldown: Duration,
    clock_ms: fn() -> i64,
}

/// Shared HLTB session: one token, one search at a time, at most one search per interval.
#[derive(Clone)]
pub struct HltbClient {
    session: Arc<Mutex<Session>>,
    config: Arc<Config>,
}

impl Default for HltbClient {
    fn default() -> Self {
        Self::with_config(Duration::from_secs(1), Duration::from_secs(60), || {
            chrono::Utc::now().timestamp_millis()
        })
    }
}

fn number(value: &Value) -> Option<i64> {
    value.as_i64().or_else(|| value.as_f64().filter(|n| n.is_finite()).map(|n| n.round() as i64))
}

fn parse_page(game: &Value) -> Option<GamePage> {
    Some(GamePage {
        game_id: number(&game["game_id"]).filter(|id| *id > 0)?,
        game_name: game["game_name"].as_str()?.to_owned(),
        comp_main: number(&game["comp_main"])?,
        comp_plus: number(&game["comp_plus"])?,
        comp_100: number(&game["comp_100"])?,
        comp_all: number(&game["comp_all"])?,
        profile_steam: number(&game["profile_steam"]).unwrap_or(0),
        profile_steam_alt: number(&game["profile_steam_alt"]).unwrap_or(0),
    })
}

fn parse_game_html(html: &str) -> Option<GamePage> {
    let data: Value = serde_json::from_str(RX_NEXT_DATA.captures(html)?.get(1)?.as_str()).ok()?;
    parse_page(&data["props"]["pageProps"]["game"]["data"]["game"][0])
}

fn parse_search(body: &Value) -> Option<Vec<SearchResult>> {
    body["data"]
        .as_array()?
        .iter()
        .map(|item| {
            Some(SearchResult {
                page: parse_page(item)?,
                comp_all_count: number(&item["comp_all_count"]).unwrap_or(0),
            })
        })
        .collect()
}

fn parse_auth(body: &Value) -> Option<(String, Option<(String, String)>)> {
    let object = body.as_object()?;
    let token = object.get("token")?.as_str().filter(|token| !token.is_empty())?.to_owned();
    let mut key = None;
    let mut val = None;
    for (name, value) in object {
        let Some(value) = value.as_str() else { continue };
        let name = name.to_lowercase();
        if key.is_none() && name.contains("key") {
            key = Some(value.to_owned());
        } else if val.is_none() && name.contains("val") {
            val = Some(value.to_owned());
        }
    }
    Some((token, key.zip(val)))
}

/// Find the site's search route in one of its scripts, preferring a route whose `/init` is also present.
fn search_path_from_script(script: &str) -> Option<String> {
    if !script.contains("searchTerms") || !script.contains("searchOptions") {
        return None;
    }
    let mut first = None;
    for captures in RX_SEARCH_FETCH.captures_iter(script) {
        let path = captures[1].trim_end_matches('/');
        let path = path.strip_suffix("/init").unwrap_or(path);
        if path.is_empty() {
            continue;
        }
        let route = format!("/api/{path}");
        if script.contains(&format!("{route}/init")) {
            return Some(route);
        }
        first.get_or_insert(route);
    }
    first
}

fn rank_by_title<'a>(title: &str, results: &'a [SearchResult]) -> Vec<&'a SearchResult> {
    let query = matching::normalise_match_title(title);
    let mut ranked: Vec<(u8, i64, usize, &SearchResult)> = results
        .iter()
        .enumerate()
        .map(|(index, result)| {
            let rank = if matching::normalise_match_title(&result.page.game_name) == query {
                0
            } else if matching::ign_title_acceptable(title, &result.page.game_name) {
                1
            } else {
                2
            };
            (rank, -result.comp_all_count, index, result)
        })
        .collect();
    ranked.sort_by_key(|(rank, count, index, _)| (*rank, if *rank == 1 { *count } else { 0 }, *index));
    ranked.into_iter().map(|(.., result)| result).collect()
}

impl HltbClient {
    fn with_config(search_interval: Duration, cooldown: Duration, clock_ms: fn() -> i64) -> Self {
        Self {
            session: Arc::new(Mutex::new(Session {
                search_path: DEFAULT_SEARCH_PATH.to_owned(),
                auth: None,
                last_search: None,
                cooldown_until: None,
            })),
            config: Arc::new(Config { search_interval, cooldown, clock_ms }),
        }
    }

    async fn cooldown(&self) -> Result<(), Error> {
        let session = self.session.lock().await;
        Self::cooldown_of(&session)
    }

    fn cooldown_of(session: &Session) -> Result<(), Error> {
        match session.cooldown_until {
            Some(until) if until > Instant::now() => Err(Error::RateLimited { retry_after: until - Instant::now() }),
            _ => Ok(()),
        }
    }

    fn rate_limited(&self, session: &mut Session) -> Error {
        session.cooldown_until = Some(Instant::now() + self.config.cooldown);
        logging::event("hltb", "rate limited", json!({"cooldown_s": self.config.cooldown.as_secs()}), log::Level::Warn);
        Error::RateLimited { retry_after: self.config.cooldown }
    }

    async fn send(
        &self,
        http: &Http,
        kind: &str,
        method: Method,
        url: &str,
        headers: &[(&str, &str)],
        body: Option<Value>,
        limit: usize,
    ) -> Result<crate::http::Response, Error> {
        let started = Instant::now();
        let result = http
            .request(method, url, headers, body, REQUEST_TIMEOUT, limit, Redirects::Default)
            .await;
        let path = url.strip_prefix(BASE).unwrap_or(url).split(['?', '#']).next().unwrap_or("");
        logging::event(
            "hltb",
            "request",
            json!({"kind": kind, "path": path, "status": result.as_ref().ok().map(|r| r.status),
                   "error": result.as_ref().err(), "ms": started.elapsed().as_millis() as u64}),
            log::Level::Debug,
        );
        result.map_err(Error::Transient)
    }

    async fn rediscover(&self, http: &Http, session: &mut Session) -> Result<(), Error> {
        let origin = [("Origin", BASE), ("Referer", REFERER)];
        let home = self.send(http, "discover", Method::GET, BASE, &origin, None, PAGE_LIMIT).await?;
        if home.status != 200 {
            return Err(Error::Transient(format!("HLTB home page returned HTTP {}", home.status)));
        }
        let html = home.text();
        for source in RX_SCRIPT_SRC.captures_iter(&html).map(|c| c[1].to_owned()).take(MAX_SCRIPTS) {
            let url = match source.strip_prefix(BASE) {
                Some(path) if path.starts_with('/') => format!("{BASE}{path}"),
                None if source.starts_with('/') && !source.starts_with("//") => format!("{BASE}{source}"),
                _ => continue,
            };
            if !url.split(['?', '#']).next().unwrap_or("").ends_with(".js") {
                continue;
            }
            let script = self.send(http, "discover", Method::GET, &url, &origin, None, SCRIPT_LIMIT).await?;
            if script.status != 200 {
                continue;
            }
            if let Some(path) = search_path_from_script(&script.text()) {
                logging::event("hltb", "search path discovered", json!({"path": path}), log::Level::Info);
                session.search_path = path;
                return Ok(());
            }
        }
        session.search_path = DEFAULT_SEARCH_PATH.to_owned();
        Ok(())
    }

    async fn token(&self, http: &Http, session: &mut Session, rediscovered: &mut bool) -> Result<Auth, Error> {
        if let Some(auth) = session.auth.as_ref().filter(|auth| auth.acquired.elapsed() < TOKEN_LIFETIME) {
            return Ok(auth.clone());
        }
        loop {
            let url = format!("{BASE}{}/init?t={}", session.search_path, (self.config.clock_ms)());
            let response = self
                .send(http, "init", Method::GET, &url, &[("Origin", BASE), ("Referer", REFERER)], None, PAGE_LIMIT)
                .await?;
            match response.status {
                200 => {
                    let (token, hp) = response
                        .json()
                        .ok()
                        .as_ref()
                        .and_then(parse_auth)
                        .ok_or_else(|| Error::Transient("HLTB returned an unusable search token".into()))?;
                    let auth = Auth { token, hp, acquired: Instant::now() };
                    session.auth = Some(auth.clone());
                    return Ok(auth);
                }
                404 if !*rediscovered => {
                    *rediscovered = true;
                    self.rediscover(http, session).await?;
                }
                429 => return Err(self.rate_limited(session)),
                status => return Err(Error::Transient(format!("HLTB token request returned HTTP {status}"))),
            }
        }
    }

    /// Search HLTB by title. Searches are serialized and paced.
    pub async fn search(&self, http: &Http, title: &str) -> Result<Vec<SearchResult>, Error> {
        let mut session = self.session.lock().await;
        Self::cooldown_of(&session)?;
        if let Some(last) = session.last_search {
            let wait = self.config.search_interval.saturating_sub(last.elapsed());
            if !wait.is_zero() {
                tokio::time::sleep(wait).await;
            }
        }
        let terms: Vec<&str> = title.split(' ').filter(|term| !term.is_empty()).collect();
        let mut refreshed = false;
        let mut rediscovered = false;
        loop {
            let auth = self.token(http, &mut session, &mut rediscovered).await?;
            let mut body = json!({
                "searchType": "games", "searchTerms": terms, "searchPage": 1, "size": 20,
                "searchOptions": {"games": {"userId": 0, "platform": "", "sortCategory": "name",
                    "rangeCategory": "main", "rangeTime": {"min": 0, "max": 0},
                    "gameplay": {"perspective": "", "flow": "", "genre": "", "difficulty": ""},
                    "modifier": "hide_dlc"}, "users": {}, "filter": "", "sort": 0, "randomizer": 0}
            });
            let mut headers = vec![
                ("Origin", BASE),
                ("Referer", REFERER),
                ("Content-Type", "application/json"),
                ("x-auth-token", auth.token.as_str()),
            ];
            if let Some((key, val)) = &auth.hp {
                headers.push(("x-hp-key", key));
                headers.push(("x-hp-val", val));
                body[key.as_str()] = json!(val);
            }
            let url = format!("{BASE}{}", session.search_path);
            session.last_search = Some(Instant::now());
            let response = self.send(http, "search", Method::POST, &url, &headers, Some(body), PAGE_LIMIT).await?;
            match response.status {
                200 => {
                    return response
                        .json()
                        .ok()
                        .as_ref()
                        .and_then(parse_search)
                        .ok_or_else(|| Error::Transient("HLTB returned unexpected search results".into()));
                }
                429 => return Err(self.rate_limited(&mut session)),
                403 if !refreshed => {
                    refreshed = true;
                    session.auth = None;
                }
                404 if !rediscovered => {
                    rediscovered = true;
                    session.auth = None;
                    self.rediscover(http, &mut session).await?;
                }
                status => return Err(Error::Transient(format!("HLTB search returned HTTP {status}"))),
            }
        }
    }

    /// Load one game's page data; `None` when HLTB has no such game.
    pub async fn game_page(&self, http: &Http, game_id: i64) -> Result<Option<GamePage>, Error> {
        if game_id <= 0 {
            return Ok(None);
        }
        self.cooldown().await?;
        let response = self
            .send(http, "page", Method::GET, &format!("{BASE}/game/{game_id}"), &[("Referer", REFERER)], None, PAGE_LIMIT)
            .await?;
        match response.status {
            200 => parse_game_html(&response.text())
                .filter(|page| page.game_id == game_id)
                .map(Some)
                .ok_or_else(|| Error::Transient("HLTB returned an unexpected game page".into())),
            404 => Ok(None),
            429 => Err(self.rate_limited(&mut *self.session.lock().await)),
            status => Err(Error::Transient(format!("HLTB game page returned HTTP {status}"))),
        }
    }

    /// Find the HLTB game for a library entry.
    pub async fn lookup(&self, http: &Http, input: LookupInput) -> Result<LookupOutcome, Error> {
        if let Some(pinned) = input.pinned_id.filter(|id| *id > 0) {
            return Ok(match self.game_page(http, pinned).await? {
                Some(page) => LookupOutcome::Matched { page, via: MatchVia::Pinned },
                None => LookupOutcome::NoMatch,
            });
        }
        let mut title = matching::clean_game_title(&input.title);
        let steam_appid = input.steam_appid.filter(|id| *id > 0);
        let mut results = if title.is_empty() { Vec::new() } else { self.search(http, &title).await? };
        if results.is_empty() && input.native_steam {
            if let Some(appid) = steam_appid {
                let english = steam::steam_appdetails_for_appid(http, appid)
                    .await
                    .and_then(|details| details["title"].as_str().map(matching::clean_game_title))
                    .filter(|english| !english.is_empty() && *english != title);
                if let Some(english) = english {
                    results = self.search(http, &english).await?;
                    title = english;
                }
            }
        }
        let ranked = rank_by_title(&title, &results);
        if let Some(appid) = steam_appid {
            for candidate in ranked.into_iter().take(MAX_STEAM_CANDIDATES) {
                if let Some(page) = self.game_page(http, candidate.page.game_id).await? {
                    if page.profile_steam == appid || page.profile_steam_alt == appid {
                        return Ok(LookupOutcome::Matched { page, via: MatchVia::SteamId });
                    }
                }
            }
            return Ok(LookupOutcome::NoMatch);
        }
        // Search results already carry the times, so a title match needs no page request.
        let query = matching::normalise_match_title(&title);
        let pick = results
            .iter()
            .find(|result| matching::normalise_match_title(&result.page.game_name) == query)
            .or_else(|| {
                results
                    .iter()
                    .filter(|result| matching::ign_title_acceptable(&title, &result.page.game_name))
                    .max_by_key(|result| result.comp_all_count)
            });
        Ok(match pick {
            Some(result) => LookupOutcome::Matched { page: result.page.clone(), via: MatchVia::Title },
            None => LookupOutcome::NoMatch,
        })
    }

    /// Reload a saved game with one page request.
    pub async fn refresh(&self, http: &Http, game_id: i64, expected_steam: Option<i64>) -> Result<RefreshOutcome, Error> {
        Ok(match self.game_page(http, game_id).await? {
            Some(page)
                if expected_steam
                    .is_none_or(|id| page.profile_steam == id || page.profile_steam_alt == id) =>
            {
                RefreshOutcome::Updated(page)
            }
            _ => RefreshOutcome::Invalid,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::{Fixture, Response};
    use reqwest::header::HeaderMap;

    const INIT: &str = "https://howlongtobeat.com/api/search/site/init?t=1";
    const SEARCH: &str = "https://howlongtobeat.com/api/search/site";

    fn client() -> HltbClient {
        HltbClient::with_config(Duration::from_millis(40), Duration::from_secs(60), || 1)
    }

    fn reply(method: Method, url: &str, status: u16, body: impl Into<Vec<u8>>) -> Fixture {
        Fixture {
            method,
            url: url.to_owned(),
            result: Ok(Response { status, headers: HeaderMap::new(), body: body.into(), url: url.to_owned() }),
        }
    }

    fn init() -> Fixture {
        reply(Method::GET, INIT, 200, br#"{"token":"abc"}"#.to_vec())
    }

    fn game(id: i64, name: &str, steam: i64, count: i64) -> Value {
        json!({"game_id": id, "game_name": name, "comp_main": 3600, "comp_plus": 7200,
               "comp_100": 10800, "comp_all": 5400, "comp_all_count": count,
               "profile_steam": steam, "profile_steam_alt": 0})
    }

    fn search(items: Vec<Value>) -> Fixture {
        reply(Method::POST, SEARCH, 200, serde_json::to_vec(&json!({"count": items.len(), "data": items})).unwrap())
    }

    fn page(id: i64, name: &str, steam: i64, alt: i64) -> Fixture {
        let mut data = game(id, name, steam, 1);
        data["profile_steam_alt"] = json!(alt);
        let next = json!({"props": {"pageProps": {"game": {"data": {"game": [data]}}}}});
        let html = format!(
            r#"<html><head></head><body><div>x</div><script id="__NEXT_DATA__" type="application/json">{next}</script></body></html>"#
        );
        reply(Method::GET, &format!("https://howlongtobeat.com/game/{id}"), 200, html)
    }

    fn missing(id: i64) -> Fixture {
        reply(Method::GET, &format!("https://howlongtobeat.com/game/{id}"), 404, b"".to_vec())
    }

    fn input(steam: Option<i64>, title: &str) -> LookupInput {
        LookupInput { steam_appid: steam, title: title.into(), pinned_id: None, native_steam: steam.is_some() }
    }

    fn matched(outcome: LookupOutcome) -> (i64, MatchVia) {
        match outcome {
            LookupOutcome::Matched { page, via } => (page.game_id, via),
            LookupOutcome::NoMatch => panic!("expected a match"),
        }
    }

    #[tokio::test]
    async fn steam_id_check_picks_the_edition_that_lists_the_steam_app() {
        // Title ranking puts the 2005 game first; its page lists another Steam ID.
        let http = Http::fixtures(vec![
            init(),
            search(vec![game(7720, "Resident Evil 4", 0, 9000), game(108881, "Resident Evil 4", 0, 300)]),
            page(7720, "Resident Evil 4", 254700, 0),
            page(108881, "Resident Evil 4", 2050650, 0),
        ]);
        let outcome = client().lookup(&http, input(Some(2050650), "Resident Evil 4")).await.unwrap();
        assert_eq!(matched(outcome), (108881, MatchVia::SteamId));
        http.assert_drained();
    }

    #[tokio::test]
    async fn steam_id_check_accepts_the_alternate_steam_id() {
        let http = Http::fixtures(vec![init(), search(vec![game(5, "Game", 0, 1)]), page(5, "Game", 10, 20)]);
        assert_eq!(matched(client().lookup(&http, input(Some(20), "Game")).await.unwrap()), (5, MatchVia::SteamId));
    }

    #[tokio::test]
    async fn unverified_steam_candidates_never_fall_back_to_the_title() {
        // Spider-Man: the exact title has no Steam ID (0); another lists a different ID.
        let http = Http::fixtures(vec![
            init(),
            search(vec![game(44852, "Marvel's Spider-Man", 0, 1), game(9, "Marvel's Spider-Man 2", 0, 1)]),
            page(44852, "Marvel's Spider-Man", 0, 0),
            page(9, "Marvel's Spider-Man 2", 2651280, 0),
        ]);
        let outcome = client().lookup(&http, input(Some(1817070), "Marvel's Spider-Man")).await.unwrap();
        assert_eq!(outcome, LookupOutcome::NoMatch);
        http.assert_drained();
    }

    #[tokio::test]
    async fn page_errors_during_steam_checks_are_errors_not_title_matches() {
        let http = Http::fixtures(vec![
            init(),
            search(vec![game(1, "Portal 2", 0, 1)]),
            reply(Method::GET, "https://howlongtobeat.com/game/1", 500, b"".to_vec()),
        ]);
        assert!(matches!(client().lookup(&http, input(Some(620), "Portal 2")).await, Err(Error::Transient(_))));
    }

    #[tokio::test]
    async fn empty_search_for_a_steam_game_retries_with_the_english_steam_name() {
        let http = Http::fixtures(vec![
            init(),
            search(vec![]),
            Fixture::json(
                "https://store.steampowered.com/api/appdetails?appids=620&l=english",
                json!({"620": {"success": true, "data": {"name": "Portal 2"}}}),
            ),
            search(vec![game(7231, "Portal 2", 0, 1)]),
            page(7231, "Portal 2", 620, 0),
        ]);
        let outcome = client().lookup(&http, input(Some(620), "ポータル2")).await.unwrap();
        assert_eq!(matched(outcome), (7231, MatchVia::SteamId));
        http.assert_drained();
    }

    #[tokio::test]
    async fn zero_results_without_a_steam_game_is_no_match() {
        let http = Http::fixtures(vec![init(), search(vec![])]);
        assert_eq!(client().lookup(&http, input(None, "Nothing Like This")).await.unwrap(), LookupOutcome::NoMatch);
        http.assert_drained();
    }

    #[tokio::test]
    async fn title_match_prefers_exact_then_most_played_and_needs_no_page() {
        let http = Http::fixtures(vec![
            init(),
            search(vec![game(1, "Celeste Classic", 0, 50), game(2, "Celeste", 0, 10)]),
        ]);
        assert_eq!(matched(client().lookup(&http, input(None, "Celeste")).await.unwrap()), (2, MatchVia::Title));
        let http = Http::fixtures(vec![
            init(),
            search(vec![game(3, "Hollow Knight: Voidheart", 0, 5), game(4, "Hollow Knight Silksong", 0, 900)]),
        ]);
        let outcome = client().lookup(&http, input(None, "Hollow Knight")).await.unwrap();
        assert_eq!(matched(outcome), (4, MatchVia::Title));
        let http = Http::fixtures(vec![init(), search(vec![game(5, "Minecraft Dungeons", 0, 5)])]);
        assert_eq!(client().lookup(&http, input(None, "Stardew Valley")).await.unwrap(), LookupOutcome::NoMatch);
    }

    #[tokio::test]
    async fn a_pinned_game_is_used_without_search_or_steam_check() {
        let http = Http::fixtures(vec![page(42, "Pinned", 999, 0), missing(43)]);
        let mut pinned = input(Some(620), "Portal 2");
        pinned.pinned_id = Some(42);
        assert_eq!(matched(client().lookup(&http, pinned.clone()).await.unwrap()), (42, MatchVia::Pinned));
        pinned.pinned_id = Some(43);
        assert_eq!(client().lookup(&http, pinned).await.unwrap(), LookupOutcome::NoMatch);
        http.assert_drained();
    }

    #[tokio::test]
    async fn an_expired_token_is_replaced_once_after_403() {
        let http = Http::fixtures(vec![
            init(),
            reply(Method::POST, SEARCH, 403, br#"{"error":"Session expired or invalid fingerprint"}"#.to_vec()),
            init(),
            search(vec![game(1, "Hades", 0, 1)]),
        ]);
        assert_eq!(client().search(&http, "Hades").await.unwrap().len(), 1);
        http.assert_drained();
        let http = Http::fixtures(vec![
            init(),
            reply(Method::POST, SEARCH, 403, b"{}".to_vec()),
            init(),
            reply(Method::POST, SEARCH, 403, b"{}".to_vec()),
        ]);
        assert!(matches!(client().search(&http, "Hades").await, Err(Error::Transient(_))));
    }

    #[tokio::test]
    async fn rate_limit_starts_a_cooldown_without_a_new_token() {
        let client = client();
        let http = Http::fixtures(vec![init(), reply(Method::POST, SEARCH, 429, b"".to_vec())]);
        assert!(matches!(client.search(&http, "Hades").await, Err(Error::RateLimited { .. })));
        http.assert_drained();
        // During the cooldown nothing is sent (an unexpected request would fail).
        assert!(matches!(client.search(&http, "Hades").await, Err(Error::RateLimited { .. })));
        assert!(matches!(client.game_page(&http, 1).await, Err(Error::RateLimited { .. })));
    }

    #[tokio::test]
    async fn the_token_is_reused_and_searches_are_spaced() {
        let client = client();
        let http = Http::fixtures(vec![init(), search(vec![]), search(vec![])]);
        let started = Instant::now();
        client.search(&http, "A").await.unwrap();
        client.search(&http, "B").await.unwrap();
        assert!(started.elapsed() >= Duration::from_millis(40));
        http.assert_drained();
    }

    #[tokio::test]
    async fn a_moved_search_route_is_rediscovered_from_site_scripts() {
        let home = r#"<html><script src="/_next/static/chunks/a.js"></script><script src="https://cdn.example/x.js"></script><script src="/_next/static/chunks/b.js"></script></html>"#;
        let script = r#"x=fetch("/api/find/games/init?t="+Date.now());y=fetch("/api/find/games",{method:"POST",body:JSON.stringify({searchTerms:t,searchOptions:o})})"#;
        let http = Http::fixtures(vec![
            reply(Method::GET, INIT, 404, b"".to_vec()),
            Fixture::text(BASE, home),
            Fixture::text("https://howlongtobeat.com/_next/static/chunks/a.js", "nothing here"),
            Fixture::text("https://howlongtobeat.com/_next/static/chunks/b.js", script),
            reply(Method::GET, "https://howlongtobeat.com/api/find/games/init?t=1", 200, br#"{"token":"t","hpKey":"k1","hpVal":"v1"}"#.to_vec()),
            reply(Method::POST, "https://howlongtobeat.com/api/find/games", 200, br#"{"data":[]}"#.to_vec()),
        ]);
        assert!(client().search(&http, "Hades").await.unwrap().is_empty());
        http.assert_drained();
    }

    #[tokio::test]
    async fn refresh_uses_one_page_and_detects_a_changed_listing() {
        let client = client();
        let http = Http::fixtures(vec![page(7231, "Portal 2", 620, 0)]);
        assert!(matches!(client.refresh(&http, 7231, Some(620)).await.unwrap(), RefreshOutcome::Updated(page) if page.comp_main == 3600));
        http.assert_drained();
        let http = Http::fixtures(vec![page(7231, "Portal 2", 999, 0), missing(7231), page(7231, "Portal 2", 999, 0)]);
        assert_eq!(client.refresh(&http, 7231, Some(620)).await.unwrap(), RefreshOutcome::Invalid);
        assert_eq!(client.refresh(&http, 7231, None).await.unwrap(), RefreshOutcome::Invalid);
        assert!(matches!(client.refresh(&http, 7231, None).await.unwrap(), RefreshOutcome::Updated(_)));
    }

    #[test]
    fn parses_the_real_page_shape_and_rejects_others() {
        let html = r#"<script id="__NEXT_DATA__" type="application/json" crossorigin="">{"props":{"pageProps":{"game":{"data":{"game":[{"game_id":7231,"game_name":"Portal 2","comp_main":30886,"comp_plus":49570,"comp_100":82821,"comp_all":38321,"profile_steam":620,"profile_steam_alt":0}]}}}}}</script>"#;
        assert_eq!(parse_game_html(html).unwrap().profile_steam, 620);
        assert!(parse_game_html("<html></html>").is_none());
        assert!(parse_game_html(&html.replace("\"comp_main\":30886,", "")).is_none());
    }
}
