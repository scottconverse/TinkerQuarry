import { ButtonHTMLAttributes, CSSProperties, forwardRef, useId } from "react";
import { CONTROL_RADIUS_CLASS, CONTROL_SIZE_CLASSES } from "./controlStyles";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "success" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  isActive?: boolean;
}

const DISABLED_STYLE: CSSProperties = {
  backgroundColor: "var(--bg-secondary)",
  color: "var(--text-secondary)",
  cursor: "not-allowed",
  border: "1px solid var(--border-primary)",
  // Gate 2026-07-09 (UX-1): without this, a disabled secondary button is visually identical
  // to an enabled one (same bg/border) — exactly during the first-run "Local AI setup needed"
  // window where the Example/Import buttons are disabled and looked clickable.
  opacity: 0.65,
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "secondary",
      size = "md",
      isActive,
      className = "",
      disabled,
      style,
      title,
      "aria-describedby": userDescribedBy,
      onMouseEnter: userMouseEnter,
      onMouseLeave: userMouseLeave,
      ...props
    },
    ref,
  ) => {
    // UIUX-6 (gate 2026-07-19): `disabled` takes a control out of the tab order, so a reason
    // carried only in `title` was reachable by sighted mouse hover and by nothing else. When a
    // disabled button explains itself, that explanation is published as a real description too.
    const reasonId = useId();
    const disabledReason =
      disabled && typeof title === "string" && title.trim() ? title.trim() : null;
    const describedBy =
      [userDescribedBy, disabledReason ? reasonId : null].filter(Boolean).join(" ") ||
      undefined;
    const getBaseStyle = (): CSSProperties => {
      if (disabled) return DISABLED_STYLE;
      switch (variant) {
        case "primary":
          return {
            backgroundColor: "var(--accent-primary)",
            color: "var(--text-inverse)",
            border: "1px solid var(--accent-primary)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
          };
        case "secondary":
          return {
            backgroundColor: isActive
              ? "var(--bg-tertiary)"
              : "var(--bg-secondary)",
            color: "var(--text-primary)",
            border: `1px solid ${isActive ? "var(--accent-primary)" : "var(--border-primary)"}`,
          };
        case "ghost":
          return {
            backgroundColor: "transparent",
            color: "var(--text-secondary)",
          };
        case "success":
          return {
            backgroundColor: "var(--color-success)",
            color: "var(--text-inverse)",
            border: "none",
          };
        case "danger":
          return {
            backgroundColor: "var(--color-error)",
            color: "var(--text-inverse)",
            border: "none",
          };
      }
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!disabled) {
        const el = e.currentTarget;
        switch (variant) {
          case "primary":
            el.style.backgroundColor = "var(--accent-hover)";
            el.style.borderColor = "var(--accent-hover)";
            break;
          case "secondary":
            el.style.backgroundColor = isActive
              ? "var(--bg-tertiary)"
              : "var(--bg-tertiary)";
            break;
          case "ghost":
            el.style.backgroundColor = "var(--bg-secondary)";
            el.style.color = "var(--text-primary)";
            break;
        }
      }
      userMouseEnter?.(e);
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!disabled) {
        const el = e.currentTarget;
        switch (variant) {
          case "primary":
            el.style.backgroundColor = "var(--accent-primary)";
            el.style.borderColor = "var(--accent-primary)";
            break;
          case "secondary":
            el.style.backgroundColor = isActive
              ? "var(--bg-tertiary)"
              : "var(--bg-secondary)";
            break;
          case "ghost":
            el.style.backgroundColor = "transparent";
            el.style.color = "var(--text-secondary)";
            break;
        }
      }
      userMouseLeave?.(e);
    };

    const baseClasses = `inline-flex items-center justify-center ${CONTROL_RADIUS_CLASS} font-medium transition-colors focus:outline-none focus:ring-2`;

    return (
      <>
        <button
          ref={ref}
          className={`${baseClasses} ${CONTROL_SIZE_CLASSES[size]} ${className}`}
          style={{ ...getBaseStyle(), ...style }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          disabled={disabled}
          title={title}
          aria-describedby={describedBy}
          {...props}
        />
        {/* Rendered as a sibling, not a child: inside the button it would become part of the
            control's accessible NAME instead of its description. `sr-only` is absolutely
            positioned, so it adds no layout box to the toolbar. */}
        {disabledReason && (
          <span id={reasonId} className="sr-only">
            {disabledReason}
          </span>
        )}
      </>
    );
  },
);

Button.displayName = "Button";
