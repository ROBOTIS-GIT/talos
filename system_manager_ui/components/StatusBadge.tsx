"use client";

import type { ReactNode } from "react";

interface StatusBadgeProps {
  status: boolean | string;
  label?: string;
  className?: string;
}

export default function StatusBadge({
  status,
  label,
  className = "",
}: StatusBadgeProps) {
  const isUp =
    typeof status === "boolean" ? status : status.toLowerCase() === "running";

  const displayLabel = label || (isUp ? "Running" : "Stopped");

  return (
    <span 
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${className}`}
      style={{
        backgroundColor: isUp 
          ? "rgba(137, 209, 133, 0.2)" 
          : "rgba(244, 135, 113, 0.2)",
        color: isUp 
          ? "var(--vscode-successForeground)" 
          : "var(--vscode-errorForeground)",
        border: `1px solid ${isUp ? "rgba(137, 209, 133, 0.3)" : "rgba(244, 135, 113, 0.3)"}`
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full mr-1.5"
        style={{
          backgroundColor: isUp 
            ? "var(--vscode-successForeground)" 
            : "var(--vscode-errorForeground)"
        }}
      />
      {displayLabel}
    </span>
  );
}
