# Talos

Central control server for ROS2-based robot containers. It integrates with s6-overlay agents and exposes a FastAPI REST API, WebSocket, and web UI.

## Overview

Talos provides the following through a single API:

- **Container/service control**: List, status, and start/stop/restart services via s6-overlay agents
- **Docker control**: List containers, status, start/stop, and logs
- **ROS2**: Zenoh-based topic subscription and real-time data streaming
- **Real-time logs**: Service log streaming over WebSocket

Each robot container exposes an s6 agent over a Unix Domain Socket; Talos controls them through these sockets.

## Architecture
```text
┌─────────────────────────────────────────────────────────┐
│  talos container                                        │
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

## Repository structure

```
talos/
├── talos/              # Backend (FastAPI)
│   ├── api.py
│   ├── routers/        # root, containers, services, docker, ros2, websocket
│   ├── agent_client.py
│   └── ...
├── talos_ui/           # Web UI (Next.js)
├── talos_cli/          # CLI package (pip install → talos up / talos down)
├── config.yml          # Default config (containers, sockets, ROS2 topics, etc.)
├── docker-compose.yml  # Production (talos + ui + zenoh)
├── docker-compose-dev.yml  # Development (hot reload)
├── requirements.txt
└── README.md
```

## Running Talos

Install Talos CLI:
```bash
pip install talos-cli
```

Run Talos:
```bash
talos up
```

- Uses the bundled `config/config.yml` by default.
- Use `talos up -c /path/to/config.yml` to specify a config file.
- Use `talos down` to stop the stack.

See [talos_cli/README.md](talos_cli/README.md) for more options.

- **containers**: Map of container name → config.
- **socket_path**: Path to the agent UDS as seen by the Talos process (or container).
- **services**: Optional. Agents provide the service list; this section only adds labels.
- **ros2**: ROS2 domain ID, topics to subscribe (name → type), static topics, etc.

## API summary

- **Docs**: `http://localhost:8081/docs` (Swagger), `http://localhost:8081/redoc` (ReDoc)
- **Schema**: `http://localhost:8081/openapi.json`

| Area | Path | Description |
|------|------|-------------|
| Root | `GET /` | API metadata |
| Containers | `GET /containers` | List configured containers |
| Services | `GET /containers/{container}/services` | List services |
| | `GET /containers/{container}/services/{service}/status` | Service status |
| | `POST /containers/{container}/services/{service}` | Control service (up/down/restart) |
| | `GET /containers/{container}/services/{service}/logs` | Get logs |
| Docker | `GET /docker/containers` | List Docker containers |
| | `GET /docker/containers/{name}/status` | Container status |
| | `POST /docker/containers/{name}` | Control container |
| | `GET /docker/containers/{name}/logs` | Container logs |
| ROS2 | `GET /containers/{container}/ros2/topics` | List topics |
| | `GET /containers/{container}/ros2/topics/{topic}` | Topic data |
| WebSocket | `WS /ws/containers/{container}/services/{service}/logs` | Service log streaming |
| | `WS /ws/containers/{container}/ros2/topics/{topic}` | ROS2 topic streaming |

Docker endpoints only work when `/var/run/docker.sock` is accessible; otherwise they return 503.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute.

## License

See the [LICENSE](LICENSE) file.
