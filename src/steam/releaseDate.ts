/** Project a calendar date into the running SteamUI JavaScript timezone.
 * The result belongs only to Steam's numeric overview contract, never storage.
 */
export const nativeReleaseDate = (value: string | null | undefined): number | undefined => {
  if (value === null) return 0;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1) return undefined;
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return Math.floor(date.getTime() / 1000);
};
