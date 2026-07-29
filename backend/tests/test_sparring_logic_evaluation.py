import random

from app.sparring_logic import choose_opponent_move, classify_user_move


def test_classify_user_move_correct_via_transposition():
    # User's sparring node came from line A, but plays the move that's only
    # recorded in sibling line B, which shares the same prefix — must still
    # count as correct (implementation.md's Fase 4 correction).
    matching = [
        ["e4", "c5", "Nf3", "d6"],
        ["e4", "c5", "Nf3", "Nc6"],
    ]
    assert classify_user_move(matching, ply_index=3, move_played="Nc6") == "correct"


def test_classify_user_move_unknown_when_not_in_any_sibling():
    matching = [["e4", "c5", "Nf3", "d6"]]
    assert classify_user_move(matching, ply_index=3, move_played="a6") == "unknown"


def test_choose_opponent_move_only_returns_existing_continuations():
    matching = [["e4", "c5", "Nf3", "Nc6", "d4"], ["e4", "c5", "Nf3", "Nc6", "Bb5"]]
    for _ in range(20):
        move = choose_opponent_move(matching, ply_index=4, rng=random.Random())
        assert move in {"d4", "Bb5"}


def test_choose_opponent_move_none_when_book_ends():
    matching = [["e4", "c5", "Nf3", "Nc6"]]
    assert choose_opponent_move(matching, ply_index=4, rng=random.Random()) is None
