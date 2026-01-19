"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useROS2TopicWebSocket } from "@/lib/websocket";

interface TopicViewerPanelProps {
  container: string;
  topic: string;
  msgType: string;
  onClose: () => void;
}

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
      console.error(`[TopicViewerPanel] WebSocket error for ${topic}:`, err);
      setError(err.message);
      setIsConnected(false);
    },
    onOpen: () => {
      console.log(`[TopicViewerPanel] WebSocket connected for ${topic}`);
      setIsConnected(true);
      setError(null);
    },
    onClose: () => {
      console.log(`[TopicViewerPanel] WebSocket closed for ${topic}`);
      setIsConnected(false);
    },
    onMessage: (data: string) => {
      try {
        const parsed = JSON.parse(data);
        console.log(`[TopicViewerPanel] Received data for ${topic}:`, {
          available: parsed.available,
          hasData: parsed.data !== null && parsed.data !== undefined,
          dataType: typeof parsed.data,
        });
      } catch (e) {
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

  const formatData = (data: any): string => {
    if (data === null || data === undefined) {
      return "null";
    }
    try {
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return String(data);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        maxHeight: "100%",
        backgroundColor: "var(--vscode-editor-background)",
        border: "1px solid var(--vscode-panel-border)",
        borderRadius: "4px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          backgroundColor: "var(--vscode-titleBar-activeBackground)",
          borderBottom: "1px solid var(--vscode-panel-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontSize: "12px",
              fontWeight: "500",
              color: "var(--vscode-foreground)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={topic}
          >
            {topic}
          </span>
          {isConnected && (
            <span
              style={{
                fontSize: "10px",
                color: "var(--vscode-descriptionForeground)",
              }}
            >
              • Live
            </span>
          )}
          <span
            style={{
              fontSize: "10px",
              color: "var(--vscode-descriptionForeground)",
            }}
          >
            ({msgType})
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--vscode-foreground)",
            cursor: "pointer",
            fontSize: "16px",
            padding: "0 4px",
            lineHeight: "1",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--vscode-toolbar-hoverBackground)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          position: "relative",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {error && (
          <div
            style={{
              padding: "8px 12px",
              backgroundColor: "rgba(244, 135, 113, 0.1)",
              color: "var(--vscode-errorForeground)",
              fontSize: "12px",
              flexShrink: 0,
            }}
          >
            {error}
          </div>
        )}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            position: "relative",
            overflow: "auto",
            padding: "12px",
          }}
        >
          {topicData ? (
            <div>
              {topicData.available === false && (
                <div
                  style={{
                    padding: "8px",
                    marginBottom: "12px",
                    backgroundColor: "rgba(244, 135, 113, 0.1)",
                    color: "var(--vscode-errorForeground)",
                    fontSize: "12px",
                    borderRadius: "4px",
                  }}
                >
                  Topic is not available (no messages received or data is stale)
                </div>
              )}
              {topicData.data !== null && topicData.data !== undefined ? (
                <pre
                  style={{
                    fontFamily: "monospace",
                    fontSize: "12px",
                    color: "var(--vscode-foreground)",
                    backgroundColor: "var(--vscode-editor-background)",
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {formatData(topicData.data)}
                </pre>
              ) : topicData.available === false ? (
                <div
                  style={{
                    color: "var(--vscode-descriptionForeground)",
                    fontSize: "12px",
                  }}
                >
                  Waiting for messages... (Topic may not be publishing or message type mismatch)
                </div>
              ) : (
                <div
                  style={{
                    color: "var(--vscode-descriptionForeground)",
                    fontSize: "12px",
                  }}
                >
                  No data available
                </div>
              )}
              {lastUpdateTime && (
                <div
                  style={{
                    marginTop: "12px",
                    paddingTop: "12px",
                    borderTop: "1px solid var(--vscode-panel-border)",
                    fontSize: "10px",
                    color: "var(--vscode-descriptionForeground)",
                  }}
                >
                  Last updated: {lastUpdateTime.toLocaleTimeString()}
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                color: "var(--vscode-descriptionForeground)",
                fontSize: "12px",
              }}
            >
              {status === "connecting" ? "Connecting..." : "No data received yet"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

