"use client";

import Link from "next/link";
import StatusBadge from "./StatusBadge";
import ServiceControls from "./ServiceControls";
import type { ServiceInfo, ServiceStatusResponse } from "@/types/api";

interface ServiceCardProps {
  container: string;
  service: ServiceInfo;
  status?: ServiceStatusResponse;
  onStatusUpdate?: () => void;
}

export default function ServiceCard({
  container,
  service,
  status,
  onStatusUpdate,
}: ServiceCardProps) {
  const isUp = status?.is_up ?? false;
  const uptime = status?.uptime_seconds;

  const formatUptime = (seconds: number | null | undefined): string => {
    if (!seconds) return "";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  return (
    <div 
      className="p-4 border rounded"
      style={{
        backgroundColor: "var(--vscode-sidebar-background)",
        borderColor: "var(--vscode-panel-border)",
        color: "var(--vscode-foreground)"
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 
              className="text-base font-medium"
              style={{ color: "var(--vscode-foreground)" }}
            >
              {service.label}
            </h3>
            <StatusBadge status={isUp} />
          </div>
          <p 
            className="text-xs font-mono"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            {service.id}
          </p>
          {status && (
            <div 
              className="mt-2 text-xs"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              {status.pid && (
                <span className="mr-4">PID: {status.pid}</span>
              )}
              {uptime !== null && uptime !== undefined && (
                <span>Uptime: {formatUptime(uptime)}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <ServiceControls
          container={container}
          service={service.id}
          onActionComplete={onStatusUpdate}
        />
        <div className="flex items-center gap-2">
          <Link
            href={`/containers/${container}/services/${service.id}/settings`}
            className="px-3 py-1.5 text-xs font-normal rounded"
            style={{
              backgroundColor: "var(--vscode-button-secondaryBackground)",
              color: "var(--vscode-button-secondaryForeground)",
              textDecoration: "none",
              display: "inline-block",
              transition: "background-color 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--vscode-button-secondaryHoverBackground)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--vscode-button-secondaryBackground)";
            }}
          >
            Settings
          </Link>
        <Link
          href={`/containers/${container}/services/${service.id}/logs`}
            className="px-3 py-1.5 text-xs font-normal rounded"
            style={{
              backgroundColor: "var(--vscode-button-background)",
              color: "var(--vscode-button-foreground)",
              textDecoration: "none",
              display: "inline-block",
              transition: "background-color 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--vscode-button-hoverBackground)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--vscode-button-background)";
            }}
        >
          View Logs
        </Link>
        </div>
      </div>
    </div>
  );
}
