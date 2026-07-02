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
} from "./steam";
import * as log from "./log";

// Stable keys for the entries we inject, so we can find and de-duplicate them.
const ENTRY_KEY = "playhub-metadata-edit";
const ENTRY_KEYS = new Set([ENTRY_KEY]);

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
const removeOurEntry = (items: any[]): void => {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (ENTRY_KEYS.has(items[index]?.key)) items.splice(index, 1);
  }
};

/** Insert our entry just above "Properties..." (or at the end) for shortcuts. */
const insertOurEntry = (items: any[], appId: number): void => {
  if (!isNonSteamApp(getOverview(appId))) return;

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
      onSelected={() => Navigation.Navigate(`/playhub-metadata/${appId}`)}
    >
      {"Decky metadata..."}
    </MenuItem>
  );
};

/** De-duplicate, then (re)insert the entry against the best-known appid. */
const syncOurEntry = (items: any[], appId: number): void => {
  removeOurEntry(items);
  insertOurEntry(items, resolveAppId(items, appId));
};

/**
 * Patch the library context menu so non-Steam games gain a Playhub entry.
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

  try {
    outerPatch = afterPatch(
      LibraryContextMenuClass.prototype,
      "render",
    (_renderArgs: any[], menu: any) => {
      const ownerAppId = Number(
        menu?._owner?.pendingProps?.overview?.appid ?? 0
      );
      const appId =
        ownerAppId || resolveAppId(menu?.props?.children ?? [], 0);

      if (!innerPatch) {
        innerPatch = afterPatch(menu, "type", (_typeArgs: any[], rendered: any) => {
          // First render of the menu body.
          afterPatch(
            rendered.type.prototype,
            "render",
            (_args: any[], output: any) => {
              const items = output?.props?.children?.[0];
              if (isGameContextMenu(items)) {
                try {
                  syncOurEntry(items, appId);
                } catch (_error) {
                  // Steam reshapes this tree often; skip on mismatch.
                }
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
                removeOurEntry(nextProps.children);
                if (shouldUpdate === true) {
                  syncOurEntry(nextProps.children, appId);
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
          syncOurEntry(menu.props.children, appId);
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
