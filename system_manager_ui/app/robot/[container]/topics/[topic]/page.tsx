"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useROS2TopicWebSocket, type WebSocketStatus } from "@/lib/websocket";
import type { ROS2TopicDataResponse } from "@/types/api";
import StatusBadge from "@/components/StatusBadge";
import LogViewer from "@/components/LogViewer";

// Constants
const NO_DATA_MESSAGE = "No data available yet. Waiting for messages...\n";
const MIN_LOG_HEIGHT = "400px";
const LOG_HEIGHT = "calc(100vh - 200px)";

const ERROR_STYLES = {
  backgroundColor: "rgba(244, 135, 113, 0.1)",
  borderColor: "rgba(244, 135, 113, 0.3)",
} as const;

const HEADER_STYLES = {
  backgroundColor: "var(--vscode-editor-background)",
} as const;

// Utility functions
function formatXML(xml: string): string {
  try {
    const trimmed = xml.trim();
    let formatted = "";
    let indent = 0;
    const tab = "  ";
    const tokens = trimmed.split(/(<[^>]+>)/);

    for (const token of tokens) {
      if (!token.trim()) continue;

      if (token.startsWith("</")) {
        indent = Math.max(0, indent - 1);
        formatted += tab.repeat(indent) + token + "\n";
      } else if (token.startsWith("<")) {
        if (token.endsWith("/>") || token.startsWith("<?") || token.startsWith("<!--")) {
          formatted += tab.repeat(indent) + token + "\n";
        } else {
          formatted += tab.repeat(indent) + token + "\n";
          if (!token.endsWith("/>") && !token.startsWith("<?") && !token.startsWith("<!--")) {
            indent++;
          }
        }
      } else {
        const text = token.trim();
        if (text) {
          formatted += tab.repeat(indent) + text + "\n";
        }
      }
    }

    return formatted.trim();
  } catch {
    return xml;
  }
}

function formatData(data: unknown): string {
  if (data === null || data === undefined) {
    return NO_DATA_MESSAGE;
  }

  if (typeof data === "string") {
    const trimmed = data.trim();
    if (trimmed.startsWith("<?xml") || trimmed.startsWith("<")) {
      try {
        return formatXML(data);
      } catch {
        return data;
      }
    }
    return data;
  }

  if (typeof data === "object") {
    return JSON.stringify(data, null, 2);
  }

  return String(data);
}

function getWebSocketStatusBadge(status: WebSocketStatus): {
  status: "running" | "pending" | "unavailable";
  label: string;
} {
  switch (status) {
    case "connected":
      return { status: "running", label: "Connected" };
    case "connecting":
      return { status: "pending", label: "Connecting..." };
    case "error":
      return { status: "pending", label: "Error" };
    default:
      return { status: "unavailable", label: "Disconnected" };
  }
}

// Button component
interface ButtonProps {
  onClick: () => void;
  label: string;
  variant?: "primary" | "secondary";
}

function Button({ onClick, label, variant = "primary" }: ButtonProps) {
  const isPrimary = variant === "primary";
  const baseStyle: React.CSSProperties = {
    padding: "4px 12px",
    fontSize: "12px",
    fontWeight: "normal",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    transition: "background-color 0.2s",
    backgroundColor: isPrimary
      ? "var(--vscode-button-background)"
      : "var(--vscode-button-secondaryBackground)",
    color: isPrimary
      ? "var(--vscode-button-foreground)"
      : "var(--vscode-button-secondaryForeground)",
  };

  const hoverBackground = isPrimary
    ? "var(--vscode-button-hoverBackground)"
    : "var(--vscode-button-secondaryHoverBackground)";

  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-sm font-normal rounded"
      style={baseStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = hoverBackground;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = baseStyle.backgroundColor as string;
      }}
    >
      {label}
    </button>
  );
}

// Error message component
interface ErrorMessageProps {
  error: string;
  onRetry: () => void;
}

function ErrorMessage({ error, onRetry }: ErrorMessageProps) {
  return (
    <div className="border rounded p-4 mb-4" style={ERROR_STYLES}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium mb-1" style={{ color: "var(--vscode-errorForeground)" }}>
            Error loading topic data
          </h3>
          <p className="text-sm" style={{ color: "var(--vscode-errorForeground)" }}>
            {error}
          </p>
        </div>
        <Button onClick={onRetry} label="Retry" variant="primary" />
      </div>
    </div>
  );
}

