import { DialogBody, DialogButton, DialogHeader, Focusable, Marquee } from "@decky/ui";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getEditorHeaderSettings } from "./backend";
import { resolveEditorIcon, steamIconUrl } from "./editorHeaderIcon";
import type { EditorPageId } from "./editorPages";
import { translateBackendError, useT } from "./i18n";
import * as log from "./log";
import { nativeFocusedElement } from "./steam/nativeFocus";
import { colors } from "./tokens";
import type { EditorHeaderSettings } from "./types";
import { resolveNativePagedSettings, type NativePagedSettingsPageEntry } from "./nativePagedSettings";

export interface EditorLayoutPage {
  id: EditorPageId;
  label: string;
  icon: ReactNode;
  dirty: boolean;
  visible: boolean;
  separatorBefore?: boolean;
  content: ReactNode;
}

export interface EditorLayoutProps {
  title: string;
  appId: number;
  /** Matched Steam game, used for its icon when the game has none and the setting allows it. */
  steamAppId: number | null;
  pages: EditorLayoutPage[];
  page: EditorPageId;
  onPageRequested(id: EditorPageId): void;
  saveLabel: string;
  saveDisabled: boolean;
  onSave(): void;
  /** When true (Artwork tab), auto-collapse .PageListColumn to a 64px icon rail while content holds focus. */
  collapsibleSidebar?: boolean;
}

const layout = "decky-metadata-editor-layout";

const css = `
.${layout}__tab-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
}

.${layout}__tab-label {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.${layout}__dirty-dot {
  display: block;
  width: 7px;
  flex: 0 0 7px;
  height: 7px;
  border-radius: 50%;
  background: ${colors.accent};
}

.${layout}__save.DialogButton.Secondary {
  flex: 0 0 42px;
  height: 42px;
  width: calc(100% - 48px);
  box-sizing: border-box;
  margin: auto 24px 22px;
}

.${layout}__header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.${layout}__header-icon {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border-radius: 2px;
  object-fit: cover;
}

.${layout}__header-icon.is-collapsed-only {
  display: none;
}

/* Marquee wraps its root in an unstyled div; let that wrapper shrink so long names scroll inside the rail. */
.${layout}__header > :last-child {
  flex: 1 1 0;
  min-width: 0;
}

.${layout}__shell {
  width: 100%;
  height: 100%;
  min-height: 100%;
}

.${layout}__shell.is-collapsible .PageListColumn {
  transition: width 180ms ease, min-width 180ms ease, max-width 180ms ease, flex-basis 180ms ease;
}

.${layout}__shell.is-collapsible.is-sidebar-collapsed .PageListColumn {
  box-sizing: border-box !important;
  width: 64px !important;
  min-width: 64px !important;
  max-width: 64px !important;
  flex: 0 0 64px !important;
  overflow: hidden !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
}

.${layout}__shell.is-collapsible.is-sidebar-collapsed .PageListColumn > :first-child {
  padding-left: 8px !important;
  padding-right: 8px !important;
  display: flex !important;
  justify-content: center !important;
  min-height: 24px !important;
}

.${layout}__shell.is-collapsible.is-sidebar-collapsed .PageListColumn > .Panel.Focusable > .Panel.Focusable {
  padding-left: 0 !important;
  padding-right: 0 !important;
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
}

.${layout}__shell.is-collapsible.is-sidebar-collapsed .PageListColumn > .Panel.Focusable > .Panel.Focusable > div {
  width: 100% !important;
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
  gap: 0 !important;
  margin: 0 !important;
}

.${layout}__shell.is-collapsible.is-sidebar-collapsed .PageListColumn > .Panel.Focusable > .Panel.Focusable > div > :first-child {
  flex: 0 0 auto !important;
  width: auto !important;
  min-width: 24px !important;
  margin: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.${layout}__shell.is-collapsible.is-sidebar-collapsed .PageListColumn > .Panel.Focusable > .Panel.Focusable > div > :last-child {
  display: none !important;
}

.${layout}__shell.is-collapsible.is-sidebar-collapsed .PageListColumn .${layout}__tab-title,
.${layout}__shell.is-collapsible.is-sidebar-collapsed .PageListColumn .${layout}__tab-label,
.${layout}__shell.is-collapsible.is-sidebar-collapsed .PageListColumn .${layout}__dirty-dot,
.${layout}__shell.is-collapsible.is-sidebar-collapsed .PageListColumn .${layout}__header-title,
.${layout}__shell.is-collapsible.is-sidebar-collapsed .PageListColumn .${layout}__header > :last-child {
  display: none !important;
}

.${layout}__shell.is-collapsible.is-sidebar-collapsed .PageListColumn .${layout}__header {
  justify-content: center;
  gap: 0;
}

.${layout}__shell.is-collapsible.is-sidebar-collapsed .PageListColumn .${layout}__header-icon.is-collapsed-only {
  display: block;
}

.${layout}__shell.is-collapsible.is-sidebar-collapsed .PageListColumn .${layout}__save.DialogButton.Secondary {
  width: 48px !important;
  min-width: 48px !important;
  margin: auto 8px 22px !important;
  padding: 0 4px !important;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
  font-size: 11px;
}

.${layout}__shell.is-collapsible.is-sidebar-collapsed .DialogContentTransition {
  flex: 1 1 auto !important;
  min-width: 0 !important;
}

`;

