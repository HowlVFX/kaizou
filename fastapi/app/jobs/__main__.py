"""Background job worker entrypoint.

Run:  python -m app.jobs   (from the fastapi/ directory)

Owns its own DB connection and runs JobWorker.start() until interrupted.
This is the process that should also load the NLI model (one copy) — it is
separate from the Uvicorn web process. Handles SIGINT/SIGTERM gracefully.
"""
from __future__ import annotations

import asyncio
import logging
import signal
import sys

import psycopg

from app.config import get_settings
from app.jobs.worker import JobWorker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("worker")


async def main() -> None:
    settings = get_settings()
    conn = await psycopg.AsyncConnection.connect(settings.database_url, autocommit=False)
    worker = JobWorker(conn)

    stop = asyncio.Event()

    def _request_stop(*_):
        logger.info("shutdown signal received")
        stop.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _request_stop)
        except NotImplementedError:
            # Windows: add_signal_handler for SIGTERM isn't supported; SIGINT
            # still arrives as KeyboardInterrupt, handled below.
            signal.signal(sig, _request_stop)

    task = asyncio.create_task(worker.start())
    await stop.wait()
    await worker.stop()
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    await conn.close()
    logger.info("worker stopped cleanly")


if __name__ == "__main__":
    # psycopg async requires the selector loop on Windows.
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
