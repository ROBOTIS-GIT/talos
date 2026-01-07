"use client";

import { useEffect, useState } from "react";
import ContainerCard from "@/components/ContainerCard";
import { getContainers } from "@/lib/api";
import type { ContainerInfo } from "@/types/api";

export default function HomePage() {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadContainers();
  }, []);

  const loadContainers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getContainers();
      setContainers(response.containers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load containers");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div style={{ color: "var(--vscode-descriptionForeground)" }}>
          Loading containers...
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
              Error loading containers
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
      <div className="mb-6">
        <h1 
          className="text-2xl font-semibold mb-2"
          style={{ color: "var(--vscode-foreground)" }}
        >
          Containers
        </h1>
        <p 
          className="text-sm"
          style={{ color: "var(--vscode-descriptionForeground)" }}
        >
          Manage ROS2-based robot containers and their services
        </p>
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
            No containers configured
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {containers.map((container) => (
            <ContainerCard key={container.name} container={container} />
          ))}
        </div>
      )}
    </div>
  );
}
