/*
 * Resolve Steam's gamepad-aware <textarea> so the metadata editor's Description
 * field can receive on-screen-keyboard input in Gamepad UI.
 *
 * A plain <textarea> takes DOM focus but never receives OSK text: Steam only
 * routes the virtual keyboard into inputs built by its own element factory.
 * That factory (internally `v0(tag)`) returns a forwardRef component plumbed
 * into the virtual keyboard; `v0("input")` is what @decky/ui's TextField wraps,
 * and `v0("textarea")` is the multiline sibling Steam uses in its own UI but
 * does not export.
 *
 * We locate the factory by the virtual-keyboard prop plumbing that only it
 * contains, then build the textarea component once. If Steam's internals shift
 * and resolution fails, we return null and the caller falls back to a plain
 * textarea (degraded, but never a crash).
 */
import { findModuleExport } from "@decky/ui";
import type { ComponentType, TextareaHTMLAttributes } from "react";

export type GamepadTextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

const resolveGamepadTextArea = (): ComponentType<GamepadTextAreaProps> | null => {
  try {
    const factory = findModuleExport(
      (moduleExport: any) =>
        typeof moduleExport === "function" &&
        typeof moduleExport.toString === "function" &&
        moduleExport.toString().includes("virtualKeyboardProps") &&
        moduleExport.toString().includes("BIsElementValidForInput")
    );
    if (typeof factory !== "function") return null;
    const component = factory("textarea");
    return typeof component === "function" || (component && typeof component === "object")
      ? (component as ComponentType<GamepadTextAreaProps>)
      : null;
  } catch (_error) {
    return null;
  }
};

let cached: ComponentType<GamepadTextAreaProps> | null | undefined;

/**
 * The resolved gamepad textarea component, or null when unavailable. Resolved
 * lazily on first use and cached (including a null result, so a miss is not
 * retried on every render).
 */
export const getGamepadTextArea = (): ComponentType<GamepadTextAreaProps> | null => {
  if (cached === undefined) cached = resolveGamepadTextArea();
  return cached;
};
