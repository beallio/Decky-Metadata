import {
  DialogButton,
  Focusable,
  NavEntryPositionPreferences,
  PanelSection,
  PanelSectionRow,
  showModal,
} from "@decky/ui";
import { useState } from "react";

import { saveMetadata } from "./backend";
import { metadataTemplate } from "./metadataForm";
import {
  appName,
  getNativeOverview,
  isNativeNonSteamShortcut,
  metadataCache,
} from "./steam/core";
import { applyMetadata, ensureMetadataCache, refreshCompatibilitySurfaces } from "./steam/metadataPatch";
import { toastError, toastSuccess } from "./toast";
import { DeckCompatibilityCategory } from "./types";

type CompatibilityChoice = DeckCompatibilityCategory | null;

const choices: Array<{ value: CompatibilityChoice; label: string }> = [
  { value: null, label: "Automatic" },
  { value: 3, label: "Verified" },
  { value: 2, label: "Playable" },
  { value: 1, label: "Unsupported" },
  { value: 0, label: "Unknown" },
];

export const compatibilityLabel = (category: DeckCompatibilityCategory): string =>
  ({ 0: "Unknown", 1: "Unsupported", 2: "Playable", 3: "Verified" })[category];

const isCompatibilityCategory = (value: unknown): value is DeckCompatibilityCategory =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3;

export const saveCompatibilityOverride = async (
  appId: number,
  override: CompatibilityChoice
) => {
  await ensureMetadataCache();
  if (!isNativeNonSteamShortcut(getNativeOverview(appId))) {
    throw new Error("Compatibility status is available only for non-Steam games.");
  }
  const metadata = metadataCache[String(appId)] || metadataTemplate(appName(appId));
  const saved = await saveMetadata(appId, {
    ...metadata,
    deck_compat_override: override,
  });
  metadataCache[String(appId)] = saved;
  applyMetadata(appId);
  refreshCompatibilitySurfaces(appId);
  return saved;
};

const choiceLabel = (choice: CompatibilityChoice, resolved: CompatibilityChoice): string => {
  if (choice !== null) return compatibilityLabel(choice);
  return resolved === null ? "Automatic" : `Automatic (Valve: ${compatibilityLabel(resolved)})`;
};

export const CompatibilityStatusModal = ({
  appId,
  closeModal,
}: {
  appId: number;
  closeModal: () => void;
}) => {
  const [saving, setSaving] = useState(false);
  const metadata = metadataCache[String(appId)];
  const selected = isCompatibilityCategory(metadata?.deck_compat_override)
    ? metadata.deck_compat_override
    : null;
  const resolved = isCompatibilityCategory(metadata?.deck_compat_category)
    ? metadata.deck_compat_category
    : null;

  const save = async (choice: CompatibilityChoice) => {
    if (saving) return;
    setSaving(true);
    try {
      await saveCompatibilityOverride(appId, choice);
      toastSuccess("Compatibility status", "Compatibility status saved");
      closeModal();
    } catch (error) {
      toastError("Compatibility status", String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelSection title="Compatibility status">
      <PanelSectionRow>
        <div style={{ color: "#cbd5e1", fontSize: "14px", lineHeight: 1.4 }}>
          {"Choose how this non-Steam game appears in Steam. Automatic uses Valve's matched status."}
        </div>
      </PanelSectionRow>
      <Focusable
        flow-children="vertical"
        navEntryPreferPosition={NavEntryPositionPreferences.PREFERRED_CHILD}
      >
        {choices.map((choice) => (
          <PanelSectionRow key={String(choice.value)}>
            <DialogButton
              focusable={true}
              preferredFocus={choice.value === null}
              disabled={saving}
              onClick={() => void save(choice.value)}
              style={{ width: "100%", textAlign: "left" }}
            >
              {selected === choice.value ? `Selected: ${choiceLabel(choice.value, resolved)}` : choiceLabel(choice.value, resolved)}
            </DialogButton>
          </PanelSectionRow>
        ))}
      </Focusable>
    </PanelSection>
  );
};

export const openCompatibilityStatusModal = async (appId: number, parent?: EventTarget) => {
  try {
    await ensureMetadataCache();
    if (!isNativeNonSteamShortcut(getNativeOverview(appId))) {
      throw new Error("Compatibility status is available only for non-Steam games.");
    }
    let modal: ReturnType<typeof showModal> | undefined;
    modal = showModal(
      <CompatibilityStatusModal appId={appId} closeModal={() => modal?.Close()} />,
      parent
    );
    return modal;
  } catch (error) {
    toastError("Compatibility status", String(error));
    return undefined;
  }
};
