import { findModuleExport } from "@decky/ui";
import type { ComponentType, ReactNode } from "react";

export type NativePagedSettingsPage = {
  identifier: string;
  title: ReactNode;
  icon: ReactNode;
  visible: boolean;
  hideTitle: boolean;
  content: ReactNode;
};

export type NativePagedSettingsPageEntry = NativePagedSettingsPage | "separator";

export type NativePagedSettingsProps = {
  pages: NativePagedSettingsPageEntry[];
  page: string;
  onPageRequested(identifier: string): void;
  title?: ReactNode;
  showTitle?: boolean;
  bottomControls?: ReactNode;
};

export const resolveNativePagedSettings = (): ComponentType<NativePagedSettingsProps> | null => {
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
