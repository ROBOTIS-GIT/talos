"""HTTP client for communicating with agents via Unix Domain Sockets."""

import logging
from typing import TYPE_CHECKING, Optional
from urllib.parse import quote

import requests
import requests_unixsocket

if TYPE_CHECKING:
    from system_manager.models import SystemConfig

logger = logging.getLogger(__name__)


class AgentClient:
    """HTTP client for agent communication over Unix Domain Socket.

    This client uses requests-unixsocket to communicate with agents
    running inside containers via Unix Domain Sockets.
    """

    def __init__(self, socket_path: str, timeout: float = 5.0):
        """Initialize agent client.

        Args:
            socket_path: Path to Unix domain socket for the agent.
            timeout: Request timeout in seconds.
        """
        self.socket_path = socket_path
        self.timeout = timeout
        self._base_url: Optional[str] = None
        self._session: Optional[requests_unixsocket.Session] = None

    def _get_base_url(self) -> str:
        """Get base URL for Unix Domain Socket.

        requests-unixsocket uses 'http+unix://' scheme where the socket path
        is URL-encoded in the host part of the URL.

        Returns:
            Base URL string for UDS communication.
        """
        if self._base_url is None:
            # URL-encode the socket path (e.g., /path/to/sock -> %2Fpath%2Fto%2Fsock)
            encoded_path = quote(self.socket_path, safe="")
            self._base_url = f"http+unix://{encoded_path}"
        return self._base_url

    def _get_session(self) -> requests_unixsocket.Session:
        """Get or create requests session.

        Returns:
            requests_unixsocket.Session configured for Unix domain socket communication.
        """
        if self._session is None:
            self._session = requests_unixsocket.Session()
            self._session.timeout = self.timeout
        return self._session

    def close(self) -> None:
        """Close the HTTP session."""
        if self._session is not None:
            self._session.close()
            self._session = None

    def get_services(self) -> dict:
        """Get list of services from agent.

        Returns:
            Response JSON from agent's /services endpoint.

        Raises:
            requests.RequestException: If request fails (socket missing, agent down, etc.)
        """
        session = self._get_session()
        base_url = self._get_base_url()
        logger.debug(f"Requesting services from agent at {self.socket_path}")
        try:
            response = session.get(f"{base_url}/services")
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Failed to communicate with agent at {self.socket_path}: {e}")
            raise
        except Exception as e:
            logger.error(f"Agent returned error: {e}")
            raise

    def get_service_status(self, service_name: str) -> dict:
        """Get status of a specific service from agent.

        Args:
            service_name: Name of the service.

        Returns:
            Response JSON from agent's /services/{name}/status endpoint.

        Raises:
            requests.RequestException: If request fails.
            requests.HTTPError: If agent returns error status (e.g., 404).
        """
        session = self._get_session()
        base_url = self._get_base_url()
        logger.debug(f"Requesting status for service '{service_name}' from agent at {self.socket_path}")
        try:
            response = session.get(f"{base_url}/services/{service_name}/status")
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Failed to communicate with agent at {self.socket_path}: {e}")
            raise
        except Exception as e:
            logger.error(f"Agent returned error status for service '{service_name}': {e}")
            raise

    def get_all_services_status(self) -> dict:
        """Get status of all services from agent in a single request.

        This is more efficient than calling get_service_status() for each service.

        Returns:
            Response JSON from agent's /services/status endpoint.

        Raises:
            requests.RequestException: If request fails.
            requests.HTTPError: If agent returns error status.
        """
        session = self._get_session()
        base_url = self._get_base_url()
        logger.debug(f"Requesting status for all services from agent at {self.socket_path}")
        try:
            response = session.get(f"{base_url}/services/status")
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Failed to communicate with agent at {self.socket_path}: {e}")
            raise
        except Exception as e:
            logger.error(f"Agent returned error status for all services: {e}")
            raise

    def control_service(self, service_name: str, action: str) -> dict:
        """Control a service (up/down/restart) via agent.

        Args:
            service_name: Name of the service.
            action: Action to perform ('up', 'down', or 'restart').

        Returns:
            Response JSON from agent's /services/{name} endpoint.

        Raises:
            requests.RequestException: If request fails.
            requests.HTTPError: If agent returns error status.
        """
        session = self._get_session()
        base_url = self._get_base_url()
        logger.debug(f"Sending action '{action}' to service '{service_name}' via agent at {self.socket_path}")
        try:
            response = session.post(
                f"{base_url}/services/{service_name}",
                json={"action": action},
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Failed to communicate with agent at {self.socket_path}: {e}")
            raise
        except Exception as e:
            logger.error(f"Agent returned error status for service '{service_name}': {e}")
            raise

    def get_service_logs(self, service_name: str, tail: int = 100) -> dict:
        """Get logs for a service from agent.

        Args:
            service_name: Name of the service.
            tail: Number of log lines to return from the end. Defaults to 100.

        Returns:
            Response JSON from agent's /services/{name}/logs endpoint.

        Raises:
            requests.RequestException: If request fails.
            requests.HTTPError: If agent returns error status (e.g., 404).
        """
        session = self._get_session()
        base_url = self._get_base_url()
        logger.debug(f"Requesting logs for service '{service_name}' from agent at {self.socket_path}")
        try:
            response = session.get(
                f"{base_url}/services/{service_name}/logs",
                params={"tail": tail} if tail else None,
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Failed to communicate with agent at {self.socket_path}: {e}")
            raise
        except Exception as e:
            logger.error(f"Agent returned error status for service '{service_name}': {e}")
            raise

    def get_service_run_script(self, service_name: str) -> dict:
        """Get run script for a service from agent.

        Args:
            service_name: Name of the service.

        Returns:
            Response JSON from agent's /services/{name}/run endpoint.

        Raises:
            requests.RequestException: If request fails.
            requests.HTTPError: If agent returns error status (e.g., 404).
        """
        session = self._get_session()
        base_url = self._get_base_url()
        logger.debug(f"Requesting run script for service '{service_name}' from agent at {self.socket_path}")
        try:
            response = session.get(f"{base_url}/services/{service_name}/run")
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Failed to communicate with agent at {self.socket_path}: {e}")
            raise
        except Exception as e:
            logger.error(f"Agent returned error status for service '{service_name}': {e}")
            raise

    def update_service_run_script(self, service_name: str, content: str) -> dict:
        """Update run script for a service via agent.

        Args:
            service_name: Name of the service.
            content: New content for the run script.

        Returns:
            Response JSON from agent's PUT /services/{name}/run endpoint.

        Raises:
            requests.RequestException: If request fails.
            requests.HTTPError: If agent returns error status.
        """
        session = self._get_session()
        base_url = self._get_base_url()
        logger.debug(f"Updating run script for service '{service_name}' via agent at {self.socket_path}")
        try:
            response = session.put(
                f"{base_url}/services/{service_name}/run",
                json={"content": content},
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Failed to communicate with agent at {self.socket_path}: {e}")
            raise
        except Exception as e:
            logger.error(f"Agent returned error status for service '{service_name}': {e}")
            raise


class AgentClientPool:
    """Pool of agent clients, one per container.

    Manages lifecycle of agent clients and provides easy access by container name.
    """

    def __init__(self, config: "SystemConfig") -> None:
        """Initialize client pool from configuration.

        Args:
            config: SystemConfig object containing container configurations.
        """
        self._clients: dict[str, AgentClient] = {}
        for container_name, container_config in config.containers.items():
            self._clients[container_name] = AgentClient(container_config.socket_path)

    def get_client(self, container_name: str) -> Optional[AgentClient]:
        """Get agent client for a container.

        Args:
            container_name: Name of the container.

        Returns:
            AgentClient instance, or None if container not found.
        """
        return self._clients.get(container_name)

    def close_all(self) -> None:
        """Close all agent clients."""
        for client in self._clients.values():
            client.close()
        self._clients.clear()

