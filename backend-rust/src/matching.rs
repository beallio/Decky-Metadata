use chrono::NaiveDate;
use regex::Regex;
use serde_json::Value;
use std::borrow::Cow;
use std::collections::HashSet;
use std::sync::LazyLock;
use unicode_casefold::UnicodeCaseFold;
use web_atoms::{C1_REPLACEMENTS, NAMED_ENTITIES};

static RX_WHITESPACE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[\s\x{1c}-\x{1f}]+").expect("fixed whitespace regex"));
static RX_TITLE_MARKS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[™®©]").expect("fixed title-mark regex"));
static RX_TITLE_BRACKETS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[[^\]]+\]|\([^\)]*\)").expect("fixed title-bracket regex"));
static RX_TITLE_ARTICLES: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b(the|a|an)\b").expect("fixed title-article regex"));
static RX_TITLE_EDITIONS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(remaster(ed)?|hd|definitive|ultimate|complete|goty|edition)\b")
        .expect("fixed title-edition regex")
});
static RX_TITLE_REGIONS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"\b(usa|europe|eur|japan|jp|world|rev|revision|beta|proto|prototype|demo|sample|en|fr|de|es|it|pt|br|v\d+(?:\.\d+)*)\b",
    )
    .expect("fixed title-region regex")
});
static RX_ASCII_LOWER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[a-z]").expect("fixed ASCII-letter regex"));
static RX_TITLE_PUNCTUATION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[^a-z0-9]+").expect("fixed title-punctuation regex"));
static RX_ASCII_WORDS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[a-z0-9]+").expect("fixed ASCII-word regex"));
static RX_DECIMAL_TOKEN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\A\d+\z").expect("fixed decimal-token regex"));
static RX_CONSOLE_SUFFIX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:\[([^\]]+)\]|\(([^\)]+)\))[\s\x{1c}-\x{1f}]*\z")
        .expect("fixed console-suffix regex")
});
static RX_P_CLOSE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)</p\s*>").expect("fixed paragraph regex"));
static RX_BR_SIMPLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<br\s*/?>").expect("fixed line-break regex"));
static RX_STRIP_TAGS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"<[^>]+>").expect("fixed tag regex"));
static RX_SCRIPT_STYLE_OPEN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)<(script|style)\b[^>]*>").expect("fixed script/style opener regex")
});
static RX_SCRIPT_CLOSE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)</script\s*>").expect("fixed script closer regex"));
static RX_STYLE_CLOSE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)</style\s*>").expect("fixed style closer regex"));
static RX_LIST_TAG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<(/?)(ul|ol|li)\b[^>]*>").expect("fixed list-tag regex"));
static RX_LI_OPEN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<li\b[^>]*>").expect("fixed list-item opener regex"));
static RX_LI_CLOSE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)</li\s*>").expect("fixed list-item closer regex"));
static RX_BLOCK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)</?(?:p|div|h[1-6])\b[^>]*>").expect("fixed block-tag regex")
});
static RX_LIST: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)</?(?:ul|ol)\b[^>]*>").expect("fixed list-container regex"));
static RX_BR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<br\b[^>]*>").expect("fixed provider line-break regex"));
static RX_EMPTY_ITEM: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\x00li\x00[\s\x{1c}-\x{1f}]*\x00/li\x00").expect("fixed empty-list-item regex")
});
static RX_MARKED_ITEM: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\x00li\x00[\s\x{1c}-\x{1f}]*").expect("fixed marked-list-item regex")
});
static RX_SPACES: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[ \t]+").expect("fixed horizontal-space regex"));
static RX_LINE_SPACES: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r" *\n *").expect("fixed line-space regex"));
static RX_MANY_NEWLINES: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\n{3,}").expect("fixed newline-collapse regex"));
static RX_ISO_DATE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\A(\d{4})-(\d{2})-(\d{2})\z").expect("fixed ISO-date regex"));
static RX_ISO_DATETIME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\A(\d{4}-\d{2}-\d{2})T.*\z").expect("fixed ISO-datetime-prefix regex")
});
static RX_MONTH_FIRST_DATE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\A([A-Za-z]+) (\d{1,2}),? (\d{4})\z").expect("fixed month-first date regex")
});
static RX_DAY_FIRST_DATE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\A(\d{1,2}) ([A-Za-z]+),? (\d{4})\z").expect("fixed day-first date regex")
});

static RX_NON_PRIMARY_DEMO: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\bdemo\b").expect("fixed non-primary demo regex"));
static RX_NON_PRIMARY_BETA: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\bbeta\b").expect("fixed non-primary beta regex"));
static RX_NON_PRIMARY_PLAYTEST: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\bplaytest\b").expect("fixed non-primary playtest regex"));
static RX_NON_PRIMARY_PROTOTYPE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\bprototype\b").expect("fixed non-primary prototype regex"));
static RX_NON_PRIMARY_SOUNDTRACK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\bsoundtrack\b").expect("fixed non-primary soundtrack regex"));
static RX_NON_PRIMARY_OST: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\bost\b").expect("fixed non-primary OST regex"));
static RX_NON_PRIMARY_SEASON_PASS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\bseason\s+pass\b").expect("fixed non-primary season-pass regex")
});
static RX_NON_PRIMARY_DLC: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\bdlc\b").expect("fixed non-primary DLC regex"));
static RX_NON_PRIMARY_PACK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\bpack\b").expect("fixed non-primary pack regex"));
static RX_NON_PRIMARY_BUNDLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\bbundle\b").expect("fixed non-primary bundle regex"));
static RX_NON_PRIMARY_ARTBOOK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\bartbook\b").expect("fixed non-primary artbook regex"));
static RX_NON_PRIMARY_ART_BOOK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\bart\s+book\b").expect("fixed non-primary art-book regex"));
static RX_NON_PRIMARY_TRAILER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\btrailer\b").expect("fixed non-primary trailer regex"));
static RX_NON_PRIMARY_DEDICATED_SERVER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\bdedicated\s+server\b").expect("fixed non-primary dedicated-server regex")
});
static RX_NON_PRIMARY_SERVER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\bserver\b").expect("fixed non-primary server regex"));
static RX_NON_PRIMARY_TEST: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\btest\b").expect("fixed non-primary test regex"));

static NON_PRIMARY_PATTERNS: [&LazyLock<Regex>; 16] = [
    &RX_NON_PRIMARY_DEMO,
    &RX_NON_PRIMARY_BETA,
    &RX_NON_PRIMARY_PLAYTEST,
    &RX_NON_PRIMARY_PROTOTYPE,
    &RX_NON_PRIMARY_SOUNDTRACK,
    &RX_NON_PRIMARY_OST,
    &RX_NON_PRIMARY_SEASON_PASS,
    &RX_NON_PRIMARY_DLC,
    &RX_NON_PRIMARY_PACK,
    &RX_NON_PRIMARY_BUNDLE,
    &RX_NON_PRIMARY_ARTBOOK,
    &RX_NON_PRIMARY_ART_BOOK,
    &RX_NON_PRIMARY_TRAILER,
    &RX_NON_PRIMARY_DEDICATED_SERVER,
    &RX_NON_PRIMARY_SERVER,
    &RX_NON_PRIMARY_TEST,
];