// Header component
interface HeaderProps {
  topic: string;
  container: string;
  topicData: ROS2TopicDataResponse | null;
  isConnected: boolean;
  wsStatus: WebSocketStatus;
  onBack: () => void;
}

function Header({
  topic,
  container,
  topicData,
  isConnected,
  wsStatus,
  onBack,
}: HeaderProps) {
  const wsBadge = getWebSocketStatusBadge(wsStatus);

  return (
    <div
      className="sticky top-0 z-10 mb-6 pb-6 -mx-6 px-6 -mt-6"
      style={HEADER_STYLES}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-2" style={{ color: "var(--vscode-foreground)" }}>
            {topic}
          </h1>
          <div className="flex items-center gap-3">
            <p className="text-sm" style={{ color: "var(--vscode-descriptionForeground)" }}>
              Container: {container}
              {topicData && ` | Domain ID: ${topicData.domain_id}`}
              {topicData && ` | Type: ${topicData.msg_type}`}
            </p>
            {topicData && (
              <StatusBadge
                status={topicData.available ? "available" : "unavailable"}
                label={topicData.available ? "Available" : "No Data"}
              />
            )}
            {isConnected && (
              <span style={{ marginLeft: "8px", color: "var(--vscode-descriptionForeground)" }}>
                • Live
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={wsBadge.status} label={wsBadge.label} />
          <Button onClick={onBack} label="Back" variant="secondary" />
        </div>
      </div>
    </div>
  );
}

// Loading component
function LoadingState() {
  return (
    <div className="flex justify-center items-center h-64">
      <div style={{ color: "var(--vscode-descriptionForeground)" }}>
        Connecting to topic...
      </div>
    </div>
  );
}

// Main component
export default function RobotTopicPage() {
  const params = useParams();
  const router = useRouter();
  const container = params.container as string;
  const topic = decodeURIComponent(params.topic as string);

  const [topicData, setTopicData] = useState<ROS2TopicDataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayData, setDisplayData] = useState<string>(NO_DATA_MESSAGE);
  const [isConnected, setIsConnected] = useState(false);
  const lastDataRef = useRef<string | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle WebSocket message
  const handleMessage = useCallback(
    (data: string) => {
      try {
        const parsed = JSON.parse(data);

        if (parsed && (parsed.data !== undefined || parsed.available !== undefined)) {
          const response = parsed as ROS2TopicDataResponse;
          setTopicData(response);

          if (response.available && response.data !== null && response.data !== undefined) {
            const formatted = formatData(response.data);
            if (formatted !== lastDataRef.current) {
              lastDataRef.current = formatted;

              if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
              }

              setDisplayData(formatted);
            }
          } else {
            setDisplayData(NO_DATA_MESSAGE);
          }
          setError(null);
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e, data);
        setDisplayData(data);
      }
    },
    []
  );

  // WebSocket hook
  const { status: wsStatus } = useROS2TopicWebSocket(container, topic, {
    onMessage: handleMessage,
    onError: (err: Error) => {
      setError(err.message);
    },
    onOpen: () => {
      setIsConnected(true);
      setError(null);
    },
    onClose: () => {
      setIsConnected(false);
    },
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // Navigation handlers
  const handleBack = useCallback(() => {
    router.push(`/robot/${container}`);
  }, [router, container]);

  const handleRetry = useCallback(() => {
    window.location.reload();
  }, []);

  // Loading state
  if (wsStatus === "connecting") {
    return <LoadingState />;
  }

  return (
    <>
      <Header
        topic={topic}
        container={container}
        topicData={topicData}
        isConnected={isConnected}
        wsStatus={wsStatus}
        onBack={handleBack}
      />

      {error && <ErrorMessage error={error} onRetry={handleRetry} />}

      <div style={{ height: LOG_HEIGHT, minHeight: MIN_LOG_HEIGHT }}>
        <LogViewer
          logs={displayData || NO_DATA_MESSAGE}
          autoScroll={true}
          className="h-full"
        />
      </div>
    </>
  );
}
