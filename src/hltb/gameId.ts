export function parseHltbGameId(input: string): number {
  const value = input.trim();
  let digits = value;
  if (!/^\d+$/.test(value)) {
    try {
      const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
      if (url.protocol !== "https:" || !/^(?:www\.)?howlongtobeat\.com$/i.test(url.hostname) || url.port || url.username || url.password) return 0;
      const match = /^\/game\/(\d+)(?:\/|$)/.exec(url.pathname);
      if (!match) return 0;
      digits = match[1];
    } catch {
      return 0;
    }
  }
  const id = Number(digits);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}
