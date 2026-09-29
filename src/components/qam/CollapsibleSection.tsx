import { Focusable, PanelSection } from "@decky/ui";
import { useId, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";

type CollapsibleSectionProps = {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
};

const headingStyle: CSSProperties = {
  alignItems: "center",
  borderRadius: 4,
  color: "#aeb8c4",
  cursor: "pointer",
  display: "flex",
  fontSize: 14,
  fontWeight: 700,
  justifyContent: "space-between",
  letterSpacing: "0.06em",
  minHeight: 36,
  padding: "8px 10px",
  textTransform: "uppercase",
};

const focusedHeadingStyle: CSSProperties = {
  ...headingStyle,
  background: "rgba(102, 182, 236, 0.18)",
  color: "#fff",
};

export function CollapsibleSection({ title, children, defaultExpanded = false }: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [focused, setFocused] = useState(false);
  const id = useId();

  return (
    <div style={{ marginTop: 8 }}>
      <Focusable
        id={`${id}-heading`}
        role="button"
        aria-expanded={expanded}
        aria-controls={id}
        onActivate={() => setExpanded(value => !value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={focused ? focusedHeadingStyle : headingStyle}
      >
        <span>{title}</span>
        {expanded ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
      </Focusable>
      <div id={id} role="region" aria-labelledby={`${id}-heading`}>
        {expanded ? <PanelSection>{children}</PanelSection> : null}
      </div>
    </div>
  );
}
