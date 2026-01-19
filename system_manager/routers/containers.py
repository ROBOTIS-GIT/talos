"""Container endpoints router."""

from fastapi import APIRouter, Depends
from system_manager.dependencies import get_config
from system_manager.models import ContainerListResponse, ContainerInfo

router = APIRouter(prefix="/containers", tags=["containers"])


@router.get(
    "",
    response_model=ContainerListResponse,
    summary="List all known containers",
    description="Retrieve a list of all containers configured in the system manager",
    response_description="List of containers with their names and socket paths",
)
async def list_containers(config=Depends(get_config)) -> ContainerListResponse:
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
    containers = [
        ContainerInfo(name=name, socket_path=container_config.socket_path)
        for name, container_config in config.containers.items()
    ]
    return ContainerListResponse(containers=containers)

