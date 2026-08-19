from app.auth import hash_reset_token, make_reset_token


def test_make_reset_token_returns_raw_and_matching_hash():
    raw, hashed = make_reset_token()
    assert raw != hashed
    assert hash_reset_token(raw) == hashed


def test_make_reset_token_is_random_each_time():
    raw1, hashed1 = make_reset_token()
    raw2, hashed2 = make_reset_token()
    assert raw1 != raw2
    assert hashed1 != hashed2


def test_hash_reset_token_is_deterministic():
    raw, hashed = make_reset_token()
    assert hash_reset_token(raw) == hashed
