from src.utils.auth import LoginThrottle, password_matches


def test_password_matches():
    assert password_matches("s3cret", "s3cret")
    assert not password_matches("s3cret ", "s3cret")
    assert not password_matches("", "s3cret")


def test_throttle_locks_after_repeated_failures_and_recovers():
    now = [0.0]
    throttle = LoginThrottle(max_failures=3, window_seconds=60, clock=lambda: now[0])

    assert throttle.attempt("bad", "good") is False
    assert throttle.attempt("bad", "good") is False
    assert throttle.attempt("bad", "good") is False
    # Locked: even the right password is refused.
    assert throttle.attempt("good", "good") is None

    now[0] = 61
    assert throttle.attempt("good", "good") is True


def test_successes_do_not_count_as_failures():
    throttle = LoginThrottle(max_failures=1)
    for _ in range(5):
        assert throttle.attempt("good", "good") is True


def test_one_client_cannot_lock_out_another():
    throttle = LoginThrottle(max_failures=2)
    for _ in range(2):
        assert throttle.attempt("bad", "good", "attacker") is False
    assert throttle.attempt("good", "good", "attacker") is None
    assert throttle.attempt("good", "good", "admin") is True


def test_shared_ceiling_across_clients():
    throttle = LoginThrottle(max_failures=5, max_total_failures=3)
    for i in range(3):
        assert throttle.attempt("bad", "good", f"client {i}") is False
    assert throttle.attempt("good", "good", "someone else") is None
