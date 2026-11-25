import { DialogBody, DialogHeader, ScrollPanelGroup } from "@decky/ui";
import { createContext, Fragment, useContext, useMemo, type ReactNode } from "react";
import { resolveNativePagedSettings, type NativePagedSettingsPageEntry } from "./nativePagedSettings";

export interface SettingsLayoutPage {
  id: string;
  label: string;
  icon: ReactNode;
  separatorBefore?: boolean;
  content: ReactNode;
}

export interface SettingsLayoutProps {
  pages: SettingsLayoutPage[];
  page: string;
  onPageRequested(id: string): void;
}

const NativePagedSettings = resolveNativePagedSettings();
const PageContentContext = createContext<SettingsLayoutPage[]>([]);

function CurrentPageContent({ id }: { id: string }): JSX.Element {
  const pages = useContext(PageContentContext);
  return <>{pages.find((page) => page.id === id)?.content ?? null}</>;
}

export function SettingsLayout({ pages, page, onPageRequested }: SettingsLayoutProps): JSX.Element {
  // Same rule as the editor: descriptors stay stable while bodies re-render; context supplies the latest content.
  const pageDependencies = pages.flatMap(({ id, label, icon, separatorBefore }) => [id, label, icon, separatorBefore]);
  const nativePages = useMemo<NativePagedSettingsPageEntry[]>(() => {
    const mapped: NativePagedSettingsPageEntry[] = [];
    for (const settingsPage of pages) {
      if (settingsPage.separatorBefore) mapped.push("separator");
      mapped.push({
        identifier: settingsPage.id,
        title: settingsPage.label,
        icon: settingsPage.icon,
        // Native separators need every page visible.
        visible: true,
        hideTitle: true,
        content: (
          <>
            <DialogHeader>{settingsPage.label}</DialogHeader>
            <DialogBody>
              <CurrentPageContent key={settingsPage.id} id={settingsPage.id} />
            </DialogBody>
          </>
        ),
      });
    }
    return mapped;
  }, pageDependencies);

  if (!NativePagedSettings) {
    // Without Steam's component, show every page in one list so no setting is lost.
    return (
      <ScrollPanelGroup>
        {pages.map((settingsPage) => (
          <Fragment key={settingsPage.id}>
            <DialogHeader>{settingsPage.label}</DialogHeader>
            <DialogBody>{settingsPage.content}</DialogBody>
          </Fragment>
        ))}
      </ScrollPanelGroup>
    );
  }

  return (
    <PageContentContext.Provider value={pages}>
      <NativePagedSettings
        pages={nativePages}
        page={page}
        onPageRequested={onPageRequested}
        showTitle={false}
      />
    </PageContentContext.Provider>
  );
}
