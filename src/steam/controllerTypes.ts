import type {
  SteamControllerRecord,
  SteamControllerStoreBoundary,
  SteamInternals,
} from "../types";

export const STEAM_DECK_CONTROLLER_TYPE = 4;
export const LEGION_GO_S_CONTROLLER_TYPE = 102;
export const AFFLICTED_CONTROLLER_TYPES = new Set<number>([
  LEGION_GO_S_CONTROLLER_TYPE,
]);

type ControllerStoreSource = SteamControllerStoreBoundary | null;
type ControllerInternals = Pick<
  SteamInternals,
  "ControllerStore" | "controllerStore"
>;

const validControllerIndex = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const validControllerType = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const readControllerStore = (internals?: ControllerInternals | null): ControllerStoreSource => {
  const boundary = internals ?? (globalThis as unknown as ControllerInternals);
  const upper = boundary.ControllerStore;
  if (upper && typeof upper.GetControllers === "function") return upper;
  const lower = boundary.controllerStore;
  if (lower && typeof lower.GetControllers === "function") return lower;
  return null;
};

const extractControllers = (store?: ControllerStoreSource): readonly unknown[] | null => {
  if (!store) return null;
  if (typeof store.GetControllers !== "function") return null;
  let value: unknown;
  try {
    value = store.GetControllers();
  } catch (_error) {
    return null;
  }
  return Array.isArray(value) ? value : null;
};

const extractControllerType = (record: unknown): number | null => {
  if (record === null || typeof record !== "object") return null;
  const value = (record as SteamControllerRecord).eControllerType;
  return validControllerType(value) ? value : null;
};

const extractControllerIndex = (record: unknown): number | null => {
  if (record === null || typeof record !== "object") return null;
  const value = (record as SteamControllerRecord).nControllerIndex;
  return validControllerIndex(value) ? value : null;
};

const readControllerTypeAtIndex = (controllerIndex: number, rawControllers: readonly unknown[]): number | null => {
  for (const record of rawControllers) {
    const index = extractControllerIndex(record);
    if (index === null || index !== controllerIndex) continue;
    return extractControllerType(record);
  }
  return null;
};

export const controllerTypeForIndex = (
  controllerIndex: unknown,
  internals?: ControllerInternals | null,
): number | null => {
  if (!validControllerIndex(controllerIndex)) return null;
  let controllers: readonly unknown[] | null;
  try {
    controllers = extractControllers(readControllerStore(internals));
  } catch (_error) {
    return null;
  }
  if (!controllers) return null;
  return readControllerTypeAtIndex(controllerIndex, controllers);
};

export const getConnectedControllerTypes = (
  internals?: ControllerInternals | null,
): number[] => {
  const controllers = extractControllers(readControllerStore(internals));
  if (!controllers) return [];
  const values = new Set<number>();
  for (const record of controllers) {
    const type = extractControllerType(record);
    if (type === null) continue;
    values.add(type);
  }
  return Array.from(values).sort((left, right) => left - right);
};

export const sourceFilterForControllerType = (
  controllerType: number | null,
  requestedFilter: boolean,
): boolean => {
  if (!requestedFilter) return false;
  if (controllerType === null) return requestedFilter;
  return !AFFLICTED_CONTROLLER_TYPES.has(controllerType) && requestedFilter;
};

const KNOWN_CONTROLLER_TYPES = new Map<number, string>([
  [STEAM_DECK_CONTROLLER_TYPE, "Steam Deck"],
  [LEGION_GO_S_CONTROLLER_TYPE, "Legion Go S"],
]);

export const formatConnectedControllerTypes = (
  types: readonly number[] | undefined | null,
): string => {
  if (!Array.isArray(types)) return "Unknown";
  const sorted = Array.from(new Set(types.filter(validControllerType)))
    .sort((left, right) => left - right);
  if (sorted.length === 0) return "Unknown";
  const labels: string[] = [];
  for (const type of sorted) {
    const label = KNOWN_CONTROLLER_TYPES.get(type);
    labels.push(label === undefined ? `Type ${type}` : `${label} (${type})`);
  }
  return labels.join(", ");
};
