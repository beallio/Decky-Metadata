type SteamUiDocument = Pick<Document, "querySelector" | "querySelectorAll" | "defaultView">;

export const steamUiWindow = () => {
  const candidates: any[] = [globalThis];
  try {
    const currentWindow = globalThis as any;
    candidates.push(currentWindow.parent, currentWindow.top);
  } catch {
    // A cross-origin frame can still use its own Decky module bridge.
  }
  return candidates.find((candidate) =>
    candidate?.webpackChunksteamui || typeof candidate?.DFL?.findModuleChild === "function"
  ) ?? globalThis;
};

const steamUiDocuments = (): SteamUiDocument[] => {
  // SharedJSContext does not own Big Picture's DOM. Resolve the same SteamUI
  // host bridge for every consumer so cards and Game Info inspect one ordered,
  // deduplicated set of real browser documents.
  const contexts = new Set<any>([globalThis, steamUiWindow()]);
  try {
    const currentWindow = globalThis as any;
    contexts.add(currentWindow.parent);
    contexts.add(currentWindow.top);
  } catch {
    // A cross-origin parent can still leave the SteamUI/webpack bridge usable.
  }

  const documents = new Set<SteamUiDocument>();
  try {
    for (const context of contexts) {
      const windowStore = context?.SteamUIStore?.m_WindowStore;
      const browserWindows = [
        windowStore?.MainWindowInstance?.m_BrowserWindow,
        windowStore?.GamepadUIMainWindowInstance?.m_BrowserWindow,
      ];
      for (const browserWindow of browserWindows) {
        const document = browserWindow?.document;
        if (typeof document?.querySelector === "function") documents.add(document);
      }
    }
  } catch {
    // Continue with context documents when a Steam private field changes.
  }

  for (const context of contexts) {
    const document = context?.document;
    if (typeof document?.querySelector === "function") documents.add(document);
  }
  return Array.from(documents);
};

/** Find an element in Steam's real browser documents, not only Decky's global. */
export const findSteamUiDocumentMatch = <T>(finder: (document: SteamUiDocument) => T | undefined): T | undefined => {
  for (const document of steamUiDocuments()) {
    try {
      const match = finder(document);
      if (match !== undefined) return match;
    } catch {
      // Private DOM access is optional. Try the next known SteamUI document.
    }
  }
  return undefined;
};
