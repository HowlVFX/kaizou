"""WS3 NLI fixes: serialized inference, off-loop load/inference, warm-up.

Fake backends only; no model download, no torch inference.
"""
from __future__ import annotations

import asyncio
import threading
import time

import pytest

from app.config import Settings
from app.nli import service as nli_service
from app.nli.service import LazyBackend, NLIService, NLIUnavailable


class BorrowCheckingBackend:
    """Mimics the HF fast tokenizer: concurrent use raises 'Already borrowed'."""

    def __init__(self, delay=0.02):
        self._busy = threading.Lock()
        self._delay = delay
        self.calls = 0
        self.threads: set[str] = set()

    def infer(self, pairs):
        if not self._busy.acquire(blocking=False):
            raise RuntimeError("Already borrowed")
        try:
            self.calls += 1
            self.threads.add(threading.current_thread().name)
            time.sleep(self._delay)
            return [(0.9, 0.05, 0.05) for _ in pairs]
        finally:
            self._busy.release()


def test_concurrent_classify_is_serialized():
    async def run():
        backend = BorrowCheckingBackend()
        svc = NLIService(backend, batch_size=4)
        results = await asyncio.gather(*(svc.classify("p", f"h{i}") for i in range(8)))
        assert len(results) == 8 and backend.calls == 8
        assert threading.main_thread().name not in backend.threads   # ran in worker threads
    asyncio.run(run())


def test_inference_does_not_block_event_loop():
    async def run():
        svc = NLIService(BorrowCheckingBackend(delay=0.3), batch_size=4)
        ticks = 0
        stop = asyncio.Event()

        async def ticker():
            nonlocal ticks
            while not stop.is_set():
                ticks += 1
                await asyncio.sleep(0.01)

        t = asyncio.create_task(ticker())
        await svc.classify("p", "h")
        stop.set()
        await t
        assert ticks >= 5                                  # loop kept running during inference
    asyncio.run(run())


def test_lazy_backend_loads_once_off_loop():
    async def run():
        built = []

        def factory():
            built.append(threading.current_thread().name)
            time.sleep(0.1)                                # the "1 GB" load
            return BorrowCheckingBackend(delay=0)
        lazy = LazyBackend(factory)
        svc = NLIService(lazy, batch_size=4)
        assert svc.enabled and not lazy.loaded             # constructing never loads
        await asyncio.gather(*(svc.classify("p", "h") for _ in range(6)))
        assert len(built) == 1                             # single initialisation
        assert built[0] != threading.main_thread().name
    asyncio.run(run())


def test_failed_load_is_unavailable_and_not_retried():
    async def run():
        calls = []

        def factory():
            calls.append(1)
            raise OSError("no model files")
        svc = NLIService(LazyBackend(factory))
        with pytest.raises(NLIUnavailable):
            await svc.classify("p", "h")
        assert svc.enabled is False                        # routers now report nli_disabled
        with pytest.raises(NLIUnavailable):
            await svc.classify("p", "h")
        assert len(calls) == 1
    asyncio.run(run())


def test_get_nli_service_does_not_load_and_warm_up_loads(monkeypatch):
    async def run():
        built = []

        def fake_factory(settings):
            def build():
                built.append(threading.current_thread().name)
                return BorrowCheckingBackend(delay=0)
            return build
        monkeypatch.setattr(nli_service, "_torch_factory", fake_factory)
        monkeypatch.setattr(nli_service, "_deps_installed", lambda: True)
        nli_service.reset_nli_service()
        try:
            s = Settings(_env_file=None, nli_enabled=True)
            svc = nli_service.get_nli_service(s)
            assert svc.enabled and built == []             # returned without loading
            assert await nli_service.warm_up_nli(s) is True
            assert len(built) == 1 and built[0] != threading.main_thread().name
            await svc.classify("p", "h")
            assert len(built) == 1
        finally:
            nli_service.reset_nli_service()
    asyncio.run(run())


def test_lifespan_preload_runs_in_background(monkeypatch):
    import app.main as main
    from app.nli import service as svc_mod

    async def run():
        began = asyncio.Event()
        gate = asyncio.Event()                             # never set: warm-up would block forever

        async def fake_warm_up(settings=None):
            began.set()
            await gate.wait()
            return True

        async def noop(*a, **k):
            return None

        monkeypatch.setattr(main, "get_settings",
                            lambda: Settings(_env_file=None, nli_enabled=True, nli_preload=True))
        monkeypatch.setattr(main, "init_pool", noop)
        monkeypatch.setattr(main, "close_pool", noop)
        monkeypatch.setattr(svc_mod, "warm_up_nli", fake_warm_up)

        async with main.lifespan(main.app):
            await asyncio.wait_for(began.wait(), 1.0)      # startup did not wait on it
        # shutdown cancelled the pending warm-up without error

    asyncio.run(run())
