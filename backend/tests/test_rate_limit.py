from app.rate_limit import RateLimitExceeded, check_rate_limit


def test_allows_requests_under_the_limit():
    for _ in range(3):
        check_rate_limit("test:allow", max_requests=3, window_seconds=60, now=1000.0)


def test_blocks_the_request_that_exceeds_the_limit():
    for _ in range(3):
        check_rate_limit("test:block", max_requests=3, window_seconds=60, now=1000.0)
    try:
        check_rate_limit("test:block", max_requests=3, window_seconds=60, now=1000.0)
        assert False, "expected RateLimitExceeded"
    except RateLimitExceeded:
        pass


def test_different_keys_have_independent_limits():
    for _ in range(3):
        check_rate_limit("test:key-a", max_requests=3, window_seconds=60, now=1000.0)
    # key-b has made no requests yet, so it should not be blocked
    check_rate_limit("test:key-b", max_requests=3, window_seconds=60, now=1000.0)


def test_requests_outside_the_window_are_forgotten():
    for _ in range(3):
        check_rate_limit("test:expire", max_requests=3, window_seconds=60, now=1000.0)
    # 61 seconds later the earlier requests have aged out of the window
    check_rate_limit("test:expire", max_requests=3, window_seconds=60, now=1061.0)
