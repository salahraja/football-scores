import pytest
from fastapi.testclient import TestClient

from football.app import create_app


@pytest.fixture
def site(make_client, tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>app</html>")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path / "secret.txt").write_text("outside")
    return TestClient(create_app(make_client(), dist=dist))


def test_root_and_deep_links_get_index(site):
    for path in ["/", "/club/109", "/table"]:
        r = site.get(path)
        assert r.status_code == 200 and "app" in r.text, path
        assert r.headers["cache-control"] == "no-cache"


def test_built_files_are_served_as_files(site):
    r = site.get("/assets/app.js")
    assert r.status_code == 200 and r.text == "console.log(1)"
    assert "immutable" in r.headers["cache-control"]


def test_api_still_answers_and_unknown_api_paths_are_json_404(site):
    assert site.get("/api/competitions").status_code == 200
    assert site.get("/healthz").json() == {"ok": True}
    r = site.get("/api/nope")
    assert r.status_code == 404 and r.json() == {"error": "Not found"}


def test_paths_cannot_climb_out_of_the_build_folder(site):
    assert "outside" not in site.get("/..%2fsecret.txt").text
    assert "outside" not in site.get("/assets/../../secret.txt").text


def test_head_on_a_page_is_200(site):
    assert site.head("/").status_code == 200
    assert site.head("/club/109").status_code == 200


def test_missing_asset_is_404_not_index(site):
    r = site.get("/assets/gone.js")
    assert r.status_code == 404 and "app" not in r.text


def test_odd_file_names_are_404_not_500(site):
    for path in ["/assets/a%00b.js", "/assets/" + "x" * 5000 + ".js"]:
        assert site.get(path).status_code == 404, path[:30]
    assert site.get("/club/%00").status_code == 404


def test_without_a_build_nothing_is_mounted(make_client, tmp_path):
    api = TestClient(create_app(make_client(), dist=tmp_path))
    assert api.get("/").status_code == 404
