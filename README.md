## System Manager

Central control plane for ROS2-based robot containers that use s6-overlay agents, exposed via a FastAPI REST API.

### Overview

The `system_manager` runs as a standalone container or local process and exposes a unified HTTP API for:

- **Container/service management via s6-overlay agents**
- **Docker container inspection and control**

Each managed robot container (for example, `ai_worker`) runs an s6 agent that exposes an HTTP API over a Unix Domain Socket. The `system_manager` talks to these agents over UDS and provides a single REST surface for external tools and UIs.

### Architecture

```text
┌─────────────────────────────────────────────────────────┐
│  system_manager container                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │  FastAPI REST API (port 8081)                     │  │
│  │  - /containers                                    │  │
│  │  - /containers/{container}/services               │  │
│  │  - /containers/{container}/services/{svc}/status  │  │
│  │  - /containers/{container}/services/{svc}         │  │
│  │  - /docker/...                                    │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                              │
│                          │ (httpx over Unix sockets)    │
│                          ▼                              │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Agent Client Pool                                │  │
│  │  - /agents/ai_worker/s6_agent.sock                │  │
│  │  - /agents/<other>/s6_agent.sock                  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          │ (Docker volumes)
                          ▼
                ┌──────────────────────┐
                │   ai_worker          │
                │   (or other robot)   │
                │   container          │
                │                      │
                │  ┌───────────────┐   │
                │  │ s6-agent      │   │
                │  │ HTTP over UDS │   │
                │  └───────────────┘   │
                └──────────────────────┘
```

## Running the System Manager

### Option 1: Run with Docker Compose (recommended)

From `/home/dev8/Desktop/ai_worker/system_manager`:

1. **Ensure agent sockets exist**
   - Start the `ai_worker` stack so that `/var/run/agent/s6_agent.sock` is created and bind-mounted to `../docker/agent_sockets/ai_worker/s6_agent.sock`.

2. **Start the system_manager container**

   ```bash
   docker compose up -d
   ```

   This will:

   - Build the `system_manager` image using `Dockerfile`
   - Mount agent sockets from `../docker/agent_sockets/ai_worker` to `/agents/ai_worker`
   - Mount `config.yml` into the container as `/app/config.yml`
   - Mount the host `system_manager` package directory into `/app/system_manager` for live code updates
   - Mount `/var/run/docker.sock` for Docker API access
   - Start the FastAPI app on port **8081** (via `uvicorn system_manager.api:app`)

3. **View logs**

   ```bash
   docker compose logs -f
   ```

### Option 2: Run locally (without Docker)

1. **Create and activate a virtualenv** (optional but recommended)

2. **Install dependencies**

   ```bash
   pip install -r requirements.txt
   ```

3. **Configure containers in `config.yml` (or another file)**
   - By default, `system_manager` reads the path from the `CONFIG_FILE` env var, or falls back to `config.yml` in the current directory.

4. **Ensure agent sockets are reachable**
   - The `socket_path` in `config.yml` must point to the Unix socket exposed by each agent (see configuration section below).

5. **Run the API server**

   ```bash
   uvicorn system_manager.api:app --host 0.0.0.0 --port 8081
   ```

## Configuration

The `system_manager` reads a YAML configuration into the `SystemConfig` model (`system_manager.models.SystemConfig`). The default config file is `config.yml` in the working directory, overridable via the `CONFIG_FILE` environment variable.

### Example `config.yml`

```yaml
containers:
  ai_worker:
    socket_path: "/agents/ai_worker/s6_agent.sock"
    services:
      - id: "ffw_bg2_follower_ai"
        label: "FFW BG2 Follower AI"
      - id: "s6-agent"
        label: "s6-agent"
```

- **`containers`**: map of container name → config.
- **`socket_path`**: path inside the `system_manager` process/container to the agent’s Unix Domain Socket (UDS).
- **`services`**: optional list of metadata objects used only for **labels**:
  - `id`: the s6 service name (must match the agent’s notion of the service ID)
  - `label`: human-friendly display name

Actual service discovery comes **from the agent**, not from this list. Missing services in the list will still show up; they just fall back to using the service ID as the label.

## API Surface

The FastAPI app is defined in `system_manager/api.py` and exposes endpoints grouped into three main areas: **root**, **containers/services**, and **docker**.

### Root

- **`GET /`**
  Basic metadata about the API (version, docs URLs).

### Containers & Services (s6-overlay agents)

- **`GET /containers`**
  Returns all configured containers and their agent socket paths.

- **`GET /containers/{container}/services`**
  - Queries the agent for the list of s6 services.
  - Wraps them with labels (if present in `config.yml`).

- **`GET /containers/{container}/services/{service}/status`**
  - Proxies the agent’s `/services/{name}/status` endpoint.
  - Response includes:
    - `container`, `service`, `service_label`
    - Raw `s6-svstat` output
    - `is_up`, `pid`, `uptime_seconds`

- **`POST /containers/{container}/services/{service}`**
  - Body: `{"action": "up" | "down" | "restart"}`
  - Forwards the action to the agent’s `/services/{name}` control endpoint.

### Docker Container Management

These endpoints are optional and only work if `/var/run/docker.sock` is reachable. If Docker is not available, responses will return HTTP 503.

- **`GET /docker/containers?all={bool}`**
  List Docker containers (running only by default, or all with `all=true`).

- **`GET /docker/containers/{name}/status`**
  Detailed status for a single container (state, timestamps, exit code, etc.).

- **`POST /docker/containers/{name}`**
  - Body: `{"action": "start" | "stop" | "restart", "timeout": 10}`
  - Controls a Docker container with an optional timeout.

- **`GET /docker/containers/{name}/logs?tail=100`**
  Tail logs from a Docker container.

## Interactive API Documentation

The FastAPI app includes auto-generated interactive docs:

- **Swagger UI**: `http://localhost:8081/docs`
- **ReDoc**: `http://localhost:8081/redoc`
- **OpenAPI schema**: `http://localhost:8081/openapi.json`

You can use these for:

- Browsing all endpoints and their schemas
- Testing requests directly in the browser
- Exporting the OpenAPI spec to tools like Postman, Insomnia, or code generators

## Docker Integration Details

- `docker-compose.yml` (in this directory) defines the `system_manager` service:
  - `network_mode: host` to simplify connection to other host services.
  - Mounts:
    - `../docker/agent_sockets/ai_worker` → `/agents/ai_worker` (UDS for s6 agent)
    - `./config.yml` → `/app/config.yml`
    - `./system_manager` → `/app/system_manager` (code)
    - `/var/run/docker.sock` → `/var/run/docker.sock`
  - Env:
    - `CONFIG_FILE=/app/config.yml`

If the Docker socket is missing or inaccessible, the app still starts; Docker endpoints will respond with **503** and an explanatory message.

## Development Notes

- **Dependencies** are pinned in `requirements.txt` and match the versions from the current container image:
  - `fastapi`, `uvicorn[standard]`, `httpx`, `pydantic`, `pyyaml`, `docker`, `requests`, `requests-unixsocket`.
- When running via Docker, changes in the local `system_manager` package are reflected in the container (due to the bind mount) without rebuilding the image, which is useful for rapid development.
