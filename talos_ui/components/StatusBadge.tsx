"use client";

// Constants
const SUCCESS_STATUS_VALUES = ["running", "available"] as const;
const DEFAULT_LABELS = {
  up: "Running",
  down: "Stopped",
} as const;

const SUCCESS_COLORS = {
  background: "rgba(137, 209, 133, 0.2)",
  border: "rgba(137, 209, 133, 0.3)",
  foreground: "var(--vscode-successForeground)",
} as const;

const ERROR_COLORS = {
  background: "rgba(244, 135, 113, 0.2)",
  border: "rgba(244, 135, 113, 0.3)",
  foreground: "var(--vscode-errorForeground)",
} as const;

// Types
type StatusValue = boolean | string;

interface StatusBadgeProps {
  status: StatusValue;
  label?: string;
  className?: string;
}

// Utility functions
function isStatusUp(status: StatusValue): boolean {
  if (typeof status === "boolean") {
    return status;
  }
  const normalized = status.toLowerCase();
  return SUCCESS_STATUS_VALUES.some((val) => normalized === val);
}

function getStatusLabel(isUp: boolean, customLabel?: string): string {
  return customLabel || (isUp ? DEFAULT_LABELS.up : DEFAULT_LABELS.down);
}

function getStatusStyles(isUp: boolean): React.CSSProperties {
  const colors = isUp ? SUCCESS_COLORS : ERROR_COLORS;
  return {
    backgroundColor: colors.background,
    color: colors.foreground,
    border: `1px solid ${colors.border}`,
  };
}

function getIndicatorStyle(isUp: boolean): React.CSSProperties {
  return {
    backgroundColor: isUp ? SUCCESS_COLORS.foreground : ERROR_COLORS.foreground,
  };
}

// Component
export default function StatusBadge({
  status,
  label,
  className = "",
}: StatusBadgeProps) {
  const isUp = isStatusUp(status);
  const displayLabel = getStatusLabel(isUp, label);
  const badgeStyles = getStatusStyles(isUp);
  const indicatorStyle = getIndicatorStyle(isUp);

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${className}`}
      style={badgeStyles}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={indicatorStyle} />
      {displayLabel}
    </span>
  );
}
