import httpx
import pytest

_RealAsyncClient = httpx.AsyncClient  # captured before any test patches httpx.AsyncClient globally


def _mock_async_client_factory(games_response=None):
    games_response = games_response if games_response is not None else {"games": []}

    def handler(request):
        return httpx.Response(200, json=games_response)

    transport = httpx.MockTransport(handler)

    class _MockAsyncClient:
        def __init__(self, *a, **k):
            self._client = _RealAsyncClient(transport=transport)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            await self._client.aclose()

        async def get(self, url, headers=None):
            return await self._client.get(url, headers=headers)

    return _MockAsyncClient


@pytest.mark.asyncio
async def test_import_sleeps_between_consecutive_chesscom_requests(monkeypatch):
    from app.routers import games

    monkeypatch.setattr(games.httpx, "AsyncClient", _mock_async_client_factory())
    sleeps = []

    async def _fake_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(games.asyncio, "sleep", _fake_sleep)

    class _FakeDb:
        def commit(self):
            pass

    await games.import_games(username="tester", months=3, db=_FakeDb())

    assert sleeps == [1, 1]  # one sleep between each of the 3 requests, none before the first


@pytest.mark.asyncio
async def test_import_does_not_sleep_for_a_single_month(monkeypatch):
    from app.routers import games

    monkeypatch.setattr(games.httpx, "AsyncClient", _mock_async_client_factory())
    sleeps = []

    async def _fake_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(games.asyncio, "sleep", _fake_sleep)

    class _FakeDb:
        def commit(self):
            pass

    await games.import_games(username="tester", months=1, db=_FakeDb())

    assert sleeps == []


def test_import_endpoint_is_rate_limited_per_ip(client, monkeypatch):
    from app.routers import games

    monkeypatch.setattr(games.httpx, "AsyncClient", _mock_async_client_factory())

    for _ in range(10):
        resp = client.get("/api/games/import", params={"username": "tester", "months": 1})
        assert resp.status_code == 200

    resp = client.get("/api/games/import", params={"username": "tester", "months": 1})
    assert resp.status_code == 429
