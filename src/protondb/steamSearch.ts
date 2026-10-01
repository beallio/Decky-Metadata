import { fetchNoCors } from '@decky/api'
import { normaliseMatchTitle, nonPrimaryMarkers } from './matchTitle'

const SEARCH_URL = 'https://store.steampowered.com/api/storesearch/'
const FETCH_TIMEOUT_MS = 2000

const ALGOLIA_APPLICATION_ID = '94HE6YATEI'
const ALGOLIA_SEARCH_KEY = '9ba0e69fb2974316cdaec8f5f257088f'
const ALGOLIA_SEARCH_URL =
  'https://94he6yatei-dsn.algolia.net/1/indexes/steamdb/query'

type AlgoliaSearchItem = {
  name?: unknown
  objectID?: unknown
}

type StoreSearchItem = {
  type?: string
  name?: string
  id?: number
}

async function fetchWithTimeout(
  fetchPromise: Promise<Response>,
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
  })
  return Promise.race([fetchPromise, timeoutPromise])
}

async function findAlgoliaAppIdByName(
  gameName: string,
  query: string,
  queryMarkers: Set<string>
): Promise<string | null> {
  const res = await fetchWithTimeout(
    fetchNoCors(ALGOLIA_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Algolia-Application-Id': ALGOLIA_APPLICATION_ID,
        'X-Algolia-API-Key': ALGOLIA_SEARCH_KEY,
        Origin: 'https://www.protondb.com',
        Referer: 'https://www.protondb.com/'
      },
      body: JSON.stringify({
        query: gameName,
        facetFilters: [['appType:Game']],
        restrictSearchableAttributes: ['name'],
        attributesToRetrieve: ['name', 'objectID'],
        attributesToHighlight: [],
        attributesToSnippet: [],
        hitsPerPage: 10
      })
    })
  )
  if (res.status !== 200) return null
  const hits = (await res.json())?.hits
  if (!Array.isArray(hits)) return null
  const match = (hits as AlgoliaSearchItem[]).find(
    (item) =>
      typeof item?.name === 'string' &&
      typeof item.objectID === 'string' &&
      /^[1-9]\d*$/.test(item.objectID) &&
      normaliseMatchTitle(item.name) === query &&
      nonPrimaryMarkers(item.name).every((marker) => queryMarkers.has(marker))
  )
  return typeof match?.objectID === 'string' ? match.objectID : null
}

/**
 * Resolve a non-Steam shortcut name to a Steam app ID.
 *
 * Uses the store search endpoint rather than the community autocomplete: it
 * returns full store titles ("Assassin's Creed™: Director's Cut Edition")
 * where the autocomplete only returns short ones ("Assassin's Creed"), so
 * more shortcuts normalise onto a candidate. Results are pinned to English so
 * the candidate names match what normaliseMatchTitle expects.
 * If Steam returns no acceptable match, try ProtonDB's SteamDB title index.
 * Transport errors do not trigger the fallback.
 */
export async function findSteamAppIdByName(
  gameName: string
): Promise<string | null> {
  const query = normaliseMatchTitle(gameName)
  if (!query) return null
  const queryMarkers = new Set(nonPrimaryMarkers(gameName))

  try {
    const params = new URLSearchParams({
      term: gameName,
      cc: 'US',
      l: 'english'
    })
    const res = await fetchWithTimeout(
      fetchNoCors(`${SEARCH_URL}?${params.toString()}`, { method: 'GET' })
    )

    if (res.status === 200) {
      const items = (await res.json())?.items
      if (!Array.isArray(items)) return null
      const match = (items as StoreSearchItem[]).find(
        (item) =>
          item?.type === 'app' &&
          item?.name &&
          normaliseMatchTitle(item.name) === query &&
          nonPrimaryMarkers(item.name).every((marker) =>
            queryMarkers.has(marker)
          )
      )
      if (typeof match?.id === 'number') return String(match.id)
      return await findAlgoliaAppIdByName(gameName, query, queryMarkers)
    }
  } catch (error) {
    console.error(error)
  }
  return null
}
