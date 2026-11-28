export const isNativeSteamAppId = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value < 0x80000000;
