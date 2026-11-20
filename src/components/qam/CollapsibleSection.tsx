import { Focusable, PanelSection, quickAccessControlsClasses } from "@decky/ui";
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
const headingCss = `
.${headingClassName}.gpfocus {
  background: #3d4450;
  color: #fff;
  border-radius: 2px;
}
`;

const headingStyle: CSSProperties = {
  alignItems: "center",
  cursor: "pointer",
  display: "flex",
  justifyContent: "space-between",
};

const headingTextStyle: CSSProperties = {
  minWidth: 0,
};

const headingAccessoriesStyle: CSSProperties = {
  alignItems: "center",
  display: "inline-flex",
  flexShrink: 0,
  gap: 8,
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
    <PanelSection>
      <style>{headingCss}</style>
      <Focusable
        id={`${id}-heading`}
        className={`${quickAccessControlsClasses.PanelSectionTitle} ${headingClassName}`}
        role="button"
        aria-expanded={expanded}
        aria-controls={id}
        onActivate={() => setExpanded(value => !value)}
        onFocus={(event) => handleFocus(event.currentTarget)}
        onGamepadFocus={(event) => handleFocus(event?.currentTarget ?? event?.target)}
        style={headingStyle}
      >
        <span style={headingTextStyle}>{title}</span>
        <span style={headingAccessoriesStyle}>
          <span aria-hidden="true">{icon}</span>
          {expanded ? <FaChevronUp size={18} /> : <FaChevronDown size={18} />}
        </span>
      </Focusable>
      <div id={id} role="region" aria-labelledby={`${id}-heading`}>
        {expanded ? children : null}
      </div>
    </PanelSection>
  );
}
