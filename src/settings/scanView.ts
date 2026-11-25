import { translateProgress } from "../i18n";
import type { MetadataScanSnapshot } from "../metadataScan";

// MetadataScanBody props from the shared scan snapshot; text is built at render time in the current language.
// The result is a toast only, so the panel shows no message once the scan stops.
export function scanView(scan: MetadataScanSnapshot) {
  const completed = Number(scan.progress?.completed || 0);
  const total = Number(scan.progress?.total || 0);
  const message = scan.busy && scan.progress
    ? scan.progress.current || translateProgress(scan.progress) || `${completed}/${total}`
    : "";
  return {
    scanBusy: scan.busy,
    scanCompleted: completed,
    scanTotal: total,
    scanMessage: message,
  };
}
