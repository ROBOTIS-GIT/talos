"""Docker endpoints router."""

import logging

import docker
from fastapi import APIRouter, Depends, HTTPException, status

from system_manager.state import get_docker_client
from system_manager.models import (
    DockerContainerActionRequest,
    DockerContainerActionResponse,
    DockerContainerInfo,
    DockerContainerListResponse,
    DockerContainerLogsResponse,
    DockerContainerStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/docker", tags=["docker"])


@router.get("/containers", response_model=DockerContainerListResponse)
async def list_docker_containers(
    all: bool = False,
    docker_client=Depends(get_docker_client),
) -> DockerContainerListResponse:
    """Get list of all Docker containers."""
    try:
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


@router.get("/containers/{name}/status", response_model=DockerContainerStatus)
async def get_docker_container_status(
    name: str,
    docker_client=Depends(get_docker_client),
) -> DockerContainerStatus:
    """Get detailed status of a Docker container."""
    try:
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


@router.post("/containers/{name}", response_model=DockerContainerActionResponse)
async def control_docker_container(
    name: str,
    request: DockerContainerActionRequest,
    docker_client=Depends(get_docker_client),
) -> DockerContainerActionResponse:
    """Control a Docker container (start, stop, or restart)."""
    try:
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


@router.get("/containers/{name}/logs", response_model=DockerContainerLogsResponse)
async def get_docker_container_logs(
    name: str,
    tail: int = 100,
    docker_client=Depends(get_docker_client),
) -> DockerContainerLogsResponse:
    """Get logs from a Docker container."""
    try:
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