const NativePagedSettings = resolveNativePagedSettings();
const PageContentContext = createContext<EditorLayoutPage[]>([]);

function CurrentPageContent({ id }: { id: EditorPageId }): JSX.Element {
  const pages = useContext(PageContentContext);
  return <>{pages.find((page) => page.id === id)?.content ?? null}</>;
}

/** Whether a resolved icon may show with the sidebar expanded; the collapsed rail always shows it. */
export function headerIconShowsExpanded(settings: EditorHeaderSettings | null, ownIcon: boolean): boolean {
  return settings?.gameIcon === true && (ownIcon || settings.steamIconFallback);
}

function EditorTitle({
  title,
  appId,
  steamAppId,
  collapsible,
}: Pick<EditorLayoutProps, "title" | "appId" | "steamAppId"> & { collapsible: boolean }) {
  const [settings, setSettings] = useState<EditorHeaderSettings | null>(null);
  const [icon, setIcon] = useState<{ url: string; own: boolean } | null>(null);
  useEffect(() => {
    let current = true;
    getEditorHeaderSettings().then(
      (loaded) => { if (current) setSettings(loaded); },
      (error) => log.warn("editor", "Header settings could not be loaded", translateBackendError(error)),
    );
    return () => { current = false; };
  }, []);
  const showIcon = settings?.gameIcon === true;
  // The collapsed rail has no room for the title, so it always shows the icon instead.
  const resolveIcon = showIcon || collapsible;
  const fallbackAppId = settings?.steamIconFallback || collapsible ? steamAppId : null;
  useEffect(() => {
    setIcon(null);
    if (!resolveIcon) return;
    let current = true;
    // Start the Steam request early; the own icon can take up to a second to appear.
    const steamIcon = fallbackAppId ? steamIconUrl(fallbackAppId) : null;
    void resolveEditorIcon(appId, null, () => current).then(async (own) => {
      const url = own ?? (steamIcon ? await steamIcon : null);
      if (current) setIcon(url ? { url, own: own !== null } : null);
    });
    return () => { current = false; };
  }, [appId, fallbackAppId, resolveIcon]);

  if (!resolveIcon) return <span className={`${layout}__header-title`}>{title}</span>;
  const iconClass = icon && headerIconShowsExpanded(settings, icon.own) ? "" : " is-collapsed-only";
  return (
    <div className={`${layout}__header`}>
      {icon ? <img className={`${layout}__header-icon${iconClass}`} src={icon.url} alt="" /> : null}
      {showIcon && Marquee ? <Marquee>{title}</Marquee> : <span className={`${layout}__header-title`}>{title}</span>}
    </div>
  );
}

export function evaluateSidebarCollapseState(
  currentlyCollapsed: boolean,
  sidebarHasFocus: boolean,
  contentHasFocus: boolean,
): boolean {
  if (sidebarHasFocus) return false;
  if (contentHasFocus) return true;
  return currentlyCollapsed;
}