const PC_PLATFORM_KEYWORDS: [&str; 8] = [
    "pc",
    "windows",
    "linux",
    "mac",
    "macintosh",
    "steamos",
    "steam-deck",
    "steam deck",
];

const CONSOLE_TITLE_SUFFIXES: [&str; 37] = [
    "ds",
    "3ds",
    "new nintendo 3ds",
    "wii",
    "wii u",
    "switch",
    "nintendo switch",
    "xbox",
    "xbox 360",
    "xbox one",
    "xbox series x",
    "xbox series x/s",
    "ps1",
    "ps2",
    "ps3",
    "ps4",
    "ps5",
    "playstation",
    "playstation 2",
    "playstation 3",
    "playstation 4",
    "playstation 5",
    "psp",
    "ps vita",
    "vita",
    "gba",
    "game boy",
    "game boy color",
    "game boy advance",
    "gamecube",
    "n64",
    "nintendo 64",
    "n-gage",
    "dreamcast",
    "sega saturn",
    "genesis",
    "mega drive",
];

#[derive(Copy, Clone)]
enum EntityReplacement {
    Empty,
    One(char),
    Two(char, char),
}

fn py_is_whitespace(ch: char) -> bool {
    ch.is_whitespace() || matches!(ch, '\u{1c}'..='\u{1f}')
}

pub(crate) fn py_strip(value: &str) -> &str {
    value.trim_matches(py_is_whitespace)
}

pub(crate) fn casefold(value: &str) -> String {
    // Extend the dependency's Unicode 9 tables to the Python baseline's Unicode 16.
    value
        .chars()
        .map(|ch| match ch {
            '\u{1c89}' | '\u{a7b8}' | '\u{a7ba}' | '\u{a7bc}' | '\u{a7be}' | '\u{a7c0}'
            | '\u{a7c2}' | '\u{a7c7}' | '\u{a7c9}' | '\u{a7cc}' | '\u{a7d0}' | '\u{a7d6}'
            | '\u{a7d8}' | '\u{a7da}' | '\u{a7f5}' => char::from_u32(ch as u32 + 1).unwrap(),
            '\u{1c90}'..='\u{1cba}' => char::from_u32(ch as u32 - 3008).unwrap(),
            '\u{1cbd}'..='\u{1cbf}' => char::from_u32(ch as u32 - 3008).unwrap(),
            '\u{2c2f}' => '\u{2c5f}',
            '\u{a7c4}' => '\u{a794}',
            '\u{a7c5}' => '\u{282}',
            '\u{a7c6}' => '\u{1d8e}',
            '\u{a7cb}' => '\u{264}',
            '\u{a7dc}' => '\u{19b}',
            '\u{10570}'..='\u{1057a}' => char::from_u32(ch as u32 + 39).unwrap(),
            '\u{1057c}'..='\u{1058a}' => char::from_u32(ch as u32 + 39).unwrap(),
            '\u{1058c}'..='\u{10592}' => char::from_u32(ch as u32 + 39).unwrap(),
            '\u{10594}'..='\u{10595}' => char::from_u32(ch as u32 + 39).unwrap(),
            '\u{10d50}'..='\u{10d65}' => char::from_u32(ch as u32 + 32).unwrap(),
            '\u{16e40}'..='\u{16e5f}' => char::from_u32(ch as u32 + 32).unwrap(),
            _ => ch,
        })
        .case_fold()
        .collect()
}

fn append_entity(output: &mut String, replacement: EntityReplacement) {
    match replacement {
        EntityReplacement::Empty => {}
        EntityReplacement::One(first) => output.push(first),
        EntityReplacement::Two(first, second) => {
            output.push(first);
            output.push(second);
        }
    }
}

fn numeric_entity(value: &str, amp: usize) -> Option<(usize, EntityReplacement)> {
    let bytes = value.as_bytes();
    let mut cursor = amp + 2;
    let radix = if cursor < bytes.len() && matches!(bytes[cursor], b'x' | b'X') {
        cursor += 1;
        16_u32
    } else {
        10_u32
    };
    let digits_start = cursor;
    let mut number = 0_u32;
    let mut overflow = false;
    while cursor < bytes.len() {
        let digit = match bytes[cursor] {
            b'0'..=b'9' => u32::from(bytes[cursor] - b'0'),
            b'a'..=b'f' if radix == 16 => u32::from(bytes[cursor] - b'a' + 10),
            b'A'..=b'F' if radix == 16 => u32::from(bytes[cursor] - b'A' + 10),
            _ => break,
        };
        number = match number.checked_mul(radix).and_then(|n| n.checked_add(digit)) {
            Some(n) => n,
            None => {
                overflow = true;
                u32::MAX
            }
        };
        cursor += 1;
    }
    if cursor == digits_start {
        return None;
    }
    if cursor < bytes.len() && bytes[cursor] == b';' {
        cursor += 1;
    }

    if overflow || number > 0x10ffff || (0xd800..=0xdfff).contains(&number) {
        return Some((cursor, EntityReplacement::One('\u{fffd}')));
    }
    if number == 0 {
        return Some((cursor, EntityReplacement::One('\u{fffd}')));
    }
    if number == 0x0d {
        return Some((cursor, EntityReplacement::One('\r')));
    }
    if (0x80..=0x9f).contains(&number) {
        let replacement = C1_REPLACEMENTS[(number - 0x80) as usize]
            .unwrap_or_else(|| char::from_u32(number).expect("C1 codepoint is valid"));
        return Some((cursor, EntityReplacement::One(replacement)));
    }
    if invalid_html_codepoint(number) {
        return Some((cursor, EntityReplacement::Empty));
    }
    Some((
        cursor,
        EntityReplacement::One(char::from_u32(number).expect("validated Unicode codepoint")),
    ))
}

fn invalid_html_codepoint(number: u32) -> bool {
    matches!(number, 0x01..=0x08 | 0x0b | 0x0e..=0x1f | 0x7f..=0x9f | 0xfdd0..=0xfdef)
        || number & 0xffff == 0xfffe
        || number & 0xffff == 0xffff
}

