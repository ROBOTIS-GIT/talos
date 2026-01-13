"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import ServiceCard from "@/components/ServiceCard";
import { getServices, getServiceStatuses } from "@/lib/api";
import type { ServiceInfo, ServiceStatusResponse } from "@/types/api";

// s6 System Services List
const SYSTEM_SERVICES = [
  "s6-agent",
  "s6-linux-init-shutdownd",
  "s6rc-fdholder",
  "s6rc-oneshot-runner",
];

// Check if the service is a system service
const isSystemService = (serviceId: string): boolean => {
  return SYSTEM_SERVICES.includes(serviceId);
};

export default function ContainerDetailPage() {
  const params = useParams();
  const containerName = params.name as string;

  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [serviceStatuses, setServiceStatuses] = useState<
    Record<string, ServiceStatusResponse>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showApplicationServices, setShowApplicationServices] = useState(true);
  const [showSystemServices, setShowSystemServices] = useState(false);

  // Separate services into regular and system services
  const { regularServices, systemServices, systemServicesCount } = useMemo(() => {
    const regular: ServiceInfo[] = [];
    const system: ServiceInfo[] = [];

    services.forEach((service) => {
      if (isSystemService(service.id)) {
        system.push(service);
      } else {
        regular.push(service);
      }
    });

    return {
      regularServices: regular,
      systemServices: system,
      systemServicesCount: system.length,
    };
  }, [services]);

  useEffect(() => {
    loadData();
  }, [containerName]);

  useEffect(() => {
    if (services.length > 0) {
      // Initial load
      loadStatuses();
      // Set up auto-refresh every 5 seconds
      const interval = setInterval(() => {
        loadStatuses();
      }, 5000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services.length, containerName]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const servicesResponse = await getServices(containerName);
      setServices(servicesResponse.services);
      await loadStatuses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load services");
    } finally {
      setLoading(false);
    }
  };

  const loadStatuses = async () => {
    if (services.length === 0) return;

    try {
      setRefreshing(true);
      const response = await getServiceStatuses(containerName);
      const statusMap: Record<string, ServiceStatusResponse> = {};
      response.statuses.forEach((status) => {
        statusMap[status.service] = status;
      });
      setServiceStatuses(statusMap);
    } catch (err) {
      // Silently fail for status updates
    } finally {
      setRefreshing(false);
    }
  };

  const handleStatusUpdate = () => {
    loadStatuses();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div style={{ color: "var(--vscode-descriptionForeground)" }}>
          Loading services...
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
              Error loading services
            </h3>
            <p
              className="text-sm"
              style={{ color: "var(--vscode-errorForeground)" }}
            >
              {error}
            </p>
          </div>
          <button
            onClick={loadData}
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
            {containerName}
          </h1>
          <p
            className="text-sm"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            Manage services in this container
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadStatuses}
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

      {services.length === 0 ? (
        <div
          className="p-8 text-center border rounded"
          style={{
            backgroundColor: "var(--vscode-sidebar-background)",
            borderColor: "var(--vscode-panel-border)"
          }}
        >
          <p style={{ color: "var(--vscode-descriptionForeground)" }}>
            No services found
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Application Services */}
          {regularServices.length > 0 && (
            <div>
              <button
                onClick={() => setShowApplicationServices(!showApplicationServices)}
                className="flex items-center gap-2 text-lg font-medium mb-4 cursor-pointer hover:opacity-80 transition-opacity"
                style={{ 
                  color: "var(--vscode-foreground)",
                  background: "none",
                  border: "none",
                  padding: 0
                }}
              >
                <span
                  className="inline-block transition-transform"
                  style={{
                    transform: showApplicationServices ? "rotate(0deg)" : "rotate(-90deg)",
                    transformOrigin: "center"
                  }}
                >
                  ▼
                </span>
                <span>Application Services ({regularServices.length})</span>
              </button>
              {showApplicationServices && (
                <div className="grid grid-cols-1 gap-4">
                  {regularServices.map((service) => (
                    <ServiceCard
                      key={service.id}
                      container={containerName}
                      service={service}
                      status={serviceStatuses[service.id]}
                      onStatusUpdate={handleStatusUpdate}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* System Services */}
          {systemServicesCount > 0 && (
            <div>
              <button
                onClick={() => setShowSystemServices(!showSystemServices)}
                className="flex items-center gap-2 text-lg font-medium mb-4 cursor-pointer hover:opacity-80 transition-opacity"
                style={{ 
                  color: "var(--vscode-foreground)",
                  background: "none",
                  border: "none",
                  padding: 0
                }}
              >
                <span
                  className="inline-block transition-transform"
                  style={{
                    transform: showSystemServices ? "rotate(0deg)" : "rotate(-90deg)",
                    transformOrigin: "center"
                  }}
                >
                  ▼
                </span>
                <span>System Services ({systemServicesCount})</span>
              </button>
              {showSystemServices && (
                <div className="grid grid-cols-1 gap-4">
                  {systemServices.map((service) => (
                    <ServiceCard
                      key={service.id}
                      container={containerName}
                      service={service}
                      status={serviceStatuses[service.id]}
                      onStatusUpdate={handleStatusUpdate}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
