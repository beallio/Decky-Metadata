import { toaster } from "@decky/api";
import { FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";
import { colors } from "./tokens";

const TITLE = "Decky Metadata";
const DURATION = 3000;

type ToastKind = "success" | "warning" | "error";

const toastLogoStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
} as const;

export function notify(kind: ToastKind, heading: string, body: string): void {
  const logo = (
    <span style={toastLogoStyle}>
      {kind === "success" ? (
        <FaCheckCircle color={colors.success} size={28} />
      ) : kind === "error" ? (
        <FaExclamationTriangle color={colors.error} size={28} />
      ) : (
        <FaExclamationTriangle color={colors.warning} size={28} />
      )}
    </span>
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
