# A fresher lawful results source, and what the golboard iPhone app needs from the API (2026-11-04)

Builds on `research_notes/golboard stack and data sources/data_sources.md` (2026-10-31), which covered football-data.org, TheSportsDB,
API-Football, FBref and the fixture-copyright case law. This note adds measurements taken today, the sources and terms that note left
open, the Champions League question, and the API needs of a SwiftUI app and widget.

## 1. In short
1. **openfootball has stalled.** Every league's last result is 20 September, 25 to 26 days ago (Primeira Liga: 80 days).
   **Today the site is current only because of the Wikipedia results grids.** Wikipedia is our de facto primary source, and it is our
   only fresh one.
2. **Recommendation:**
   - Keep Wikipedia as the source of published results and openfootball for the schedule.
   - Add football-data.org's free tier as a **private cross-check** that we never publish. It flags a score that Wikipedia gets wrong or
     lacks.
   - Do not publish football-data.org data until its maintainer answers two questions in writing: may we store and republish copies, and
     what happens to them if we stop. A draft email is in section 4.
3. **Champions League:** there is no CC0 or public-domain source for 2026-27; openfootball's CL repo stops at 2025-26. The lawful free
   options are Wikipedia's league-phase table (CC BY-SA) or football-data.org (which has the same open question as point 2). The
   knockout rounds do not start until February 2027, so the near-term piece is the league-phase table with its knockout zones.
4. **The iPhone app:** the API already does what an app needs most: static JSON, ETag with `304` (measured), Brotli (the largest file,
   134 KB, arrives as 9 KB), a JSON Schema and per-file hashes. It lacks four things an app or widget needs:
   - kick-off as an absolute time
   - one small "today" file, so a widget makes one request instead of eight
   - short team names for widgets
   - the table zones

## 2. Measured freshness, 2026-11-04

openfootball `football.json`, season 2026-27, compared with what golboard's API published today (built 19:09 UTC):

| League | openfootball: last result | Games due but unscored | Oldest unscored | golboard API: last result |
|---|---|---|---|---|
| Serie A | 2026-09-20 | 50 | 2026-10-10 (25 days) | 2026-11-02 |
| Premier League | 2026-09-20 | 40 | 2026-10-10 (25 days) | 2026-11-02 |
| LaLiga | 2026-09-20 | 41 | 2026-10-09 (26 days) | 2026-11-01 |
| Bundesliga | 2026-09-20 | 36 | 2026-10-09 (26 days) | 2026-11-01 |
| Ligue 1 | 2026-09-20 | 36 | 2026-10-09 (26 days) | 2026-11-01 |
| Eredivisie | 2026-09-20 | 36 | 2026-10-09 (26 days) | 2026-11-01 |
| Primeira Liga | 2026-09-20 | 28 | 2026-08-16 (80 days) | 2026-11-02 |
| Championship | 2026-09-20 | 70 | 2026-10-09 (26 days) | 2026-11-03 |

Why it stalled, from GitHub's API:
- `football.json` was last pushed on 2026-09-22.
- The upstream `italy` and `deutschland` repos were last pushed on 2026-09-21, both by their "auto-update week 39" bot.
- `england`, `espana` and `europe` were pushed on 2026-10-15, but those changes never reached `football.json`.

So the problem is the upstream update bot and the JSON rebuild, not a single league. Upstream pull requests would help only where
the rebuild still runs.

Method: download each `2026-27/<code>.json` and count matches dated before today with no full-time score. The script is in
section 6.

## 3. Sources and their terms

