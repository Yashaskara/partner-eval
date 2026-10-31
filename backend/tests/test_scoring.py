from backend.src.routes.analysis import _compute_composite


def test_composite_weighted_average():
    assessments = [
        {"domain": "lifestyle", "score": 8},
        {"domain": "career", "score": 6},
    ]
    self_domains = [
        {"domain": "lifestyle", "priority": 1},
        {"domain": "career", "priority": 3},
    ]
    assert _compute_composite(assessments, self_domains) == 7.5


def test_composite_defaults_to_priority_2():
    assessments = [{"domain": "lifestyle", "score": 10}]
    self_domains = []
    assert _compute_composite(assessments, self_domains) == 10.0


def test_composite_empty():
    assert _compute_composite([], []) == 0


def test_composite_rounds_to_one_decimal():
    assessments = [
        {"domain": "lifestyle", "score": 7},
        {"domain": "career", "score": 8},
        {"domain": "family", "score": 3},
    ]
    self_domains = [
        {"domain": "lifestyle", "priority": 1},
        {"domain": "career", "priority": 2},
        {"domain": "family", "priority": 3},
    ]
    assert _compute_composite(assessments, self_domains) == 6.7