fn named_entity(value: &str, amp: usize) -> Option<(usize, EntityReplacement)> {
    let start = amp + 1;
    let mut end = start;
    let mut count = 0;
    for (offset, ch) in value[start..].char_indices() {
        if count == 32 || matches!(ch, '\t' | '\n' | '\u{0c}' | ' ' | '<' | '&' | '#' | ';') {
            break;
        }
        end = start + offset + ch.len_utf8();
        count += 1;
    }
    if count == 0 {
        return None;
    }
    if end < value.len() && value.as_bytes()[end] == b';' {
        end += 1;
    }

    let candidate = &value[start..end];
    let mut length = candidate.len();
    loop {
        if candidate.is_char_boundary(length) {
            if let Some(&(first, second)) = NAMED_ENTITIES.get(&candidate[..length]) {
                if first != 0 {
                    let first = char::from_u32(first).expect("valid HTML entity codepoint");
                    let replacement = if second == 0 {
                        EntityReplacement::One(first)
                    } else {
                        EntityReplacement::Two(
                            first,
                            char::from_u32(second).expect("valid HTML entity codepoint"),
                        )
                    };
                    return Some((start + length, replacement));
                }
            }
        }
        if length == 0 {
            break;
        }
        length -= 1;
    }
    None
}

fn entity_at(value: &str, amp: usize) -> Option<(usize, EntityReplacement)> {
    let bytes = value.as_bytes();
    if bytes.get(amp + 1) == Some(&b'#') {
        numeric_entity(value, amp)
    } else {
        named_entity(value, amp)
    }
}

/// Decode HTML 5 character references once, retaining a borrow when unchanged.
pub fn decode_html_entities(value: &str) -> Cow<'_, str> {
    let mut cursor = 0;
    let mut copied_through = 0;
    let mut output = String::new();
    let mut changed = false;

    while cursor < value.len() {
        let Some(relative_amp) = value[cursor..].find('&') else {
            break;
        };
        let amp = cursor + relative_amp;
        if let Some((end, replacement)) = entity_at(value, amp) {
            if !changed {
                output.push_str(&value[..amp]);
                changed = true;
            } else {
                output.push_str(&value[copied_through..amp]);
            }
            append_entity(&mut output, replacement);
            copied_through = end;
            cursor = end;
        } else {
            cursor = amp + 1;
        }
    }

    if !changed {
        Cow::Borrowed(value)
    } else {
        output.push_str(&value[copied_through..]);
        Cow::Owned(output)
    }
}

fn remove_words_unless_last_letter_erased(pattern: &Regex, text: String) -> String {
    let stripped = pattern.replace_all(&text, " ").into_owned();
    if RX_ASCII_LOWER.is_match(&text) && !RX_ASCII_LOWER.is_match(&stripped) {
        text
    } else {
        stripped
    }
}

/// Normalize titles using the source's Unicode casefold and marker-removal rules.
pub fn normalise_match_title(title: &str) -> String {
    let mut text = casefold(decode_html_entities(title).as_ref());
    text = RX_TITLE_MARKS.replace_all(&text, "").into_owned();
    text = RX_TITLE_BRACKETS.replace_all(&text, " ").into_owned();
    text = remove_words_unless_last_letter_erased(&RX_TITLE_ARTICLES, text);
    text = remove_words_unless_last_letter_erased(&RX_TITLE_EDITIONS, text);
    text = remove_words_unless_last_letter_erased(&RX_TITLE_REGIONS, text);
    text = RX_TITLE_PUNCTUATION.replace_all(&text, " ").into_owned();
    py_strip(&RX_WHITESPACE.replace_all(&text, " ")).to_owned()
}

/// Detect Steam search results that are variants rather than the requested game.
pub fn is_non_primary_steam_title(name: &str, query: &str) -> bool {
    let name = casefold(decode_html_entities(name).as_ref());
    let query = casefold(decode_html_entities(query).as_ref());
    NON_PRIMARY_PATTERNS
        .iter()
        .any(|pattern| pattern.is_match(&name) && (query.is_empty() || !pattern.is_match(&query)))
}

/// Require every distinctive query token to be present in the candidate title.
pub fn distinctive_tokens_present(query_norm: &str, candidate_norm: &str) -> bool {
    let candidate: HashSet<&str> = candidate_norm
        .split(py_is_whitespace)
        .filter(|token| !token.is_empty())
        .collect();
    query_norm
        .split(py_is_whitespace)
        .filter(|token| !token.is_empty())
        .filter(|token| token.chars().count() >= 3 || RX_DECIMAL_TOKEN.is_match(token))
        .all(|token| candidate.contains(token))
}

/// Apply the token-subset and overlap constraints used for IGN title matches.
pub fn reasonable_match(query: &str, title: &str) -> bool {
    let query = casefold(query);
    let title = casefold(title);
    let query_tokens: HashSet<&str> = RX_ASCII_WORDS
        .find_iter(&query)
        .map(|matched| matched.as_str())
        .collect();
    let title_tokens: HashSet<&str> = RX_ASCII_WORDS
        .find_iter(&title)
        .map(|matched| matched.as_str())
        .collect();
    if query_tokens.is_empty() || title_tokens.is_empty() {
        return false;
    }
    if query_tokens.is_subset(&title_tokens) || title_tokens.is_subset(&query_tokens) {
        return true;
    }
    let overlap =
        query_tokens.intersection(&title_tokens).count() as f64 / query_tokens.len().max(1) as f64;
    overlap >= 0.55
}

/// Apply the shared token checks and retain the distinctive normalized tokens.
pub fn ign_title_acceptable(query: &str, candidate_title: &str) -> bool {
    if !reasonable_match(query, candidate_title) {
        return false;
    }
    distinctive_tokens_present(
        &normalise_match_title(query),
        &normalise_match_title(candidate_title),
    )
}

/// Return whether any provider platform string names a PC platform.
pub fn has_pc_platform(platforms: &[String]) -> bool {
    platforms.iter().any(|platform| {
        let folded = casefold(py_strip(platform));
        let normalized = RX_WHITESPACE.replace_all(&folded, " ");
        PC_PLATFORM_KEYWORDS
            .iter()
            .any(|keyword| normalized.contains(keyword))
    })
}

/// Return the recognized console suffix, preserving its source spelling.
pub fn console_title_suffix(title: &str) -> Option<String> {
    let captures = RX_CONSOLE_SUFFIX.captures(title)?;
    let token = py_strip(
        captures
            .get(1)
            .or_else(|| captures.get(2))
            .map_or("", |matched| matched.as_str()),
    );
    let folded = casefold(token);
    let normalized = RX_WHITESPACE.replace_all(&folded, " ");
    CONSOLE_TITLE_SUFFIXES
        .contains(&normalized.as_ref())
        .then(|| token.to_owned())
}

