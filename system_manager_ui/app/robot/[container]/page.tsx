"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getROS2Topics, controlService, getServiceStatus } from "@/lib/api";
import type { ROS2TopicStatus, ServiceStatusResponse } from "@/types/api";
import StatusBadge from "@/components/StatusBadge";
import FixedLogPanel from "@/components/FixedLogPanel";
import Robot3DViewer from "@/components/Robot3DViewer";
import TopicViewerPanel from "@/components/TopicViewerPanel";

// Constants
const LEADER_SERVICE_NAME = "ffw_lg2_leader_ai";
const STATUS_POLL_INTERVAL = 2000; // 2 seconds
const ERROR_DISPLAY_DURATION = 5000; // 5 seconds
const STATUS_RELOAD_DELAY = 1000; // 1 second

const PANEL_STYLES = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  height: "400px",
  maxHeight: "400px",
} as const;

const CONTAINER_STYLES = {
  backgroundColor: "var(--vscode-sidebar-background)",
  borderColor: "var(--vscode-panel-border)",
  width: "500px",
} as const;

const ERROR_STYLES = {
  color: "var(--vscode-errorForeground)",
  backgroundColor: "rgba(244, 135, 113, 0.1)",
  border: "1px solid rgba(244, 135, 113, 0.3)",
} as const;

// Helper functions
const getStoredRobotType = (container: string): "SG2" | "BG2" => {
  if (typeof window === "undefined" || !container) return "BG2";
  const stored = localStorage.getItem(`robot_type_${container}`);
  return (stored === "SG2" || stored === "BG2") ? stored : "BG2";
};

const getServiceName = (type: "SG2" | "BG2"): string => {
  return type === "SG2" ? "ffw_sg2_follower_ai" : "ffw_bg2_follower_ai";
};

// Custom hook for service status management
function useServiceStatus(
  container: string | undefined,
  serviceName: string | (() => string)
) {
  const [status, setStatus] = useState<ServiceStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!container) return;
    try {
      const name = typeof serviceName === "function" ? serviceName() : serviceName;
      const serviceStatus = await getServiceStatus(container, name);
      setStatus((prevStatus) => {
        if (
          prevStatus?.is_up === serviceStatus.is_up &&
          prevStatus?.pid === serviceStatus.pid &&
          prevStatus?.uptime_seconds === serviceStatus.uptime_seconds
        ) {
          return prevStatus;
        }
        return serviceStatus;
      });
    } catch (err) {
      setStatus((prevStatus) => {
        if (prevStatus === null) return prevStatus;
        return null;
      });
    }
  }, [container, serviceName]);

  const handleControl = useCallback(
    async (action: "up" | "down") => {
      if (!container) return;
      setLoading(true);
      setError(null);

      try {
        const name = typeof serviceName === "function" ? serviceName() : serviceName;
        await controlService(container, name, action);
        setTimeout(() => {
          loadStatus();
        }, STATUS_RELOAD_DELAY);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to control service";
        setError(errorMessage);
        setTimeout(() => setError(null), ERROR_DISPLAY_DURATION);
      } finally {
        setLoading(false);
      }
    },
    [container, serviceName, loadStatus]
  );

  return { status, loading, error, loadStatus, handleControl };
}

// Button component
interface ControlButtonProps {
  onClick: () => void;
  disabled: boolean;
  isActive: boolean;
  loadingText: string;
  activeText: string;
  inactiveText: string;
}

function ControlButton({
  onClick,
  disabled,
  isActive,
  loadingText,
  activeText,
  inactiveText,
}: ControlButtonProps) {
  const baseStyle: React.CSSProperties = {
    padding: "4px 12px",
    fontSize: "12px",
    fontWeight: "400",
    border: "none",
    borderRadius: "2px",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    backgroundColor: isActive
      ? "var(--vscode-button-secondaryBackground)"
      : "var(--vscode-button-background)",
    color: isActive
      ? "var(--vscode-button-secondaryForeground)"
      : "var(--vscode-button-foreground)",
    transition: "background-color 0.2s",
    minWidth: "106px",
    textAlign: "center",
  };

  const getHoverBackground = (): string => {
    if (disabled) return baseStyle.backgroundColor as string;
    return isActive
      ? "var(--vscode-button-secondaryHoverBackground)"
      : "var(--vscode-button-hoverBackground)";
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={baseStyle}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = getHoverBackground();
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = baseStyle.backgroundColor as string;
      }}
    >
      {disabled ? loadingText : isActive ? activeText : inactiveText}
    </button>
  );
}

// Toggle button component
interface ToggleButtonProps {
  onClick: () => void;
  isActive: boolean;
  label: string;
}

function ToggleButton({ onClick, isActive, label }: ToggleButtonProps) {
  const baseStyle: React.CSSProperties = {
    padding: "4px 12px",
    fontSize: "12px",
    fontWeight: "400",
    border: "none",
    borderRadius: "2px",
    cursor: "pointer",
    backgroundColor: isActive
      ? "var(--vscode-button-secondaryBackground)"
      : "var(--vscode-button-background)",
    color: isActive
      ? "var(--vscode-button-secondaryForeground)"
      : "var(--vscode-button-foreground)",
    transition: "background-color 0.2s",
  };

  return (
    <button
      onClick={onClick}
      style={baseStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = isActive
          ? "var(--vscode-button-secondaryHoverBackground)"
          : "var(--vscode-button-hoverBackground)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = baseStyle.backgroundColor as string;
      }}
    >
      {label}
    </button>
  );
}

