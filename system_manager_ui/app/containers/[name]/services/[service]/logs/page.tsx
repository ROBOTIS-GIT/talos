"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import LogViewer from "@/components/LogViewer";
import { clearServiceLogs } from "@/lib/api";
import { createLogsWebSocket } from "@/lib/websocket";

export default function ServiceLogsPage() {
  const params = useParams();
  const containerName = params.name as string;
  const serviceName = params.service as string;

  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Always connect to WebSocket for real-time logs
    connectWebSocket();

    return () => {
      // Cleanup: close WebSocket connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [containerName, serviceName]);

  const connectWebSocket = () => {
    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    setLoading(true);
    setError(null);
    setIsConnected(false);

    try {
      const ws = createLogsWebSocket(containerName, serviceName, {
        onMessage: (data: string) => {
          // Append new logs to existing logs
          setLogs((prevLogs) => {
            // If prevLogs is empty, this is the initial load
            if (prevLogs === "") {
              return data;
            }
            // Append new data
            return prevLogs + data;
          });
          setLoading(false);
          setIsConnected(true);
        },
        onError: (err: Error) => {
          setError(err.message);
          setLoading(false);
          setIsConnected(false);
        },
        onOpen: () => {
          setIsConnected(true);
        },
        onClose: () => {
          setIsConnected(false);
          // Auto-reconnect after 3 seconds
          setTimeout(() => {
            connectWebSocket();
          }, 3000);
        },
      });

      wsRef.current = ws;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to WebSocket");
      setLoading(false);
    }
  };

  const downloadLogs = () => {
    const blob = new Blob([logs], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${containerName}-${serviceName}-logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearLogs = async () => {
    try {
      setError(null);
      await clearServiceLogs(containerName, serviceName);
      // Clear client-side logs
      setLogs("");
      // Reconnect WebSocket to get fresh logs
      if (wsRef.current) {
        wsRef.current.close();
        connectWebSocket();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear logs");
    }
  };

  const buttonStyle = {
    padding: "4px 12px",
    fontSize: "12px",
    fontWeight: "400",
    border: "none",
    borderRadius: "2px",
    cursor: "pointer",
    backgroundColor: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    transition: "background-color 0.2s",
  };

  return (
    <>
      <div
        className="sticky top-0 z-10 mb-6 pb-6 -mx-6 px-6 -mt-6"
        style={{
          backgroundColor: "var(--vscode-editor-background)"
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1
              className="text-2xl font-semibold mb-2"
              style={{ color: "var(--vscode-foreground)" }}
            >
              {serviceName} Logs
            </h1>
            <p
              className="text-sm"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              Container: {containerName}
              {isConnected && (
                <span style={{ marginLeft: "8px", color: "var(--vscode-descriptionForeground)" }}>
                  • Live
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearLogs}
              style={buttonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--vscode-button-hoverBackground)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--vscode-button-background)";
              }}
            >
              Clear
            </button>
            <button
              onClick={downloadLogs}
              style={buttonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--vscode-button-hoverBackground)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--vscode-button-background)";
              }}
            >
              Download
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="border rounded p-4 mb-4"
          style={{
            backgroundColor: "rgba(244, 135, 113, 0.1)",
            borderColor: "rgba(244, 135, 113, 0.3)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3
                className="font-medium mb-1"
                style={{ color: "var(--vscode-errorForeground)" }}
              >
                Error loading logs
              </h3>
              <p
                className="text-sm"
                style={{ color: "var(--vscode-errorForeground)" }}
              >
                {error}
              </p>
            </div>
            <button
              onClick={connectWebSocket}
              style={buttonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--vscode-button-hoverBackground)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--vscode-button-background)";
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div style={{ height: "calc(100vh - 200px)", minHeight: "400px" }}>
        <LogViewer logs={logs} autoScroll={true} className="h-full" />
      </div>
    </>
  );
}