/// Strip basic provider HTML and decode entities once.
pub fn clean_html_text(value: &str) -> String {
    let text = RX_P_CLOSE.replace_all(value, "\n\n");
    let text = RX_BR_SIMPLE.replace_all(&text, "\n");
    let text = RX_STRIP_TAGS.replace_all(&text, "");
    let text = decode_html_entities(&text);
    let text = RX_SPACES.replace_all(&text, " ");
    let text = RX_MANY_NEWLINES.replace_all(&text, "\n\n");
    py_strip(&text).to_owned()
}

/// Normalize already-plain descriptions without decoding entities or tags.
pub fn normalize_description_text(value: &str) -> String {
    value.replace("\r\n", "\n").replace('\r', "\n")
}

fn strip_script_style_blocks(text: String) -> String {
    let mut output: Option<String> = None;
    let mut cursor = 0;
    let mut copied_through = 0;

    while let Some(open) = RX_SCRIPT_STYLE_OPEN.captures_at(&text, cursor) {
        let Some(open_match) = open.get(0) else {
            break;
        };
        let Some(tag) = open.get(1) else {
            break;
        };
        let close_regex = if tag.as_str().eq_ignore_ascii_case("script") {
            &RX_SCRIPT_CLOSE
        } else {
            &RX_STYLE_CLOSE
        };
        if let Some(close) = close_regex.find_at(&text, open_match.end()) {
            let result = output.get_or_insert_with(|| text[..open_match.start()].to_owned());
            if copied_through != 0 {
                result.push_str(&text[copied_through..open_match.start()]);
            }
            copied_through = close.end();
            cursor = close.end();
        } else {
            cursor = open_match.start() + 1;
        }
    }

    match output {
        Some(mut output) => {
            output.push_str(&text[copied_through..]);
            output
        }
        None => text,
    }
}

fn close_implicit_list_items(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut copied_through = 0;
    let mut open_items = vec![false];

    for captures in RX_LIST_TAG.captures_iter(text) {
        let Some(matched) = captures.get(0) else {
            continue;
        };
        let tag = captures.get(2).map_or("", |group| group.as_str());
        let closing = captures
            .get(1)
            .is_some_and(|group| !group.as_str().is_empty());
        output.push_str(&text[copied_through..matched.start()]);
        if tag.eq_ignore_ascii_case("li") {
            if !closing && open_items.last().copied().unwrap_or(false) {
                output.push_str("</li>");
            }
            if let Some(open) = open_items.last_mut() {
                *open = !closing;
            }
        } else if !closing {
            open_items.push(false);
        } else {
            if open_items.last().copied().unwrap_or(false) {
                output.push_str("</li>");
            }
            if open_items.len() > 1 {
                open_items.pop();
            } else if let Some(open) = open_items.last_mut() {
                *open = false;
            }
        }
        output.push_str(matched.as_str());
        copied_through = matched.end();
    }
    output.push_str(&text[copied_through..]);
    output.push_str(
        "</li>"
            .repeat(open_items.iter().filter(|open| **open).count())
            .as_str(),
    );
    output
}

fn remove_empty_list_items(text: String) -> String {
    let mut text = text;
    loop {
        let without_empty_items = RX_EMPTY_ITEM.replace_all(&text, "");
        if without_empty_items.len() == text.len() {
            return text;
        }
        text = without_empty_items.into_owned();
    }
}

fn remove_parent_list_markers(text: &str) -> String {
    const START: &str = "\0li\0";
    let mut output = String::with_capacity(text.len());
    let mut cursor = 0;
    while let Some(relative_start) = text[cursor..].find(START) {
        let start = cursor + relative_start;
        let after_start = start + START.len();
        let whitespace_end = text[after_start..]
            .char_indices()
            .take_while(|(_, ch)| py_is_whitespace(*ch))
            .map(|(offset, ch)| after_start + offset + ch.len_utf8())
            .last()
            .unwrap_or(after_start);
        if text[whitespace_end..].starts_with(START) {
            output.push_str(&text[cursor..start]);
            cursor = whitespace_end;
        } else {
            output.push_str(&text[cursor..after_start]);
            cursor = after_start;
        }
    }
    output.push_str(&text[cursor..]);
    output
}

/// Convert provider HTML into readable plain text, preserving nested list boundaries.
pub fn description_html_to_text(value: &str) -> String {
    let text = RX_WHITESPACE.replace_all(value, " ").into_owned();
    let text = strip_script_style_blocks(text);
    let text = close_implicit_list_items(&text);
    let text = RX_LI_OPEN.replace_all(&text, "\0li\0");
    let text = RX_LI_CLOSE.replace_all(&text, "\0/li\0");
    let text = RX_BLOCK.replace_all(&text, "\n\n");
    let text = RX_LIST.replace_all(&text, "\n");
    let text = RX_BR.replace_all(&text, "\n");
    let text = RX_STRIP_TAGS.replace_all(&text, "");
    let text = decode_html_entities(&text).into_owned();
    let text = remove_empty_list_items(text);
    let text = remove_parent_list_markers(&text);
    let text = RX_MARKED_ITEM.replace_all(&text, "\n- ");
    let text = text.replace("\0/li\0", "");
    let text = RX_SPACES.replace_all(&text, " ");
    let text = RX_LINE_SPACES.replace_all(&text, "\n");
    let text = RX_MANY_NEWLINES.replace_all(&text, "\n\n");
    py_strip(&text).to_owned()
}

/// Remove trademark glyphs and excess whitespace from a displayed title.
pub fn clean_game_title(name: &str) -> String {
    let text = decode_html_entities(name);
    let text = RX_TITLE_MARKS.replace_all(&text, "");
    py_strip(&RX_WHITESPACE.replace_all(&text, " ")).to_owned()
}

/// Convert a provider rating to a clamped integer percentage with Python rounding.
pub fn rating_to_percent(value: &Value) -> Option<i64> {
    let number = match value {
        Value::Bool(value) => Some(if *value { 1.0 } else { 0.0 }),
        Value::Number(value) => value.as_f64(),
        Value::String(value) => python_float(value),
        _ => None,
    }?;
    if !number.is_finite() {
        return None;
    }
    let percent = if number <= 10.0 {
        number * 10.0
    } else {
        number
    };
    Some(percent.round_ties_even().clamp(0.0, 100.0) as i64)
}