// Select component
interface SelectProps {
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  options: { value: string; label: string }[];
}

function Select({ value, onChange, disabled, options }: SelectProps) {
  const baseStyle: React.CSSProperties = {
    backgroundColor: "var(--vscode-input-background)",
    color: "var(--vscode-input-foreground)",
    borderColor: "var(--vscode-input-border)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    width: "fit-content",
    minWidth: "80px",
  };

  return (
    <select
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
      className="px-3 py-1.5 rounded border text-sm"
      style={baseStyle}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

// Service control row component
interface ServiceControlRowProps {
  selectValue: string;
  selectOptions: { value: string; label: string }[];
  onSelectChange?: (value: string) => void;
  selectDisabled?: boolean;
  controlButton: {
    onClick: () => void;
    disabled: boolean;
    isActive: boolean;
    loadingText: string;
    activeText: string;
    inactiveText: string;
  };
  status: ServiceStatusResponse | null;
  logButton: {
    onClick: () => void;
    isActive: boolean;
  };
}

function ServiceControlRow({
  selectValue,
  selectOptions,
  onSelectChange,
  selectDisabled,
  controlButton,
  status,
  logButton,
  className = "",
}: ServiceControlRowProps & { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Select
        value={selectValue}
        onChange={onSelectChange}
        disabled={selectDisabled}
        options={selectOptions}
      />
      <ControlButton {...controlButton} />
      {status && <StatusBadge status={status.is_up} />}
      <ToggleButton onClick={logButton.onClick} isActive={logButton.isActive} label="Log Viewer" />
    </div>
  );
}

// Error message component
function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="mt-3 text-xs px-2 py-1 rounded" style={ERROR_STYLES}>
      {message}
    </div>
  );
}

// Topic list item component
interface TopicListItemProps {
  topic: ROS2TopicStatus;
  onClick: () => void;
}

function TopicListItem({ topic, onClick }: TopicListItemProps) {
  const baseStyle: React.CSSProperties = {
    backgroundColor: "var(--vscode-sidebar-background)",
    borderColor: "var(--vscode-panel-border)",
  };

  return (
    <div
      className="border rounded p-4 cursor-pointer transition-all"
      style={baseStyle}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--vscode-list-hoverBackground)";
        e.currentTarget.style.borderColor = "var(--vscode-focusBorder)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = baseStyle.backgroundColor as string;
        e.currentTarget.style.borderColor = baseStyle.borderColor as string;
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="font-medium" style={{ color: "var(--vscode-foreground)" }}>
              {topic.topic}
            </h3>
          </div>
          <p className="text-sm" style={{ color: "var(--vscode-descriptionForeground)" }}>
            Type: {topic.msg_type}
          </p>
        </div>
        <div className="text-sm ml-4" style={{ color: "var(--vscode-descriptionForeground)" }}>
          →
        </div>
      </div>
    </div>
  );
}

