import random
from datetime import datetime, timedelta

from app.sparring_logic import LineInfo, StatsInfo, build_sparring_candidates, select_sparring_node


def _line(line_id, opening_id, moves, repetitions=0):
    return LineInfo(line_id=line_id, opening_id=opening_id, moves=moves, repetitions=repetitions)


def test_candidates_exclude_positions_shallower_than_two_plies():
    lines = [_line(1, "op", ["e4", "e5", "Nf3", "Nc6"])]
    candidates = build_sparring_candidates(lines, {}, color="white")
    assert [c.ply_index for c in candidates] == [2]


def test_divergent_prefix_gets_higher_weight_than_unique_prefix():
    lines = [
        _line(1, "op", ["e4", "c5", "Nf3", "d6", "d4", "cxd4"]),
        _line(2, "op", ["e4", "c5", "Nc3", "Nc6", "g3", "g6"]),
        _line(3, "op", ["d4", "d5", "Bf4", "Nf6", "e3", "e6"]),
    ]
    candidates = build_sparring_candidates(lines, {}, color="white")
    by_key = {(c.line_id, c.ply_index): c for c in candidates}
    assert by_key[(1, 2)].weight > by_key[(3, 2)].weight
    assert by_key[(2, 2)].weight > by_key[(3, 2)].weight


def test_recent_wrong_result_lowers_weight_via_cooldown():
    lines = [_line(1, "op", ["e4", "e5", "Nf3", "Nc6"])]
    now = datetime(2026, 7, 29, 12, 0, 0)
    recent = build_sparring_candidates(
        lines, {(1, 2): StatsInfo(attempts=1, last_result="unknown", last_attempt_at=now - timedelta(minutes=10))},
        color="white", now=now,
    )[0]
    stale = build_sparring_candidates(
        lines, {(1, 2): StatsInfo(attempts=1, last_result="unknown", last_attempt_at=now - timedelta(hours=2))},
        color="white", now=now,
    )[0]
    assert recent.weight < stale.weight


def test_select_sparring_node_returns_none_for_no_candidates():
    assert select_sparring_node([], random.Random(0)) is None


def test_select_sparring_node_is_deterministic_given_the_same_rng_seed():
    lines = [_line(1, "op", ["e4", "e5", "Nf3", "Nc6"]), _line(2, "op2", ["d4", "d5", "Bf4", "Nf6"])]
    candidates = build_sparring_candidates(lines, {}, color="white")
    a = select_sparring_node(candidates, random.Random(42))
    b = select_sparring_node(candidates, random.Random(42))
    assert (a.line_id, a.ply_index) == (b.line_id, b.ply_index)
