"""Service endpoints router."""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from system_manager.dependencies import get_config, get_agent_client
from system_manager.models import (
    ServiceListResponse,
    ServiceInfo,
    ServiceStatusResponse,
    ServiceStatusListResponse,
    ServiceLogsResponse,
    ServiceLogsClearResponse,
    ServiceRunScriptResponse,
    ServiceRunScriptUpdateRequest,
    ServiceActionRequest,
    ServiceControlResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/containers/{container}/services", tags=["services"])


@router.get("", response_model=ServiceListResponse)
async def list_services(
    container: str,
    config=Depends(get_config),
) -> ServiceListResponse:
    """Get list of services for a specific container."""
    if container not in config.containers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{container}' not found",
        )

    container_config = config.containers[container]

    try:
        client = get_agent_client(container)
        agent_response = await client.get_services()
        agent_services = agent_response.get("services", [])

        label_map = {svc.id: svc.label for svc in container_config.services}

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


@router.get("/{service}/status", response_model=ServiceStatusResponse)
async def get_service_status(
    container: str,
    service: str,
    config=Depends(get_config),
) -> ServiceStatusResponse:
    """Get status of a specific service in a container."""
    if container not in config.containers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{container}' not found",
        )

    container_config = config.containers[container]

    service_label: Optional[str] = None
    for svc_info in container_config.services:
        if svc_info.id == service:
            service_label = svc_info.label
            break
    if service_label is None:
        service_label = service

    try:
        client = get_agent_client(container)
        agent_response = await client.get_service_status(service)
    except Exception as e:
        logger.error(f"Failed to get service status from agent: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to communicate with agent: {str(e)}",
        )

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


@router.get("/status", response_model=ServiceStatusListResponse)
async def get_all_services_status(
    container: str,
    config=Depends(get_config),
) -> ServiceStatusListResponse:
    """Get status of all services in a container."""
    if container not in config.containers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{container}' not found",
        )

    container_config = config.containers[container]

    try:
        client = get_agent_client(container)
        agent_response = await client.get_all_services_status()
        agent_statuses = agent_response.get("statuses", [])
    except Exception as e:
        logger.error(f"Failed to get services status from agent: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to communicate with agent: {str(e)}",
        )

    service_labels: dict[str, str] = {}
    for svc_info in container_config.services:
        service_labels[svc_info.id] = svc_info.label

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


@router.get("/{service}/logs", response_model=ServiceLogsResponse)
async def get_service_logs(
    container: str,
    service: str,
    tail: int = 100,
    config=Depends(get_config),
) -> ServiceLogsResponse:
    """Get logs for a service in a container."""
    if container not in config.containers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{container}' not found",
        )

    try:
        client = get_agent_client(container)
        agent_response = await client.get_service_logs(service, tail=tail)
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


@router.delete("/{service}/logs", response_model=ServiceLogsClearResponse)
async def clear_service_logs(
    container: str,
    service: str,
    config=Depends(get_config),
) -> ServiceLogsClearResponse:
    """Clear logs for a service in a container."""
    if container not in config.containers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{container}' not found",
        )

    try:
        client = get_agent_client(container)
        agent_response = await client.clear_service_logs(service)
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


@router.get("/{service}/run", response_model=ServiceRunScriptResponse)
async def get_service_run_script(
    container: str,
    service: str,
    config=Depends(get_config),
) -> ServiceRunScriptResponse:
    """Get the run script for a service."""
    if container not in config.containers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{container}' not found",
        )

    try:
        client = get_agent_client(container)
        agent_response = await client.get_service_run_script(service)
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


@router.put("/{service}/run", response_model=ServiceRunScriptResponse)
async def update_service_run_script(
    container: str,
    service: str,
    request: ServiceRunScriptUpdateRequest,
    config=Depends(get_config),
) -> ServiceRunScriptResponse:
    """Update the run script for a service."""
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

    try:
        client = get_agent_client(container)
        agent_response = await client.update_service_run_script(service, request.content)
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


@router.post("/{service}", response_model=ServiceControlResponse)
async def control_service(
    container: str,
    service: str,
    request: ServiceActionRequest,
    config=Depends(get_config),
) -> ServiceControlResponse:
    """Control a service (start, stop, or restart)."""
    if container not in config.containers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{container}' not found",
        )

    try:
        client = get_agent_client(container)
        agent_response = await client.control_service(service, request.action)
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