// Main component
export default function RobotContainerPage() {
  const params = useParams();
  const router = useRouter();
  const container = params.container as string;

  const [topics, setTopics] = useState<ROS2TopicStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [robotType, setRobotType] = useState<"SG2" | "BG2">(() =>
    getStoredRobotType(container)
  );
  const [showLogs, setShowLogs] = useState(false);
  const [showLeaderLogs, setShowLeaderLogs] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<{
    topic: string;
    msgType: string;
  } | null>(null);

  // Service status hooks
  const robotService = useServiceStatus(container, () => getServiceName(robotType));
  const leaderService = useServiceStatus(container, LEADER_SERVICE_NAME);

  // Load topics
  const loadTopics = useCallback(async (isRefresh = false) => {
    if (!container) return;
    try {
      // 처음 로드할 때만(데이터가 없을 때만) 전체 로딩 화면을 보여줍니다.
      if (!isRefresh) {
        setLoading(true);
      }
      setError(null);
      const response = await getROS2Topics(container);
      setTopics(response.topics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ROS2 topics");
    } finally {
      setLoading(false);
    }
  }, [container]);

  // Handle robot bringup/stop
  const handleRobotBringup = useCallback(async () => {
    const action = robotService.status?.is_up ? "down" : "up";
    await robotService.handleControl(action);
    setTimeout(() => {
      // true를 전달하여 전체 화면 로딩(깜빡임) 방지
      loadTopics(true);
    }, STATUS_RELOAD_DELAY);
  }, [robotService, loadTopics]);

  // Handle leader bringup/stop
  const handleLeaderBringup = useCallback(async () => {
    const action = leaderService.status?.is_up ? "down" : "up";
    await leaderService.handleControl(action);
  }, [leaderService]);

  // Effects
  useEffect(() => {
    if (container) {
      loadTopics();
      const storedType = getStoredRobotType(container);
      setRobotType(storedType);
    }
  }, [container, loadTopics]);

  useEffect(() => {
    if (container && robotType) {
      localStorage.setItem(`robot_type_${container}`, robotType);
    }
  }, [container, robotType]);

  useEffect(() => {
    if (container) {
      robotService.loadStatus();
      leaderService.loadStatus();
    }
  }, [container, robotType, robotService, leaderService]);

  useEffect(() => {
    if (!container) return;
    const interval = setInterval(() => {
      robotService.loadStatus();
      leaderService.loadStatus();
    }, STATUS_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [container, robotType, robotService, leaderService]);

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div style={{ color: "var(--vscode-descriptionForeground)" }}>
          Loading ROS2 topics...
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="border rounded p-4" style={ERROR_STYLES}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium mb-1" style={{ color: "var(--vscode-errorForeground)" }}>
              Error loading ROS2 topics
            </h3>
            <p className="text-sm" style={{ color: "var(--vscode-errorForeground)" }}>
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
                transition: "background-color 0.2s",
              }}
            >
              Back
            </button>
            <button
              onClick={() => loadTopics()}
              className="px-4 py-2 text-sm font-normal rounded"
              style={{
                backgroundColor: "var(--vscode-button-background)",
                color: "var(--vscode-button-foreground)",
                border: "none",
                cursor: "pointer",
                transition: "background-color 0.2s",
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* 3D Robot Viewer and Panels Layout */}
      <div className="flex gap-4 mb-6" style={{ alignItems: "flex-start" }}>
        <div style={{ flexShrink: 0 }}>
          <Robot3DViewer
            container={container}
            topic="/robot_description"
          />
        </div>

        {showLogs && !selectedTopic && !showLeaderLogs && (
          <div style={PANEL_STYLES}>
            <FixedLogPanel
              container={container}
              service={getServiceName(robotType)}
              onClose={() => setShowLogs(false)}
            />
          </div>
        )}

        {showLeaderLogs && !selectedTopic && !showLogs && (
          <div style={PANEL_STYLES}>
            <FixedLogPanel
              container={container}
              service={LEADER_SERVICE_NAME}
              onClose={() => setShowLeaderLogs(false)}
            />
          </div>
        )}

        {selectedTopic && !showLogs && !showLeaderLogs && (
          <div style={PANEL_STYLES}>
            <TopicViewerPanel
              container={container}
              topic={selectedTopic.topic}
              msgType={selectedTopic.msgType}
              onClose={() => setSelectedTopic(null)}
            />
          </div>
        )}
      </div>

      {/* Service Controls */}
      <div className="mb-6">
        <div className="border rounded p-4" style={CONTAINER_STYLES}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <ServiceControlRow
                selectValue={robotType}
                selectOptions={[
                  { value: "SG2", label: "SG2" },
                  { value: "BG2", label: "BG2" },
                ]}
                onSelectChange={(value) => {
                  const newType = value as "SG2" | "BG2";
                  setRobotType(newType);
                  if (container) {
                    localStorage.setItem(`robot_type_${container}`, newType);
                  }
                }}
                selectDisabled={robotService.loading || robotService.status?.is_up}
                controlButton={{
                  onClick: handleRobotBringup,
                  disabled: robotService.loading,
                  isActive: robotService.status?.is_up ?? false,
                  loadingText: robotService.status?.is_up ? "Stopping..." : "Starting...",
                  activeText: "Stop",
                  inactiveText: "Robot Bringup",
                }}
                status={robotService.status}
                logButton={{
                  onClick: () => {
                    setShowLogs(!showLogs);
                    setSelectedTopic(null);
                  },
                  isActive: showLogs,
                }}
                className="mb-3"
              />

              <ServiceControlRow
                selectValue="LG2"
                selectOptions={[{ value: "LG2", label: "LG2" }]}
                selectDisabled={true}
                controlButton={{
                  onClick: handleLeaderBringup,
                  disabled: leaderService.loading,
                  isActive: leaderService.status?.is_up ?? false,
                  loadingText: leaderService.status?.is_up ? "Stopping..." : "Starting...",
                  activeText: "Stop",
                  inactiveText: "Leader Bringup",
                }}
                status={leaderService.status}
                logButton={{
                  onClick: () => {
                    setShowLeaderLogs(!showLeaderLogs);
                    setSelectedTopic(null);
                  },
                  isActive: showLeaderLogs,
                }}
              />
            </div>
          </div>

          {robotService.error && <ErrorMessage message={robotService.error} />}
          {leaderService.error && <ErrorMessage message={leaderService.error} />}
        </div>
      </div>

      {/* Topics List */}
      {topics.length === 0 ? (
        <div className="p-8 text-center border rounded" style={CONTAINER_STYLES}>
          <p style={{ color: "var(--vscode-descriptionForeground)" }}>
            No ROS2 topics configured for this container
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {topics.map((topic) => (
            <TopicListItem
              key={topic.topic}
              topic={topic}
              onClick={() => {
                setSelectedTopic({ topic: topic.topic, msgType: topic.msg_type });
                setShowLogs(false);
                setShowLeaderLogs(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
