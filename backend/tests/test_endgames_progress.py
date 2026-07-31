def test_progress_without_track_streak_leaves_wins_and_streak_at_zero(client):
    """Simulates the Puzzles call site, which never sends trackStreak."""
    resp = client.post("/api/endgames/progress/bishop-1", json={"solved": True})
    assert resp.status_code == 200
    body = resp.json()
    assert body["wins"] == 0
    assert body["winStreak"] == 0

    resp = client.post("/api/endgames/progress/bishop-1", json={"solved": False})
    assert resp.status_code == 200
    body = resp.json()
    assert body["wins"] == 0
    assert body["winStreak"] == 0


def test_track_streak_increments_wins_and_streak_on_consecutive_wins(client):
    client.post("/api/endgames/progress/bishop-1", json={"solved": True, "trackStreak": True})
    resp = client.post("/api/endgames/progress/bishop-1", json={"solved": True, "trackStreak": True})
    body = resp.json()
    assert body["wins"] == 2
    assert body["winStreak"] == 2


def test_track_streak_resets_streak_on_loss_without_incrementing_wins(client):
    client.post("/api/endgames/progress/bishop-1", json={"solved": True, "trackStreak": True})
    client.post("/api/endgames/progress/bishop-1", json={"solved": True, "trackStreak": True})
    resp = client.post("/api/endgames/progress/bishop-1", json={"solved": False, "trackStreak": True})
    body = resp.json()
    assert body["wins"] == 2
    assert body["winStreak"] == 0


def test_wins_and_streak_are_scoped_per_puzzle_id(client):
    client.post("/api/endgames/progress/bishop-1", json={"solved": True, "trackStreak": True})
    client.post("/api/endgames/progress/bishop-1", json={"solved": True, "trackStreak": True})

    resp = client.post("/api/endgames/progress/bishop-2", json={"solved": True, "trackStreak": True})
    body = resp.json()
    assert body["wins"] == 1        # bishop-2's own count, unaffected by bishop-1's 2 wins
    assert body["winStreak"] == 1