/// Normalize a provider calendar date without assigning a time or timezone.
pub fn normalize_release_date(value: &Value) -> Option<String> {
    let Value::String(value) = value else {
        return None;
    };
    let mut text = py_strip(value);
    if text.is_empty() {
        return None;
    }
    if let Some(captures) = RX_ISO_DATETIME.captures(text) {
        text = captures.get(1)?.as_str();
    }

    let (year, month, day) = if let Some(captures) = RX_ISO_DATE.captures(text) {
        (
            captures.get(1)?.as_str().parse::<i32>().ok()?,
            captures.get(2)?.as_str().parse::<u32>().ok()?,
            captures.get(3)?.as_str().parse::<u32>().ok()?,
        )
    } else if let Some(captures) = RX_MONTH_FIRST_DATE.captures(text) {
        let month = english_month(captures.get(1)?.as_str())?;
        (
            captures.get(3)?.as_str().parse::<i32>().ok()?,
            month,
            captures.get(2)?.as_str().parse::<u32>().ok()?,
        )
    } else if let Some(captures) = RX_DAY_FIRST_DATE.captures(text) {
        let month = english_month(captures.get(2)?.as_str())?;
        (
            captures.get(3)?.as_str().parse::<i32>().ok()?,
            month,
            captures.get(1)?.as_str().parse::<u32>().ok()?,
        )
    } else {
        return None;
    };
    if !(1..=9999).contains(&year) {
        return None;
    }
    NaiveDate::from_ymd_opt(year, month, day).map(|date| date.format("%Y-%m-%d").to_string())
}

fn english_month(value: &str) -> Option<u32> {
    match value.to_ascii_lowercase().as_str() {
        "jan" | "january" => Some(1),
        "feb" | "february" => Some(2),
        "mar" | "march" => Some(3),
        "apr" | "april" => Some(4),
        "may" => Some(5),
        "jun" | "june" => Some(6),
        "jul" | "july" => Some(7),
        "aug" | "august" => Some(8),
        "sep" | "september" => Some(9),
        "oct" | "october" => Some(10),
        "nov" | "november" => Some(11),
        "dec" | "december" => Some(12),
        _ => None,
    }
}

pub(crate) fn decimal_digit(value: char) -> Option<u8> {
    if value.is_ascii_digit() {
        return Some(value as u8 - b'0');
    }
    // CPython 3.14 uses Unicode 16.0 decimal-digit families.
    const ZEROS: &[u32] = &[
        0x30, 0x660, 0x6F0, 0x7C0, 0x966, 0x9E6, 0xA66, 0xAE6, 0xB66, 0xBE6, 0xC66, 0xCE6, 0xD66,
        0xDE6, 0xE50, 0xED0, 0xF20, 0x1040, 0x1090, 0x17E0, 0x1810, 0x1946, 0x19D0, 0x1A80, 0x1A90,
        0x1B50, 0x1BB0, 0x1C40, 0x1C50, 0xA620, 0xA8D0, 0xA900, 0xA9D0, 0xA9F0, 0xAA50, 0xABF0,
        0xFF10, 0x104A0, 0x10D30, 0x10D40, 0x11066, 0x110F0, 0x11136, 0x111D0, 0x112F0, 0x11450,
        0x114D0, 0x11650, 0x116C0, 0x116D0, 0x116DA, 0x11730, 0x118E0, 0x11950, 0x11BF0, 0x11C50,
        0x11D50, 0x11DA0, 0x11F50, 0x16130, 0x16A60, 0x16AC0, 0x16B50, 0x16D70, 0x1CCF0, 0x1D7CE,
        0x1D7D8, 0x1D7E2, 0x1D7EC, 0x1D7F6, 0x1E140, 0x1E2F0, 0x1E4F0, 0x1E5F1, 0x1E950, 0x1FBF0,
    ];
    let code = value as u32;
    let index = ZEROS.partition_point(|zero| *zero <= code).checked_sub(1)?;
    let digit = code - ZEROS[index];
    (digit < 10).then_some(digit as u8)
}

pub(crate) fn integer_string(value: &str) -> Option<Cow<'_, str>> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    if value.bytes().all(|byte| byte.is_ascii_digit()) {
        let digits = value.trim_start_matches('0');
        return Some(Cow::Borrowed(if digits.is_empty() { "0" } else { digits }));
    }
    let negative = value.starts_with('-');
    let digits = value.strip_prefix(['+', '-']).unwrap_or(value);
    if negative
        && !digits.is_empty()
        && !digits.starts_with('0')
        && digits.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Some(Cow::Borrowed(value));
    }
    let mut characters = digits.chars().peekable();
    decimal_digit(*characters.peek()?)?;
    let mut normalized = String::with_capacity(value.len());
    if negative {
        normalized.push('-');
    }
    let prefix = usize::from(negative);
    let mut previous_digit = false;
    while let Some(character) = characters.next() {
        if let Some(digit) = decimal_digit(character) {
            if digit != 0 || normalized.len() > prefix {
                normalized.push(char::from(b'0' + digit));
            }
            previous_digit = true;
        } else if character == '_'
            && previous_digit
            && characters
                .peek()
                .is_some_and(|next| decimal_digit(*next).is_some())
        {
            previous_digit = false;
        } else {
            return None;
        }
    }
    if normalized.len() == prefix {
        normalized.clear();
        normalized.push('0');
    }
    Some(Cow::Owned(normalized))
}

fn python_float(value: &str) -> Option<f64> {
    let value = py_strip(value);
    if value.is_empty() {
        return None;
    }
    let bytes = value.as_bytes();
    let start = if bytes
        .first()
        .is_some_and(|byte| matches!(*byte, b'+' | b'-'))
    {
        1
    } else {
        0
    };
    if start < bytes.len() {
        let special = &value[start..];
        if special.eq_ignore_ascii_case("inf") || special.eq_ignore_ascii_case("infinity") {
            return Some(if bytes.first() == Some(&b'-') {
                f64::NEG_INFINITY
            } else {
                f64::INFINITY
            });
        }
        if special.eq_ignore_ascii_case("nan") {
            return Some(f64::NAN);
        }
    }

    if value.is_ascii() && !value.contains('_') {
        return value.parse().ok();
    }
    let mut normalized = String::with_capacity(value.len());
    let mut characters = value.chars().peekable();
    let mut previous_digit = false;
    while let Some(character) = characters.next() {
        if character == '_' {
            if !previous_digit
                || !characters
                    .peek()
                    .is_some_and(|next| decimal_digit(*next).is_some())
            {
                return None;
            }
            previous_digit = false;
        } else if let Some(digit) = decimal_digit(character) {
            normalized.push(char::from(b'0' + digit));
            previous_digit = true;
        } else if character.is_ascii() {
            normalized.push(character);
            previous_digit = false;
        } else {
            return None;
        }
    }
    normalized.parse().ok()
}

/// Parse an integer as Python's `int(float(str(value).replace(",", "")))` helper does.
pub fn safe_int(value: &Value) -> Option<i64> {
    if value.is_null() || matches!(value, Value::String(text) if text.is_empty()) {
        return None;
    }
    let normalized = py_string(value).replace(',', "");
    let number = python_float(&normalized)?;
    if !number.is_finite() {
        return None;
    }
    let truncated = number.trunc();
    const I64_BOUNDARY: f64 = 9_223_372_036_854_775_808.0;
    if truncated < -I64_BOUNDARY || truncated >= I64_BOUNDARY {
        None
    } else {
        Some(truncated as i64)
    }
}

