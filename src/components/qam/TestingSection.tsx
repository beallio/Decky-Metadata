import {
  ButtonItem,
  ConfirmModal,
  DialogButton,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Field,
  Focusable,
  Menu,
  MenuItem,
  NavEntryPositionPreferences,
  Navigation,
  showContextMenu,
  showModal,
} from "@decky/ui";
import { toaster } from "@decky/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaCaretDown,
  FaClock,
  FaDownload,
  FaExclamationTriangle,
  FaInfo,
  FaSortAmountDownAlt,
  FaSortAmountUpAlt,
  FaSyncAlt,
  FaUser,
} from "react-icons/fa";
import {
  clearPendingUpdateInstall,
  confirmUpdateInstallHandoff,
  getTestingVersions,
  prepareTestingVersion,
  recordUpdateInstallRequested,
} from "../../backend";
import { formatDate, formatDateTime, translateBackendError, useT } from "../../i18n";
import { BusySpinner, inlineStatusStyle } from "../../styles";
import { colors, fontSize, fontWeight, space } from "../../tokens";
import type { TestingPullRequest } from "../../types";
import {
  INSTALL_TYPE_UPDATE,
  invokeDeckyInstaller,
  isDeckyInstallerAvailable,
} from "../../updater/deckyInstaller";

export type TestingSortField = "updated" | "opened" | "number" | "author" | "title";

const iconButtonStyle = {
  height: "40px",
  width: "40px",
  minWidth: "40px",
  padding: "10px 12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
} as const;

const testingCss = `
.decky-metadata-testing-focus {
  outline: 2px solid rgba(255, 255, 255, 0.8);
  outline-offset: 2px;
  border-radius: 4px;
}
.decky-metadata-testing-meta-icon {
  display: inline-flex;
  align-items: center;
  vertical-align: -2px;
  margin-right: 4px;
  color: ${colors.textSecondary};
}
`;

export function sortTestingPullRequests(
  items: TestingPullRequest[],
  sortField: TestingSortField,
  sortDescending: boolean,
): TestingPullRequest[] {
  const primaryValue = (pr: TestingPullRequest): number | string => {
    switch (sortField) {
      case "opened":
        return new Date(pr.created_at).getTime();
      case "number":
        return pr.id;
      case "author":
        return (pr.author ?? "").toLowerCase();
      case "title":
        return pr.name.toLowerCase();
      case "updated":
      default:
        return new Date(pr.updated_at).getTime();
    }
  };

  return [...items].sort((a, b) => {
    const aValue = primaryValue(a);
    const bValue = primaryValue(b);
    const comparison =
      typeof aValue === "number" && typeof bValue === "number"
        ? aValue - bValue
        : String(aValue).localeCompare(String(bValue));
    if (comparison !== 0) {
      return sortDescending ? -comparison : comparison;
    }
    return b.id - a.id;
  });
}

