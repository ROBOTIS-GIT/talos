"""Lifespan management for FastAPI app."""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from talos.agent_client import AgentClientPool
from talos.config import load_config
from talos.docker_client import DockerClient
from talos.state import (
    set_config,
    set_client_pool,
    set_docker_client,
    set_ros2_plugin,
    get_client_pool,
    get_docker_client,
    get_ros2_plugins,
    clear_ros2_plugins,
)
from talos.plugins.ros2_topic_subscriber import ROS2TopicSubscriber

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for FastAPI app.

    Loads configuration and initializes agent client pool and Docker client on startup.
    Cleans up on shutdown.
    """
    # Startup
    logger.info("Starting talos...")
    try:
        config = load_config()
        set_config(config)

        client_pool = AgentClientPool(config)
        set_client_pool(client_pool)

        # Initialize Docker client (optional - may fail if socket not available)
        try:
            docker_client = DockerClient()
            logger.info("Docker client initialized successfully")
            set_docker_client(docker_client)
        except Exception as e:
            logger.warning(f"Docker client initialization failed (Docker operations will be unavailable): {e}")
            set_docker_client(None)

        # Initialize ROS2 plugins for containers with ROS2 configuration
        for container_name, container_config in config.containers.items():
            if container_config.ros2:
                try:
                    ros2_config = container_config.ros2

                    # Get domain_id from environment variable or use config
                    domain_id = int(os.getenv("ROS_DOMAIN_ID", str(ros2_config.domain_id)))

                    # Get router settings from environment or config
                    router_ip = os.getenv("ZENOH_ROUTER_IP") or ros2_config.router_ip
                    router_port_str = os.getenv("ZENOH_ROUTER_PORT")
                    router_port = int(router_port_str) if router_port_str else ros2_config.router_port

                    plugin = ROS2TopicSubscriber(
                        container_name=container_name,
                        topics=ros2_config.topics,
                        static_topics=ros2_config.static_topics,
                        domain_id=domain_id,
                        router_ip=router_ip,
                        router_port=router_port,
                    )
                    plugin.start()
                    set_ros2_plugin(container_name, plugin)
                    logger.info(
                        f"ROS2 plugin initialized for container '{container_name}' "
                    )
                except Exception as e:
                    logger.warning(
                        f"ROS2 plugin initialization failed for container '{container_name}' "
                    )
                    # Continue with other containers even if one fails

        logger.info("Talos initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize talos: {e}")
        raise

    yield

    # Shutdown
    logger.info("Shutting down talos...")
    client_pool = get_client_pool()
    if client_pool:
        await client_pool.close_all()

    docker_client = get_docker_client()
    if docker_client:
        docker_client.close()

    # Stop all ROS2 plugins
    plugins = get_ros2_plugins()
    for container_name, plugin in plugins.items():
        try:
            plugin.stop()
            logger.debug(f"Stopped ROS2 plugin for container '{container_name}'")
        except Exception as e:
            logger.error(f"Error stopping ROS2 plugin for container '{container_name}': {e}")
    clear_ros2_plugins()

    logger.info("Talos shut down")

