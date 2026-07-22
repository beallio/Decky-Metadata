/*
 * Decky Metadata - library context-menu integration.
 *
 * Adds a single "Decky metadata..." entry to the per-game context menu in
 * the Steam library, for non-Steam shortcuts.
 *
 * The technique used here to resolve and patch Steam's internal
 * LibraryContextMenu class is derived from the decky-steamgriddb plugin by the
 * SteamGridDB project (https://github.com/SteamGridDB/decky-steamgriddb),
 * which is licensed under the GNU General Public License v3. Because this file
 * is a derivative of that work, Decky Metadata is distributed under the
 * GPL-3.0-or-later license. Full credit to the original authors.
 *
 * Copyright (C) 2026 ZazaMastro
 * Portions copyright (C) the SteamGridDB / decky-steamgriddb contributors.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version. This program is distributed WITHOUT ANY WARRANTY; see the
 * GNU General Public License for more details.
 */

import {
  afterPatch,
  fakeRenderComponent,
  findInReactTree,
  findInTree,
  findModuleByExport,
  Export,
  MenuItem,
  Navigation,
  Patch,
} from "@decky/ui";
import { FC } from "react";

import {
  getOverview,
  isNonSteamApp,
  patchInstallStatus,
  hasSteamInternals,
} from "./steam/core";
import * as log from "./log";
import { frontendLog } from "./backend";

// Stable keys for the entries we inject, so we can find and de-duplicate them.
const ENTRY_KEY = "decky-metadata-edit";
const ENTRY_KEYS = new Set([ENTRY_KEY]);

let contextMenuTraceEnabled = false;
export const setContextMenuTraceEnabled = (enabled: boolean) => {
  contextMenuTraceEnabled = enabled;
};

const hasAppPropertiesHelper = (items: any[]): boolean => {
  if (!Array.isArray(items) || items.length === 0) return false;
  return !!findInReactTree(
    items,
    (node) => node?.onSelected?.toString?.().includes("AppProperties")
  );
};

const traceMenu = (
  phase: "first-render" | "should-update" | "outer-rerender",
  ownerAppId: number,
  fallbackAppId: number,
  finalAppId: number,
  isGameMenu: boolean,
  hasAppProperties: boolean,
  hasLaunchSource: boolean,
  removedExisting: boolean,
  insertedOrSkipped: boolean | string,
  items: any[]
) => {
  if (!contextMenuTraceEnabled) return;
  try {
    const snippets = (Array.isArray(items) ? items : [])
      .slice(0, 5)
      .map((node: any) => ({
        key: node?.key,
        text: typeof node?.props?.children === "string" ? node.props.children : undefined,
      }));
    frontendLog("trace", "context-menu", {
      phase,
      ownerAppId,
      fallbackAppId,
      finalAppId,
      isGameContextMenu: isGameMenu,
      hasAppProperties,
      hasLaunchSource,
      removedExisting,
      insertedOrSkipped,
      snippets,
    }).catch(() => undefined);
  } catch (_e) {}
};


/**
 * Resolve Steam's internal LibraryContextMenu class at runtime.
 *
 * The class is not exported, so we locate the webpack module that references
 * it, pick the member whose source mentions "navigator:", and read the type
 * back from a throwaway render.
 */
const resolveLibraryContextMenu = (): any => {
  const owningModule = findModuleByExport(
    (member: Export) =>
      typeof member?.toString === "function" &&
      member.toString().includes("().LibraryContextMenu")
  );

  const menuComponent = Object.values(owningModule).find(
    (member) =>
      typeof member?.toString === "function" &&
      member.toString().includes("navigator:")
  ) as FC;

  return fakeRenderComponent(menuComponent).type;
};

export const LibraryContextMenu = resolveLibraryContextMenu();

/**
 * Work out which appid the menu is really for.
 *
 * Steam reuses context-menu instances, so the appid passed in can be stale.
 * Prefer a fresh appid carried on the owning React node; otherwise scan the
 * node tree for an `app.appid` (used by newer Steam clients).
 */
const resolveAppId = (nodes: any[], fallbackAppId: number): number => {
  const fresherNode = (nodes || []).find(
    (node: any) =>
      node?._owner?.pendingProps?.overview?.appid &&
      node._owner.pendingProps.overview.appid !== fallbackAppId
  );
  if (fresherNode) {
    return Number(fresherNode._owner.pendingProps.overview.appid);
  }

  const taggedNode = findInTree(nodes, (node) => node?.app?.appid, {
    walkable: ["props", "children"],
  });
  return Number(taggedNode?.app?.appid ?? fallbackAppId);
};

/**
 * True only for the per-game context menu. Its launch action's handler
 * references "launchSource"; menus like the screenshot menu do not, which
 * lets us ignore them.
 */
const isGameContextMenu = (items: any[]): boolean => {
  if (!Array.isArray(items) || items.length === 0) return false;
  return !!findInReactTree(
    items,
    (node) => node?.props?.onSelected?.toString?.().includes("launchSource")
  );
};

/** Remove any previously injected entry so re-renders cannot stack copies. */
const removeOurEntry = (items: any[]): boolean => {
  let removed = false;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (ENTRY_KEYS.has(items[index]?.key)) {
      items.splice(index, 1);
      removed = true;
    }
  }
  return removed;
};

