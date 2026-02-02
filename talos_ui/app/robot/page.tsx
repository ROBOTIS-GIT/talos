"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getContainers, getROS2Topics } from "@/lib/api";
import type { ContainerInfo } from "@/types/api";

export default function RobotPage() {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [containersWithROS2, setContainersWithROS2] = useState<Set<string>>(new Set());
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

      // Check which containers have ROS2 topics configured
      const ros2Containers = new Set<string>();
      await Promise.all(
        response.containers.map(async (container) => {
          try {
            await getROS2Topics(container.name);
            ros2Containers.add(container.name);
          } catch (err) {
            // Container doesn't have ROS2 configured or plugin not available
          }
        })
      );
      setContainersWithROS2(ros2Containers);
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

  const ros2Containers = containers.filter((c) => containersWithROS2.has(c.name));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-semibold mb-2"
            style={{ color: "var(--vscode-foreground)" }}
          >
            Robot Topics
          </h1>
          <p
            className="text-sm"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            View ROS2 topics from robot containers
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
          Refresh
        </button>
      </div>

      {ros2Containers.length === 0 ? (
        <div
          className="p-8 text-center border rounded"
          style={{
            backgroundColor: "var(--vscode-sidebar-background)",
            borderColor: "var(--vscode-panel-border)"
          }}
        >
          <p style={{ color: "var(--vscode-descriptionForeground)" }}>
            No containers with ROS2 topics configured
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ros2Containers.map((container) => (
            <Link
              key={container.name}
              href={`/robot/${container.name}`}
              className="block"
            >
              <div
                className="border rounded p-4 cursor-pointer transition-all"
                style={{
                  backgroundColor: "var(--vscode-sidebar-background)",
                  borderColor: "var(--vscode-panel-border)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--vscode-list-hoverBackground)";
                  e.currentTarget.style.borderColor = "var(--vscode-focusBorder)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--vscode-sidebar-background)";
                  e.currentTarget.style.borderColor = "var(--vscode-panel-border)";
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="text-2xl"
                    style={{ color: "var(--vscode-foreground)" }}
                  >
                    🤖
                  </div>
                  <div className="flex-1">
                    <h3
                      className="font-medium mb-1"
                      style={{ color: "var(--vscode-foreground)" }}
                    >
                      {container.name}
                    </h3>
                    <p
                      className="text-xs"
                      style={{ color: "var(--vscode-descriptionForeground)" }}
                    >
                      View ROS2 topics
                    </p>
                  </div>
                  <div
                    className="text-sm"
                    style={{ color: "var(--vscode-descriptionForeground)" }}
                  >
                    →
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

