// TypeScript types matching the system_manager API Pydantic models

export interface ServiceInfo {
  id: string;
  label: string;
}

export interface ContainerInfo {
  name: string;
  socket_path: string;
}

export interface ContainerListResponse {
  containers: ContainerInfo[];
}

export interface ServiceListResponse {
  container: string;
  services: ServiceInfo[];
}

export interface ServiceStatusResponse {
  container: string;
  service: string;
  service_label: string | null;
  name: string;
  raw: string;
  is_up: boolean;
  pid: number | null;
  uptime_seconds: number | null;
}

export interface ServiceStatusListResponse {
  container: string;
  statuses: ServiceStatusResponse[];
}

export interface ServiceActionRequest {
  action: "up" | "down" | "restart";
}

export interface ServiceControlResponse {
  container: string;
  service: string;
  action: "up" | "down" | "restart";
  result: string;
}

export interface ServiceLogsResponse {
  container: string;
  service: string;
  logs: string;
  tail: number;
  log_path: string | null;
}

export interface ServiceLogsClearResponse {
  container: string;
  service: string;
  message: string;
  log_path: string | null;
}

export interface ServiceRunScriptResponse {
  container: string;
  service: string;
  path: string;
  content: string;
}

export interface DockerContainerInfo {
  id: string;
  name: string;
  status: string;
  image: string;
  created: string;
}

export interface DockerContainerListResponse {
  containers: DockerContainerInfo[];
}

export interface DockerContainerStatus {
  id: string;
  name: string;
  status: string;
  state: string;
  running: boolean;
  restarting: boolean;
  paused: boolean;
  image: string;
  created: string;
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
}

export interface DockerContainerActionRequest {
  action: "start" | "stop" | "restart";
  timeout?: number;
}

export interface DockerContainerActionResponse {
  name: string;
  action: "start" | "stop" | "restart";
  result: string;
}

export interface DockerContainerLogsResponse {
  container: string;
  logs: string;
  tail: number;
}

export interface ErrorResponse {
  error: string;
  detail: string | null;
}
