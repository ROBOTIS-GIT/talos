"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getROS2Topics, controlService, getServiceStatus } from "@/lib/api";
import type { ROS2TopicStatus, ServiceStatusResponse } from "@/types/api";
import StatusBadge from "@/components/StatusBadge";
import FixedLogPanel from "@/components/FixedLogPanel";
import Robot3DViewer from "@/components/Robot3DViewer";
import TopicViewerPanel from "@/components/TopicViewerPanel";

export default function RobotContainerPage() {
  const params = useParams();
  const router = useRouter();
  const container = params.container as string;

  const [topics, setTopics] = useState<ROS2TopicStatus[]>([]);
  const [domainId, setDomainId] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Load robot type from localStorage, default to BG2
  const getStoredRobotType = useCallback((): "SG2" | "BG2" => {
    if (typeof window === "undefined" || !container) return "BG2";
    const stored = localStorage.getItem(`robot_type_${container}`);
    return (stored === "SG2" || stored === "BG2") ? stored : "BG2";
  }, [container]);
  
  const [robotType, setRobotType] = useState<"SG2" | "BG2">(() => getStoredRobotType());
  const [bringupLoading, setBringupLoading] = useState(false);
  const [bringupError, setBringupError] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatusResponse | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<{ topic: string; msgType: string } | null>(null);

  // Get service name from robot type
  const getServiceName = useCallback((type: "SG2" | "BG2") => {
    return type === "SG2" ? "ffw_sg2_follower_ai" : "ffw_bg2_follower_ai";
  }, []);

  // Load service status
  const loadServiceStatus = useCallback(async () => {
    if (!container) return;
    try {
      const serviceName = getServiceName(robotType);
      const status = await getServiceStatus(container, serviceName);
      // Only update if status actually changed to prevent unnecessary re-renders
      setServiceStatus((prevStatus) => {
        if (
          prevStatus?.is_up === status.is_up &&
          prevStatus?.pid === status.pid &&
          prevStatus?.uptime_seconds === status.uptime_seconds
        ) {
          return prevStatus; // No change, return previous to prevent re-render
        }
        return status;
      });
    } catch (err) {
      // Service might not exist, set status to null only if it wasn't already null
      setServiceStatus((prevStatus) => {
        if (prevStatus === null) {
          return prevStatus; // Already null, no need to update
        }
        return null;
      });
    }
  }, [container, robotType, getServiceName]);

  const formatUptime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const loadTopics = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getROS2Topics(container);
      setTopics(response.topics);
      setDomainId(response.domain_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ROS2 topics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (container) {
      loadTopics();
      // Load stored robot type when container changes
      const storedType = getStoredRobotType();
      setRobotType(storedType);
    }
  }, [container, getStoredRobotType]);

  // Save robot type to localStorage when it changes
  useEffect(() => {
    if (container && robotType) {
      localStorage.setItem(`robot_type_${container}`, robotType);
    }
  }, [container, robotType]);

  // Find robot_description topic (memoized to avoid Hook order issues)
  // Normalize topic names by removing leading slash for comparison
  const robotDescriptionTopic = useMemo(() => {
    return topics.find((t) => {
      const normalizedTopic = t.topic.startsWith("/") ? t.topic.slice(1) : t.topic;
      return normalizedTopic === "robot_description";
    });
  }, [topics]);

  // Load service status when robot type or container changes
  useEffect(() => {
    if (container) {
      loadServiceStatus();
    }
  }, [container, robotType, loadServiceStatus]);

  // Poll service status periodically
  useEffect(() => {
    if (!container) return;

    const interval = setInterval(() => {
      loadServiceStatus();
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [container, robotType, loadServiceStatus]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div style={{ color: "var(--vscode-descriptionForeground)" }}>
          Loading ROS2 topics...
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
              Error loading ROS2 topics
            </h3>
            <p 
              className="text-sm"
              style={{ color: "var(--vscode-errorForeground)" }}
            >
              {error}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/robot")}
              className="px-4 py-2 text-sm font-normal rounded"
              style={{
                backgroundColor: "var(--vscode-button-secondaryBackground)",
                color: "var(--vscode-button-secondaryForeground)",
                border: "none",
                cursor: "pointer",
                transition: "background-color 0.2s"
              }}
            >
              Back
            </button>
            <button
              onClick={loadTopics}
              className="px-4 py-2 text-sm font-normal rounded"
              style={{
                backgroundColor: "var(--vscode-button-background)",
                color: "var(--vscode-button-foreground)",
                border: "none",
                cursor: "pointer",
                transition: "background-color 0.2s"
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Handle robot bringup/stop
  const handleRobotBringup = async () => {
    setBringupLoading(true);
    setBringupError(null);

    try {
      const serviceName = getServiceName(robotType);
      const action = serviceStatus?.is_up ? "down" : "up";
      
      await controlService(container, serviceName, action);
      
      // Reload status after action
      setTimeout(() => {
        loadServiceStatus();
        loadTopics();
      }, 1000);
    } catch (err) {
      setBringupError(err instanceof Error ? err.message : "Failed to control robot service");
      setTimeout(() => setBringupError(null), 5000);
    } finally {
      setBringupLoading(false);
    }
  };

  return (
    <div className="relative">
      {/* 3D Robot Viewer and Log Panel Layout */}
      <div className="flex gap-4 mb-6" style={{ alignItems: "flex-start" }}>
        {/* 3D Robot Viewer - Always show (uses HTTP API, not config.yml subscription) */}
        <div style={{ flexShrink: 0 }}>
          <Robot3DViewer container={container} topic="/robot_description" />
        </div>

        {/* Log Panel - Fixed Layout */}
        {showLogs && (
          <div style={{ 
            flex: 1, 
            minWidth: 0, 
            display: "flex", 
            flexDirection: "column",
            height: "400px",
            maxHeight: "400px"
          }}>
            <FixedLogPanel
              container={container}
              service={getServiceName(robotType)}
              onClose={() => setShowLogs(false)}
            />
          </div>
        )}

        {/* Topic Viewer Panel - Fixed Layout */}
        {selectedTopic && (
          <div style={{ 
            flex: 1, 
            minWidth: 0, 
            display: "flex", 
            flexDirection: "column",
            height: "400px",
            maxHeight: "400px"
          }}>
            <TopicViewerPanel
              container={container}
              topic={selectedTopic.topic}
              msgType={selectedTopic.msgType}
              onClose={() => setSelectedTopic(null)}
            />
          </div>
        )}
      </div>

      {/* Robot Bringup Controls */}
      <div className="mb-6">
          <div
            className="border rounded p-4"
            style={{
              backgroundColor: "var(--vscode-sidebar-background)",
              borderColor: "var(--vscode-panel-border)",
              width: "500px",
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <select
                    value={robotType}
                    onChange={(e) => {
                      const newType = e.target.value as "SG2" | "BG2";
                      setRobotType(newType);
                      // Save to localStorage immediately
                      if (container) {
                        localStorage.setItem(`robot_type_${container}`, newType);
                      }
                    }}
                    disabled={bringupLoading || serviceStatus?.is_up}
                    className="px-3 py-1.5 rounded border text-sm"
                    style={{
                      backgroundColor: "var(--vscode-input-background)",
                      color: "var(--vscode-input-foreground)",
                      borderColor: "var(--vscode-input-border)",
                      cursor: (bringupLoading || serviceStatus?.is_up) ? "not-allowed" : "pointer",
                      opacity: (bringupLoading || serviceStatus?.is_up) ? 0.5 : 1,
                      width: "fit-content",
                      minWidth: "80px",
                    }}
                  >
                    <option value="SG2">SG2</option>
                    <option value="BG2">BG2</option>
                  </select>
                  <button
                    onClick={handleRobotBringup}
                    disabled={bringupLoading}
                    style={{
                      padding: "4px 12px",
                      fontSize: "12px",
                      fontWeight: "400",
                      border: "none",
                      borderRadius: "2px",
                      cursor: bringupLoading ? "not-allowed" : "pointer",
                      opacity: bringupLoading ? 0.5 : 1,
                      backgroundColor: serviceStatus?.is_up
                        ? "var(--vscode-button-secondaryBackground)"
                        : "var(--vscode-button-background)",
                      color: serviceStatus?.is_up
                        ? "var(--vscode-button-secondaryForeground)"
                        : "var(--vscode-button-foreground)",
                      transition: "background-color 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (!bringupLoading) {
                        e.currentTarget.style.backgroundColor = serviceStatus?.is_up
                          ? "var(--vscode-button-secondaryHoverBackground)"
                          : "var(--vscode-button-hoverBackground)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!bringupLoading) {
                        e.currentTarget.style.backgroundColor = serviceStatus?.is_up
                          ? "var(--vscode-button-secondaryBackground)"
                          : "var(--vscode-button-background)";
                      }
                    }}
                  >
                    {bringupLoading 
                      ? (serviceStatus?.is_up ? "Stopping..." : "Starting...")
                      : (serviceStatus?.is_up ? "Stop" : "Robot Bringup")
                    }
                  </button>
                  {serviceStatus && (
                    <StatusBadge status={serviceStatus.is_up} />
                  )}
                  <button
                    onClick={() => setShowLogs(!showLogs)}
                    style={{
                      padding: "4px 12px",
                      fontSize: "12px",
                      fontWeight: "400",
                      border: "none",
                      borderRadius: "2px",
                      cursor: "pointer",
                      backgroundColor: showLogs
                        ? "var(--vscode-button-secondaryBackground)"
                        : "var(--vscode-button-background)",
                      color: showLogs
                        ? "var(--vscode-button-secondaryForeground)"
                        : "var(--vscode-button-foreground)",
                      transition: "background-color 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = showLogs
                        ? "var(--vscode-button-secondaryHoverBackground)"
                        : "var(--vscode-button-hoverBackground)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = showLogs
                        ? "var(--vscode-button-secondaryBackground)"
                        : "var(--vscode-button-background)";
                    }}
                  >
                    Log Viewer
                  </button>
                </div>
              </div>
            </div>
            {bringupError && (
              <div
                className="mt-3 text-xs px-2 py-1 rounded"
                style={{
                  color: "var(--vscode-errorForeground)",
                  backgroundColor: "rgba(244, 135, 113, 0.1)",
                  border: "1px solid rgba(244, 135, 113, 0.3)",
                }}
              >
                {bringupError}
              </div>
            )}
          </div>
        </div>


      {topics.length === 0 ? (
        <div 
          className="p-8 text-center border rounded"
          style={{
            backgroundColor: "var(--vscode-sidebar-background)",
            borderColor: "var(--vscode-panel-border)"
          }}
        >
          <p style={{ color: "var(--vscode-descriptionForeground)" }}>
            No ROS2 topics configured for this container
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {topics.map((topic) => (
            <div
              key={topic.topic}
              className="border rounded p-4 cursor-pointer transition-all"
              style={{
                backgroundColor: "var(--vscode-sidebar-background)",
                borderColor: "var(--vscode-panel-border)",
              }}
              onClick={() => {
                setSelectedTopic({ topic: topic.topic, msgType: topic.msg_type });
                setShowLogs(false); // Close log panel if open
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
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3
                      className="font-medium"
                      style={{ color: "var(--vscode-foreground)" }}
                    >
                      {topic.topic}
                    </h3>
                    <StatusBadge
                      status={topic.available ? "available" : "unavailable"}
                      label={topic.available ? "Available" : "No Data"}
                    />
                    {topic.subscribed && (
                      <StatusBadge
                        status="running"
                        label="Subscribed"
                      />
                    )}
                  </div>
                  <p
                    className="text-sm"
                    style={{ color: "var(--vscode-descriptionForeground)" }}
                  >
                    Type: {topic.msg_type}
                  </p>
                </div>
                <div
                  className="text-sm ml-4"
                  style={{ color: "var(--vscode-descriptionForeground)" }}
                >
                  →
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

