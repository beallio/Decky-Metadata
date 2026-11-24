import {
  Focusable,
  getFocusNavController,
  getGamepadNavigationTrees,
  NavEntryPositionPreferences,
} from "@decky/ui";
import { useCallback, useEffect, useRef } from "react";

import { MetadataScanBody } from "./components/qam/MetadataSection";
import { OpenSettingsButton, QamInstallRow } from "./components/qam/QamActions";
import { currentSteamLanguage, refreshLanguage } from "./i18n";
import * as log from "./log";
import { metadataScanStore } from "./metadataScan";
import { scanView } from "./settings/scanView";
import { useScanGames } from "./settings/useScanGames";
import { qamPanelStyle } from "./styles";

type NativeFocusNode = {
  Element?: Element;
  m_rgChildren?: NativeFocusNode[];
  BTakeFocus?: () => boolean;
};

type NativeNavigationTree = {
  Root?: NativeFocusNode;
};

export const takeNativeFocus = (element: Element | null): boolean => {
  if (!element) return false;
  try {
    const ownerDocument = element.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    if (
      !ownerWindow
      || ownerWindow.closed
      || ownerWindow.document !== ownerDocument
      || ownerDocument.visibilityState !== "visible"
    ) return false;
    // Steam can leave the QAM context inactive while the panel is closed.
    // A focus node can then report success without painting gamepad focus.
    const focusNav = getFocusNavController();
    if (!focusNav?.m_ActiveContext && focusNav?.m_LastActiveContext) {
      focusNav.FindAnActiveContext?.();
    }
    const trees = (getGamepadNavigationTrees() || []) as NativeNavigationTree[];
    for (const tree of trees) {
      const pending = tree.Root ? [tree.Root] : [];
      while (pending.length) {
        const node = pending.pop();
        if (!node) continue;
        if (node.Element === element && typeof node.BTakeFocus === "function") {
          return Boolean(node.BTakeFocus());
        }
        if (Array.isArray(node.m_rgChildren)) {
          pending.push(...node.m_rgChildren);
        }
      }
    }
  } catch (error) {
    log.warn("qam", "preferred metadata focus unavailable", error);
  }
  return false;
};

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

export const Content = () => {
  // Steam can change its UI language while QAM is closed.
  useEffect(() => {
    void refreshLanguage();
  }, []);

  const focusFrame = useRef<number | null>(null);
  const initialPanelFocusComplete = useRef(false);
  const { games, scan } = useScanGames();

  const focusPanel = useCallback((element: HTMLDivElement | null) => {
    if (focusFrame.current !== null) {
      window.cancelAnimationFrame(focusFrame.current);
      focusFrame.current = null;
    }
    if (element && !initialPanelFocusComplete.current) {
      focusFrame.current = window.requestAnimationFrame(() => {
        focusFrame.current = null;
        if (initialPanelFocusComplete.current) return;
        initialPanelFocusComplete.current = true;
        takeNativeFocus(element);
        // Native focus can scroll QAM past its title. Keep the panel header
        // visible when the initial focus settles.
        const viewport = findScrollViewport(element);
        if (viewport) {
          window.requestAnimationFrame(() => {
            viewport.scrollTop = 0;
          });
        }
      });
    }
  }, []);

  return (
    <Focusable
      ref={focusPanel}
      preferredFocus={true}
      navEntryPreferPosition={NavEntryPositionPreferences.PREFERRED_CHILD}
      style={qamPanelStyle}
    >
      <MetadataScanBody
        {...scanView(scan)}
        detectedCount={games.length}
        savedCount={scan.savedCount}
        missingCount={scan.missingCount}
        onRefreshMetadata={() => void metadataScanStore.start(games, currentSteamLanguage)}
      />
      <QamInstallRow />
      <OpenSettingsButton />
    </Focusable>
  );
};
