let verbose = false;

export const setVerboseLogging = (enabled: boolean) => {
  verbose = !!enabled;
};

const prefix = (area: string) => `[Playhub Metadata][${area}]`;

export const debug = (area: string, message: string, ...args: unknown[]) => {
  if (verbose) console.debug(prefix(area), message, ...args);
};

export const info = (area: string, message: string, ...args: unknown[]) => {
  if (verbose) console.info(prefix(area), message, ...args);
};

export const warn = (area: string, message: string, ...args: unknown[]) => {
  console.warn(prefix(area), message, ...args);
};

export const error = (area: string, message: string, ...args: unknown[]) => {
  console.error(prefix(area), message, ...args);
};
