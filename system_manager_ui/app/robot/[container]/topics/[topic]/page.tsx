"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useROS2TopicWebSocket, type WebSocketStatus } from "@/lib/websocket";
import type { ROS2TopicDataResponse } from "@/types/api";
import StatusBadge from "@/components/StatusBadge";
import LogViewer from "@/components/LogViewer";

export default function RobotTopicPage() {
  const params = useParams();
  const router = useRouter();
  const container = params.container as string;
  const topic = decodeURIComponent(params.topic as string);
  
  const [topicData, setTopicData] = useState<ROS2TopicDataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayData, setDisplayData] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const lastDataRef = useRef<string | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Simple XML formatter
  const formatXML = useCallback((xml: string): string => {
    try {
      // Remove extra whitespace
      const trimmed = xml.trim();
      
      // Simple indentation
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
          // Text content
          const text = token.trim();
          if (text) {
            formatted += tab.repeat(indent) + text + "\n";
          }
        }
      }
      
      return formatted.trim();
    } catch (e) {
      // If formatting fails, return original
      return xml;
    }
  }, []);

  // Format data for display
  const formatData = useCallback((data: any): string => {
    if (data === null || data === undefined) {
      return "No data available yet. Waiting for messages...\n";
    }
    if (typeof data === "string") {
      // Try to format XML if it looks like XML
      if (data.trim().startsWith("<?xml") || data.trim().startsWith("<")) {
        try {
          // Simple XML formatting (indent)
          const formatted = formatXML(data);
          return formatted;
        } catch (e) {
          // If formatting fails, return original
          return data;
        }
      }
      return data;
    }
    if (typeof data === "object") {
      return JSON.stringify(data, null, 2);
    }
    return String(data);
  }, [formatXML]);

  // Use WebSocket for real-time updates
  const { status: wsStatus } = useROS2TopicWebSocket(
    container,
    topic,
    {
      onMessage: (data: string) => {
        try {
          // The data string is already the JSON string of the response
          // Parse it to get the ROS2TopicDataResponse
          const parsed = JSON.parse(data);
          
          // The parsed object is the ROS2TopicDataResponse
          if (parsed && (parsed.data !== undefined || parsed.available !== undefined)) {
            const response = parsed as ROS2TopicDataResponse;
            setTopicData(response);
            
            // Update display data with formatted content
            if (response.available && response.data !== null && response.data !== undefined) {
              const formatted = formatData(response.data);
              // Only update if data changed
              if (formatted !== lastDataRef.current) {
                lastDataRef.current = formatted;
                
                // Clear any pending update
                if (updateTimeoutRef.current) {
                  clearTimeout(updateTimeoutRef.current);
                }
                
                // Update display immediately
                setDisplayData(formatted);
              }
            } else {
              setDisplayData("No data available yet. Waiting for messages...\n");
            }
            setError(null);
          }
        } catch (e) {
          // If parsing fails, try to use as string
          console.error("Failed to parse WebSocket message:", e, data);
          setDisplayData(data);
        }
      },
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
    }
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // Type assertion to fix TypeScript inference issue
  const status = wsStatus as WebSocketStatus;
  
  if ((status as string) === "connecting") {
    return (
      <div className="flex justify-center items-center h-64">
        <div style={{ color: "var(--vscode-descriptionForeground)" }}>
          Connecting to topic...
        </div>
      </div>
    );
  }

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
              {topic}
            </h1>
            <div className="flex items-center gap-3">
              <p
                className="text-sm"
                style={{ color: "var(--vscode-descriptionForeground)" }}
              >
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
            <StatusBadge
              status={
                (status as string) === "connected" 
                  ? "running" 
                  : (status as string) === "connecting"
                  ? "pending" 
                  : (status as string) === "error"
                  ? "pending"
                  : "unavailable"
              }
              label={
                (status as string) === "connected" 
                  ? "Connected" 
                  : (status as string) === "connecting" 
                  ? "Connecting..." 
                  : (status as string) === "error"
                  ? "Error"
                  : "Disconnected"
              }
            />
            <button
              onClick={() => router.push(`/robot/${container}`)}
              className="px-4 py-2 text-sm font-normal rounded"
              style={{
                backgroundColor: "var(--vscode-button-secondaryBackground)",
                color: "var(--vscode-button-secondaryForeground)",
                border: "none",
                cursor: "pointer",
                transition: "background-color 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--vscode-button-secondaryHoverBackground)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--vscode-button-secondaryBackground)";
              }}
            >
              Back
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
                Error loading topic data
              </h3>
              <p
                className="text-sm"
                style={{ color: "var(--vscode-errorForeground)" }}
              >
                {error}
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-normal rounded"
              style={{
                backgroundColor: "var(--vscode-button-background)",
                color: "var(--vscode-button-foreground)",
                border: "none",
                cursor: "pointer",
                transition: "background-color 0.2s"
              }}
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
        <LogViewer logs={displayData || "No data available yet. Waiting for messages...\n"} autoScroll={true} className="h-full" />
      </div>
    </>
  );
}