| Source | Covers | Fresh? | Terms (checked today unless marked) | Verdict |
|---|---|---|---|---|
| openfootball football.json | all 8 leagues | stalled since 20 Sep | CC0-1.0 ([repo](https://github.com/openfootball/football.json)) | keep for the schedule and as backfill |
| openfootball champions-league | CL, Europa League | stops at 2025-26 (last push 2 Jul 2026) | CC0-1.0 ([repo](https://github.com/openfootball/champions-league)) | no 2026-27 |
| Wikipedia season pages | all 8 leagues and the CL | 1–2 days behind | CC BY-SA 4.0 for copied text; bare scores are facts (see the case law in the 31 Oct note); we credit it on every page | **primary today** |
| football-data.org free tier | all 8 leagues and the CL, delayed scores, 10 calls a minute (31 Oct note) | not measured | 7.1: attribution "Football data provided by the Football-Data.org API". 2.3: one key per application, web and mobile. No clause on storing, caching or republishing. 9.1: after cancelling, the customer "is not permitted to reference the football data". 9.2: logos belong to their owners ([terms](https://www.football-data.org/client/register)) | private cross-check now; publish only after a written answer |
| OpenLigaDB | Bundesliga (community-entered) | not measured | free, no key ([docs](https://openligadb.readthedocs.io/en/latest/usage.html)); Apache-2.0 covers only the [sample code](https://github.com/OpenLigaDB/OpenLigaDB-Samples). The data licence is unverified (one directory says ODbL) | Bundesliga cross-check at most |
| SportScore | live scores (already used in the browser) | live | terms page returns HTTP 403 to automated readers, so **unread** | Salah to read [its terms](https://sportscore.com/terms/) before the iPhone app uses it |
| TheSportsDB, API-Football, FBref | see the 31 Oct note | n/a | TheSportsDB needs a paid plan for App Store apps; FBref forbids automated access | not recommended |

## 4. Recommendation and next steps
1. **Results:**
   - Wikipedia stays the primary source.
   - Add a test that fails the build when a league's newest result in our API is more than 3 days older than the build day while
     games were due. That turns a stalled source into a red build instead of a quiet one.
2. **Cross-check:**
   - A scheduled job compares our published scores with football-data.org's (free key, kept as a server secret) and opens an issue
     when they disagree.
   - Nothing from football-data.org is published, which avoids the 9.1 question.
3. **Email for Salah to send** (draft): "Hello, I run golboard, a free site and iPhone app with tables and results for eight European
   leagues. I would like to use the free tier and publish the results and tables, with your attribution line, as static files rebuilt
   every 30 minutes. Is storing and republishing them allowed on the free tier? If I stop using the API, may results I published
   before stay online? Thank you." The address, info@football-data.org, comes from the 31 Oct note; it was not re-checked today.
4. **Champions League:** build the league-phase table from Wikipedia's "2026–27 UEFA Champions League league phase" page: the table,
   not the match boxes, because that parser is smaller. Zones: 1st–8th round of 16, 9th–24th knockout play-off, 25th–36th out.
   Add the bracket from February.

## 5. What the iPhone app (SwiftUI and a widget) needs from the API

What it already has, measured against the live site:
- **Plain static JSON** at `/api/v1/…`, with no key.
- **Repeat requests are cheap:** the server sends an `etag`, and a request with `If-None-Match` gets **`304 Not Modified`**. URLSession
  does this for free with its default cache policy.
- **Compression:** Brotli brings the largest file (`en-2/2026-27/matches.json`) from 133,982 bytes to 8,998.
- **Caching header:** `cache-control: public,max-age=0,must-revalidate`, so every read revalidates. That is fine for an app; see
  change 5 for an optional tweak.
- **Consistency:** a contract (`schema.json`) for Codable models, and `meta.files` sha256 hashes, so the app can reject a half-published
  build.

Proposed additions, all additive so v1 stays compatible:
1. **`kickoff` on every match:** an ISO 8601 time with the league's UTC offset, for example `2026-11-07T15:00:00+00:00`.
   - Why: matches carry only a local `date` and `time`, and the time zone appears only as prose ("UK time"). Widgets, local
     notifications and Live Activities need an absolute instant.
   - `scripts/api/pages.mjs` already works these out for its schema.org data (PR #16); move that into the API build.
2. **`api/v1/today.json`:** every league's games from yesterday to three days ahead, with scores.
   - Why: a widget has a budget of roughly 40–70 reloads a day (Apple's guidance, per the 31 Oct iOS note). One small file per
     reload beats eight `matches.json` files.
3. **`short` team names** in `teams.json`, three letters (`INT`, `NAP`) for widget sizes. Our own short names are facts, not crests,
   so there is no trademark issue.
4. **Zones in the API:** `zones` in `table.json` from `data/api/zones.json` (PR #14), so the app shows the same legend as the web.
5. **Optional caching header:** for `/api/v1/*`, use `cache-control: public, max-age=300, stale-while-revalidate=3600` in
   `netlify.toml`. App launches within five minutes then cost no request at all. Without it, a `304` still costs one round trip.
6. **Not needed:**
   - CORS headers: a native app is not bound by CORS.
   - Push: the 31 Oct iOS note rules out APNs on a free Personal Team. The app polls instead: `BGAppRefreshTask` plus widget timelines.

## 6. How to reproduce the freshness table

```python
import json, urllib.request, datetime
today = datetime.date.today()
ft = lambda m: (m.get("score") or {}).get("ft") if isinstance(m.get("score"), dict) else m.get("score") or None
for code in ["it.1", "en.1", "es.1", "de.1", "fr.1", "nl.1", "pt.1", "en.2"]:
    url = f"https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/{code}.json"
    ms = json.load(urllib.request.urlopen(url, timeout=20))["matches"]
    missing = [m for m in ms if m["date"] < today.isoformat() and not ft(m)]
    print(code, max((m["date"] for m in ms if ft(m)), default="-"), len(missing), min((m["date"] for m in missing), default="-"))
```
