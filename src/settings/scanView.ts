import { translateBackendError, translateProgress } from "../i18n";
import { scanCompleteMessage, type MetadataScanSnapshot } from "../metadataScan";

// MetadataScanBody props from the shared scan snapshot; text is built at render time in the current language.
export function scanView(scan: MetadataScanSnapshot) {
  const completed = Number(scan.progress?.completed || 0);
  const total = Number(scan.progress?.total || 0);
  const message = scan.statusKind === "error"
    ? translateBackendError(scan.error)
    : scan.busy
      ? scan.progress
        ? scan.progress.current || translateProgress(scan.progress) || `${completed}/${total}`
        : ""
      : (scan.statusKind === "success" || scan.statusKind === "warning") && scan.progress
        ? scanCompleteMessage(scan.progress)
        : "";
  return {
    scanBusy: scan.busy,
    scanCompleted: completed,
    scanTotal: total,
    scanMessage: message,
    scanStatusKind: scan.statusKind,
  };
}
