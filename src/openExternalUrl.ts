export const openExternalUrl = (url: string): void => {
  try {
    const steamClient = (window as any)?.SteamClient;
    if (steamClient?.System?.OpenInSystemBrowser) {
      steamClient.System.OpenInSystemBrowser(url);
      return;
    }
    if (steamClient?.Overlay?.OpenExternalBrowserURL) {
      steamClient.Overlay.OpenExternalBrowserURL(url);
      return;
    }
  } catch (_error) {
    // Fall back to the browser below.
  }
  window.open(url, "_blank", "noopener,noreferrer");
};
