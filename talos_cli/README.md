# Talos Usage

Talos is a central control server for ROS2-based robot containers. **Talos CLI** lets you run the server, UI, and Zenoh daemon via Docker.

---

## 1. Installation (Talos CLI)

```bash
# From this repo's talos_cli directory
pip install .

# Or install from wheel (recommended if `talos` command is not found)
python -m build --wheel
pip install dist/talos_cli-0.1.0-py3-none-any.whl

# If published on PyPI
pip install talos-cli
```

**If you see `talos: command not found`**

- With pip user installs, scripts go to `~/.local/bin`. Add it to your PATH:
  ```bash
  export PATH="$HOME/.local/bin:$PATH"
  ```
  (To make it permanent: `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc`, then open a new terminal.)
- Or run without the script:
  ```bash
  python3 -m talos_cli.cli up
  ```

---

## 2. Basic usage

```bash
talos up
```

- Starts **talos server**, **talos_ui**, and **zenoh daemon** containers in the background.
- Uses the bundled `config/config.yml` by default.
- Requires Docker and `docker compose`.

---

## 3. Options

| Command | Description |
|---------|-------------|
| `talos up` | Start the stack with the packaged default config |
| `talos up -c /path/to/config.yml` | Start with the given config file (creates a copy from the package config if the file does not exist) |
| `talos up --pull` | Pull images before starting |
| `talos down` | Stop talos server, talos_ui, and zenoh daemon |
| `talos --help` | Show help |

---

## 4. Access

- **API**: `http://127.0.0.1:8081`
- **UI**: `http://127.0.0.1:3000` (talos_ui container)

---

## 5. Running from the repo (without CLI)

From the repo root:

```bash
docker compose up -d
```

- Builds `talos/` and `talos_ui`, and uses the root `config.yml` and `docker-compose.yml`.
- Agent sockets are mounted from `/var/run/robotis/agent_sockets`.

---

## 6. Summary

| Goal | Command |
|------|---------|
| Install with pip and run | `pip install ./talos_cli` → `talos up` |
| Stop the stack | `talos down` |
| Run with custom config | `talos up -c ~/myconfig.yml` |
| Pull latest images and run | `talos up --pull` |
| Develop/run from repo | `docker compose up -d` |
