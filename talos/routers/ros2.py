"""ROS2 endpoints router."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from talos.state import get_config, get_ros2_plugin
from talos.models import (
    ROS2TopicDataResponse,
    ROS2TopicsListResponse,
    ROS2TopicStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/containers/{container}/ros2", tags=["ros2"])


@router.get("/topics", response_model=ROS2TopicsListResponse)
async def list_ros2_topics(
    container: str,
    config=Depends(get_config),
) -> ROS2TopicsListResponse:
    """Get list of all configured ROS2 topics for a container."""
    if container not in config.containers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{container}' not found",
        )

    plugin = get_ros2_plugin(container)
    if plugin is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"ROS2 plugin for container '{container}' is not available. "
                   f"Check if ROS2 configuration exists in config.yml and zenoh connection.",
        )

    topics_status = plugin.get_all_topics_status()

    topics = [
        ROS2TopicStatus(
            topic=topic,
            msg_type=status_info["msg_type"],
            configured=status_info["configured"],
            available=status_info["available"],
            subscribed=status_info["subscribed"],
        )
        for topic, status_info in topics_status.items()
    ]

    return ROS2TopicsListResponse(
        container=container,
        domain_id=plugin.domain_id,
        topics=topics,
    )


@router.get("/topics/{topic:path}", response_model=ROS2TopicDataResponse)
async def get_ros2_topic_data(
    container: str,
    topic: str,
    config=Depends(get_config),
) -> ROS2TopicDataResponse:
    """Get the latest data from a specific ROS2 topic for a container."""
    if container not in config.containers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{container}' not found",
        )

    plugin = get_ros2_plugin(container)
    if plugin is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"ROS2 plugin for container '{container}' is not available. "
                   f"Check if ROS2 configuration exists in config.yml and zenoh connection.",
        )
    
    if topic not in plugin.list_topics():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Topic '{topic}' is not configured for container '{container}'",
        )
    
    cached_data = plugin.get_topic_data(topic)
    available = plugin.is_topic_available(topic)
    
    data = None
    if cached_data:
        data = cached_data.get("data")
    
    return ROS2TopicDataResponse(
        container=container,
        topic=topic,
        msg_type=plugin.topics[topic],
        data=data,
        available=available,
        domain_id=plugin.domain_id,
    )
