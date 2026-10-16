import logging

import httpx
from conftest import KEY
from fastapi.testclient import TestClient

from football.app import create_app


def test_missing_key_is_a_clear_503_and_makes_no_upstream_call(make_client, upstream):
    api = TestClient(create_app(make_client(api_key=None)))
    for url in ["/api/today", "/api/competitions/SA/matches", "/api/competitions/PL/standings", "/api/teams/65"]:
        r = api.get(url)
        assert r.status_code == 503, url
        assert "key" in r.json()["error"].lower()
    assert upstream.calls == []
    # Routes that need no upstream data still work.
    assert api.get("/healthz").status_code == 200
    assert api.get("/api/competitions").status_code == 200


def test_key_is_sent_only_as_header(api, upstream):
    api.get("/api/competitions/PL/standings")
    url, params, headers = upstream.calls[0]
    assert headers == {"X-Auth-Token": KEY}
    assert KEY not in url and KEY not in str(params)


def test_key_never_in_any_response(api, upstream):
    urls = ["/api/competitions", "/api/today", "/api/competitions/SA/matches",
            "/api/competitions/PL/standings", "/api/teams/65", "/healthz", "/api/competitions/XX/matches"]
    for url in urls:
        r = api.get(url)
        assert KEY not in r.text and KEY not in str(dict(r.headers)), url
    upstream.fail = 500
    r = api.get("/api/teams/999")
    assert KEY not in r.text


def test_key_never_in_logs(api, upstream, caplog):
    caplog.set_level(logging.DEBUG)
    api.get("/api/today")
    api.get("/api/competitions/PL/standings")
    upstream.fail = 500
    api.get("/api/teams/999")
    upstream.fail = httpx.ConnectError("boom " + KEY)  # even if an exception carried it
    api.get("/api/teams/998")
    assert caplog.records, "expected some log lines to check"
    assert KEY not in caplog.text


def test_upstream_errors_are_502_with_a_plain_message(api, upstream):
    for n, failure in enumerate((500, 403, 429, httpx.ConnectTimeout("slow"))):
        upstream.fail = failure
        r = api.get("/api/teams/%d" % (1000 + n))
        assert r.status_code == 502
        body = r.json()
        assert list(body) == ["error"]
        assert "Traceback" not in r.text and KEY not in r.text


def test_unreadable_upstream_body_is_502(api, upstream):
    upstream.unreadable = True
    r = api.get("/api/teams/65")
    assert r.status_code == 502 and list(r.json()) == ["error"]
