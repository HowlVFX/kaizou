"""Local dev launcher.

psycopg's async pool is incompatible with Windows' Proactor event loop, which
uvicorn installs by default. On Python 3.13+ the reliable fix is to run the
server inside asyncio.run(..., loop_factory=<selector loop>) so the whole app
runs on a selector loop. On Linux (deployment target) this path is skipped and
plain uvicorn is used.

Usage:  python run_local.py [--host 127.0.0.1] [--port 8000]
"""
from __future__ import annotations

import argparse
import asyncio
import sys

import uvicorn


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()

    config = uvicorn.Config("app.main:app", host=args.host, port=args.port, loop="asyncio")
    server = uvicorn.Server(config)

    if sys.platform == "win32":
        import selectors

        def selector_loop_factory():
            return asyncio.SelectorEventLoop(selectors.SelectSelector())

        asyncio.run(server.serve(), loop_factory=selector_loop_factory)
    else:
        server.run()


if __name__ == "__main__":
    main()
