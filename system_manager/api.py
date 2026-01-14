"""FastAPI application for system_manager unified REST API."""

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import docker
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from system_manager.agent_client import AgentClient, AgentClientPool
from system_manager.config import load_config
from system_manager.docker_client import DockerClient
from system_manager.models import (
    ContainerListResponse,
    ContainerInfo,
    DockerContainerActionRequest,
    DockerContainerActionResponse,
    DockerContainerInfo,
    DockerContainerListResponse,
    DockerContainerLogsResponse,
    DockerContainerStatus,
    ErrorResponse,
    ServiceActionRequest,
    ServiceControlResponse,
    ServiceInfo,
    ServiceListResponse,
    ServiceLogsResponse,
    ServiceLogsClearResponse,
    ServiceRunScriptResponse,
    ServiceRunScriptUpdateRequest,
    ServiceStatusListResponse,
    ServiceStatusResponse,
    SystemConfig,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global state
_config: Optional[SystemConfig] = None
_client_pool: Optional[AgentClientPool] = None
_docker_client: Optional[DockerClient] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for FastAPI app.

    Loads configuration and initializes agent client pool and Docker client on startup.
    Cleans up on shutdown.
    """
    global _config, _client_pool, _docker_client

    # Startup
    logger.info("Starting system_manager...")
    try:
        _config = load_config()
        _client_pool = AgentClientPool(_config)

        # Initialize Docker client (optional - may fail if socket not available)
        try:
            _docker_client = DockerClient()
            logger.info("Docker client initialized successfully")
        except Exception as e:
            logger.warning(f"Docker client initialization failed (Docker operations will be unavailable): {e}")
            _docker_client = None

        logger.info("System manager initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize system_manager: {e}")
        raise

    yield

    # Shutdown
    logger.info("Shutting down system_manager...")
    if _client_pool:
        _client_pool.close_all()
    if _docker_client:
        _docker_client.close()
    logger.info("System manager shut down")


app = FastAPI(
    title="System Manager API",
    description="""
    Unified REST API for managing ROS2-based robot containers using s6-overlay.

    This API provides a centralized control plane to manage services across multiple
    robot containers. Each container runs an agent that exposes s6-overlay service
    management via Unix Domain Sockets.

    ## Features

    * List all managed containers
    * List services within each container
    * Get real-time service status
    * Control services (start, stop, restart)
    * Docker container management (list, status, control, logs)

    ## Documentation

    * **Swagger UI**: Available at `/docs` (interactive API testing)
    * **ReDoc**: Available at `/redoc` (alternative documentation)
    * **OpenAPI Schema**: Available at `/openapi.json`
    """,
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    tags_metadata=[
        {
            "name": "root",
            "description": "Root endpoint and API information",
        },
        {
            "name": "containers",
            "description": "Operations related to container management. List and inspect containers.",
        },
        {
            "name": "services",
            "description": "Operations related to service management. List services, check status, and control services (start/stop/restart).",
        },
        {
            "name": "docker",
            "description": "Docker container management operations. List containers, get status, control containers, and view logs.",
        },
    ],
)

# Add CORS middleware to allow requests from the UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins like ["http://localhost:3000"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_config() -> SystemConfig:
    """Get loaded configuration.

    Returns:
        SystemConfig instance.

    Raises:
        HTTPException: If configuration is not loaded.
    """
    if _config is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Configuration not loaded",
        )
    return _config


def get_client_pool() -> AgentClientPool:
    """Get agent client pool.

    Returns:
        AgentClientPool instance.

    Raises:
        HTTPException: If client pool is not initialized.
    """
    if _client_pool is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Agent client pool not initialized",
        )
    return _client_pool


def get_docker_client() -> DockerClient:
    """Get Docker client.

    Returns:
        DockerClient instance.

    Raises:
        HTTPException: If Docker client is not available.
    """
    if _docker_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Docker client not available. Ensure Docker socket is mounted.",
        )
    return _docker_client


def get_agent_client(container_name: str) -> AgentClient:
    """Get agent client for a container.

    Args:
        container_name: Name of the container.

    Returns:
        AgentClient instance.

    Raises:
        HTTPException: If container not found or client unavailable.
    """
    config = get_config()
    if container_name not in config.containers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{container_name}' not found",
        )

    client_pool = get_client_pool()
    client = client_pool.get_client(container_name)
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Agent client for container '{container_name}' not available",
        )
    return client


@app.get(
    "/",
    tags=["root"],
    summary="API Information",
    description="Get API information and links to documentation",
    response_description="API metadata and documentation links",
)
async def root():
    """Root endpoint with API information and documentation links.

    Returns:
        API metadata including version and links to interactive documentation.
    """
    return {
        "message": "System Manager API",
        "version": "0.1.0",
        "docs": {
            "swagger_ui": "/docs",
            "redoc": "/redoc",
            "openapi_schema": "/openapi.json",
        },
        "description": "Unified REST API for managing ROS2-based robot containers",
    }


@app.get(
    "/containers",
    response_model=ContainerListResponse,
    tags=["containers"],
    summary="List all known containers",
    description="Retrieve a list of all containers configured in the system manager",
    response_description="List of containers with their names and socket paths",
)
async def list_containers() -> ContainerListResponse:
    """Get list of all known containers from configuration.

    Returns a list of all containers that are configured in the system manager's
    configuration file. Each container entry includes its name and the path to
    its agent's Unix Domain Socket.

    Returns:
        ContainerListResponse containing a list of ContainerInfo objects.

    Example Response:
        ```json
        {
          "containers": [
            {
              "name": "ai_worker",
              "socket_path": "/agents/ai_worker/s6_agent.sock"
            }
          ]
        }
        ```
    """
    config = get_config()
    containers = [
        ContainerInfo(name=name, socket_path=container_config.socket_path)
        for name, container_config in config.containers.items()
    ]
    return ContainerListResponse(containers=containers)


@app.get(
    "/containers/{container}/services",
    response_model=ServiceListResponse,
    tags=["services"],
    summary="List services for a container",
    description="Get a list of all services available in a specific container",
    response_description="List of services with their IDs and labels",
)
async def list_services(container: str) -> ServiceListResponse:
    """Get list of services for a specific container.

    Services are discovered dynamically from the agent. The config may contain
    optional labels for better display names, but services come from the agent.

    Args:
        container: Name of the container (e.g., "ai_worker")

    Returns:
        ServiceListResponse containing the container name and list of services.

    Raises:
        HTTPException: 404 if container not found, 503 if agent is unavailable.

    Example Response:
        ```json
        {
          "container": "ai_worker",
          "services": [
            {
              "id": "ffw_bg2_follower_ai",
              "label": "FFW BG2 Follower AI"
            },
            {
              "id": "s6-agent",
              "label": "s6-agent"
            }
          ]
        }
        ```
    """
    config = get_config()
    if container not in config.containers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{container}' not found",
        )

    container_config = config.containers[container]

    # Get services from agent (source of truth)
    try:
        client = get_agent_client(container)
        agent_response = client.get_services()
        agent_services = agent_response.get("services", [])

        # Create a map of service labels from config (optional metadata)
        label_map = {svc.id: svc.label for svc in container_config.services}

        # Build service list from agent, using labels from config if available
        services = [
            ServiceInfo(id=service_id, label=label_map.get(service_id, service_id))
            for service_id in agent_services
        ]

    except Exception as e:
        logger.error(f"Failed to get services from agent for container '{container}': {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to communicate with agent: {str(e)}",
        )

    return ServiceListResponse(container=container, services=services)


@app.get(
    "/containers/{container}/services/{service}/status",
    response_model=ServiceStatusResponse,
    tags=["services"],
    summary="Get status of a service",
    description="Retrieve the current status of a specific service in a container",
    response_description="Service status including running state, PID, and uptime",
)
async def get_service_status(container: str, service: str) -> ServiceStatusResponse:
    """Get status of a specific service in a container.

    Calls the agent's /services/{name}/status endpoint and wraps the response
    with container/service metadata. Returns detailed information about the
    service's current state.

    Args:
        container: Name of the container (e.g., "ai_worker")
        service: Service ID (e.g., "ai_worker_bringup")

    Returns:
        ServiceStatusResponse with service status information.

    Raises:
        HTTPException: 404 if container/service not found, 503 if agent unavailable.

    Example Response:
        ```json
        {
          "container": "ai_worker",
          "service": "ai_worker_bringup",
          "service_label": "AI Worker Bringup",
          "name": "ai_worker_bringup",
          "raw": "up (pid 1234) 10 seconds",
          "is_up": true,
          "pid": 1234,
          "uptime_seconds": 10
        }
        ```
    """
    config = get_config()
    if container not in config.containers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{container}' not found",
        )

    container_config = config.containers[container]

    # Find service label from config (optional metadata)
    service_label: Optional[str] = None
    for svc_info in container_config.services:
        if svc_info.id == service:
            service_label = svc_info.label
            break
    # If not in config, use service name as label
    if service_label is None:
        service_label = service

    # Get status from agent
    try:
        client = get_agent_client(container)
        agent_response = client.get_service_status(service)
    except Exception as e:
        logger.error(f"Failed to get service status from agent: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to communicate with agent: {str(e)}",
        )

    # Wrap agent response with container/service metadata
    return ServiceStatusResponse(
        container=container,
        service=service,
        service_label=service_label,
        name=agent_response.get("name", service),
        raw=agent_response.get("raw", ""),
        is_up=agent_response.get("is_up", False),
        pid=agent_response.get("pid"),
        uptime_seconds=agent_response.get("uptime_seconds"),
    )


@app.get(
    "/containers/{container}/services/status",
    response_model=ServiceStatusListResponse,
    tags=["services"],
    summary="Get status of all services",
    description="Retrieve the current status of all services in a container in a single request",
    response_description="List of service statuses including running state, PID, and uptime",
)
async def get_all_services_status(container: str) -> ServiceStatusListResponse:
    """Get status of all services in a container.

    Fetches status for all services in parallel and returns them in a single response.
    This is more efficient than calling the individual status endpoint for each service.

    Args:
        container: Name of the container (e.g., "ai_worker")

    Returns:
        ServiceStatusListResponse with status for all services.

    Raises:
        HTTPException: 404 if container not found, 503 if agent unavailable.

    Example Response:
        ```json
        {
          "container": "ai_worker",
          "statuses": [
            {
              "container": "ai_worker",
              "service": "ai_worker_bringup",
              "service_label": "AI Worker Bringup",
              "name": "ai_worker_bringup",
              "raw": "up (pid 1234) 10 seconds",
              "is_up": true,
              "pid": 1234,
              "uptime_seconds": 10
            }
          ]
        }
        ```
    """
    config = get_config()
    if container not in config.containers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{container}' not found",
        )

    container_config = config.containers[container]

    # Get all service statuses from agent in a single request
    try:
        client = get_agent_client(container)
        # Use the agent's bulk status endpoint for efficiency
        loop = asyncio.get_event_loop()
        agent_response = await loop.run_in_executor(
            None, client.get_all_services_status
        )
        agent_statuses = agent_response.get("statuses", [])
    except Exception as e:
        logger.error(f"Failed to get services status from agent: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to communicate with agent: {str(e)}",
        )

    # Create a mapping of service ID to label from config
    service_labels: dict[str, str] = {}
    for svc_info in container_config.services:
        service_labels[svc_info.id] = svc_info.label

    # Convert agent statuses to API response format with labels
    statuses: list[ServiceStatusResponse] = []
    for agent_status in agent_statuses:
        service_id = agent_status.get("name", "")
        service_label = service_labels.get(service_id, service_id)

        statuses.append(
            ServiceStatusResponse(
                container=container,
                service=service_id,
                service_label=service_label,
                name=agent_status.get("name", service_id),
                raw=agent_status.get("raw", ""),
                is_up=agent_status.get("is_up", False),
                pid=agent_status.get("pid"),
                uptime_seconds=agent_status.get("uptime_seconds"),
            )
        )

    return ServiceStatusListResponse(container=container, statuses=statuses)


@app.get(
    "/containers/{container}/services/{service}/logs",
    response_model=ServiceLogsResponse,
    tags=["services"],
    summary="Get service logs",
    description="Retrieve logs from a service in a container",
    response_description="Service logs with metadata",
)
async def get_service_logs(
    container: str,
    service: str,
    tail: int = 100,
) -> ServiceLogsResponse:
    """Get logs for a service in a container.

    Fetches logs from the agent's /services/{name}/logs endpoint, which reads
    from the s6-overlay log directory (/var/log/{service_name}/current).

    Args:
        container: Name of the container (e.g., "ai_worker")
        service: Service ID (e.g., "ffw_bg2_follower_ai")
        tail: Number of log lines to return from the end. Defaults to 100.

    Returns:
        ServiceLogsResponse containing the service logs.

    Raises:
        HTTPException: 404 if container/service not found, 503 if agent unavailable.

    Example Response:
        ```json
        {
          "container": "ai_worker",
          "service": "ffw_bg2_follower_ai",
          "logs": "2024-01-01T01:00:00Z [ffw_bg2_follower_ai] Starting service...\n...",
          "tail": 100,
          "log_path": "/var/log/ffw_bg2_follower_ai/current"
        }
        ```
    """
    config = get_config()
    if container not in config.containers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{container}' not found",
        )

    # Get logs from agent
    try:
        client = get_agent_client(container)
        agent_response = client.get_service_logs(service, tail=tail)
        logger.info(f"Successfully retrieved logs for service '{service}' in container '{container}'")
    except Exception as e:
        logger.error(f"Failed to get service logs from agent: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to communicate with agent: {str(e)}",
        )

    return ServiceLogsResponse(
        container=container,
        service=service,
        logs=agent_response.get("logs", ""),
        tail=agent_response.get("tail", tail),
        log_path=agent_response.get("log_path"),
    )


@app.delete(
    "/containers/{container}/services/{service}/logs",
    response_model=ServiceLogsClearResponse,
    tags=["services"],
    summary="Clear service logs",
    description="Clear (truncate) logs for a service in a container",
    response_description="Confirmation that logs were cleared",
)
async def clear_service_logs(
    container: str,
    service: str,
) -> ServiceLogsClearResponse:
    """Clear logs for a service in a container.

    Fetches logs from the agent's DELETE /services/{name}/logs endpoint, which truncates
    the log file at /var/log/{service_name}/current.

    Args:
        container: Name of the container (e.g., "ai_worker")
        service: Service ID (e.g., "ffw_bg2_follower_ai")

    Returns:
        ServiceLogsClearResponse confirming that logs were cleared.

    Raises:
        HTTPException: 404 if container/service not found, 503 if agent unavailable.

    Example Response:
        ```json
        {
          "container": "ai_worker",
          "service": "ffw_bg2_follower_ai",
          "message": "Logs cleared successfully",
          "log_path": "/var/log/ffw_bg2_follower_ai/current"
        }
        ```
    """
    config = get_config()
    if container not in config.containers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{container}' not found",
        )

    # Clear logs via agent
    try:
        client = get_agent_client(container)
        agent_response = client.clear_service_logs(service)
        logger.info(f"Successfully cleared logs for service '{service}' in container '{container}'")
    except Exception as e:
        logger.error(f"Failed to clear service logs from agent: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to communicate with agent: {str(e)}",
        )

    return ServiceLogsClearResponse(
        container=container,
        service=service,
        message=agent_response.get("message", "Logs cleared successfully"),
        log_path=agent_response.get("log_path"),
    )


@app.websocket("/ws/containers/{container}/services/{service}/logs")
async def websocket_service_logs(websocket: WebSocket, container: str, service: str):
    """WebSocket endpoint for streaming service logs in real-time.
    
    Establishes a WebSocket connection and streams logs from the specified service.
    Logs are fetched from the agent and sent to the client as they become available.
    
    Args:
        websocket: WebSocket connection object.
        container: Name of the container (e.g., "ai_worker").
        service: Service ID (e.g., "ffw_bg2_follower_ai").
    """
    await websocket.accept()
    logger.info(f"WebSocket connection established for {container}/{service} logs")
    
    try:
        # Validate container exists
        config = get_config()
        if container not in config.containers:
            await websocket.send_json({
                "type": "error",
                "data": f"Container '{container}' not found"
            })
            await websocket.close()
            return
        
        client_pool = get_client_pool()
        client = client_pool.get_client(container)
        if client is None:
            await websocket.send_json({
                "type": "error",
                "data": f"Agent client for container '{container}' not available"
            })
            await websocket.close()
            return
        
        # Initial log fetch (last 100 lines)
        last_logs = ""
        try:
            loop = asyncio.get_event_loop()
            agent_response = await loop.run_in_executor(
                None, client.get_service_logs, service, 100
            )
            last_logs = agent_response.get("logs", "")
            
            # Send initial logs
            await websocket.send_json({
                "type": "logs",
                "data": last_logs
            })
        except Exception as e:
            logger.error(f"Failed to fetch initial logs: {e}")
            await websocket.send_json({
                "type": "error",
                "data": f"Failed to fetch initial logs: {str(e)}"
            })
        
        # Poll for new logs every 0.5 seconds
        loop = asyncio.get_event_loop()
        while True:
            try:
                # Wait before next poll
                await asyncio.sleep(0.5)
                
                # Fetch current logs
                agent_response = await loop.run_in_executor(
                    None, client.get_service_logs, service, 10000  # Fetch up to 10000 lines
                )
                current_logs = agent_response.get("logs", "")
                
                # Compare logs to find new content
                if current_logs != last_logs:
                    if len(current_logs) > len(last_logs) and current_logs.startswith(last_logs):
                        # New content appended
                        new_logs = current_logs[len(last_logs):]
                        await websocket.send_json({
                            "type": "logs",
                            "data": new_logs
                        })
                    elif len(current_logs) < len(last_logs):
                        # Logs were cleared, send full logs
                        await websocket.send_json({
                            "type": "logs",
                            "data": current_logs
                        })
                    else:
                        # Logs changed but not in expected way, send full logs
                        await websocket.send_json({
                            "type": "logs",
                            "data": current_logs
                        })
                    last_logs = current_logs
                    
            except WebSocketDisconnect:
                logger.info(f"WebSocket disconnected for {container}/{service}")
                break
            except Exception as e:
                logger.error(f"Error streaming logs for {container}/{service}: {e}")
                try:
                    await websocket.send_json({
                        "type": "error",
                        "data": f"Error streaming logs: {str(e)}"
                    })
                except Exception:
                    # WebSocket might be closed, break the loop
                    break
                # Continue polling despite errors (but wait a bit longer)
                await asyncio.sleep(2)
                
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for {container}/{service}")
    except Exception as e:
        logger.error(f"WebSocket error for {container}/{service}: {e}")
        try:
            await websocket.close()
        except Exception:
            pass


@app.get(
    "/containers/{container}/services/{service}/run",
    response_model=ServiceRunScriptResponse,
    tags=["services"],
    summary="Get service run script",
    description="Read the s6-overlay service 'run' script for editing",
    responses={
        404: {"model": ErrorResponse, "description": "Service run script not found"},
        500: {"model": ErrorResponse, "description": "Failed to read service run script"},
        503: {"model": ErrorResponse, "description": "Agent unavailable"},
    },
)
async def get_service_run_script(
    container: str,
    service: str,
) -> ServiceRunScriptResponse:
    """Get the run script for a service.

    Fetches the run script from the agent, which reads from
    /etc/s6-overlay/s6-rc.d/{service}/run inside the container.

    Args:
        container: Name of the container (e.g., "ai_worker")
        service: Service ID (e.g., "ffw_bg2_follower_ai")

    Returns:
        ServiceRunScriptResponse with path and file contents.

    Raises:
        HTTPException: 404 if container/service not found, 503 if agent unavailable.

    Example Response:
        ```json
        {
          "container": "ai_worker",
          "service": "ffw_bg2_follower_ai",
          "path": "/etc/s6-overlay/s6-rc.d/ffw_bg2_follower_ai/run",
          "content": "#!/command/with-contenv bash\n..."
        }
        ```
    """
    config = get_config()
    if container not in config.containers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{container}' not found",
        )

    # Get run script from agent
    try:
        client = get_agent_client(container)
        agent_response = client.get_service_run_script(service)
        logger.info(f"Successfully retrieved run script for service '{service}' in container '{container}'")
    except Exception as e:
        logger.error(f"Failed to get run script from agent: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to communicate with agent: {str(e)}",
        )

    return ServiceRunScriptResponse(
        container=container,
        service=service,
        path=agent_response.get("path", ""),
        content=agent_response.get("content", ""),
    )


@app.put(
    "/containers/{container}/services/{service}/run",
    response_model=ServiceRunScriptResponse,
    tags=["services"],
    summary="Update service run script",
    description="Update the s6-overlay service 'run' script from the UI",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request"},
        404: {"model": ErrorResponse, "description": "Service run script not found"},
        500: {"model": ErrorResponse, "description": "Failed to update service run script"},
        503: {"model": ErrorResponse, "description": "Agent unavailable"},
    },
)
async def update_service_run_script(
    container: str,
    service: str,
    request: ServiceRunScriptUpdateRequest,
) -> ServiceRunScriptResponse:
    """Update the run script for a service.

    Updates the run script via the agent, which writes to
    /etc/s6-overlay/s6-rc.d/{service}/run inside the container.
    Changes take effect after the service is restarted.

    Args:
        container: Name of the container (e.g., "ai_worker")
        service: Service ID (e.g., "ffw_bg2_follower_ai")
        request: ServiceRunScriptUpdateRequest with new script content

    Returns:
        Updated ServiceRunScriptResponse.

    Raises:
        HTTPException: 400 if content is invalid, 404 if service not found, 503 if agent unavailable.

    Example Request:
        ```json
        {
          "content": "#!/command/with-contenv bash\n# Updated script\n..."
        }
        ```

    Example Response:
        ```json
        {
          "container": "ai_worker",
          "service": "ffw_bg2_follower_ai",
          "path": "/etc/s6-overlay/s6-rc.d/ffw_bg2_follower_ai/run",
          "content": "#!/command/with-contenv bash\n# Updated script\n..."
        }
        ```
    """
    config = get_config()
    if container not in config.containers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{container}' not found",
        )

    if not request.content or not request.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Content must not be empty",
        )

    # Update run script via agent
    try:
        client = get_agent_client(container)
        agent_response = client.update_service_run_script(service, request.content)
        logger.info(f"Successfully updated run script for service '{service}' in container '{container}'")
    except Exception as e:
        logger.error(f"Failed to update run script via agent: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to communicate with agent: {str(e)}",
        )

    return ServiceRunScriptResponse(
        container=container,
        service=service,
        path=agent_response.get("path", ""),
        content=agent_response.get("content", ""),
    )


@app.post(
    "/containers/{container}/services/{service}",
    response_model=ServiceControlResponse,
    tags=["services"],
    summary="Control a service (start/stop/restart)",
    description="Start, stop, or restart a service in a container",
    response_description="Confirmation of the action performed",
)
async def control_service(
    container: str,
    service: str,
    request: ServiceActionRequest,
) -> ServiceControlResponse:
    """Control a service (start, stop, or restart).

    Forwards the action to the agent's /services/{name} endpoint. This allows
    you to control s6-overlay services running inside the container.

    Args:
        container: Name of the container (e.g., "ai_worker")
        service: Service ID (e.g., "ai_worker_bringup")
        request: ServiceActionRequest with action ("up", "down", or "restart")

    Returns:
        ServiceControlResponse confirming the action was performed.

    Raises:
        HTTPException: 404 if container/service not found, 503 if agent unavailable.

    Example Request:
        ```json
        {
          "action": "restart"
        }
        ```

    Example Response:
        ```json
        {
          "container": "ai_worker",
          "service": "ai_worker_bringup",
          "action": "restart",
          "result": "ok"
        }
        ```
    """
    config = get_config()
    if container not in config.containers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{container}' not found",
        )

    # Forward to agent
    try:
        client = get_agent_client(container)
        agent_response = client.control_service(service, request.action)
        logger.info(f"Successfully executed action '{request.action}' on service '{service}' in container '{container}'")
    except Exception as e:
        logger.error(f"Failed to control service via agent: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to communicate with agent: {str(e)}",
        )

    return ServiceControlResponse(
        container=container,
        service=service,
        action=request.action,
        result=agent_response.get("result", "ok"),
    )


# Docker Container Management Endpoints


@app.get(
    "/docker/containers",
    response_model=DockerContainerListResponse,
    tags=["docker"],
    summary="List all Docker containers",
    description="Retrieve a list of all Docker containers on the system",
    response_description="List of Docker containers with basic information",
)
async def list_docker_containers(all: bool = False) -> DockerContainerListResponse:
    """Get list of all Docker containers.

    Args:
        all: If True, include stopped containers. Defaults to False (only running).

    Returns:
        DockerContainerListResponse containing a list of DockerContainerInfo objects.

    Raises:
        HTTPException: 503 if Docker client is unavailable.

    Example Response:
        ```json
        {
          "containers": [
            {
              "id": "abc123def456",
              "name": "ai_worker",
              "status": "running",
              "image": "robotis/ai-worker:latest",
              "created": "2024-01-01T00:00:00Z"
            }
          ]
        }
        ```
    """
    try:
        docker_client = get_docker_client()
        containers = docker_client.list_containers(all=all)
        return DockerContainerListResponse(
            containers=[DockerContainerInfo(**container) for container in containers]
        )
    except Exception as e:
        logger.error(f"Failed to list Docker containers: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to list containers: {str(e)}",
        )


@app.get(
    "/docker/containers/{name}/status",
    response_model=DockerContainerStatus,
    tags=["docker"],
    summary="Get Docker container status",
    description="Retrieve detailed status information for a specific Docker container",
    response_description="Detailed container status including state, timestamps, and exit codes",
)
async def get_docker_container_status(name: str) -> DockerContainerStatus:
    """Get detailed status of a Docker container.

    Args:
        name: Container name or ID.

    Returns:
        DockerContainerStatus with detailed container information.

    Raises:
        HTTPException: 404 if container not found, 503 if Docker client unavailable.

    Example Response:
        ```json
        {
          "id": "abc123def456",
          "name": "ai_worker",
          "status": "running",
          "state": "running",
          "running": true,
          "restarting": false,
          "paused": false,
          "image": "robotis/ai-worker:latest",
          "created": "2024-01-01T00:00:00Z",
          "started_at": "2024-01-01T01:00:00Z",
          "finished_at": null,
          "exit_code": null
        }
        ```
    """
    try:
        docker_client = get_docker_client()
        status_info = docker_client.get_container_status(name)
        return DockerContainerStatus(**status_info)
    except docker.errors.NotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Docker container '{name}' not found",
        )
    except Exception as e:
        logger.error(f"Failed to get container status for '{name}': {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to get container status: {str(e)}",
        )


@app.post(
    "/docker/containers/{name}",
    response_model=DockerContainerActionResponse,
    tags=["docker"],
    summary="Control a Docker container",
    description="Start, stop, or restart a Docker container",
    response_description="Confirmation of the action performed",
)
async def control_docker_container(
    name: str, request: DockerContainerActionRequest
) -> DockerContainerActionResponse:
    """Control a Docker container (start, stop, or restart).

    Args:
        name: Container name or ID.
        request: DockerContainerActionRequest with action and optional timeout.

    Returns:
        DockerContainerActionResponse confirming the action was performed.

    Raises:
        HTTPException: 404 if container not found, 503 if Docker client unavailable.

    Example Request:
        ```json
        {
          "action": "restart",
          "timeout": 10
        }
        ```

    Example Response:
        ```json
        {
          "name": "ai_worker",
          "action": "restart",
          "result": "ok"
        }
        ```
    """
    try:
        docker_client = get_docker_client()

        if request.action == "start":
            result = docker_client.start_container(name)
        elif request.action == "stop":
            result = docker_client.stop_container(name, timeout=request.timeout or 10)
        elif request.action == "restart":
            result = docker_client.restart_container(name, timeout=request.timeout or 10)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid action: {request.action}",
            )

        return DockerContainerActionResponse(**result)
    except docker.errors.NotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Docker container '{name}' not found",
        )
    except Exception as e:
        logger.error(f"Failed to control container '{name}': {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to control container: {str(e)}",
        )


@app.get(
    "/docker/containers/{name}/logs",
    response_model=DockerContainerLogsResponse,
    tags=["docker"],
    summary="Get Docker container logs",
    description="Retrieve logs from a Docker container",
    response_description="Container logs with metadata",
)
async def get_docker_container_logs(name: str, tail: int = 100) -> DockerContainerLogsResponse:
    """Get logs from a Docker container.

    Args:
        name: Container name or ID.
        tail: Number of log lines to return from the end. Defaults to 100.

    Returns:
        DockerContainerLogsResponse containing the logs.

    Raises:
        HTTPException: 404 if container not found, 503 if Docker client unavailable.

    Example Response:
        ```json
        {
          "container": "ai_worker",
          "logs": "2024-01-01T01:00:00Z Starting service...\n...",
          "tail": 100
        }
        ```
    """
    try:
        docker_client = get_docker_client()
        logs = docker_client.get_container_logs(name, tail=tail)
        return DockerContainerLogsResponse(container=name, logs=logs, tail=tail)
    except docker.errors.NotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Docker container '{name}' not found",
        )
    except Exception as e:
        logger.error(f"Failed to get logs for container '{name}': {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to get container logs: {str(e)}",
        )


@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc: HTTPException):
    """Custom exception handler for HTTP exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(error=exc.detail or "Unknown error").model_dump(),
    )

