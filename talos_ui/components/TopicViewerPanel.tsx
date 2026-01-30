"use client";

import { useState, useEffect } from "react";
import { useROS2TopicWebSocket } from "@/lib/websocket";

// Constants
const DEBUG_PREFIX = "[TopicViewerPanel]";

const PANEL_STYLES: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  maxHeight: "100%",
  backgroundColor: "var(--vscode-editor-background)",
  border: "1px solid var(--vscode-panel-border)",
  borderRadius: "4px",
  overflow: "hidden",
} as const;

const HEADER_STYLES: React.CSSProperties = {
  padding: "8px 12px",
  backgroundColor: "var(--vscode-titleBar-activeBackground)",
  borderBottom: "1px solid var(--vscode-panel-border)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexShrink: 0,
} as const;

const CONTENT_STYLES: React.CSSProperties = {
  flex: 1,
  overflow: "hidden",
  position: "relative",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
} as const;

const SCROLLABLE_CONTENT_STYLES: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  position: "relative",
  overflow: "auto",
  padding: "12px",
} as const;

const ERROR_STYLES: React.CSSProperties = {
  padding: "8px 12px",
  backgroundColor: "rgba(244, 135, 113, 0.1)",
  color: "var(--vscode-errorForeground)",
  fontSize: "12px",
  flexShrink: 0,
} as const;

const ERROR_BANNER_STYLES: React.CSSProperties = {
  padding: "8px",
  marginBottom: "12px",
  backgroundColor: "rgba(244, 135, 113, 0.1)",
  color: "var(--vscode-errorForeground)",
  fontSize: "12px",
  borderRadius: "4px",
} as const;

const TEXT_STYLES = {
  topic: {
    fontSize: "12px",
    fontWeight: "500",
    color: "var(--vscode-foreground)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  msgType: {
    fontSize: "10px",
    color: "var(--vscode-descriptionForeground)",
  } as React.CSSProperties,
  timestamp: {
    fontSize: "10px",
    color: "var(--vscode-descriptionForeground)",
    marginLeft: "auto",
  } as React.CSSProperties,
  description: {
    color: "var(--vscode-descriptionForeground)",
    fontSize: "12px",
  } as React.CSSProperties,
  code: {
    fontFamily: "monospace",
    fontSize: "12px",
    color: "var(--vscode-foreground)",
    backgroundColor: "var(--vscode-editor-background)",
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  } as React.CSSProperties,
} as const;

// Types
interface TopicViewerPanelProps {
  container: string;
  topic: string;
  msgType: string;
  onClose: () => void;
}

// Utility functions
function formatData(data: unknown): string {
  if (data === null || data === undefined) {
    return "null";
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

// Sub-components
interface CloseButtonProps {
  onClick: () => void;
}

function CloseButton({ onClick }: CloseButtonProps) {
  const buttonStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: "var(--vscode-foreground)",
    cursor: "pointer",
    fontSize: "16px",
    padding: "0 4px",
    lineHeight: "1",
    flexShrink: 0,
  };

  return (
    <button
      onClick={onClick}
      style={buttonStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--vscode-toolbar-hoverBackground)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      ×
    </button>
  );
}

interface HeaderProps {
  topic: string;
  msgType: string;
  lastUpdateTime: Date | null;
  onClose: () => void;
}

function Header({ topic, msgType, lastUpdateTime, onClose }: HeaderProps) {
  return (
    <div style={HEADER_STYLES}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
        <span style={TEXT_STYLES.topic} title={topic}>
          {topic}
        </span>
        <span style={TEXT_STYLES.msgType}>({msgType})</span>
        {lastUpdateTime && (
          <span style={TEXT_STYLES.timestamp}>
            Last updated: {lastUpdateTime.toLocaleTimeString()}
          </span>
        )}
      </div>
      <CloseButton onClick={onClose} />
    </div>
  );
}

interface ErrorMessageProps {
  message: string;
}

function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <div style={ERROR_STYLES}>
      {message}
    </div>
  );
}

interface TopicContentProps {
  topicData: any;
  status: string;
}

function TopicContent({ topicData, status }: TopicContentProps) {
  if (!topicData) {
    return (
      <div style={TEXT_STYLES.description}>
        {status === "connecting" ? "Connecting..." : "No data received yet"}
      </div>
    );
  }

  if (topicData.available === false) {
    return (
      <div>
        <div style={ERROR_BANNER_STYLES}>
          Topic is not available (no messages received or data is stale)
        </div>
        {topicData.data === null || topicData.data === undefined ? (
          <div style={TEXT_STYLES.description}>
            Waiting for messages... (Topic may not be publishing or message type mismatch)
          </div>
        ) : (
          <pre style={TEXT_STYLES.code}>{formatData(topicData.data)}</pre>
        )}
      </div>
    );
  }

  if (topicData.data !== null && topicData.data !== undefined) {
    return <pre style={TEXT_STYLES.code}>{formatData(topicData.data)}</pre>;
  }

  return <div style={TEXT_STYLES.description}>No data available</div>;
}

// Main component
export default function TopicViewerPanel({
  container,
  topic,
  msgType,
  onClose,
}: TopicViewerPanelProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);

  const { topicData, status } = useROS2TopicWebSocket(container, topic, {
    onError: (err: Error) => {
      console.error(`${DEBUG_PREFIX} WebSocket error for ${topic}:`, err);
      setError(err.message);
      setIsConnected(false);
    },
    onOpen: () => {
      console.log(`${DEBUG_PREFIX} WebSocket connected for ${topic}`);
      setIsConnected(true);
      setError(null);
    },
    onClose: () => {
      console.log(`${DEBUG_PREFIX} WebSocket closed for ${topic}`);
      setIsConnected(false);
    },
    onMessage: (data: string) => {
      try {
        const parsed = JSON.parse(data);
        console.log(`${DEBUG_PREFIX} Received data for ${topic}:`, {
          available: parsed.available,
          hasData: parsed.data !== null && parsed.data !== undefined,
          dataType: typeof parsed.data,
        });
      } catch {
        // Ignore parse errors in logging
      }
    },
  });

  // Update connection status based on WebSocket status
  useEffect(() => {
    if (status === "connected") {
      setIsConnected(true);
      setError(null);
    } else if (status === "error" || status === "disconnected") {
      setIsConnected(false);
    }
  }, [status]);

  // Update last update time when data changes
  useEffect(() => {
    if (topicData) {
      setLastUpdateTime(new Date());
    }
  }, [topicData]);

  return (
    <div style={PANEL_STYLES}>
      <Header
        topic={topic}
        msgType={msgType}
        lastUpdateTime={lastUpdateTime}
        onClose={onClose}
      />
      <div style={CONTENT_STYLES}>
        {error && <ErrorMessage message={error} />}
        <div style={SCROLLABLE_CONTENT_STYLES}>
          <TopicContent topicData={topicData} status={status} />
        </div>
      </div>
    </div>
  );
}
