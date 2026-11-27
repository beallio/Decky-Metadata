import type { ArtworkSlot } from "../../../types";
import { colors } from "../../../tokens";

export const artworkBrowserClass = "decky-metadata-artwork-browser";

export const SLOT_ASPECT_RATIO: Record<ArtworkSlot, string> = {
  cover: "2 / 3",
  wide: "460 / 215",
  hero: "1920 / 620",
  logo: "16 / 9",
  icon: "1 / 1",
};

export const SLOT_GRID_MIN_WIDTH: Record<ArtworkSlot, number> = {
  cover: 140,
  wide: 215,
  hero: 300,
  logo: 205,
  icon: 108,
};

export const mimeLabel = (mime: string): string => {
  if (mime === "image/png") return "PNG";
  if (mime === "image/jpeg") return "JPEG";
  if (mime === "image/webp") return "WebP";
  if (mime === "image/vnd.microsoft.icon") return "ICO";
  return mime;
};

export const artworkBrowserCss = `
.${artworkBrowserClass} {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 18px;
}

.${artworkBrowserClass}__tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(14, 20, 27, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.${artworkBrowserClass}__bumper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.12);
  color: ${colors.textSecondary};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  flex: 0 0 auto;
}

.${artworkBrowserClass}__tab-list {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
}

.${artworkBrowserClass}__tab {
  padding: 5px 9px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  color: ${colors.textSecondary};
  background: transparent;
  white-space: nowrap;
  cursor: pointer;
  border: 2px solid transparent;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}

.${artworkBrowserClass}__tab.is-active {
  background: rgba(26, 159, 255, 0.24);
  color: #ffffff;
  border-color: rgba(26, 159, 255, 0.65);
}

.${artworkBrowserClass}__tab.gpfocus,
.${artworkBrowserClass}__tab:focus {
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
  border-color: #ffffff;
  outline: none;
}

.${artworkBrowserClass}__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
}

.${artworkBrowserClass}__game-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 220px;
}

.${artworkBrowserClass}__game-title {
  font-size: 13px;
  font-weight: 600;
  color: ${colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.${artworkBrowserClass}__pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  background: rgba(26, 159, 255, 0.22);
  color: #8fd2ff;
  flex: 0 0 auto;
}

.${artworkBrowserClass}__toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.${artworkBrowserClass}__action-btn.DialogButton {
  padding: 5px 12px !important;
  min-width: 0 !important;
  width: auto !important;
  font-size: 12px !important;
  line-height: 1.3 !important;
}

.${artworkBrowserClass}__grid {
  display: grid;
  gap: 12px;
  width: 100%;
}

.${artworkBrowserClass}__card {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(16, 22, 30, 0.85);
  border: 2px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}

.${artworkBrowserClass}__card.gpfocus,
.${artworkBrowserClass}__card:focus {
  transform: scale(1.03);
  border-color: #ffffff;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.55);
  outline: none;
  z-index: 2;
}

.${artworkBrowserClass}__card-media {
  position: relative;
  width: 100%;
  background: rgba(8, 12, 18, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.${artworkBrowserClass}__card-media.is-transparent-bg {
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.06) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.06) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.06) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.06) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}

.${artworkBrowserClass}__card-img {
  width: 100%;
  height: 100%;
  display: block;
}

.${artworkBrowserClass}__badges {
  position: absolute;
  top: 6px;
  left: 6px;
  right: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  pointer-events: none;
}

.${artworkBrowserClass}__badge {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  background: rgba(10, 15, 22, 0.85);
  color: #ffffff;
}

.${artworkBrowserClass}__badge--official {
  background: rgba(26, 159, 255, 0.92);
  color: #06131f;
}

.${artworkBrowserClass}__badge--animated {
  background: rgba(164, 92, 255, 0.92);
  color: #ffffff;
}

.${artworkBrowserClass}__card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 5px 8px;
  font-size: 11px;
  color: ${colors.textSecondary};
  background: rgba(12, 17, 24, 0.92);
}

.${artworkBrowserClass}__card-author {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.${artworkBrowserClass}__notice {
  padding: 14px 16px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.${artworkBrowserClass}__chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.${artworkBrowserClass}__chip {
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.08);
  color: ${colors.textSecondary};
  border: 2px solid transparent;
  cursor: pointer;
}

.${artworkBrowserClass}__chip.is-selected {
  background: rgba(26, 159, 255, 0.28);
  color: #ffffff;
  border-color: rgba(26, 159, 255, 0.8);
}

.${artworkBrowserClass}__chip.gpfocus,
.${artworkBrowserClass}__chip:focus {
  border-color: #ffffff;
  outline: none;
}

.${artworkBrowserClass}__manage-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.${artworkBrowserClass}__manage-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.${artworkBrowserClass}__manage-thumb {
  width: 96px;
  height: 58px;
  border-radius: 4px;
  background: rgba(10, 15, 22, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex: 0 0 96px;
}

.${artworkBrowserClass}__manage-thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.${artworkBrowserClass}__manage-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.${artworkBrowserClass}__logo-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 1920 / 620;
  border-radius: 6px;
  overflow: hidden;
  background: linear-gradient(135deg, #162231 0%, #0d141d 100%);
  border: 1px solid rgba(255, 255, 255, 0.14);
}

.${artworkBrowserClass}__anchor-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}
`;
