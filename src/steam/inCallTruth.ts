type InCallTruthState = {
  bypassCounter: number;
};

export const withInCallTruth = <T>(state: InCallTruthState, run: () => T): T => {
  const previous = state.bypassCounter;
  state.bypassCounter = -1;
  try {
    return run();
  } finally {
    state.bypassCounter = previous;
  }
};
