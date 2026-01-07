"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Convert from "ansi-to-html";
import { useTheme } from "@/contexts/ThemeContext";

interface LogViewerProps {
  logs: string;
  autoScroll?: boolean;
  className?: string;
}

export default function LogViewer({
  logs,
  autoScroll = true,
  className = "",
}: LogViewerProps) {
  const logRef = useRef<HTMLPreElement>(null);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);
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

  useEffect(() => {
    if (autoScroll && isScrolledToBottom && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, autoScroll, isScrolledToBottom]);

  const handleScroll = () => {
    if (logRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
      setIsScrolledToBottom(isAtBottom);
    }
  };

  // Convert ANSI codes to HTML
  const htmlLogs = useMemo(
    () => (logs ? convert.toHtml(logs) : "No logs available"),
    [logs, convert]
  );

  return (
    <div className={`relative flex flex-col ${className}`} style={{ height: "100%", minHeight: 0 }}>
      <pre
        ref={logRef}
        onScroll={handleScroll}
        className="p-4 rounded overflow-auto font-mono text-xs flex-1"
        style={{ 
          fontFamily: "monospace",
          backgroundColor: theme === "dark" ? "#1e1e1e" : "#ffffff",
          color: theme === "dark" ? "#d4d4d4" : "#333333",
          border: "1px solid var(--vscode-panel-border)",
          minHeight: 0
        }}
        dangerouslySetInnerHTML={{ __html: htmlLogs }}
      />
      {!isScrolledToBottom && autoScroll && (
        <button
          onClick={() => {
            if (logRef.current) {
              logRef.current.scrollTop = logRef.current.scrollHeight;
              setIsScrolledToBottom(true);
            }
          }}
          className="absolute bottom-4 right-4 px-3 py-1 rounded text-xs"
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
          Scroll to bottom
        </button>
      )}
    </div>
  );
}
