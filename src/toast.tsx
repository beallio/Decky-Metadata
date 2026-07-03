import { toaster } from "@decky/api";
import { FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";
import { colors } from "./tokens";

const TITLE = "Decky Metadata";
const DURATION = 3000;

type ToastKind = "success" | "warning" | "error";

export function notify(kind: ToastKind, heading: string, body: string): void {
  const logo =
    kind === "success" ? (
      <FaCheckCircle color={colors.success} />
    ) : kind === "error" ? (
      <FaExclamationTriangle color={colors.error} />
    ) : (
      <FaExclamationTriangle color={colors.warning} />
    );
  try {
    toaster.toast({ title: `${TITLE} · ${heading}`, body, duration: DURATION, logo });
  } catch {
    // The Decky toaster may be unavailable outside the runtime.
  }
}

export const toastSuccess = (heading: string, body: string) =>
  notify("success", heading, body);
export const toastWarn = (heading: string, body: string) =>
  notify("warning", heading, body);
export const toastError = (heading: string, body: string) =>
  notify("error", heading, body);
