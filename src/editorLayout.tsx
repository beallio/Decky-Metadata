import { DialogBody, DialogButton, DialogHeader, findModuleExport, Focusable } from "@decky/ui";
import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from "react";
import type { EditorPageId } from "./editorPages";
import { useT } from "./i18n";
import { colors } from "./tokens";

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
  title: string;
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

function NativeEditorLayout({
  title,
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
        title={title}
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
