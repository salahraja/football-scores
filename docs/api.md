# golboard API, version 1

Our own football data: results, fixtures, tables and team ids for eight leagues, as a folder of static JSON. No server and no key, so any
app or page can read it. Built by `npm run api` (download, then build) into `public/api/v1/`, which Vite copies to the site.

## Files

| Path | What it holds |
|---|---|
| `api/v1/competitions.json` | `{ competitions: [{ id, name, country, seasons, current }] }` |
| `api/v1/<league>/<season>/matches.json` | `{ competition, season, matches: [{ id, round, stage, date, time, home, away, status, score, source }] }` |
| `api/v1/<league>/<season>/table.json` | `{ competition, season, table: [{ position, team, played, won, drawn, lost, gf, ga, gd, points, adjustment }], adjustments }` |
| `api/v1/<league>/<season>/teams.json` | `{ competition, season, teams: { <team id>: <name> } }` |
| `api/v1/meta.json` | version, when it was built, the sources and their licences, per league season: games finished and to play, the date of the last result, corrections applied; and `files`: every other file of the build with the sha256 of its bytes |
| `api/v1/schema.json` | the contract: a JSON Schema (2020-12) with one `$defs` entry per file type (`competitions`, `matches`, `table`, `teams`, `meta`). Kept in `data/api/schema.json` |

League ids: `it-1` Serie A, `en-1` Premier League, `es-1` LaLiga, `de-1` Bundesliga, `fr-1` Ligue 1, `nl-1` Eredivisie, `pt-1` Primeira
Liga, `en-2` Championship. Seasons look like `2026-27`.

A match: `status` is `finished` (with `score.ft`, and `score.ht` when known) or `scheduled` (`score` null). `stage` is `league` or `playoffs`;
play-off games never count in a table. `source` is `openfootball`, `correction` with `correctionSource` naming the official record, or `wikipedia` with `sourceUrl` naming the
revision its score came from.
A match id is `<league>:<date>:<home>-<away>`. Team ids are our own (`inter`, `napoli`, `manchester-united`): one id per club whatever a
source calls it (`scripts/api/teams.mjs`, `data/api/aliases.json`).

## The contract

The web pages and the iPhone app read the same shapes, so the shapes are written down once, in `data/api/schema.json`, and published
with the data. `tests/api-schema.test.ts` builds the API and checks every file against it, and checks a broken file is caught. A reader can
check `meta.files` too: a file whose sha256 does not match comes from a half-published or older build. Change the schema in the same
change as the data it describes.

## Pages

`npm run api:build` also writes plain HTML pages from the API it just built (`scripts/api/pages.mjs`): `/leagues/` and
`/leagues/<league>/` in the site's Stadio look (the facelift: a slate poster with the league in brick-red Barlow Condensed over the
game of the moment, then glass boxes for this week, the table, the latest results and the next fixtures). No framework (in our test on a
throttled phone a plain page showed in 376 ms against 912 ms for the Vue app), one stylesheet (`/leagues/site.css`) and the two fonts
(OFL) served from `/leagues/fonts/`, light and dark.
Each page says how far its results go, gives kick-off times in the league's own time zone (`clock` in `data/api/leagues.json`), and
credits only the sources it used. "This week" comes first: every unscored game up to three days ahead (a game from before the build day
with no score is waiting for its result, never "next").

**Live scores** (`/leagues/live.js`, the only script): on a page with games still to play, in a league SportScore covers (`sportscore` in
`data/api/leagues.json`; not Primeira Liga yet), the browser asks SportScore's free API once a minute for that league's games today and
writes each score and state ("Live · 2nd half", "Full time") into the row with the same two teams, within three days of today because a
schedule can be a day out (openfootball had LaLiga's 31 October games on 1 November); the poster moves to a game that is live; it stops
when they have all finished.
SportScore's terms ask for a visible link, so those pages say "Live scores powered by SportScore". The script names clubs with the same
function and aliases as `teams.mjs` (copied in at build time). On 31 October 2026 goals showed on SportScore a median 0.2 min after ESPN
and final whistles 1.2 min after (each ±1 min). The site's CSP allows `connect-src https://sportscore.com` for this. Without the script the
page is still complete.

## Where it comes from, and how we know it is right

- **Results and fixtures:** [openfootball/football.json](https://github.com/openfootball/football.json), public domain (CC0), free for any
  use including an app. It is kept by volunteers and runs behind: on 2026-10-31 the 2026-27 results stopped at 2026-09-20.
  `meta.json` says so per league (`lastResult`), so a page can say "results up to 20 Sep" rather than present a stale table as current.
- **Recent results:** English Wikipedia's season pages (CC BY-SA 4.0), whose results grids volunteers fill in within hours
  (`scripts/api/fetch-wikipedia.mjs` saves the grid and its revision to `data/wikipedia/`; `scripts/api/wikipedia.mjs` reads it). A
  grid score fills a league game openfootball has not scored yet, and only a game dated before the build day, because editors update the
  grid while games are on. It never replaces a score openfootball has: where the two differ, `meta.json` lists it under the league
  season's `wikipedia.disagreements`, with the revision used and how many games it filled. A club the grid names that we cannot map stops
  the build until it gets an alias. On 31 October 2026 this filled 254 games (results up to 25-30 October instead of 20 September); 139 of
  them could be paired with SportScore's results and all 139 agreed. The reader reproduces all 3,016 official 2025-26 scores from the
  grids (`tests/api-wikipedia.test.ts`). Pages that use this data credit Wikipedia under CC BY-SA.
- **Tables are computed, never copied**, with each league's own tie-break rules (`data/api/leagues.json`) and any points a league took
  away (`data/api/adjustments.json`, each with its reason and source).
- **Checked against the official record** (`tests/api.test.ts`): for 2025-26, all 3,016 league scores equal the official results, and all
  eight final tables equal the official tables in order, games, goals and points. Four scores openfootball had missing or wrong are put
  right in `data/api/corrections.json`, each citing its source; a correction the source no longer needs stops the build.
- **Nothing broken is published:** a build checks every season (duplicate ids, a team playing itself, impossible scores, unknown teams)
  and writes nothing if any check fails, so the last good API stays up. A download that fails keeps the saved copy.

## Not here yet

- Same-day and live results: SportScore's free API (attribution required, measured against ESPN on 31 October) or football-data.org once
  its terms for apps are confirmed.
- A schedule: a job that rebuilds every 30 minutes on match days. Netlify's free build minutes are too few for that, so it will publish
  from a separate place.
- Live minute-by-minute scores (licensed by the leagues), club crests and league logos (trademarks).
