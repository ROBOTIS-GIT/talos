"""FastAPI application for s6-overlay agent service management API."""

import logging
import re
import subprocess
from pathlib import Path

from fastapi import FastAPI, HTTPException, status
from fastapi.responses import JSONResponse

from system_manager.agent.models import (
    ErrorResponse,
    ServiceActionRequest,
    ServiceControlResponse,
    ServiceListResponse,
    ServiceStatus,
    ServiceStatusListResponse,
)
from system_manager.agent.s6_client import (
    control_service,
    get_all_services_status,
    get_service_status,
    list_services,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def strip_ansi_codes(text: str) -> str:
    """Remove ANSI escape codes from text.

    ANSI escape codes are used for terminal coloring and formatting.
    This function removes them to produce clean log output.

    Args:
        text: Text that may contain ANSI escape codes.

    Returns:
        Text with ANSI escape codes removed.
    """
    # Pattern to match ANSI escape sequences
    # Matches: \x1b[...m, \033[...m, \u001b[...m, etc.
    ansi_escape = re.compile(r'\x1b\[[0-9;]*m|\033\[[0-9;]*m|\u001b\[[0-9;]*m')
    return ansi_escape.sub('', text)


app = FastAPI(
    title="s6 Agent API",
    description="""
    REST API for managing s6-overlay services within a container.

    This agent provides endpoints to list, check status, and control
    s6-overlay services running in the container.
    """,
    version="0.1.0",
    docs_url=None,  # Disable docs for security (Unix socket only)
    redoc_url=None,
    openapi_url=None,
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc: HTTPException):
    """Custom exception handler for HTTP exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(error=exc.detail or "Unknown error").model_dump(),
    )


@app.get("/", tags=["root"])
async def root():
    """Root endpoint."""
    return {"message": "s6 Agent API", "version": "0.1.0"}


@app.get(
    "/services",
    response_model=ServiceListResponse,
    tags=["services"],
    summary="List all available services",
    description="Get a list of all s6-overlay services available in this container",
)
async def get_services() -> ServiceListResponse:
    """Get list of all available s6 services.

    Returns:
        ServiceListResponse containing a list of service names.

    Raises:
        HTTPException: 500 if service listing fails.
    """
    try:
        services = list_services()
        return ServiceListResponse(services=services)
    except Exception as e:
        logger.error(f"Failed to list services: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list services: {str(e)}",
        )


@app.get(
    "/services/status",
    response_model=ServiceStatusListResponse,
    tags=["services"],
    summary="Get status of all services",
    description="Get detailed status information for all services in a single request",
)
async def get_all_services_status_endpoint() -> ServiceStatusListResponse:
    """Get status of all services.

    This endpoint is more efficient than calling the individual status endpoint
    for each service, as it processes all services in a single operation.

    Returns:
        ServiceStatusListResponse containing status for all available services.

    Raises:
        HTTPException: 500 if service listing fails.
    """
    try:
        statuses = get_all_services_status()
        return ServiceStatusListResponse(statuses=statuses)
    except Exception as e:
        logger.error(f"Failed to get all services status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get services status: {str(e)}",
        )


@app.get(
    "/services/{name}/status",
    response_model=ServiceStatus,
    tags=["services"],
    summary="Get service status",
    description="Get detailed status information for a specific service",
)
async def get_service_status_endpoint(name: str) -> ServiceStatus:
    """Get status of a specific service.

    Args:
        name: Service name.

    Returns:
        ServiceStatus with detailed service information.

    Raises:
        HTTPException: 404 if service not found, 500 on other errors.
    """
    try:
        return get_service_status(name)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service '{name}' not found",
        )
    except Exception as e:
        logger.error(f"Failed to get status for service '{name}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get service status: {str(e)}",
        )


@app.post(
    "/services/{name}",
    response_model=ServiceControlResponse,
    tags=["services"],
    summary="Control a service",
    description="Start, stop, or restart a service",
)
async def control_service_endpoint(
    name: str, request: ServiceActionRequest
) -> ServiceControlResponse:
    """Control a service (start, stop, or restart).

    Args:
        name: Service name.
        request: ServiceActionRequest with action to perform.

    Returns:
        ServiceControlResponse confirming the action.

    Raises:
        HTTPException: 404 if service not found, 400 if action invalid, 500 on other errors.
    """
    try:
        control_service(name, request.action)
        return ServiceControlResponse(name=name, action=request.action, result="ok")
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service '{name}' not found",
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Failed to control service '{name}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to control service: {str(e)}",
        )


@app.get(
    "/services/{name}/logs",
    tags=["services"],
    summary="Get service logs",
    description="Retrieve logs for a service from s6-overlay log directory",
)
async def get_service_logs(name: str, tail: int = 100, strip_ansi: bool = False):
    """Get logs for a service.

    Reads logs from /var/log/{service_name}/current (s6-overlay log directory).
    If the log file doesn't exist or the service doesn't have logging enabled,
    returns an appropriate error.

    Args:
        name: Service name.
        tail: Number of log lines to return from the end. Defaults to 100.
        strip_ansi: If True, remove ANSI escape codes (color/formatting) from the output.

    Returns:
        Dictionary with service name, logs content, and tail count.

    Raises:
        HTTPException: 404 if service not found or logs unavailable, 500 on other errors.
    """
    # s6-overlay logs are stored in /var/log/{service_name}/current
    log_path = Path(f"/var/log/{name}/current")

    if not log_path.exists():
        # Return empty logs instead of 404 when log file doesn't exist
        logger.debug(f"Log file not found for service '{name}', returning empty logs")
        return {
            "service": name,
            "logs": "",
            "tail": tail,
            "log_path": str(log_path),
        }

    try:
        # Use tail command to get last N lines
        # Read from /var/log/{service_name}/current (s6-log output)
        result = subprocess.run(
            ["tail", "-n", str(tail), str(log_path)],
            capture_output=True,
            text=True,
            timeout=5,
        )

        if result.returncode != 0:
            logger.error(f"Failed to read logs for service '{name}': {result.stderr}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to read log file: {result.stderr}",
            )

        logs = strip_ansi_codes(result.stdout) if strip_ansi else result.stdout

        return {
            "service": name,
            "logs": logs,
            "tail": tail,
            "log_path": str(log_path),
        }

    except subprocess.TimeoutExpired:
        logger.error(f"Timeout reading logs for service '{name}'")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Timeout reading log file",
        )
    except Exception as e:
        logger.error(f"Error reading logs for service '{name}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read logs: {str(e)}",
        )


@app.delete(
    "/services/{name}/logs",
    tags=["services"],
    summary="Clear service logs",
    description="Clear (truncate) logs for a service",
)
async def clear_service_logs(name: str):
    """Clear logs for a service.

    Truncates the log file at /var/log/{service_name}/current to clear all logs.
    Note: s6-log will continue writing new logs to this file after clearing.

    Args:
        name: Service name.

    Returns:
        Dictionary with service name and success message.

    Raises:
        HTTPException: 404 if service not found or logs unavailable, 500 on other errors.
    """
    # s6-overlay logs are stored in /var/log/{service_name}/current
    log_path = Path(f"/var/log/{name}/current")

    if not log_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Log file not found for service '{name}'. Service may not have logging enabled or log directory doesn't exist.",
        )

    try:
        # Truncate the log file (clear all contents)
        log_path.open("w").close()
        logger.info(f"Successfully cleared logs for service '{name}'")

        return {
            "service": name,
            "message": "Logs cleared successfully",
            "log_path": str(log_path),
        }
    except Exception as e:
        logger.error(f"Error clearing logs for service '{name}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clear logs: {str(e)}",
        )


@app.get(
    "/services/{name}/run",
    tags=["services"],
    summary="Get service run script",
    description="Read the s6-overlay service 'run' script for editing",
)
async def get_service_run_script(name: str):
    """Get the run script for a service.

    Reads the run script from /etc/s6-overlay/s6-rc.d/{service_name}/run.
    This is the script that s6-overlay executes to start the service.

    Args:
        name: Service name.

    Returns:
        Dictionary with service name, script path, and content.

    Raises:
        HTTPException: 404 if service/script not found, 500 on other errors.
    """
    # s6-overlay run scripts are in /etc/s6-overlay/s6-rc.d/{service_name}/run
    run_path = Path(f"/etc/s6-overlay/s6-rc.d/{name}/run")

    if not run_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Run script not found for service '{name}' at {run_path}. Service may not exist or run script is missing.",
        )

    try:
        content = run_path.read_text(encoding="utf-8")
        return {
            "service": name,
            "path": str(run_path),
            "content": content,
        }
    except Exception as e:
        logger.error(f"Failed to read run script for service '{name}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read run script: {str(e)}",
        )


@app.put(
    "/services/{name}/run",
    tags=["services"],
    summary="Update service run script",
    description="Update the s6-overlay service 'run' script",
)
async def update_service_run_script(name: str, request: dict):
    """Update the run script for a service.

    Writes new content to /etc/s6-overlay/s6-rc.d/{service_name}/run.
    Note: Changes take effect after service restart.

    Args:
        name: Service name.
        request: Dictionary with 'content' key containing new script content.

    Returns:
        Dictionary with service name, script path, and updated content.

    Raises:
        HTTPException: 400 if content is invalid, 404 if service not found, 500 on write errors.
    """
    content = request.get("content")
    if not content or not isinstance(content, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Content must be a non-empty string",
        )

    # s6-overlay run scripts are in /etc/s6-overlay/s6-rc.d/{service_name}/run
    run_path = Path(f"/etc/s6-overlay/s6-rc.d/{name}/run")

    if not run_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Run script not found for service '{name}' at {run_path}. Service may not exist or run script is missing.",
        )

    try:
        # Write new content to the run script
        run_path.write_text(content, encoding="utf-8")
        # Make sure it's executable
        run_path.chmod(0o755)

        logger.info(f"Successfully updated run script for service '{name}'")
        return {
            "service": name,
            "path": str(run_path),
            "content": content,
        }
    except Exception as e:
        logger.error(f"Failed to write run script for service '{name}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to write run script: {str(e)}",
        )

