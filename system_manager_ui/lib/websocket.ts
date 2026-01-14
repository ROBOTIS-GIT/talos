/**
 * WebSocket utilities for real-time log streaming
 */

export type WebSocketMessage = {
  type: "logs" | "error";
  data: string;
};

export type WebSocketStatus = "connecting" | "connected" | "disconnected" | "error";

export interface UseWebSocketOptions {
  onMessage?: (data: string) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
  reconnect?: boolean;
  reconnectInterval?: number;
}

/**
 * Get WebSocket URL base
 */
const getWebSocketBaseUrl = (): string => {
  // Check for environment variable
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  
  if (envUrl) {
    // Convert HTTP URL to WebSocket URL
    return envUrl.replace(/^http/, "ws");
  }
  
  // Use the hostname where the frontend is hosted
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.hostname}:8081`;
  }
  
  // Fallback for server-side rendering
  return "ws://localhost:8081";
};

/**
 * Create WebSocket connection for service logs
 */
export function createLogsWebSocket(
  container: string,
  service: string,
  options: UseWebSocketOptions = {}
): WebSocket {
  const baseUrl = getWebSocketBaseUrl();
  const wsUrl = `${baseUrl}/ws/containers/${container}/services/${service}/logs`;
  
  const ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log(`WebSocket connected: ${wsUrl}`);
    options.onOpen?.();
  };
  
  ws.onmessage = (event) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      if (message.type === "logs") {
        options.onMessage?.(message.data);
      } else if (message.type === "error") {
        options.onError?.(new Error(message.data));
      }
    } catch (error) {
      console.error("Failed to parse WebSocket message:", error);
      options.onError?.(error instanceof Error ? error : new Error("Unknown error"));
    }
  };
  
  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    options.onError?.(new Error("WebSocket connection error"));
  };
  
  ws.onclose = () => {
    console.log(`WebSocket disconnected: ${wsUrl}`);
    options.onClose?.();
  };
  
  return ws;
}

