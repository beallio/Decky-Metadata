import { DialogBody, DialogButton, DialogHeader, findModuleExport, Focusable, Marquee } from "@decky/ui";
import { createContext, useContext, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { getEditorHeaderSettings } from "./backend";
import { resolveEditorIcon } from "./editorHeaderIcon";
import type { EditorPageId } from "./editorPages";
import { translateBackendError, useT } from "./i18n";
import * as log from "./log";
import { colors } from "./tokens";
import type { EditorHeaderSettings } from "./types";

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

/* Marquee wraps its root in an unstyled div; let that wrapper shrink so long names scroll inside the rail. */
.${layout}__header > :last-child {
  flex: 1 1 0;
  min-width: 0;
}

`;

type NativePagedSettingsPage = {
  identifier: EditorPageId;
  title: ReactNode;
  icon: ReactNode;
  visible: boolean;
  hideTitle: boolean;
  content: ReactNode;
};

type NativePagedSettingsPageEntry = NativePagedSettingsPage | "separator";

type NativePagedSettingsProps = {
  pages: NativePagedSettingsPageEntry[];
  page: EditorPageId;
  onPageRequested(identifier: string): void;
  title: ReactNode;
  showTitle: boolean;
  bottomControls: ReactNode;
};

const resolveNativePagedSettings = (): ComponentType<NativePagedSettingsProps> | null => {
  try {
    const component = findModuleExport((moduleExport: unknown) => {
      if (typeof moduleExport !== "function") return false;
      const source = String(moduleExport);
      return source.includes("PagedSettings") && /\{\s*\.\.\.\w+\s*\}/.test(source);
    });
    return typeof component === "function" ? component as ComponentType<NativePagedSettingsProps> : null;
  } catch {
    return null;
  }
};

const NativePagedSettings = resolveNativePagedSettings();
const PageContentContext = createContext<EditorLayoutPage[]>([]);

function CurrentPageContent({ id }: { id: EditorPageId }): JSX.Element {
  const pages = useContext(PageContentContext);
  return <>{pages.find((page) => page.id === id)?.content ?? null}</>;
}

function EditorTitle({ title, appId, steamAppId }: Pick<EditorLayoutProps, "title" | "appId" | "steamAppId">) {
  const [settings, setSettings] = useState<EditorHeaderSettings | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    getEditorHeaderSettings().then(
      (loaded) => { if (current) setSettings(loaded); },
      (error) => log.warn("editor", "Header settings could not be loaded", translateBackendError(error)),
    );
    return () => { current = false; };
  }, []);
  const showIcon = settings?.gameIcon === true;
  const fallbackAppId = settings?.steamIconFallback ? steamAppId : null;
  useEffect(() => {
    setIcon(null);
    if (!showIcon) return;
    let current = true;
    void resolveEditorIcon(appId, fallbackAppId, () => current).then((url) => { if (current) setIcon(url); });
    return () => { current = false; };
  }, [appId, fallbackAppId, showIcon]);

  if (!showIcon || !Marquee) return <>{title}</>;
  return (
    <div className={`${layout}__header`}>
      {icon ? <img className={`${layout}__header-icon`} src={icon} alt="" /> : null}
      <Marquee>{title}</Marquee>
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
      <NativePagedSettings
        pages={nativePages}
        page={page}
        onPageRequested={(id) => onPageRequested(id as EditorPageId)}
        title={<EditorTitle title={title} appId={appId} steamAppId={steamAppId} />}
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
