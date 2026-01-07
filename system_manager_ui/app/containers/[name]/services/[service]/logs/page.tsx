"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import LogViewer from "@/components/LogViewer";
import { getServiceLogs } from "@/lib/api";

export default function ServiceLogsPage() {
  const params = useParams();
  const containerName = params.name as string;
  const serviceName = params.service as string;

  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tail, setTail] = useState(100);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    loadLogs();
  }, [containerName, serviceName, tail]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(loadLogs, 3000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, containerName, serviceName, tail]);

  const loadLogs = async () => {
    try {
      setError(null);
      const response = await getServiceLogs(containerName, serviceName, tail);
      setLogs(response.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div style={{ color: "var(--vscode-descriptionForeground)" }}>
          Loading logs...
        </div>
      </div>
    );
  }

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
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label
              className="flex items-center gap-2 text-sm cursor-pointer"
              style={{ color: "var(--vscode-foreground)" }}
            >
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                style={{
                  accentColor: "var(--vscode-button-background)",
                  cursor: "pointer"
                }}
              />
              Auto-refresh
            </label>
            <select
              value={tail}
              onChange={(e) => setTail(Number(e.target.value))}
              className="px-3 py-1.5 border rounded text-sm"
              style={{
                backgroundColor: "var(--vscode-input-background)",
                borderColor: "var(--vscode-input-border)",
                color: "var(--vscode-input-foreground)",
                cursor: "pointer"
              }}
            >
              <option value={50}>Last 50 lines</option>
              <option value={100}>Last 100 lines</option>
              <option value={200}>Last 200 lines</option>
              <option value={500}>Last 500 lines</option>
            </select>
            <button
              onClick={loadLogs}
              style={buttonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--vscode-button-hoverBackground)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--vscode-button-background)";
              }}
            >
              Refresh
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
              onClick={loadLogs}
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
        <LogViewer logs={logs} autoScroll={autoRefresh} className="h-full" />
    </div>
    </>
  );
}
