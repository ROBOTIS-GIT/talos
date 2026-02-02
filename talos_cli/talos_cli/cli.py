"""CLI for pip-installed talos_cli: talos up, talos down. Launches talos server and UI via Docker."""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


def _docker_dir() -> Path:
    return Path(__file__).resolve().parent / "docker"


def _config_dir() -> Path:
    return Path(__file__).resolve().parent / "config"


def _packaged_config_path() -> Path:
    """Path to the bundled config (config/config.yml). Used by default for talos up."""
    return _config_dir() / "config.yml"


def cmd_up(args: argparse.Namespace) -> int:
    """Run docker compose with packaged compose file (talos server + UI containers)."""
    if args.config is None:
        config_path = _packaged_config_path()
    else:
        config_path = Path(args.config).expanduser().resolve()
        if not config_path.exists():
            config_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(_packaged_config_path(), config_path)
            print(f"Created default config at {config_path}", file=sys.stderr)
        if not config_path.is_file():
            print(f"Config file not found: {config_path}", file=sys.stderr)
            return 1
    compose_path = _docker_dir() / "docker-compose.yml"
    if not compose_path.is_file():
        print(f"Compose file not found: {compose_path}", file=sys.stderr)
        return 1
    env = os.environ.copy()
    env["TALOS_CONFIG_FILE"] = str(config_path)
    cmd = [
        "docker",
        "compose",
        "-f",
        str(compose_path),
        "up",
        "-d",
    ]
    if args.pull:
        cmd.insert(-1, "--pull")
        cmd.insert(-1, "always")
    try:
        subprocess.run(cmd, env=env, check=True)
    except subprocess.CalledProcessError as e:
        return e.returncode
    except FileNotFoundError:
        print(
            "Docker not found. Install Docker and ensure 'docker compose' is available.",
            file=sys.stderr,
        )
        return 1
    print("talos server, talos_ui, and zenoh daemon are up.")
    return 0


def cmd_down(args: argparse.Namespace) -> int:
    """Stop talos server, talos_ui, and zenoh daemon (docker compose down)."""
    compose_path = _docker_dir() / "docker-compose.yml"
    if not compose_path.is_file():
        print(f"Compose file not found: {compose_path}", file=sys.stderr)
        return 1
    env = os.environ.copy()
    env["TALOS_CONFIG_FILE"] = str(_packaged_config_path())
    cmd = [
        "docker",
        "compose",
        "-f",
        str(compose_path),
        "down",
    ]
    try:
        subprocess.run(cmd, env=env, check=True)
    except subprocess.CalledProcessError as e:
        return e.returncode
    except FileNotFoundError:
        print(
            "Docker not found. Install Docker and ensure 'docker compose' is available.",
            file=sys.stderr,
        )
        return 1
    print("talos server, talos_ui, and zenoh daemon are down.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="talos",
        description="Talos CLI: launch talos server and UI containers. Services run via Docker images.",
    )
    sub = parser.add_subparsers(dest="command", help="Commands")

    up_parser = sub.add_parser(
        "up", help="Start talos server, talos_ui, and zenoh daemon (docker compose)"
    )
    up_parser.add_argument(
        "-c",
        "--config",
        metavar="PATH",
        help="Config file path (default: use bundled config from package)",
    )
    up_parser.add_argument(
        "--pull",
        action="store_true",
        help="Always pull images before starting",
    )
    up_parser.set_defaults(func=cmd_up)

    down_parser = sub.add_parser(
        "down", help="Stop talos server, talos_ui, and zenoh daemon (docker compose down)"
    )
    down_parser.set_defaults(func=cmd_down)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return 0
    return args.func(args)
