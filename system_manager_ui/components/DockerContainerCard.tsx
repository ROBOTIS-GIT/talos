"use client";

import { useState, useMemo } from "react";
import Convert from "ansi-to-html";
import StatusBadge from "./StatusBadge";
import { useTheme } from "@/contexts/ThemeContext";
import {
  controlDockerContainer,
  getDockerContainerLogs,
} from "@/lib/api";
import type { DockerContainerInfo } from "@/types/api";

interface DockerContainerCardProps {
  container: DockerContainerInfo;
  onActionComplete?: () => void;
}

export default function DockerContainerCard({
  container,
  onActionComplete,
}: DockerContainerCardProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string>("");
  const [loadingLogs, setLoadingLogs] = useState(false);
  const { theme } = useTheme();

  // Initialize ANSI converter with theme-aware colors
  const convert = useMemo(
    () => {
      const isDark = theme === "dark";
      return new Convert({
        fg: isDark ? "#d4d4d4" : "#333333",
        bg: isDark ? "#1e1e1e" : "#ffffff",
        newline: false,
        escapeXML: true,
        stream: false,
        colors: isDark ? {
          // Dark theme colors
          0: "#000000",
          1: "#cd3131",
          2: "#0dbc79",
          3: "#e5e510",
          4: "#2472c8",
          5: "#bc3fbc",
          6: "#11a8cd",
          7: "#e5e5e5",
          8: "#666666",
          9: "#f14c4c",
          10: "#23d18b",
          11: "#f5f543",
          12: "#3b8eea",
          13: "#d670d6",
          14: "#29b8db",
          15: "#e5e5e5",
        } : {
          // Light theme colors
          0: "#000000",
          1: "#cd3131",
          2: "#0dbc79",
          3: "#e5e510",
          4: "#2472c8",
          5: "#bc3fbc",
          6: "#11a8cd",
          7: "#333333",
          8: "#666666",
          9: "#f14c4c",
          10: "#23d18b",
          11: "#f5f543",
          12: "#3b8eea",
          13: "#d670d6",
          14: "#29b8db",
          15: "#333333",
        },
      });
    },
    [theme]
  );

  const handleAction = async (action: "start" | "stop" | "restart") => {
    setLoading(action);
    setError(null);

    try {
      await controlDockerContainer(container.name, action);
      onActionComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to control container");
    } finally {
      setLoading(null);
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleViewLogs = async () => {
    if (showLogs) {
      setShowLogs(false);
      return;
    }

    setLoadingLogs(true);
    try {
      const response = await getDockerContainerLogs(container.name, 100);
      setLogs(response.logs);
      setShowLogs(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch logs");
    } finally {
      setLoadingLogs(false);
    }
  };

  const isRunning = container.status.toLowerCase() === "running";

  const buttonStyle = (isPrimary = false) => ({
    padding: "4px 12px",
    fontSize: "12px",
    fontWeight: "400",
    border: "none",
    borderRadius: "2px",
    cursor: loading !== null ? "not-allowed" : "pointer",
    opacity: loading !== null ? 0.5 : 1,
    backgroundColor: isPrimary 
      ? "var(--vscode-button-background)" 
      : "var(--vscode-button-secondaryBackground)",
    color: isPrimary 
      ? "var(--vscode-button-foreground)" 
      : "var(--vscode-button-secondaryForeground)",
    transition: "background-color 0.2s",
  });

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
              {container.name}
            </h3>
            <StatusBadge status={container.status} />
          </div>
          <p 
            className="text-xs font-mono mb-1"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            {container.id.substring(0, 12)}
          </p>
          <p 
            className="text-xs"
            style={{ color: "var(--vscode-foreground)" }}
          >
            {container.image}
          </p>
          <p 
            className="text-xs mt-1"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            Created: {new Date(container.created).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {isRunning ? (
          <>
            <button
              onClick={() => handleAction("stop")}
              disabled={loading !== null}
              style={buttonStyle()}
              onMouseEnter={(e) => {
                if (loading === null) {
                  e.currentTarget.style.backgroundColor = "var(--vscode-button-secondaryHoverBackground)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--vscode-button-secondaryBackground)";
              }}
            >
              {loading === "stop" ? "Stopping..." : "Stop"}
            </button>
            <button
              onClick={() => handleAction("restart")}
              disabled={loading !== null}
              style={buttonStyle()}
              onMouseEnter={(e) => {
                if (loading === null) {
                  e.currentTarget.style.backgroundColor = "var(--vscode-button-secondaryHoverBackground)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--vscode-button-secondaryBackground)";
              }}
            >
              {loading === "restart" ? "Restarting..." : "Restart"}
            </button>
          </>
        ) : (
          <button
            onClick={() => handleAction("start")}
            disabled={loading !== null}
            style={buttonStyle(true)}
            onMouseEnter={(e) => {
              if (loading === null) {
                e.currentTarget.style.backgroundColor = "var(--vscode-button-hoverBackground)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--vscode-button-background)";
            }}
          >
            {loading === "start" ? "Starting..." : "Start"}
          </button>
        )}
        <button
          onClick={handleViewLogs}
          disabled={loadingLogs}
          style={buttonStyle()}
          onMouseEnter={(e) => {
            if (!loadingLogs) {
              e.currentTarget.style.backgroundColor = "var(--vscode-button-secondaryHoverBackground)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--vscode-button-secondaryBackground)";
          }}
        >
          {loadingLogs ? "Loading..." : showLogs ? "Hide Logs" : "View Logs"}
        </button>
      </div>

      {error && (
        <div 
          className="mt-2 text-xs px-2 py-1 rounded"
          style={{
            color: "var(--vscode-errorForeground)",
            backgroundColor: "rgba(244, 135, 113, 0.1)",
            border: "1px solid rgba(244, 135, 113, 0.3)"
          }}
        >
          {error}
        </div>
      )}

      {showLogs && (
        <div className="mt-4">
          <pre
            className="p-3 rounded overflow-auto font-mono text-xs"
            style={{
              backgroundColor: theme === "dark" ? "#1e1e1e" : "#ffffff",
              color: theme === "dark" ? "#d4d4d4" : "#333333",
              border: "1px solid var(--vscode-panel-border)",
              maxHeight: "300px"
            }}
            dangerouslySetInnerHTML={{
              __html: logs ? convert.toHtml(logs) : "No logs available",
            }}
          />
        </div>
      )}
    </div>
  );
}