/// Convert a JSON value using Python's `float(value)` boolean and string behavior.
pub fn as_number(value: &Value, fallback: f64) -> f64 {
    match value {
        Value::Bool(value) => {
            if *value {
                1.0
            } else {
                0.0
            }
        }
        Value::Number(value) => value.as_f64().unwrap_or(fallback),
        Value::String(value) => python_float(value).unwrap_or(fallback),
        _ => fallback,
    }
}

/// Promote protocol-relative and HTTP URLs to HTTPS, preserving all other input.
pub fn https_url(value: &str) -> String {
    let text = py_strip(value);
    if text.starts_with("//") {
        format!("https:{text}")
    } else if let Some(rest) = text.strip_prefix("http://") {
        format!("https://{rest}")
    } else {
        text.to_owned()
    }
}

/// Return Python's SequenceMatcher ratio for already-normalized ASCII titles.
///
/// Matching-block behavior follows CPython `difflib.SequenceMatcher` (Python Software
/// Foundation License 2.0); only the fixed-alphabet indexing and reusable work buffers differ.
pub fn sequence_ratio(a: &str, b: &str) -> f64 {
    let a = a.as_bytes();
    let b = b.as_bytes();
    let total = a.len() + b.len();
    if total == 0 {
        return 1.0;
    }

    const NONE: usize = usize::MAX;
    let mut counts = [0_usize; 256];
    for byte in b {
        counts[usize::from(*byte)] += 1;
    }
    let mut popular = [false; 256];
    if b.len() >= 200 {
        let threshold = b.len() / 100 + 1;
        for (byte, count) in counts.iter().copied().enumerate() {
            popular[byte] = count > threshold;
        }
    }

    let mut heads = [NONE; 256];
    let mut next = vec![NONE; b.len()];
    for index in (0..b.len()).rev() {
        let byte = usize::from(b[index]);
        if !popular[byte] {
            next[index] = heads[byte];
            heads[byte] = index;
        }
    }

    let mut previous = vec![0_usize; b.len()];
    let mut current = vec![0_usize; b.len()];
    let mut previous_positions = Vec::new();
    let mut current_positions = Vec::new();
    let mut pending = vec![(0, a.len(), 0, b.len())];
    let mut matching = 0_usize;

    while let Some((a_low, a_high, b_low, b_high)) = pending.pop() {
        let (match_a, match_b, match_len) = longest_ascii_match(
            a,
            b,
            a_low,
            a_high,
            b_low,
            b_high,
            &heads,
            &next,
            &popular,
            &mut previous,
            &mut current,
            &mut previous_positions,
            &mut current_positions,
        );
        if match_len == 0 {
            continue;
        }
        matching += match_len;
        if a_low < match_a && b_low < match_b {
            pending.push((a_low, match_a, b_low, match_b));
        }
        let match_a_end = match_a + match_len;
        let match_b_end = match_b + match_len;
        if match_a_end < a_high && match_b_end < b_high {
            pending.push((match_a_end, a_high, match_b_end, b_high));
        }
    }

    2.0 * matching as f64 / total as f64
}

#[allow(clippy::too_many_arguments)]
fn longest_ascii_match(
    a: &[u8],
    b: &[u8],
    a_low: usize,
    a_high: usize,
    b_low: usize,
    b_high: usize,
    heads: &[usize; 256],
    next: &[usize],
    popular: &[bool; 256],
    previous: &mut Vec<usize>,
    current: &mut Vec<usize>,
    previous_positions: &mut Vec<usize>,
    current_positions: &mut Vec<usize>,
) -> (usize, usize, usize) {
    for index in previous_positions.drain(..) {
        previous[index] = 0;
    }
    for index in current_positions.drain(..) {
        current[index] = 0;
    }

    let mut best_a = a_low;
    let mut best_b = b_low;
    let mut best_len = 0;
    for a_index in a_low..a_high {
        for index in current_positions.drain(..) {
            current[index] = 0;
        }
        let byte = usize::from(a[a_index]);
        if !popular[byte] {
            let mut b_index = heads[byte];
            while b_index != usize::MAX {
                if b_index >= b_high {
                    break;
                }
                if b_index >= b_low {
                    let size = if b_index == 0 {
                        1
                    } else {
                        previous[b_index - 1] + 1
                    };
                    current[b_index] = size;
                    current_positions.push(b_index);
                    if size > best_len {
                        best_a = a_index + 1 - size;
                        best_b = b_index + 1 - size;
                        best_len = size;
                    }
                }
                b_index = next[b_index];
            }
        }
        std::mem::swap(previous, current);
        std::mem::swap(previous_positions, current_positions);
    }

    while best_a > a_low && best_b > b_low && a[best_a - 1] == b[best_b - 1] {
        best_a -= 1;
        best_b -= 1;
        best_len += 1;
    }
    while best_a + best_len < a_high
        && best_b + best_len < b_high
        && a[best_a + best_len] == b[best_b + best_len]
    {
        best_len += 1;
    }

    for index in previous_positions.drain(..) {
        previous[index] = 0;
    }
    for index in current_positions.drain(..) {
        current[index] = 0;
    }
    (best_a, best_b, best_len)
}

/// Match Python truthiness for JSON values.
pub fn py_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => value.as_f64().is_none_or(|number| number != 0.0),
        Value::String(value) => !value.is_empty(),
        Value::Array(value) => !value.is_empty(),
        Value::Object(value) => !value.is_empty(),
    }
}

/// Render JSON values using Python's string conventions for scalars and containers.
pub fn py_string(value: &Value) -> String {
    match value {
        Value::Null => "None".to_owned(),
        Value::Bool(true) => "True".to_owned(),
        Value::Bool(false) => "False".to_owned(),
        Value::Number(value) => value.to_string(),
        Value::String(value) => value.clone(),
        Value::Array(values) => {
            let mut output = String::from("[");
            for (index, value) in values.iter().enumerate() {
                if index != 0 {
                    output.push_str(", ");
                }
                append_python_repr(value, &mut output);
            }
            output.push(']');
            output
        }
        Value::Object(values) => {
            let mut output = String::from("{");
            for (index, (key, value)) in values.iter().enumerate() {
                if index != 0 {
                    output.push_str(", ");
                }
                append_python_string_repr(key, &mut output);
                output.push_str(": ");
                append_python_repr(value, &mut output);
            }
            output.push('}');
            output
        }
    }
}

