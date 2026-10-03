const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  trade: '™',
  reg: '®',
  copy: '©'
}

function unescapeHtml(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const hex = entity[1] === 'x' || entity[1] === 'X'
      const code = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    return HTML_ENTITIES[entity.toLowerCase()] ?? match
  })
}

/**
 * Normalise a game title for comparison against Steam search results.
 *
 * Ported from Decky-Metadata's backend/matching.py:normalise_match_title.
 * Drops bracketed segments, articles, edition/remaster wording and region or
 * version tokens, then collapses everything that is not alphanumeric.
 *
 * Unlike the Python original, a removal that would leave the title with no
 * letters is skipped: "Prototype" and "Prototype 2" are games, not version
 * markers, and stripping the word leaves nothing to match on.
 */
const TITLE_REMOVALS = [
  /\b(?:the|a|an)\b/g,
  /\b(?:remaster(?:ed)?|hd|definitive|ultimate|complete|goty|edition)\b/g,
  /\b(?:usa|europe|eur|japan|jp|world|rev|revision|beta|proto|prototype|demo|sample|en|fr|de|es|it|pt|br|v\d+(?:\.\d+)*)\b/g
]

export function normaliseMatchTitle(title: string | undefined | null): string {
  let text = unescapeHtml(String(title ?? ''))
    .toLowerCase()
    .replace(/[\u2122\u00ae\u00a9]/g, '')
    .replace(/\[[^\]]+\]|\([^)]*\)/g, ' ')

  for (const removal of TITLE_REMOVALS) {
    const stripped = text.replace(removal, ' ')
    if (/[a-z]/.test(stripped)) {
      text = stripped
    }
  }

  return text
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Markers that identify a store entry as something other than the main game.
// Ported from Decky-Metadata's NON_PRIMARY_STEAM_TITLE_PATTERNS.
const NON_PRIMARY_PATTERNS = [
  /\bdemo\b/,
  /\bbeta\b/,
  /\bplaytest\b/,
  /\bprototype\b/,
  /\bsoundtrack\b/,
  /\bost\b/,
  /\bseason\s+pass\b/,
  /\bdlc\b/,
  /\bpack\b/,
  /\bbundle\b/,
  /\bartbook\b/,
  /\bart\s+book\b/,
  /\btrailer\b/,
  /\bdedicated\s+server\b/,
  /\bserver\b/,
  /\btest\b/
]

/**
 * Which "not the main game" markers a title carries.
 *
 * normaliseMatchTitle strips words like "demo" and "beta", so a demo entry can
 * normalise onto the base game's title. Comparing the markers of the query and
 * of the candidate keeps that apart, while still letting a title whose real
 * name contains a marker (Prototype, Test Drive) match itself.
 */
export function nonPrimaryMarkers(title: string | undefined | null): string[] {
  const text = unescapeHtml(String(title ?? '')).toLowerCase()
  return NON_PRIMARY_PATTERNS.filter((pattern) => pattern.test(text)).map(
    (pattern) => pattern.source
  )
}
