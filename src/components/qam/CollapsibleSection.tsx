import { Focusable, PanelSection } from "@decky/ui";
import { useId, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";

type CollapsibleSectionProps = {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
};

const headingClassName = "decky-metadata-qam-section-heading";
// Look lives in CSS, not inline, so Steam's .gpfocus class (set by gamepad focus even when DOM focus lags, #55) can override the colour.
const headingCss = `
.${headingClassName} {
  align-items: center;
  border-radius: 4px;
  color: #aeb8c4;
  cursor: pointer;
  display: flex;
  font-size: 16px;
  font-weight: 700;
  justify-content: space-between;
  letter-spacing: 0.06em;
  min-height: 40px;
  padding: 8px 10px;
  text-transform: uppercase;
}
.${headingClassName}.gpfocus {
  background: rgba(102, 182, 236, 0.18);
  color: #fff;
}
`;

const headingLabelStyle: CSSProperties = {
  alignItems: "center",
  display: "inline-flex",
  gap: 8,
  minWidth: 0,
};

const headingIconStyle: CSSProperties = {
  display: "inline-flex",
  flexShrink: 0,
};

export function CollapsibleSection({ title, icon, children, defaultExpanded = false }: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const id = useId();
  const handleFocus = (target: EventTarget | null | undefined) => {
    const heading = target as HTMLElement | null | undefined;
    heading?.ownerDocument?.defaultView?.requestAnimationFrame?.(() => {
      if (heading.isConnected) heading.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  };

  return (
    <div style={{ marginTop: 8 }}>
      <style>{headingCss}</style>
      <Focusable
        id={`${id}-heading`}
        className={headingClassName}
        role="button"
        aria-expanded={expanded}
        aria-controls={id}
        onActivate={() => setExpanded(value => !value)}
        onFocus={(event) => handleFocus(event.currentTarget)}
        onGamepadFocus={(event) => handleFocus(event?.currentTarget ?? event?.target)}
      >
        <span style={headingLabelStyle}>
          <span aria-hidden="true" style={headingIconStyle}>{icon}</span>
          <span>{title}</span>
        </span>
        {expanded ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
      </Focusable>
      <div id={id} role="region" aria-labelledby={`${id}-heading`}>
        {expanded ? <PanelSection>{children}</PanelSection> : null}
      </div>
    </div>
  );
}
