import { DialogButton, findModuleExport, Focusable, NavEntryPositionPreferences, ScrollPanel } from "@decky/ui";
import {
  createContext,
  Fragment,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type ComponentType,
  type ReactNode,
} from "react";
import type { EditorPageId } from "./editorPages";
import { accentRgba, colors, fontFamily } from "./tokens";

export interface EditorLayoutPage {
  id: EditorPageId;
  label: string;
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

// DFL only declares children, but Steam's ScrollPanel forwards the ref and Focusable props.
const EditorScrollPanel = ScrollPanel as typeof Focusable;
const layout = "decky-metadata-editor-layout";

const css = `
.${layout} {
  display: flex;
  height: 100%;
  min-height: 100vh;
  max-height: 100vh;
  box-sizing: border-box;
  /* The route spans the viewport; Steam overlays its top bar and footer. */
  padding: 40px 0;
  overflow: hidden;
  font-family: ${fontFamily};
}

.${layout}__rail {
  display: flex;
  flex: 0 0 240px;
  flex-direction: column;
  min-width: 0;
  background: rgb(43, 45, 51);
}

.${layout}__title,
.${layout}__heading {
  font-size: 22px;
  font-weight: 700;
  line-height: 28px;
  color: #fff;
}

.${layout}__title {
  margin: 0 0 16px;
  padding: 8px 16px 0 24px;
}

.${layout}__title,
.${layout}__tab > span:first-child {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.${layout}__tab {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  height: 42px;
  padding: 10px 24px;
  font-size: 16px;
  line-height: 22px;
  color: rgb(184, 188, 191);
}

.${layout}__tab[aria-selected="true"] {
  background: linear-gradient(90deg, ${accentRgba(0.22)}, transparent);
  color: #fff;
}

.${layout}__tab.gpfocus,
.${layout}__tab:focus-visible {
  background: linear-gradient(90deg, ${accentRgba(0.4)}, transparent);
  box-shadow: inset 2px 0 ${colors.accent};
  color: #fff;
  outline: none;
}

.${layout}__dirty-dot {
  display: block;
  width: 7px;
  flex: 0 0 7px;
  height: 7px;
  border-radius: 50%;
  margin-left: auto;
  background: ${colors.accent};
}

.${layout}__dirty-dot--icon {
  margin-left: 0;
}

/* Clean tabs keep an invisible dot so every label shares the native icon indent. */
.${layout}__dirty-dot--clean {
  background: transparent;
}

.${layout}__separator {
  height: 1px;
  margin: 6px 24px;
  background: rgba(255, 255, 255, .08);
}

.${layout}__save.DialogButton.Secondary {
  flex: 0 0 42px;
  height: 42px;
  width: calc(100% - 48px);
  box-sizing: border-box;
  margin: auto 24px 22px;
}

.${layout}__save.DialogButton.Secondary:not(:disabled, :hover, :focus, .gpfocus) {
  background: rgba(255, 255, 255, .15);
}

.${layout}__save.DialogButton.Secondary:disabled {
  background: rgba(61, 67, 77, .35);
  color: rgba(255, 255, 255, .3);
  opacity: 1;
}

.${layout}__pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  padding: 24px 24px 35px;
}

.${layout}__heading {
  margin: 0 0 14px;
}
`;

type NativePagedSettingsPage = {
  identifier: EditorPageId;
  title: string;
  icon?: ReactNode;
  visible: boolean;
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

// Steam's paged settings component; falls back to the custom rail when a client update hides it.
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
  const pageDependencies = pages.flatMap(({ id, label, dirty, visible, separatorBefore }) =>
    [id, label, dirty, visible, separatorBefore]);
  const nativePages = useMemo<NativePagedSettingsPageEntry[]>(() => {
    const mapped: NativePagedSettingsPageEntry[] = [];
    for (const editorPage of pages) {
      if (editorPage.separatorBefore) mapped.push("separator");
      mapped.push({
        identifier: editorPage.id,
        title: editorPage.label,
        icon: (
          <span
            className={`${layout}__dirty-dot ${layout}__dirty-dot--icon${editorPage.dirty ? "" : ` ${layout}__dirty-dot--clean`}`}
            aria-hidden="true"
          />
        ),
        visible: editorPage.visible,
        content: <CurrentPageContent key={editorPage.id} id={editorPage.id} />,
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

function CustomEditorLayout({ title, pages, page, onPageRequested, saveLabel, saveDisabled, onSave }: EditorLayoutProps): JSX.Element {
  const panelId = useId();
  const paneRef = useRef<HTMLDivElement>(null);
  const selected = pages.find((tab) => tab.visible && tab.id === page);

  useLayoutEffect(() => {
    if (paneRef.current) paneRef.current.scrollTop = 0;
  }, [page]);

  return (
    <Focusable
      className={layout}
      flow-children="row"
      navEntryPreferPosition={NavEntryPositionPreferences.PREFERRED_CHILD}
    >
      <style>{css}</style>
      <Focusable className={`${layout}__rail`} flow-children="column">
        <h1 className={`${layout}__title`} id={`${panelId}-title`}>{title}</h1>
        <Focusable flow-children="column" role="tablist" aria-orientation="vertical" aria-labelledby={`${panelId}-title`}>
          {pages.map((tab) => tab.visible && (
            <Fragment key={tab.id}>
              {tab.separatorBefore && <div className={`${layout}__separator`} aria-hidden="true" />}
              <Focusable
                className={`${layout}__tab`}
                id={`${panelId}-${tab.id}`}
                role="tab"
                aria-controls={panelId}
                aria-selected={tab.id === page}
                onActivate={() => {
                  if (tab.id === page) {
                    paneRef.current
                      ?.querySelector<HTMLElement>('input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
                      ?.focus();
                  } else {
                    onPageRequested(tab.id);
                  }
                }}
              >
                <span>{tab.label}</span>
                {tab.dirty && <span className={`${layout}__dirty-dot`} aria-hidden="true" />}
              </Focusable>
            </Fragment>
          ))}
        </Focusable>
        <DialogButton
          className={`${layout}__save`}
          focusable={!saveDisabled}
          disabled={saveDisabled}
          onClick={onSave}
        >
          {saveLabel}
        </DialogButton>
      </Focusable>
      <EditorScrollPanel
        ref={paneRef}
        className={`${layout}__pane`}
        id={panelId}
        flow-children="column"
        role="tabpanel"
        aria-labelledby={selected && `${panelId}-${selected.id}`}
        preferredFocus
      >
        {selected && (
          <Fragment key={selected.id}>
            <h2 className={`${layout}__heading`}>{selected.label}</h2>
            {selected.content}
          </Fragment>
        )}
      </EditorScrollPanel>
    </Focusable>
  );
}

export function EditorLayout(props: EditorLayoutProps): JSX.Element {
  return NativePagedSettings
    ? <NativeEditorLayout {...props} />
    : <CustomEditorLayout {...props} />;
}
