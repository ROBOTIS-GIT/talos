"""Pydantic models for system_manager API and configuration."""

from typing import Literal, Optional
from pydantic import BaseModel, Field


class ServiceInfo(BaseModel):
    """Service information from configuration."""

    id: str = Field(
        ..., description="Service identifier (matches s6 service name)", examples=["ai_worker_bringup"]
    )
    label: str = Field(..., description="Human-readable service label", examples=["AI Worker Bringup"])


class ContainerConfig(BaseModel):
    """Container configuration from YAML.

    Services are discovered dynamically from the agent, not defined in config.
    The config only needs container name and socket path.
    """

    socket_path: str = Field(..., description="Path to agent Unix domain socket")
    services: list[ServiceInfo] = Field(
        default_factory=list,
        description="Optional: Service metadata for labels. Services are discovered from agent.",
    )


class SystemConfig(BaseModel):
    """Root configuration model."""

    containers: dict[str, ContainerConfig] = Field(
        default_factory=dict, description="Map of container names to their configurations"
    )


# API Request/Response Models


class ServiceActionRequest(BaseModel):
    """Request body for service control actions."""

    action: Literal["up", "down", "restart"] = Field(
        ...,
        description="Action to perform on the service",
        examples=["restart"],
    )


class ContainerInfo(BaseModel):
    """Container information for API responses."""

    name: str = Field(..., description="Container name", examples=["ai_worker"])
    socket_path: str = Field(
        ..., description="Path to agent socket", examples=["/agents/ai_worker/s6_agent.sock"]
    )


class ContainerListResponse(BaseModel):
    """Response for GET /containers."""

    containers: list[ContainerInfo] = Field(..., description="List of known containers")


class ServiceListResponse(BaseModel):
    """Response for GET /containers/{container}/services."""

    container: str = Field(..., description="Container name")
    services: list[ServiceInfo] = Field(..., description="List of services in the container")


class ServiceStatusResponse(BaseModel):
    """Response for GET /containers/{container}/services/{service}/status.

    This wraps the agent's service status response with container/service metadata.
    """

    container: str = Field(..., description="Container name")
    service: str = Field(..., description="Service ID")
    service_label: Optional[str] = Field(None, description="Service label from config")
    # Agent response fields (from agent's /services/{name}/status)
    name: str = Field(..., description="Service name (from agent)")
    raw: str = Field(..., description="Raw s6-svstat output")
    is_up: bool = Field(..., description="Whether service is running")
    pid: Optional[int] = Field(None, description="Process ID if running")
    uptime_seconds: Optional[int] = Field(None, description="Uptime in seconds if running")


class ServiceStatusListResponse(BaseModel):
    """Response for GET /containers/{container}/services/status.

    Returns status for all services in a container in a single request.
    """

    container: str = Field(..., description="Container name")
    statuses: list[ServiceStatusResponse] = Field(..., description="List of service statuses")


class ServiceControlResponse(BaseModel):
    """Response for POST /containers/{container}/services/{service}."""

    container: str = Field(..., description="Container name")
    service: str = Field(..., description="Service ID")
    action: Literal["up", "down", "restart"] = Field(..., description="Action that was performed")
    result: str = Field(default="ok", description="Result of the action")


class ErrorResponse(BaseModel):
    """Error response model."""

    error: str = Field(..., description="Error message")
    detail: Optional[str] = Field(None, description="Additional error details")


# Docker Container Models


class DockerContainerInfo(BaseModel):
    """Docker container information."""

    id: str = Field(..., description="Container ID", examples=["abc123def456"])
    name: str = Field(..., description="Container name", examples=["ai_worker"])
    status: str = Field(..., description="Container status", examples=["running"])
    image: str = Field(..., description="Container image", examples=["robotis/ai-worker:latest"])
    created: str = Field(..., description="Container creation timestamp")


class DockerContainerStatus(BaseModel):
    """Detailed Docker container status."""

    id: str = Field(..., description="Container ID")
    name: str = Field(..., description="Container name")
    status: str = Field(..., description="Container status")
    state: str = Field(..., description="Container state (running, stopped, etc.)")
    running: bool = Field(..., description="Whether container is running")
    restarting: bool = Field(..., description="Whether container is restarting")
    paused: bool = Field(..., description="Whether container is paused")
    image: str = Field(..., description="Container image")
    created: str = Field(..., description="Container creation timestamp")
    started_at: Optional[str] = Field(None, description="Container start timestamp")
    finished_at: Optional[str] = Field(None, description="Container finish timestamp")
    exit_code: Optional[int] = Field(None, description="Container exit code if stopped")


class DockerContainerListResponse(BaseModel):
    """Response for GET /docker/containers."""

    containers: list[DockerContainerInfo] = Field(..., description="List of Docker containers")


class DockerContainerActionRequest(BaseModel):
    """Request body for Docker container control actions."""

    action: Literal["start", "stop", "restart"] = Field(
        ...,
        description="Action to perform on the container",
        examples=["restart"],
    )
    timeout: Optional[int] = Field(
        default=10, description="Timeout in seconds for stop/restart actions", examples=[10]
    )


class DockerContainerActionResponse(BaseModel):
    """Response for Docker container control actions."""

    name: str = Field(..., description="Container name")
    action: Literal["start", "stop", "restart"] = Field(..., description="Action that was performed")
    result: str = Field(default="ok", description="Result of the action")


class DockerContainerLogsResponse(BaseModel):
    """Response for GET /docker/containers/{name}/logs."""

    container: str = Field(..., description="Container name")
    logs: str = Field(..., description="Container logs")
    tail: int = Field(..., description="Number of log lines returned")


class ServiceLogsResponse(BaseModel):
    """Response for GET /containers/{container}/services/{service}/logs."""

    container: str = Field(..., description="Container name")
    service: str = Field(..., description="Service ID")
    logs: str = Field(..., description="Service logs from s6-overlay")
    tail: int = Field(..., description="Number of log lines returned")
    log_path: Optional[str] = Field(None, description="Path to log file in container")


class ServiceLogsClearResponse(BaseModel):
    """Response for DELETE /containers/{container}/services/{service}/logs."""

    container: str = Field(..., description="Container name")
    service: str = Field(..., description="Service ID")
    message: str = Field(..., description="Success message")
    log_path: Optional[str] = Field(None, description="Path to log file in container")


class ServiceRunScriptResponse(BaseModel):
    """Response for GET /containers/{container}/services/{service}/run."""

    container: str = Field(..., description="Container name")
    service: str = Field(..., description="Service ID")
    path: str = Field(..., description="Filesystem path to the service run script")
    content: str = Field(..., description="Contents of the run script")


class ServiceRunScriptUpdateRequest(BaseModel):
    """Request body for updating a service run script."""

    content: str = Field(..., description="New contents of the run script")