fn append_python_repr(value: &Value, output: &mut String) {
    if let Value::String(value) = value {
        append_python_string_repr(value, output);
    } else {
        output.push_str(&py_string(value));
    }
}

fn append_python_string_repr(value: &str, output: &mut String) {
    let quote = if value.contains('\'') && !value.contains('"') {
        '"'
    } else {
        '\''
    };
    output.push(quote);
    for ch in value.chars() {
        match ch {
            '\\' => output.push_str("\\\\"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            ch if ch == quote => {
                output.push('\\');
                output.push(ch);
            }
            ch if ch.is_control() => {
                use std::fmt::Write as _;
                if u32::from(ch) <= 0xff {
                    write!(output, "\\x{:02x}", u32::from(ch)).expect("writing to String");
                } else {
                    write!(output, "\\u{{{:x}}}", u32::from(ch)).expect("writing to String");
                }
            }
            ch => output.push(ch),
        }
    }
    output.push(quote);
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn unicode_keys_keep_full_folding_and_modern_case_pairs() {
        assert_eq!(casefold("Straße Σς ᲐᲑ ꭰ"), "strasse σσ აბ Ꭰ");
        assert_eq!(
            casefold("\u{10570}\u{10d50}\u{16e40}"),
            "\u{10597}\u{10d70}\u{16e60}"
        );
        assert_eq!(casefold("\u{a7ce}\u{16ea0}"), "\u{a7ce}\u{16ea0}");
    }

    #[test]
    fn entity_decoding_matches_oracle_and_is_single_pass() {
        for (source, expected) in [
            ("&notit;", "¬it;"),
            ("&amp;amp;", "&amp;"),
            ("&#x80; &#128; &#0; &#xD800; &#x110000;", "€ € � � �"),
            (
                "&CounterClockwiseContourIntegral; &notin &notin;",
                "∳ ¬in ∉",
            ),
            ("&copy text &copycat &acE;", "© text ©cat ∾̳"),
            ("&#13; &#11; &#x81;", "\r  \u{81}"),
        ] {
            assert_eq!(decode_html_entities(source).as_ref(), expected);
        }
        let literal = "no entities here";
        assert!(matches!(decode_html_entities(literal), Cow::Borrowed(_)));
    }

    #[test]
    fn title_normalization_matches_oracle_and_preserves_load_bearing_markers() {
        for (source, expected) in [
            ("The HD", "hd"),
            ("Straße: Ultimate Edition [USA]", "strasse"),
            ("Pokémon™ (Switch)", "pok mon"),
            ("The An A", "the an a"),
            ("James Bond 007: Blood Stone", "james bond 007 blood stone"),
            ("&notit;", "it"),
            ("Prototype", "prototype"),
            ("Prototype 2", "prototype 2"),
            ("Prototype Demo", "prototype demo"),
            ("1942 [USA]", "1942"),
            ("The Last of Us Part I Remastered", "last of us part i"),
            (
                "Warhammer 40,000: Space Marine Demo",
                "warhammer 40 000 space marine",
            ),
            ("1942 USA", "1942 usa"),
        ] {
            assert_eq!(normalise_match_title(source), expected, "{source}");
        }
    }

    #[test]
    fn steam_and_ign_matching_helpers_keep_variant_and_numeric_guards() {
        for (candidate, query) in [
            ("Prototype", "Prototype"),
            ("Test Drive Unlimited", "Test Drive Unlimited"),
            ("Worms Armageddon Pack", "Worms Armageddon Pack"),
            ("Server Simulator", "Server Simulator"),
            ("Space Marine Demo", "Space Marine Demo"),
        ] {
            assert!(!is_non_primary_steam_title(candidate, query));
        }
        for (candidate, query) in [
            ("Prototype Demo", "Prototype"),
            (
                "Warhammer 40,000: Space Marine Demo",
                "Warhammer 40,000: Space Marine",
            ),
            ("Sonic Mega Pack", "Sonic"),
            ("Rust Dedicated Server", "Rust"),
            ("Test Drive Unlimited", "Drive Unlimited"),
        ] {
            assert!(is_non_primary_steam_title(candidate, query));
        }
        assert!(is_non_primary_steam_title("Prototype", ""));
        assert!(!distinctive_tokens_present(
            "assassin s creed valhalla",
            "assassin s creed director s cut"
        ));
        assert!(distinctive_tokens_present(
            "warhammer 40 000 space marine",
            "warhammer 40 000 space marine anniversary"
        ));
        assert!(!ign_title_acceptable("Prototype 2", "Prototype"));
        assert!(!ign_title_acceptable(
            "Assassin's Creed: Director's Cut",
            "Assassin's Creed Valhalla"
        ));
        assert!(!ign_title_acceptable(
            "Wobbly Life",
            "Totally Reliable Delivery Service"
        ));
        assert!(ign_title_acceptable("Wobbly Life", "Wobbly Life"));
        assert!(ign_title_acceptable(
            "Assassin's Creed: Director's Cut",
            "Assassin's Creed Director's Cut Edition"
        ));
    }

    #[test]
    fn reasonable_match_uses_query_token_overlap_threshold() {
        assert!(reasonable_match("a b c d e f g h i j", "a b c d e f z"));
        assert!(!reasonable_match("a b c d e f g h i j k", "a b c d e f z"));
        assert!(reasonable_match("Wobbly Life", "Wobbly Life Deluxe"));
        assert!(!reasonable_match("!!!", "???"));
    }

    #[test]
    fn platform_and_console_suffix_checks_match_ign_preferences() {
        for platform in [
            "pc",
            "Windows",
            "linux",
            "Mac",
            "macintosh",
            "SteamOS",
            "steam-deck",
            "Steam Deck",
            "windows-pc",
        ] {
            assert!(has_pc_platform(&[platform.to_owned()]));
        }
        assert!(!has_pc_platform(&[
            "nintendo-ds".into(),
            "playstation-5".into()
        ]));
        assert!(!has_pc_platform(&[]));
        for (title, expected) in [
            ("Game [DS]", Some("DS")),
            ("Game (Xbox 360)", Some("Xbox 360")),
            ("Game [PS Vita]", Some("PS Vita")),
            ("Wobbly Life", None),
            ("Game [A Dark Subtitle]", None),
            ("Game [DS] Definitive Edition", None),
        ] {
            assert_eq!(console_title_suffix(title).as_deref(), expected);
        }
    }

    #[test]
    fn html_cleanup_separates_plain_text_and_provider_markup() {
        assert_eq!(
            clean_html_text("<p>One</p><br/>Two &amp;lt;").as_str(),
            "One\n\nTwo &lt;"
        );
        assert_eq!(
            normalize_description_text("literal &amp; <tag>\r\nline\r"),
            "literal &amp; <tag>\nline\n"
        );
        assert_eq!(
            description_html_to_text(
                "<h2>Flight</h2><div>Fly &lt;pilot&gt;</div><ul><li>First</li><li>Second</li></ul>"
            ),
            "Flight\n\nFly <pilot>\n\n- First\n- Second"
        );
        assert_eq!(
            description_html_to_text(
                "<ul><li></li><li><img src='cover.png'></li><li>&nbsp;</li></ul>"
            ),
            ""
        );
        assert_eq!(
            description_html_to_text("<ul><li><ul><li><img src='cover.png'></li></ul></li></ul>"),
            ""
        );
        assert_eq!(
            description_html_to_text(
                "<ul><li><p>First</p><ul><li></li><li>Nested</li></ul></li><li>Last</li></ul>"
            ),
            "- First\n\n- Nested\n\n- Last"
        );
        assert_eq!(
            description_html_to_text("<ul><li><ul><li>Nested</ul></ul>"),
            "- Nested"
        );
        assert_eq!(
            description_html_to_text("<script>gone</script><style>also gone</style><p>kept</p>"),
            "kept"
        );
        assert_eq!(
            description_html_to_text("<p>&amp;lt;one&amp;gt;</p>"),
            "&lt;one&gt;"
        );
    }

    #[test]
    fn implicit_html_list_closures_keep_nested_items_distinct() {
        for (source, expected) in [
            ("<ul><li></ul>", ""),
            ("<ul><li><img src='cover.png'></ul>", ""),
            ("<ul><li><img src='cover.png'><li>&nbsp;</ul>", ""),
            ("<ul><li><img src='cover.png'><li>Real<li></ul>", "- Real"),
            ("<ul><li><ul><li>Nested</ul></ul>", "- Nested"),
            (
                "<ul><li>Parent<ul><li><img src='cover.png'><li>Nested</ul><li>Last</ul>",
                "- Parent\n\n- Nested\n\n- Last",
            ),
        ] {
            assert_eq!(description_html_to_text(source), expected, "{source}");
        }
    }

    #[test]
    fn date_normalization_is_strict_and_calendar_preserving() {
        for source in [
            "Apr 18, 2011",
            "18 Apr, 2011",
            "April 18, 2011",
            "18 April, 2011",
        ] {
            assert_eq!(
                normalize_release_date(&json!(source)).as_deref(),
                Some("2011-04-18")
            );
        }
        assert_eq!(
            normalize_release_date(&json!("2024-03-10T00:00:00+14:00")).as_deref(),
            Some("2024-03-10")
        );
        assert_eq!(
            normalize_release_date(&json!("2024-02-29")).as_deref(),
            Some("2024-02-29")
        );
        for invalid in [
            "2024-02-30",
            "2023-02-29",
            "Apr 2011",
            "2011",
            "Coming soon",
            "",
        ] {
            assert_eq!(normalize_release_date(&json!(invalid)), None, "{invalid}");
        }
        assert_eq!(normalize_release_date(&json!(1710057600)), None);
        assert_eq!(normalize_release_date(&json!(true)), None);
        assert_eq!(normalize_release_date(&Value::Null), None);
    }

    #[test]
    fn number_helpers_preserve_python_bool_and_ties_even_behavior() {
        assert_eq!(rating_to_percent(&json!(4.25)), Some(42));
        assert_eq!(rating_to_percent(&json!(4.75)), Some(48));
        assert_eq!(rating_to_percent(&json!(true)), Some(10));
        assert_eq!(safe_int(&json!("٢_٩")), Some(29));
        assert_eq!(as_number(&json!("٣.٥"), -1.0), 3.5);
        assert_eq!(rating_to_percent(&json!(false)), Some(0));
        assert_eq!(rating_to_percent(&json!(101)), Some(100));
        assert_eq!(rating_to_percent(&json!(-1)), Some(0));
        assert_eq!(rating_to_percent(&json!("not a rating")), None);
        assert_eq!(safe_int(&json!("-1,234.9")), Some(-1234));
        assert_eq!(safe_int(&json!("1_234.9")), Some(1234));
        assert_eq!(safe_int(&json!(true)), None);
        assert_eq!(safe_int(&json!(null)), None);
        assert_eq!(safe_int(&json!("")), None);
        assert_eq!(as_number(&json!(true), -1.0), 1.0);
        assert_eq!(as_number(&json!(false), -1.0), 0.0);
        assert_eq!(as_number(&json!("2.5"), -1.0), 2.5);
        assert_eq!(as_number(&json!(null), -1.0), -1.0);
    }

    #[test]
    fn title_and_url_cleanup_keep_expected_literal_boundaries() {
        assert_eq!(
            clean_game_title("  The Witcher™ &amp; World  "),
            "The Witcher & World"
        );
        assert_eq!(https_url(" //example.test/a "), "https://example.test/a");
        assert_eq!(https_url("http://example.test/a"), "https://example.test/a");
        assert_eq!(https_url("HTTP://example.test/a"), "HTTP://example.test/a");
    }

    #[test]
    fn sequence_ratio_matches_python_fixtures_and_popular_element_edges() {
        for (a, b, expected) in [
            ("ababab", "abacab", 0.8333333333333334),
            ("", "", 1.0),
            ("abc", "bca", 0.6666666666666666),
            ("one two three", "one three two", 0.6923076923076923),
        ] {
            assert!(
                (sequence_ratio(a, b) - expected).abs() < 1e-15,
                "{a:?} vs {b:?}"
            );
        }
        let below = format!("x{}", "a".repeat(198));
        let below_candidate = format!("y{}", "a".repeat(198));
        assert!(sequence_ratio(&below, &below_candidate) > 0.99);
        let leading = format!("{}x", "a".repeat(210));
        let leading_candidate = format!("{}y", "a".repeat(210));
        assert!((sequence_ratio(&leading, &leading_candidate) - 420.0 / 422.0).abs() < 1e-15);
        let trailing = format!("x{}", "a".repeat(210));
        let trailing_candidate = format!("y{}", "a".repeat(210));
        assert_eq!(sequence_ratio(&trailing, &trailing_candidate), 0.0);
    }

    #[test]
    fn json_truthiness_and_stringification_follow_python_scalars() {
        assert!(!py_truthy(&Value::Null));
        assert!(!py_truthy(&json!(false)));
        assert!(!py_truthy(&json!(0)));
        assert!(!py_truthy(&json!("")));
        assert!(!py_truthy(&json!([])));
        assert!(!py_truthy(&json!({})));
        assert!(py_truthy(&json!("0")));
        assert!(py_truthy(&json!([0])));
        assert_eq!(py_string(&Value::Null), "None");
        assert_eq!(py_string(&json!(true)), "True");
        assert_eq!(py_string(&json!([null, "x"])), "[None, 'x']");
    }
}