function generateTestingTraceId(prId: number): string {
  return `pr-${prId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type TestingInstallModalProps = {
  pr: TestingPullRequest;
  closeModal?: () => void;
};

function TestingInstallModal({ pr, closeModal }: TestingInstallModalProps) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (busy) return;
    if (!isDeckyInstallerAvailable()) {
      setError(t("qam.update.manualInstallUnavailable"));
      return;
    }
    setBusy(true);
    setError(null);
    setRetryAfter(null);

    let recordedVersion: string | null = null;
    try {
      const prepared = await prepareTestingVersion(pr.id, pr.head_sha);
      if (prepared.status !== "ready") {
        const message = prepared.message
          ? translateBackendError(prepared.message)
          : t("qam.testing.prepareFailed");
        setError(message);
        setRetryAfter(prepared.retry_after ?? null);
        setBusy(false);
        return;
      }

      const traceId = generateTestingTraceId(pr.id);
      recordedVersion = prepared.version;
      await recordUpdateInstallRequested({
        version: prepared.version,
        tag: prepared.tag,
        channel: prepared.channel,
        artifact_url: prepared.artifact_url,
        sha256: prepared.sha256,
        release_url: pr.link,
        published_at: prepared.published_at,
        action: "update",
        updateTraceId: traceId,
      }).catch(() => undefined);

      // Close our verification dialog before invoking Decky Loader's own install
      // confirmation modal so the two dialogs never stack or block each other.
      closeModal?.();
      void invokeDeckyInstaller(
        prepared.artifact_url,
        prepared.version,
        prepared.sha256,
        INSTALL_TYPE_UPDATE,
        traceId,
      ).then(
        async () => {
          await confirmUpdateInstallHandoff(prepared.version).catch(() => undefined);
          toaster.toast({
            title: t("updater.installation.startedTitle"),
            body: t("updater.installation.startedBody", { version: prepared.version }),
            duration: 3000,
          });
        },
        async (caught) => {
          await clearPendingUpdateInstall(prepared.version).catch(() => undefined);
          toaster.toast({
            title: t("updater.installation.failedTitle"),
            body: translateBackendError(caught),
            duration: 5000,
          });
        },
      );
    } catch (caught) {
      if (recordedVersion) {
        await clearPendingUpdateInstall(recordedVersion).catch(() => undefined);
      }
      setError(translateBackendError(caught));
      setBusy(false);
    }
  };

  return (
    <ConfirmModal
      strTitle={t("qam.testing.installModalTitle", { id: pr.id })}
      strOKButtonText={
        busy
          ? t("qam.testing.installing")
          : error
            ? t("qam.testing.retry")
            : t("qam.testing.install")
      }
      strCancelButtonText={t("editor.unsaved.cancel")}
      bOKDisabled={busy}
      bCancelDisabled={busy}
      bDisableBackgroundDismiss={busy}
      bHideCloseIcon={busy}
      onOK={() => handleConfirm()}
      onCancel={() => {
        if (!busy) closeModal?.();
      }}
      onEscKeypress={() => {
        if (!busy) closeModal?.();
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
        <div style={{ color: colors.text, fontWeight: fontWeight.medium }}>{pr.name}</div>
        <div style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
          {t("qam.testing.modalDetails", {
            author: pr.author || t("common.unknown"),
            sha: pr.head_sha.slice(0, 7),
          })}
        </div>
        <div style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
          {t("qam.testing.installModalDescription")}
        </div>
        {busy && (
          <div style={inlineStatusStyle("active")}>
            <BusySpinner />
            <span>{t("qam.testing.downloadingArtifact", { id: pr.id })}</span>
          </div>
        )}
        {error && (
          <div style={inlineStatusStyle("error")}>
            <span style={{ flexShrink: 0, marginTop: "2px", display: "inline-flex" }}>
              <FaExclamationTriangle />
            </span>
            <div>
              <div>{error}</div>
              {retryAfter && (
                <div>
                  {t("qam.update.tryAgainAfter", { date: formatDateTime(new Date(retryAfter)) })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ConfirmModal>
  );
}

export function TestingBody() {
  const t = useT();
  const [items, setItems] = useState<TestingPullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<string | null>(null);
  const [sortField, setSortField] = useState<TestingSortField>("updated");
  const [sortDescending, setSortDescending] = useState(true);

  const loadPullRequests = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    setRetryAfter(null);
    try {
      const result = await getTestingVersions();
      if (result.status === "ok") {
        setItems(result.items);
      } else {
        setErrorMessage(
          result.message
            ? translateBackendError(result.message)
            : t("qam.testing.loadError"),
        );
        setRetryAfter(result.retry_after ?? null);
      }
    } catch (error) {
      setErrorMessage(translateBackendError(error));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadPullRequests();
  }, [loadPullRequests]);

  const sortedItems = useMemo(
    () => sortTestingPullRequests(items, sortField, sortDescending),
    [items, sortField, sortDescending],
  );

  const sortOptions: Array<{ label: string; data: TestingSortField }> = [
    { label: t("qam.testing.sort.updated"), data: "updated" },
    { label: t("qam.testing.sort.opened"), data: "opened" },
    { label: t("qam.testing.sort.number"), data: "number" },
    { label: t("qam.testing.sort.author"), data: "author" },
    { label: t("qam.testing.sort.title"), data: "title" },
  ];

  const sortLabel =
    sortOptions.find((option) => option.data === sortField)?.label ?? sortOptions[0].label;

  const sortValue = (pr: TestingPullRequest): string => {
    switch (sortField) {
      case "opened":
        return formatDate(new Date(pr.created_at));
      case "updated":
        return formatDate(new Date(pr.updated_at));
      case "author":
        return pr.author || t("common.unknown");
      case "number":
      case "title":
      default:
        return `#${pr.id}`;
    }
  };

  const openSortMenu = (target: EventTarget | null) => {
    showContextMenu(
      <Menu label={t("qam.testing.items")}>
        {sortOptions.map((option) => (
          <MenuItem
            key={option.data}
            selected={option.data === sortField}
            onSelected={() => setSortField(option.data)}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>,
      target ?? window,
    );
  };

  const openInstallModal = (pr: TestingPullRequest) => {
    showModal(<TestingInstallModal pr={pr} />);
  };

  return (
    <>
      <style>{testingCss}</style>
      <DialogControlsSection>
        <DialogControlsSectionHeader>{t("qam.testing.header")}</DialogControlsSectionHeader>
        <Field focusable={false} description={t("qam.testing.eligibilityNote")} />
        <ButtonItem
          layout="inline"
          label={t("qam.testing.refreshLabel")}
          onClick={() => void loadPullRequests()}
          disabled={loading}
        >
          {t("settings.action.refresh")}
        </ButtonItem>

        {loading && (
          <Field focusable={false} childrenLayout="below">
            <div style={inlineStatusStyle("active")}>
              <BusySpinner />
              <span>{t("qam.testing.loading")}</span>
            </div>
          </Field>
        )}

        {!loading && errorMessage && (
          <Field focusable={false} childrenLayout="below">
            <div style={inlineStatusStyle("error")}>
              <span style={{ flexShrink: 0, marginTop: "2px", display: "inline-flex" }}>
                <FaExclamationTriangle />
              </span>
              <div>
                <div>{errorMessage}</div>
                {retryAfter && (
                  <div>
                    {t("qam.update.tryAgainAfter", { date: formatDateTime(new Date(retryAfter)) })}
                  </div>
                )}
              </div>
            </div>
          </Field>
        )}

        {!loading && !errorMessage && sortedItems.length === 0 && (
          <Field focusable={false} description={t("qam.testing.noPrs")} />
        )}

        {!loading && !errorMessage && sortedItems.length > 0 && (
          <>
            <Focusable style={{ display: "flex", alignItems: "center", padding: "8px 8px 0" }}>
              <span
                style={{
                  color: colors.text,
                  fontSize: `${fontSize.lg}px`,
                  fontWeight: fontWeight.medium,
                  lineHeight: "20px",
                  whiteSpace: "nowrap",
                }}
              >
                {t("qam.testing.items")}
              </span>
              <span
                style={{
                  color: colors.textSecondary,
                  fontSize: `${fontSize.lg}px`,
                  fontWeight: fontWeight.medium,
                  lineHeight: "20px",
                  marginLeft: "8px",
                }}
              >
                {sortedItems.length}
              </span>
              <div
                aria-hidden="true"
                style={{
                  flexGrow: 1,
                  height: "2px",
                  margin: "0 10px",
                  backgroundColor: "rgba(103, 112, 123, 0.3)",
                }}
              />
              <Focusable
                role="button"
                aria-label={sortLabel}
                aria-haspopup="menu"
                onActivate={(event) => openSortMenu(event.currentTarget)}
                focusClassName="decky-metadata-testing-focus"
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: "28px",
                  padding: "4px 0",
                  marginTop: "1px",
                  cursor: "pointer",
                }}
              >
                <FaCaretDown size={16} style={{ margin: "2px 8px 2px 0", flexShrink: 0 }} />
                <span style={{ fontSize: `${fontSize.lg}px`, lineHeight: "20px", whiteSpace: "nowrap" }}>
                  {sortLabel}
                </span>
              </Focusable>
              <Focusable
                role="button"
                aria-label={
                  sortDescending ? t("qam.testing.sortAscending") : t("qam.testing.sortDescending")
                }
                onActivate={() => setSortDescending((descending) => !descending)}
                focusClassName="decky-metadata-testing-focus"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "28px",
                  height: "28px",
                  marginLeft: "13px",
                  flexShrink: 0,
                  cursor: "pointer",
                }}
              >
                {sortDescending ? (
                  <FaSortAmountDownAlt aria-hidden="true" size={16} />
                ) : (
                  <FaSortAmountUpAlt aria-hidden="true" size={16} />
                )}
              </Focusable>
            </Focusable>

            <ul style={{ listStyleType: "none", padding: 0, margin: 0 }}>
              {sortedItems.map((pr) => (
                <li key={`${pr.id}_${pr.head_sha}`}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      minHeight: "58px",
                      padding: "6px 8px",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 }}>
                      <div
                        style={{
                          color: colors.text,
                          fontSize: `${fontSize.lg}px`,
                          fontWeight: fontWeight.medium,
                          lineHeight: "20px",
                          marginBottom: "4px",
                        }}
                      >
                        {pr.name}
                      </div>
                      <div
                        style={{
                          color: colors.textSecondary,
                          fontSize: `${fontSize.xs}px`,
                          fontWeight: fontWeight.bold,
                          lineHeight: "20px",
                          letterSpacing: "0.4px",
                          textTransform: "uppercase",
                        }}
                      >
                        <span className="decky-metadata-testing-meta-icon">
                          <FaUser size={12} aria-hidden="true" />
                        </span>
                        {t("qam.testing.author", { author: pr.author || t("common.unknown") })}
                        {" · "}
                        <span className="decky-metadata-testing-meta-icon">
                          <FaClock size={12} aria-hidden="true" />
                        </span>
                        {t("qam.testing.opened", { date: formatDate(new Date(pr.created_at)) })}
                        {" · "}
                        <span className="decky-metadata-testing-meta-icon">
                          <FaSyncAlt size={12} aria-hidden="true" />
                        </span>
                        {t("qam.testing.updated", { date: formatDate(new Date(pr.updated_at)) })}
                        {pr.is_fork ? ` · ${t("qam.testing.forkBadge")}` : ""}
                        {pr.draft ? ` · ${t("qam.testing.draftBadge")}` : ""}
                      </div>
                    </div>
                    <span
                      style={{
                        color: colors.text,
                        fontSize: `${fontSize.xs}px`,
                        fontWeight: fontWeight.bold,
                        lineHeight: "20px",
                        letterSpacing: "0.4px",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                        maxWidth: "30%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        margin: "0 8px",
                        flexShrink: 0,
                      }}
                    >
                      {sortValue(pr)}
                    </span>
                    <Focusable
                      style={{ display: "flex", gap: "8px", height: "40px", flexShrink: 0 }}
                      navEntryPreferPosition={NavEntryPositionPreferences.MAINTAIN_X}
                    >
                      <DialogButton
                        style={iconButtonStyle}
                        aria-label={t("qam.testing.install")}
                        onClick={() => openInstallModal(pr)}
                      >
                        <FaDownload aria-hidden="true" style={{ display: "block" }} />
                      </DialogButton>
                      <DialogButton
                        style={iconButtonStyle}
                        aria-label={t("qam.testing.info")}
                        onClick={() => Navigation.NavigateToExternalWeb(pr.link)}
                      >
                        <FaInfo aria-hidden="true" style={{ display: "block" }} />
                      </DialogButton>
                    </Focusable>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogControlsSection>
    </>
  );
}