function CollapsibleSidebarShell({
  collapsible,
  children,
}: {
  collapsible: boolean;
  children: ReactNode;
}): JSX.Element {
  const shellRef = useRef<HTMLDivElement | null>(null);
  // Collapsible pages open with focus in their content, so start collapsed instead of animating closed.
  const [collapsed, setCollapsed] = useState(collapsible);

  useEffect(() => {
    if (!collapsible) {
      setCollapsed(false);
      return;
    }
    const shell = shellRef.current;
    if (!shell) return;

    const syncFromDom = () => {
      const sidebar = shell.querySelector<HTMLElement>(".PageListColumn");
      const content = shell.querySelector<HTMLElement>(".DialogContentTransition");
      // Plugin code runs in another window; read Steam's gamepad focus, else this window's DOM focus.
      const active = nativeFocusedElement() ?? shell.ownerDocument.activeElement;
      const sidebarFocused = Boolean(
        sidebar && (sidebar.classList.contains("gpfocuswithin") || (active && sidebar.contains(active))),
      );
      const contentFocused = Boolean(
        content && (content.classList.contains("gpfocuswithin") || (active && content.contains(active))),
      );
      setCollapsed((prev) => evaluateSidebarCollapseState(prev, sidebarFocused, contentFocused));
    };

    syncFromDom();
    shell.addEventListener("focusin", syncFromDom, true);
    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(syncFromDom);
      observer.observe(shell, { attributes: true, attributeFilter: ["class"], subtree: true });
    }
    return () => {
      shell.removeEventListener("focusin", syncFromDom, true);
      observer?.disconnect();
    };
  }, [collapsible]);

  const className = [
    `${layout}__shell`,
    collapsible ? "is-collapsible" : "",
    collapsible && collapsed ? "is-sidebar-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={shellRef} className={className}>
      {children}
    </div>
  );
}

function NativeEditorLayout({
  title,
  appId,
  steamAppId,
  pages,
  page,
  onPageRequested,
  saveLabel,
  saveDisabled,
  onSave,
  collapsibleSidebar = false,
}: EditorLayoutProps): JSX.Element {
  // Keep descriptors stable as fields edit; context supplies the latest content nodes.
  const pageDependencies = pages.flatMap(({ id, label, icon, dirty, visible, separatorBefore }) =>
    [id, label, icon, dirty, visible, separatorBefore]);
  const nativePages = useMemo<NativePagedSettingsPageEntry[]>(() => {
    const mapped: NativePagedSettingsPageEntry[] = [];
    for (const editorPage of pages) {
      if (editorPage.separatorBefore) mapped.push("separator");
      mapped.push({
        identifier: editorPage.id,
        title: (
          <span className={`${layout}__tab-title`}>
            <span className={`${layout}__tab-label`}>{editorPage.label}</span>
            {editorPage.dirty ? (
              <span className={`${layout}__dirty-dot`} aria-hidden="true" />
            ) : null}
          </span>
        ),
        icon: editorPage.icon,
        visible: editorPage.visible,
        hideTitle: true,
        // Steam's settings pages use DialogHeader + DialogBody; native CSS supplies their spacing.
        content: (
          <>
            <DialogHeader>{editorPage.label}</DialogHeader>
            <DialogBody>
              <CurrentPageContent key={editorPage.id} id={editorPage.id} />
            </DialogBody>
          </>
        ),
      });
    }
    return mapped;
  }, pageDependencies);

  return (
    <PageContentContext.Provider value={pages}>
      <style>{css}</style>
      <CollapsibleSidebarShell collapsible={collapsibleSidebar}>
        <NativePagedSettings
          pages={nativePages}
          page={page}
          onPageRequested={(id) => onPageRequested(id as EditorPageId)}
          title={<EditorTitle title={title} appId={appId} steamAppId={steamAppId} collapsible={collapsibleSidebar} />}
          showTitle={true}
          bottomControls={
            <DialogButton
              className={`${layout}__save`}
              focusable={!saveDisabled}
              disabled={saveDisabled}
              onClick={onSave}
            >
              {saveLabel}
            </DialogButton>
          }
        />
      </CollapsibleSidebarShell>
    </PageContentContext.Provider>
  );
}

export function EditorLayout(props: EditorLayoutProps): JSX.Element {
  const t = useT();
  return NativePagedSettings
    ? <NativeEditorLayout {...props} />
    : (
      // Focusable so B reaches the editor root and leaves; there is nothing else to focus.
      <Focusable
        noFocusRing
        onActivate={() => undefined}
        style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#dcdedf", fontSize: 16 }}
      >
        {t("editor.unsupportedSteam")}
      </Focusable>
    );
}
