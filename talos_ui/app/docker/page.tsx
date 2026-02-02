"use client";

import { useEffect, useState } from "react";
import DockerContainerCard from "@/components/DockerContainerCard";
import { getDockerContainers } from "@/lib/api";
import type { DockerContainerInfo } from "@/types/api";

export default function DockerPage() {
  const [containers, setContainers] = useState<DockerContainerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    loadContainers();
  }, [showAll]);

  const loadContainers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getDockerContainers(showAll);
      setContainers(response.containers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Docker containers");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div style={{ color: "var(--vscode-descriptionForeground)" }}>
          Loading Docker containers...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="border rounded p-4"
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
              Error loading Docker containers
            </h3>
            <p
              className="text-sm"
              style={{ color: "var(--vscode-errorForeground)" }}
            >
              {error}
            </p>
          </div>
          <button
            onClick={loadContainers}
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
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-semibold mb-2"
            style={{ color: "var(--vscode-foreground)" }}
          >
            Docker Containers
          </h1>
          <p
            className="text-sm"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            Manage Docker containers on the system
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label
            className="flex items-center gap-2 text-sm cursor-pointer"
            style={{ color: "var(--vscode-foreground)" }}
          >
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              style={{
                accentColor: "var(--vscode-button-background)",
                cursor: "pointer"
              }}
            />
            Show all (including stopped)
          </label>
          <button
            onClick={loadContainers}
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
            Refresh
          </button>
        </div>
      </div>

      {containers.length === 0 ? (
        <div
          className="p-8 text-center border rounded"
          style={{
            backgroundColor: "var(--vscode-sidebar-background)",
            borderColor: "var(--vscode-panel-border)"
          }}
        >
          <p style={{ color: "var(--vscode-descriptionForeground)" }}>
            No Docker containers found
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {containers.map((container) => (
            <DockerContainerCard
              key={container.id}
              container={container}
              onActionComplete={loadContainers}
            />
          ))}
        </div>
      )}
    </div>
  );
}