/** Insert our entry just above "Properties..." (or at the end) for shortcuts. */
const insertOurEntry = (items: any[], appId: number): boolean => {
  if (!isNonSteamApp(getOverview(appId))) return false;

  const propertiesIndex = items.findIndex((node) =>
    findInReactTree(
      node,
      (x) => x?.onSelected?.toString?.().includes("AppProperties")
    )
  );
  const insertAt = propertiesIndex >= 0 ? propertiesIndex : items.length;

  items.splice(
    insertAt,
    0,
    <MenuItem
      key={ENTRY_KEY}
      onSelected={() => Navigation.Navigate(`/decky-metadata/${appId}`)}
    >
      {"Decky metadata..."}
    </MenuItem>
  );
  return true;
};

const syncOurEntry = (
  phase: "first-render" | "should-update" | "outer-rerender",
  items: any[],
  ownerAppId: number,
  fallbackAppId: number
): void => {
  const removed = removeOurEntry(items);
  const isGameMenu = isGameContextMenu(items);
  const hasAppProps = hasAppPropertiesHelper(items);

  let inserted: boolean | string = "skipped";
  let finalAppId = 0;

  if (!isGameMenu) {
    inserted = "skipped-not-top-level";
  } else if (ownerAppId > 0) {
    finalAppId = ownerAppId;
    inserted = "owner-app-id";
  } else if (fallbackAppId > 0) {
    if (hasAppProps) {
      finalAppId = fallbackAppId;
      inserted = "fallback-app-id";
    } else {
      inserted = "skipped-incomplete-shape";
    }
  } else {
    inserted = "skipped-no-valid-appid";
  }

  if (finalAppId > 0) {
    const actuallyInserted = insertOurEntry(items, finalAppId);
    if (!actuallyInserted) {
      inserted = "skipped-not-non-steam";
    }
  }

  traceMenu(
    phase,
    ownerAppId,
    fallbackAppId,
    finalAppId,
    isGameMenu,
    hasAppProps,
    isGameMenu,
    removed,
    inserted,
    items
  );
};

/**
 * Patch the library context menu so non-Steam games gain a Decky Metadata entry.
 * @param LibraryContextMenuClass The resolved menu class.
 * @returns An object exposing unpatch() for plugin teardown.
 */
const contextMenuPatch = (LibraryContextMenuClass: any) => {
  if (!LibraryContextMenuClass || !hasSteamInternals()) {
    if (patchInstallStatus.contextMenu === "pending") {
      patchInstallStatus.contextMenu = "skipped-missing-internal";
      log.warn("patch", "context menu patch skipped", { status: patchInstallStatus.contextMenu });
    }
    return { unpatch: () => {} };
  }

  let innerPatch: Patch | undefined;
  let outerPatch: Patch | undefined;

  // Steam reuses a single context-menu instance and installs the inner
  // (body) render patches only once. Those patches must read the appid of
  // whichever game is *currently* opening the menu, not the one captured on
  // first render, so keep the latest values in mutable holders that the outer
  // render refreshes on every open.
  let currentOwnerAppId = 0;
  let currentFallbackAppId = 0;

  try {
    outerPatch = afterPatch(
      LibraryContextMenuClass.prototype,
      "render",
    (_renderArgs: any[], menu: any) => {
      currentOwnerAppId = Number(
        menu?._owner?.pendingProps?.overview?.appid ?? 0
      );
      currentFallbackAppId = resolveAppId(menu?.props?.children ?? [], 0);

      if (!innerPatch) {
        innerPatch = afterPatch(menu, "type", (_typeArgs: any[], rendered: any) => {
          // First render of the menu body.
          afterPatch(
            rendered.type.prototype,
            "render",
            (_args: any[], output: any) => {
              const items = output?.props?.children?.[0];
              try {
                syncOurEntry("first-render", items, currentOwnerAppId, currentFallbackAppId);
              } catch (_error) {
                // Steam reshapes this tree often; skip on mismatch.
              }
              return output;
            }
          );

          // Subsequent updates when Steam refreshes the app overview.
          afterPatch(
            rendered.type.prototype,
            "shouldComponentUpdate",
            ([nextProps]: any[], shouldUpdate: boolean) => {
              try {
                if (shouldUpdate === true) {
                  syncOurEntry("should-update", nextProps.children, currentOwnerAppId, currentFallbackAppId);
                } else {
                  removeOurEntry(nextProps.children);
                }
              } catch (_error) {
                // Not our menu; leave the decision untouched.
              }
              return shouldUpdate;
            }
          );

          return rendered;
        });
      } else if (Array.isArray(menu?.props?.children)) {
        try {
          syncOurEntry("outer-rerender", menu.props.children, currentOwnerAppId, currentFallbackAppId);
        } catch (_error) {
          // Ignore non-matching menus.
        }
      }

      return menu;
    }
  );
  patchInstallStatus.contextMenu = "installed";
  log.info("patch", "context menu patch installed", { status: patchInstallStatus.contextMenu });
  } catch (error) {
    patchInstallStatus.contextMenu = "failed";
    log.warn("patch", "context menu patch failed", { status: patchInstallStatus.contextMenu }, error);
  }

  return {
    unpatch: () => {
      outerPatch?.unpatch();
      innerPatch?.unpatch();
    },
  };
};

export default contextMenuPatch;
