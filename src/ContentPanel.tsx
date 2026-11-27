import {
  Focusable,
  NavEntryPositionPreferences,
  PanelSection,
} from "@decky/ui";
import { useCallback, useEffect, useRef } from "react";

import { MetadataScanBody } from "./components/qam/MetadataSection";
import { QamInstallRow } from "./components/qam/QamActions";
import { currentSteamLanguage, refreshLanguage } from "./i18n";
import { metadataScanStore } from "./metadataScan";
import { scanView } from "./settings/scanView";
import { useScanGames } from "./settings/useScanGames";
import { SETTINGS_BUTTON_CLASS } from "./settingsRoute";
import { takeNativeFocus } from "./steam/nativeFocus";
import { qamPanelStyle } from "./styles";

const findScrollViewport = (element: HTMLElement): HTMLElement | null => {
  let node: HTMLElement | null = element.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
};

// About half a second at 60 fps before the panel takes the first focus instead.
const SETTINGS_FOCUS_FRAMES = 30;

export const Content = () => {
  // Steam can change its UI language while QAM is closed.
  useEffect(() => {
    void refreshLanguage();
  }, []);

  const focusFrame = useRef<number | null>(null);
  const initialPanelFocusComplete = useRef(false);
  const { games, loaded, scan } = useScanGames();

  const focusPanel = useCallback((element: HTMLDivElement | null) => {
    if (focusFrame.current !== null) {
      window.cancelAnimationFrame(focusFrame.current);
      focusFrame.current = null;
    }
    if (!element || initialPanelFocusComplete.current) return;
    let framesLeft = SETTINGS_FOCUS_FRAMES;
    const attempt = () => {
      focusFrame.current = null;
      if (initialPanelFocusComplete.current) return;
      // First focus goes to the Settings gear in the header. A fresh QAM window
      // registers it in Steam's navigation tree a few frames late; the panel is the fallback.
      const settingsButton = element.ownerDocument.querySelector?.(`.${SETTINGS_BUTTON_CLASS}`) ?? null;
      if (!takeNativeFocus(settingsButton)) {
        if (--framesLeft > 0) {
          focusFrame.current = window.requestAnimationFrame(attempt);
          return;
        }
        takeNativeFocus(element);
      }
      initialPanelFocusComplete.current = true;
      // Native focus can scroll QAM past its title. Keep the panel header
      // visible when the initial focus settles.
      const viewport = findScrollViewport(element);
      if (viewport) {
        window.requestAnimationFrame(() => {
          viewport.scrollTop = 0;
        });
      }
    };
    focusFrame.current = window.requestAnimationFrame(attempt);
  }, []);

  return (
    <Focusable
      ref={focusPanel}
      preferredFocus={true}
      navEntryPreferPosition={NavEntryPositionPreferences.PREFERRED_CHILD}
      style={qamPanelStyle}
    >
      {/* PanelSection gives the standard Decky side padding that other plugins' QAM pages have. */}
      <PanelSection>
        <MetadataScanBody
          {...scanView(scan)}
          detectedCount={games.length}
          savedCount={scan.savedCount}
          missingCount={scan.missingCount}
          onRefreshMetadata={() => void metadataScanStore.start(games, currentSteamLanguage)}
          listReady={loaded}
        />
        <QamInstallRow />
      </PanelSection>
    </Focusable>
  );
};
