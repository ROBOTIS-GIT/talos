"""Docker client for container management."""

import logging
from typing import Optional

import docker
from docker.errors import DockerException, NotFound

logger = logging.getLogger(__name__)


class DockerClient:
    """Client for interacting with Docker daemon via Docker socket."""

    def __init__(self, base_url: str = "unix://var/run/docker.sock"):
        """Initialize Docker client.

        Args:
            base_url: Docker daemon socket URL. Defaults to Unix socket.
        """
        try:
            self.client = docker.DockerClient(base_url=base_url)
            # Test connection
            self.client.ping()
            logger.info("Docker client initialized successfully")
        except DockerException as e:
            logger.error(f"Failed to initialize Docker client: {e}")
            raise

    def list_containers(self, all: bool = False) -> list[dict]:
        """List all containers.

        Args:
            all: If True, include stopped containers.

        Returns:
            List of container dictionaries with basic info.
        """
        try:
            containers = self.client.containers.list(all=all)
            return [
                {
                    "id": container.id,
                    "name": container.name,
                    "status": container.status,
                    "image": container.image.tags[0] if container.image.tags else "",
                    "created": container.attrs["Created"],
                }
                for container in containers
            ]
        except DockerException as e:
            logger.error(f"Failed to list containers: {e}")
            raise

    def get_container(self, container_name: str):
        """Get a container by name or ID.

        Args:
            container_name: Container name or ID.

        Returns:
            Docker container object.

        Raises:
            NotFound: If container not found.
        """
        try:
            return self.client.containers.get(container_name)
        except NotFound:
            logger.warning(f"Container '{container_name}' not found")
            raise
        except DockerException as e:
            logger.error(f"Failed to get container '{container_name}': {e}")
            raise

    def get_container_status(self, container_name: str) -> dict:
        """Get detailed status of a container.

        Args:
            container_name: Container name or ID.

        Returns:
            Dictionary with container status information.

        Raises:
            NotFound: If container not found.
        """
        try:
            container = self.get_container(container_name)
            container.reload()  # Refresh container state

            return {
                "id": container.id,
                "name": container.name,
                "status": container.status,
                "state": container.attrs["State"]["Status"],
                "running": container.status == "running",
                "restarting": container.attrs["State"].get("Restarting", False),
                "paused": container.attrs["State"].get("Paused", False),
                "image": container.image.tags[0] if container.image.tags else "",
                "created": container.attrs["Created"],
                "started_at": container.attrs["State"].get("StartedAt", ""),
                "finished_at": container.attrs["State"].get("FinishedAt", ""),
                "exit_code": container.attrs["State"].get("ExitCode"),
            }
        except NotFound:
            raise
        except DockerException as e:
            logger.error(f"Failed to get container status for '{container_name}': {e}")
            raise

    def start_container(self, container_name: str) -> dict:
        """Start a container.

        Args:
            container_name: Container name or ID.

        Returns:
            Dictionary with action result.

        Raises:
            NotFound: If container not found.
        """
        try:
            container = self.get_container(container_name)
            container.start()
            logger.info(f"Started container '{container_name}'")
            return {"name": container_name, "action": "start", "result": "ok"}
        except NotFound:
            raise
        except DockerException as e:
            logger.error(f"Failed to start container '{container_name}': {e}")
            raise

    def stop_container(self, container_name: str, timeout: int = 10) -> dict:
        """Stop a container.

        Args:
            container_name: Container name or ID.
            timeout: Timeout in seconds before force killing.

        Returns:
            Dictionary with action result.

        Raises:
            NotFound: If container not found.
        """
        try:
            container = self.get_container(container_name)
            container.stop(timeout=timeout)
            logger.info(f"Stopped container '{container_name}'")
            return {"name": container_name, "action": "stop", "result": "ok"}
        except NotFound:
            raise
        except DockerException as e:
            logger.error(f"Failed to stop container '{container_name}': {e}")
            raise

    def restart_container(self, container_name: str, timeout: int = 10) -> dict:
        """Restart a container.

        Args:
            container_name: Container name or ID.
            timeout: Timeout in seconds before force killing.

        Returns:
            Dictionary with action result.

        Raises:
            NotFound: If container not found.
        """
        try:
            container = self.get_container(container_name)
            container.restart(timeout=timeout)
            logger.info(f"Restarted container '{container_name}'")
            return {"name": container_name, "action": "restart", "result": "ok"}
        except NotFound:
            raise
        except DockerException as e:
            logger.error(f"Failed to restart container '{container_name}': {e}")
            raise

    def get_container_logs(
        self, container_name: str, tail: int = 100, follow: bool = False
    ) -> str:
        """Get container logs.

        Args:
            container_name: Container name or ID.
            tail: Number of lines to return from the end.
            follow: If True, follow log output (streaming).

        Returns:
            Container logs as string.

        Raises:
            NotFound: If container not found.
        """
        try:
            container = self.get_container(container_name)
            logs = container.logs(tail=tail, follow=follow, timestamps=True)
            return logs.decode("utf-8") if isinstance(logs, bytes) else logs
        except NotFound:
            raise
        except DockerException as e:
            logger.error(f"Failed to get logs for container '{container_name}': {e}")
            raise

    def close(self) -> None:
        """Close the Docker client connection."""
        if hasattr(self, "client"):
            self.client.close()

