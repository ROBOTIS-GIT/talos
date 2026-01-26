"""ROS2 topic subscriber for a specific container.

This subscriber manages multiple ROS2 topic subscriptions for a single container.
Each topic is subscribed independently and cached for API access.
"""

import asyncio
import logging
import threading
import time
from typing import Any, Optional

from zenoh_ros2_sdk import ROS2Subscriber
from zenoh_ros2_sdk.qos import QosProfile, QosDurability

logger = logging.getLogger(__name__)

# Constants
STATUS_CHECK_INTERVAL = 10  # seconds - reduced frequency for status checks
DYNAMIC_TOPIC_STALE_TIME = 3.0  # seconds - time after which dynamic topic cache is considered stale and cleared


class ROS2TopicSubscriber:
    """ROS2 topic subscriber for a specific container.

    This class manages multiple ROS2 topic subscriptions for a single container.
    Each topic is subscribed independently and cached for API access.

    Attributes:
        container_name: Name of the container/robot
        topics: Dictionary mapping topic names to message types
        domain_id: ROS2 domain ID
        router_ip: Optional Zenoh router IP address
        router_port: Optional Zenoh router port
        subscribers: Dictionary of active ROS2Subscriber instances
        msg_cache: Dictionary of cached latest messages per topic
        lock: Thread lock for safe access to cached data
        is_running: Whether the plugin is currently running
    """

    def __init__(
        self,
        container_name: str,
        topics: dict[str, str],
        static_topics: Optional[dict[str, str]] = None,
        domain_id: int = 30,
        router_ip: Optional[str] = None,
        router_port: Optional[int] = None,
    ):
        """Initialize ROS2 plugin for a container.

        Args:
            container_name: Name of the container/robot
            topics: Dictionary mapping dynamic topic names to message types
                Example: {"/joint_states": "sensor_msgs/msg/JointState"}
            static_topics: Optional dictionary mapping static topic names to message types
                Example: {"/robot_description": "std_msgs/msg/String"}
            domain_id: ROS2 domain ID. Defaults to 30.
            router_ip: Optional Zenoh router IP address.
            router_port: Optional Zenoh router port.
        """
        self.container_name = container_name
        self.topics = topics  # Dynamic topics
        self.static_topics = static_topics or {}  # Static topics (e.g., robot_description)
        self.domain_id = domain_id
        self.router_ip = router_ip
        self.router_port = router_port

        self.subscribers: dict[str, ROS2Subscriber] = {}
        self.msg_cache: dict[str, Any] = {}
        self.lock = threading.Lock()
        self.is_running = False
        self._status_thread: Optional[threading.Thread] = None

        logger.info(
            f"[{container_name}] Initializing ROS2 plugin: "
            f"{len(topics)} dynamic topics, {len(self.static_topics)} static topics, domain_id={domain_id}"
        )

    # ============================================================================
    # Public Lifecycle Methods
    # ============================================================================

    def start(self) -> None:
        """Start subscribing to all configured topics (dynamic + static).

        Raises:
            RuntimeError: If plugin fails to start or no subscribers are created.
        """
        if self.is_running:
            logger.warning(
                f"[{self.container_name}] Plugin is already running"
            )
            return

        try:
            logger.info(
                f"[{self.container_name}] Starting ROS2 plugin: domain_id={self.domain_id}"
            )

            failed_topics = []
            # Subscribe to dynamic topics
            for topic, msg_type in self.topics.items():
                try:
                    self._create_subscriber(topic, msg_type)
                except Exception as e:
                    logger.error(
                        f"[{self.container_name}] Failed to subscribe to dynamic topic '{topic}': {e}"
                    )
                    failed_topics.append(topic)
                    # Continue with other topics even if one fails

            # Subscribe to static topics
            for topic, msg_type in self.static_topics.items():
                try:
                    self._create_subscriber(topic, msg_type)
                except Exception as e:
                    logger.error(
                        f"[{self.container_name}] Failed to subscribe to static topic '{topic}': {e}"
                    )
                    failed_topics.append(topic)
                    # Continue with other topics even if one fails

            if failed_topics:
                logger.warning(
                    f"[{self.container_name}] Failed to subscribe to {len(failed_topics)} topic(s): {failed_topics}"
                )

            # Only require at least one subscriber if there are any topics configured
            total_topics = len(self.topics) + len(self.static_topics)
            if not self.subscribers and total_topics > 0:
                raise RuntimeError(
                    f"Failed to create any subscribers for container '{self.container_name}'"
                )

            self.is_running = True
            logger.info(
                f"[{self.container_name}] Plugin started: "
                f"{len(self.subscribers)}/{total_topics} topics active "
                f"({len(self.topics)} dynamic, {len(self.static_topics)} static)"
            )

            # Start periodic status check thread
            self._status_thread = threading.Thread(
                target=self._periodic_status_check,
                daemon=True,
                name=f"{self.container_name}-status-check"
            )
            self._status_thread.start()
            logger.debug(f"[{self.container_name}] Started periodic status check thread")

        except Exception as e:
            logger.error(
                f"[{self.container_name}] Failed to start plugin: {e}",
                exc_info=True
            )
            self.is_running = False
            self._cleanup_subscribers()
            raise

    def stop(self) -> None:
        """Stop all subscriptions and clean up resources."""
        if not self.is_running:
            return

        logger.info(f"[{self.container_name}] Stopping plugin...")

        try:
            self.is_running = False

            # Wait for status thread to finish (with timeout)
            if self._status_thread and self._status_thread.is_alive():
                self._status_thread.join(timeout=2.0)
                if self._status_thread.is_alive():
                    logger.warning(
                        f"[{self.container_name}] Status check thread did not stop in time"
                    )

            self._cleanup_subscribers()

            with self.lock:
                self.msg_cache.clear()

            logger.info(f"[{self.container_name}] Plugin stopped")

        except Exception as e:
            logger.error(
                f"[{self.container_name}] Error stopping plugin: {e}",
                exc_info=True
            )

    # ============================================================================
    # Public API Methods
    # ============================================================================

    def get_topic_data(self, topic: str) -> Optional[dict[str, Any]]:
        """Get the latest cached data for a specific topic.

        For dynamic topics, checks if the data is stale and clears it if so.
        Static topics are never considered stale.

        Args:
            topic: Topic name.

        Returns:
            Cached data dictionary with 'data' and 'received_at' keys,
            or None if no message has been received yet or if data is stale.
        """
        with self.lock:
            cached = self.msg_cache.get(topic)
            if cached is None:
                return None

            # Check if topic is stale (only for dynamic topics)
            is_dynamic_topic = topic in self.topics
            if is_dynamic_topic:
                received_at = cached.get("received_at")
                if received_at is not None:
                    current_time = time.time()
                    age = current_time - received_at
                    if age > DYNAMIC_TOPIC_STALE_TIME:
                        # Data is stale, clear it
                        del self.msg_cache[topic]
                        logger.debug(
                            f"[{self.container_name}] Cleared stale cache for dynamic topic '{topic}' "
                            f"(age: {age:.1f}s > {DYNAMIC_TOPIC_STALE_TIME}s)"
                        )
                        return None

            # Convert raw_message to dict for JSON serialization
            raw_message = cached.get("raw_message")
            if raw_message is not None:
                # Convert entire message to dict (no extraction, send as-is)
                data = self._convert_message_to_dict(raw_message)
                return {
                    "data": data,
                    "received_at": cached.get("received_at"),
                }
            return None

    def list_topics(self) -> list[str]:
        """Get list of configured topics (both dynamic and static).

        Returns:
            List of topic names that are configured for this plugin.
        """
        all_topics = list(self.topics.keys()) + list(self.static_topics.keys())
        return all_topics

    def is_topic_available(self, topic: str) -> bool:
        """Check if a topic is configured and has cached data.

        For dynamic topics, also checks if the data is stale.

        Args:
            topic: Topic name.

        Returns:
            True if topic is configured and has non-stale cached data, False otherwise.
        """
        with self.lock:
            # Check if topic is configured (dynamic or static)
            if topic not in self.topics and topic not in self.static_topics:
                return False

            if topic not in self.msg_cache:
                return False

            cached = self.msg_cache.get(topic)
            if cached is None:
                return False

            # Check if dynamic topic is stale
            is_dynamic_topic = topic in self.topics
            if is_dynamic_topic:
                received_at = cached.get("received_at")
                if received_at is not None:
                    current_time = time.time()
                    age = current_time - received_at
                    if age > DYNAMIC_TOPIC_STALE_TIME:
                        # Data is stale, clear it
                        del self.msg_cache[topic]
                        return False

            return True

    def clear_topic_cache(self, topic: str) -> None:
        """Clear cached data for a specific topic.

        Args:
            topic: Topic name to clear from cache.
        """
        with self.lock:
            if topic in self.msg_cache:
                del self.msg_cache[topic]
                logger.info(
                    f"[{self.container_name}] Cleared cache for topic '{topic}'"
                )

    def clear_all_cache(self) -> None:
        """Clear all cached topic data."""
        with self.lock:
            cleared_count = len(self.msg_cache)
            self.msg_cache.clear()
            if cleared_count > 0:
                logger.info(
                    f"[{self.container_name}] Cleared cache for {cleared_count} topic(s)"
                )

    def get_all_topics_status(self) -> dict[str, dict[str, Any]]:
        """Get status for all configured topics (both dynamic and static).

        Returns:
            Dictionary mapping topic names to their status information.
            Each status dict contains:
            - configured: bool - whether topic is configured
            - available: bool - whether topic has cached data
            - msg_type: str - message type
            - subscribed: bool - whether subscriber is active
            - received_at: float - timestamp of last message (if available)
            - seconds_since_last_message: float - seconds since last message (if available)
        """
        current_time = time.time()
        with self.lock:
            status = {}
            # Process dynamic topics
            for topic in self.topics.keys():
                cached = self.msg_cache.get(topic)
                available = False
                received_at = None
                seconds_since_last_message = None

                if cached is not None:
                    received_at = cached.get("received_at")
                    if received_at is not None and received_at > 0:
                        seconds_since_received = current_time - received_at
                        # Check if data is stale
                        if seconds_since_received <= DYNAMIC_TOPIC_STALE_TIME:
                            available = True
                            seconds_since_last_message = seconds_since_received
                        else:
                            # Data is stale, clear it
                            del self.msg_cache[topic]
                            available = False
                    else:
                        # Old cache entry without timestamp (backward compatibility)
                        available = True

                status[topic] = {
                    "configured": True,
                    "available": available,
                    "msg_type": self.topics[topic],
                    "subscribed": topic in self.subscribers,
                    "received_at": received_at,
                    "seconds_since_last_message": seconds_since_last_message,
                }
            
            # Process static topics
            for topic in self.static_topics.keys():
                cached = self.msg_cache.get(topic)
                available = False
                received_at = None
                seconds_since_last_message = None

                if cached is not None:
                    received_at = cached.get("received_at")
                    if received_at is not None and received_at > 0:
                        seconds_since_received = current_time - received_at
                        available = True
                        seconds_since_last_message = seconds_since_received
                    else:
                        # Old cache entry without timestamp (backward compatibility)
                        available = True

                status[topic] = {
                    "configured": True,
                    "available": available,
                    "msg_type": self.static_topics[topic],
                    "subscribed": topic in self.subscribers,
                    "received_at": received_at,
                    "seconds_since_last_message": seconds_since_last_message,
                }
            return status

    # ============================================================================
    # Private Helper Methods
    # ============================================================================

    def _convert_message_to_dict(self, msg: Any) -> Any:
        """Convert ROS2 message object to dictionary for JSON serialization.

        Converts the entire message including all fields (data, header, etc.)
        to preserve all information like timestamps.

        Args:
            msg: ROS2 message object.

        Returns:
            Dictionary representation of the entire message.
        """
        if msg is None:
            return None

        try:
            if hasattr(msg, '__dict__'):
                result = {}
                for key, value in msg.__dict__.items():
                    # Skip private attributes
                    if key.startswith('_'):
                        continue
                    # Recursively convert nested objects (including ndarray)
                    # Check for ndarray first, then other nested types
                    if hasattr(value, 'tolist') and hasattr(value, 'shape'):
                        # numpy ndarray
                        try:
                            result[key] = value.tolist()
                        except Exception:
                            result[key] = str(value)
                    elif hasattr(value, '__dict__') or isinstance(value, (list, tuple)):
                        result[key] = self._convert_nested_obj_to_dict(value)
                    else:
                        result[key] = value
                return result
            else:
                return str(msg)
        except Exception as e:
            logger.warning(f"Failed to convert message to dict: {e}, using str()")
            return str(msg)

    def _convert_nested_obj_to_dict(self, obj: Any) -> Any:
        """Recursively convert nested objects to dictionaries.

        Args:
            obj: Object to convert.

        Returns:
            Dictionary or primitive value.
        """
        if obj is None:
            return None
        if isinstance(obj, (str, int, float, bool)):
            return obj

        # Handle numpy ndarray (common in ROS2 messages like joint_states, odom)
        # Check for ndarray by checking for tolist method and shape attribute
        if hasattr(obj, 'tolist') and hasattr(obj, 'shape'):
            try:
                return obj.tolist()  # Convert ndarray to list
            except Exception:
                return str(obj)

        if isinstance(obj, (list, tuple)):
            return [self._convert_nested_obj_to_dict(item) for item in obj]
        if hasattr(obj, '__dict__'):
            result = {}
            for key, value in obj.__dict__.items():
                if key.startswith('_'):
                    continue
                result[key] = self._convert_nested_obj_to_dict(value)
            return result
        return str(obj)

    def _create_subscriber(self, topic: str, msg_type: str) -> None:
        """Create and start a subscriber for a specific topic.

        Args:
            topic: Topic name.
            msg_type: Message type string.

        Raises:
            Exception: If subscriber creation fails.
        """
        try:
            # Create callback function that captures the topic name
            def msg_callback(msg: Any):
                """Handle incoming ROS2 message for this topic.

                Args:
                    msg: ROS2 message object.
                """
                try:
                    # Use current time as received_at (stale check)
                    received_at = time.time()

                    with self.lock:
                        # Store only raw_message to save memory
                        self.msg_cache[topic] = {
                            "raw_message": msg,
                            "received_at": received_at,
                        }

                except Exception as e:
                    logger.error(
                        f"[{self.container_name}] Error processing message for '{topic}': {e}",
                        exc_info=True
                    )

            # Build subscriber kwargs
            # Note: ROS2Subscriber defaults to router_ip=127.0.0.1, router_port=7447
            subscriber_kwargs = {
                "topic": topic,
                "msg_type": msg_type,
                "callback": msg_callback,
                "domain_id": self.domain_id,
            }

            # Only set router_ip/router_port if explicitly configured
            if self.router_ip is not None:
                subscriber_kwargs["router_ip"] = self.router_ip
                logger.debug(f"[{self.container_name}] Using router IP: {self.router_ip}")

            if self.router_port is not None:
                subscriber_kwargs["router_port"] = self.router_port
                logger.debug(f"[{self.container_name}] Using router port: {self.router_port}")

            # Apply TRANSIENT_LOCAL QoS for static topics (typically robot_description)
            if topic in self.static_topics:
                subscriber_kwargs["qos"] = QosProfile(
                    durability=QosDurability.TRANSIENT_LOCAL,
                    history_depth=1,
                )

            logger.info(
                f"[{self.container_name}] Creating subscriber for '{topic}' "
                f"(type: {msg_type}, domain_id: {self.domain_id})"
            )

            try:
                subscriber = ROS2Subscriber(**subscriber_kwargs)
                self.subscribers[topic] = subscriber

                logger.info(
                    f"[{self.container_name}] Successfully subscribed to '{topic}'"
                )
            except Exception as sub_error:
                # Error is already logged by start() method, just raise
                raise

        except Exception as e:
            # Error will be handled by start() method which calls this function
            # Just raise it without logging again to avoid duplicate logs
            raise

    def _cleanup_subscribers(self) -> None:
        """Clean up all subscribers."""
        for topic, subscriber in list(self.subscribers.items()):
            try:
                subscriber.close()
                logger.debug(f"[{self.container_name}] Closed subscriber for '{topic}'")
            except Exception as e:
                logger.warning(
                    f"[{self.container_name}] Error closing subscriber for '{topic}': {e}"
                )
        self.subscribers.clear()


    def _periodic_status_check(self) -> None:
        """Periodically log subscription status, cache state, and clear stale dynamic topics."""
        check_count = 0
        while self.is_running:
            time.sleep(STATUS_CHECK_INTERVAL)
            if not self.is_running:
                break

            check_count += 1
            current_time = time.time()
            
            with self.lock:
                # Clear stale dynamic topics
                stale_topics = []
                for topic_name in list(self.msg_cache.keys()):
                    # Only check dynamic topics for staleness
                    if topic_name in self.topics:
                        cached = self.msg_cache.get(topic_name)
                        if cached is not None:
                            received_at = cached.get("received_at")
                            if received_at is not None:
                                age = current_time - received_at
                                if age > DYNAMIC_TOPIC_STALE_TIME:
                                    del self.msg_cache[topic_name]
                                    stale_topics.append(topic_name)
                                    logger.debug(
                                        f"[{self.container_name}] Cleared stale cache for dynamic topic '{topic_name}' "
                                        f"(age: {age:.1f}s > {DYNAMIC_TOPIC_STALE_TIME}s)"
                                    )

                # Only log warnings for dynamic topics without data (not stale, just missing)
                for topic_name in self.topics.keys():
                    if topic_name not in self.msg_cache:
                        logger.warning(
                            f"[{self.container_name}] Dynamic topic '{topic_name}' has no cached data "
                            f"(no messages received in {check_count * STATUS_CHECK_INTERVAL} seconds)"
                        )

                # Debug-level summary (only if DEBUG logging is enabled)
                if logger.isEnabledFor(logging.DEBUG):
                    total_topics = len(self.topics) + len(self.static_topics)
                    logger.debug(
                        f"[{self.container_name}] Status check #{check_count}: "
                        f"subscribers={len(self.subscribers)}, "
                        f"cached_topics={len(self.msg_cache)}/{total_topics}, "
                        f"stale_cleared={len(stale_topics)}"
                    )
