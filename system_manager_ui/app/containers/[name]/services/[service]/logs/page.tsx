"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import type { MouseEvent } from "react";
import { useParams } from "next/navigation";
import LogViewer from "@/components/LogViewer";
import { clearServiceLogs } from "@/lib/api";
import { createLogsWebSocket } from "@/lib/websocket";

// Constants
const LOG_UPDATE_DEBOUNCE_MS = 200; // Increased to reduce flickering and batch more updates
const RECONNECT_DELAY_MS = 3000;
const WS_CLOSE_CODE_NORMAL = 1000;
const WS_CLOSE_CODE_GOING_AWAY = 1001;

export default function ServiceLogsPage() {
  const params = useParams();
  const containerName = params.name as string;
  const serviceName = params.service as string;

  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const shouldReconnectRef = useRef(true);
  const pendingLogsRef = useRef<string>("");
  const logUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isEmptyLogsRef = useRef(true); // Track if logs are empty to avoid state dependency

  // Cleanup function
  const cleanup = useCallback(() => {
    isMountedRef.current = false;
    shouldReconnectRef.current = false;
    
    if (wsRef.current) {
      wsRef.current.close(WS_CLOSE_CODE_NORMAL, "Component unmounting");
      wsRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (logUpdateTimeoutRef.current) {
      clearTimeout(logUpdateTimeoutRef.current);
      logUpdateTimeoutRef.current = null;
    }
    
    // Flush pending logs
    if (pendingLogsRef.current) {
      setLogs((prevLogs) => prevLogs + pendingLogsRef.current);
      pendingLogsRef.current = "";
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    shouldReconnectRef.current = true;
    isEmptyLogsRef.current = true;
    connectWebSocket();
    return cleanup;
  }, [containerName, serviceName, cleanup]);

  const connectWebSocket = useCallback(() => {
    if (!isMountedRef.current) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close(WS_CLOSE_CODE_NORMAL, "Reconnecting");
      wsRef.current = null;
    }

    // Clear pending operations
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setLoading(true);
    setError(null);
    setIsConnected(false);
    shouldReconnectRef.current = true;

    try {
      const ws = createLogsWebSocket(containerName, serviceName, {
        onMessage: (data: string) => {
          if (!isMountedRef.current) return;
          
          // Append to pending logs buffer
          pendingLogsRef.current += data;
          
          // Update immediately for first message, batch subsequent updates
          if (isEmptyLogsRef.current) {
            setLogs(pendingLogsRef.current);
            pendingLogsRef.current = "";
            isEmptyLogsRef.current = false;
            setLoading(false);
            setIsConnected(true);
          } else {
            // Clear existing timeout to batch multiple rapid updates
            if (logUpdateTimeoutRef.current) {
              clearTimeout(logUpdateTimeoutRef.current);
            }
            // Batch updates to reduce flickering
            logUpdateTimeoutRef.current = setTimeout(() => {
              if (!isMountedRef.current) return;
              // Only update if there's pending data
              if (pendingLogsRef.current) {
                setLogs((prevLogs) => {
                  const newLogs = prevLogs + pendingLogsRef.current;
                  pendingLogsRef.current = "";
                  return newLogs;
                });
              }
            }, LOG_UPDATE_DEBOUNCE_MS);
          }
        },
        onError: (err: Error) => {
          if (!isMountedRef.current) return;
          setError(err.message);
          setLoading(false);
          setIsConnected(false);
          
          // Disable reconnection if service is stopped
          if (err.message.includes("stopped") || err.message.includes("both stopped")) {
            shouldReconnectRef.current = false;
          }
        },
        onOpen: () => {
          if (!isMountedRef.current) return;
          setIsConnected(true);
          setError(null);
        },
        onClose: (event?: CloseEvent) => {
          if (!isMountedRef.current) return;
          setIsConnected(false);
          
          const shouldReconnect = 
            isMountedRef.current &&
            wsRef.current === ws &&
            shouldReconnectRef.current &&
            event?.code !== WS_CLOSE_CODE_NORMAL &&
            event?.code !== WS_CLOSE_CODE_GOING_AWAY;
          
          if (shouldReconnect) {
            reconnectTimeoutRef.current = setTimeout(() => {
              if (isMountedRef.current && shouldReconnectRef.current) {
            connectWebSocket();
              }
            }, RECONNECT_DELAY_MS);
          }
        },
      });

      wsRef.current = ws;
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to connect to WebSocket");
      setLoading(false);
    }
  }, [containerName, serviceName]);

  const downloadLogs = useCallback(() => {
    const blob = new Blob([logs], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${containerName}-${serviceName}-logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [logs, containerName, serviceName]);

  const clearLogs = useCallback(async () => {
    try {
      setError(null);
      await clearServiceLogs(containerName, serviceName);
      setLogs("");
      isEmptyLogsRef.current = true;
      
      if (wsRef.current) {
        wsRef.current.close();
        connectWebSocket();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear logs");
    }
  }, [containerName, serviceName, connectWebSocket]);

  const handleRetry = useCallback(() => {
    shouldReconnectRef.current = true;
    connectWebSocket();
  }, [connectWebSocket]);

  // Memoize button style and handlers
  const buttonStyle = useMemo(() => ({
    padding: "4px 12px",
    fontSize: "12px",
    fontWeight: "400",
    border: "none",
    borderRadius: "2px",
    cursor: "pointer",
    backgroundColor: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    transition: "background-color 0.2s",
  }), []);

  const handleButtonHover = useCallback((e: MouseEvent<HTMLButtonElement>, isEnter: boolean) => {
    e.currentTarget.style.backgroundColor = isEnter
      ? "var(--vscode-button-hoverBackground)"
      : "var(--vscode-button-background)";
  }, []);

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
              onMouseEnter={(e) => handleButtonHover(e, true)}
              onMouseLeave={(e) => handleButtonHover(e, false)}
            >
              Clear
            </button>
            <button
              onClick={downloadLogs}
              style={buttonStyle}
              onMouseEnter={(e) => handleButtonHover(e, true)}
              onMouseLeave={(e) => handleButtonHover(e, false)}
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
              onClick={handleRetry}
              style={buttonStyle}
              onMouseEnter={(e) => handleButtonHover(e, true)}
              onMouseLeave={(e) => handleButtonHover(e, false)}
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
