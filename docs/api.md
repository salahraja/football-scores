# golboard API, version 1

Our own football data: results, fixtures, tables and team ids for eight leagues, the three European cups, the Nations League and AFCON qualifying, as a folder of static JSON. No server and no key, so any
app or page can read it. Built by `npm run api` (download, then build) into `public/api/v1/`, which Astro copies to the site.

## Files

| Path | What it holds |
|---|---|
| `api/v1/competitions.json` | `{ competitions: [{ id, name, country, seasons, current }] }` |
| `api/v1/<league>/<season>/matches.json` | `{ competition, season, matches: [{ id, round, stage, date, time, home, away, status, score, source }] }` |
| `api/v1/<league>/<season>/table.json` | `{ competition, season, table: [{ position, team, played, won, drawn, lost, gf, ga, gd, points, adjustment }], adjustments }` |
| `api/v1/<league>/<season>/teams.json` | `{ competition, season, teams: { <team id>: <name> } }` |
| `api/v1/<league>/<season>/games/<date>-<home>-<away>.json` | One finished game in detail, from ESPN's feeds: `{ competition, season, match, source, kickoff, home, away, players, events, shots, positions, touches }`. `match` is our match id; `players` the lineups (`id`, `name`, `side`, `number`, `position`, `starter`); `events` the goals, cards and substitutions in order; `shots` every shot with where it was taken from (`x`, `y`), `outcome`, `xg` (null where ESPN has none) and `penalty`; `touches` each player's on-ball touches counted in 30 zones. Positions are percent of the pitch, the player's own team attacking toward x = 100, y = 0 its right touchline. Only for games ESPN has and our results agree with |
| `api/v1/meta.json` | version, when it was built, the sources and their licences, per league season: games finished and to play, the date of the last result, corrections applied; and `files`: every other file of the build with the sha256 of its bytes |
| `api/v1/news.json` | `{ generatedAt, articles: [{ title, summary, url, source, published, image, clubs }] }`: football headlines, newest first (at most 60), from BBC Sport, The Guardian and ESPN's own RSS feeds; `clubs` lists the team ids the story names. Written by `scripts/api/news.mjs`, after `build.mjs`, so it is not in `meta.json`'s file list |
| `api/v1/news/<club id>.json` | `{ generatedAt, articles }` in the same shape, at most 30 per club, newest first: the general headlines that name the club plus The Guardian's own feed for it (`data/api/guardian-feeds.json`). One file per club of every league, so a club the three general feeds never mention (Juventus had none on 2026-11-12) still has its stories. A club with no Guardian feed gets only the general ones |
| `api/v1/tournaments.json` | `{ tournaments: [{ id, name, full, region, teams, season, finals }] }`: cups and international tournaments; `teams` is `clubs` or `nations`. Kept apart from `competitions.json`, whose readers expect one league table per competition |
| `api/v1/<tournament>/<season>/matches.json` | `{ tournament, season, matches }`: like a league's, plus `group` (`A`, `A1`, or `league` for a single league-phase table), `stage` `group`, `round` (`Group A`, `League A, Group 1`, `Matchday 3`), and `kickoff` with a UTC offset |
| `api/v1/<tournament>/<season>/groups.json` | `{ tournament, season, zones: [{ kind, label, from, to, division }], hosts, groups: [{ group, name, division, table }] }`: one computed table per group; each row adds `status`: the kind of zone its place falls in, `host` (in the finals already as a host), or null |
| `api/v1/<tournament>/<season>/teams.json` | `{ tournament, season, teams: { <team id>: <name> } }` |
| `api/v1/schema.json` | the contract: a JSON Schema (2020-12) with one `$defs` entry per file type (`competitions`, `matches`, `table`, `teams`, `game`, `tournaments`, `tournamentMatches`, `groups`, `tournamentTeams`, `today`, `news`, `meta`). Kept in `data/api/schema.json` |

League ids: `it-1` Serie A, `en-1` Premier League, `es-1` LaLiga, `de-1` Bundesliga, `fr-1` Ligue 1, `nl-1` Eredivisie, `pt-1` Primeira
Liga, `en-2` Championship. Tournament ids: `afcon` AFCON qualifying (48 nations, 12 groups of four, September 2026 to March 2027), `champions-league`,
`europa-league` and `conference-league` (one league-phase table of 36 each), `nations-league` (14 groups in Leagues A to D). Seasons look like `2026-27`. Nation ids are the name as a slug (`morocco`, `dr-congo`), from the FIFA codes in `data/api/nations.json`.

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
game of the moment, then glass boxes for this week, the table, the latest results and the next fixtures). Each league game ESPN
has detail for (`games/*.json`) gets a page of its own, `/leagues/<league>/<date>-<home>-<away>/`, linked as "Shots and touches"
from the league's and the clubs' game lists (`scripts/api/gamepage.mjs`): the score, the timeline, home and away shots and expected
goals, a shot map (every shot from where it was taken; a circle's area grows with its xG; filled for a goal, a thick ring saved, a thin
ring off target, dashed blocked) with a list of every shot, and touch maps for each side and each player: on-ball touches counted in 30
zones (the boxes, the six-yard boxes' width, halfway and a third of each half), coloured by touches per square metre in five steps
of one red, with the count printed in each zone. All drawn as SVG when the page is built: no script, colours from CSS classes so the
dark theme works, a title and a description on each map for screen readers. A page with 34 maps is about 9 KB compressed. No framework (in our test on a
throttled phone a plain page showed in 376 ms against 912 ms for the Vue app), one stylesheet (`/leagues/site.css`) and the two fonts
(OFL) served from `/leagues/fonts/`, light and dark.
Each page says how far its results go, gives kick-off times in the league's own time zone (`clock` in `data/api/leagues.json`), and
credits only the sources it used. "This week" comes first: every unscored game up to three days ahead (a game from before the build day
with no score is waiting for its result, never "next").

**Live scores** (`/leagues/live.js`, the only script): on a page with games still to play, in a league SportScore covers (`sportscore` in
`data/api/leagues.json`; not Primeira Liga yet), and on the cup and international pages (`sportscore` in `data/api/tournaments.json`: all five,
AFCON qualifying under SportScore's `caf-africa-cup-of-nations`), the browser asks SportScore's free API once a minute for that league's games today and
writes each score and state ("Live · 2nd half", "Full time") into the row with the same two teams, within three days of today because a
schedule can be a day out (openfootball had LaLiga's 31 October games on 1 November); the poster moves to a game that is live; it stops
when they have all finished.
SportScore's terms ask for a visible link, so those pages say "Live scores powered by SportScore". The script names clubs with the same
function and aliases as `teams.mjs` (copied in at build time). A name the feed uses that makes a different id from ours is a club whose
live scores never show, so the names are checked against the feed itself: `node scripts/api/check-live-names.mjs` reads SportScore's
fixtures for a window of days and lists every name that is not a team of ours. On 17 November 2026 it found four, all promoted clubs
(Deportivo La Coruña, Le Havre, Troyes, Excelsior), now in `data/api/aliases.json` and `tests/api-league-live-names.test.ts`; the cups
and internationals were clean. Run it when a season starts or a competition is added. On 31 October 2026 goals showed on SportScore a median 0.2 min after ESPN
and final whistles 1.2 min after (each ±1 min). The site's CSP allows `connect-src https://sportscore.com` for this. Without the script the
page is still complete. A hidden team (Israel) has no row, so a game of theirs that SportScore sends is never shown.

## News and Following

`npm run api:fetch` also downloads the three football feeds into `data/news/` (a feed that fails keeps its saved copy), and `api:build`
turns them into `api/v1/news.json` (`scripts/api/news.mjs`; it never fails the build). Only the headline, a short plain-text summary, the
picture's address and the link are kept: a story is read on its publisher's site. The Guardian offers its feeds for personal,
non-commercial use; BBC's and ESPN's current terms were not confirmed (the BBC page reachable was a 2011 copy).

`api:fetch` also reads The Guardian's feed for each club that has one (`https://www.theguardian.com/football/<tag>/rss`, the tag per club in
`data/api/guardian-feeds.json`: 122 of the 156 clubs; found by trying the club's name as a tag and keeping a feed only when its stories are about the
club). The requests go three at a time with a pause between, because the Guardian rate-limits bursts; a club whose feed fails keeps its saved copy in
`data/news/club/`. Those tags are the Guardian's own, so a roundup ("European football: ...") appears under every club it covers.

A story is tagged with a club when the club's name, or a well-known short name ("Man Utd", "Spurs"), appears as whole words in the
headline, the summary or the feed's own tags. A short name that could mean two clubs ("United", "Manchester", "Madrid") is left out, so a
story may be missed but is not filed under the wrong club; a one-word name needs a capital letter ("Nice" the club, not "nice"). Stories
that only name a player are not tagged. The iPhone app has the same rules (`Golboard/Follow.swift`); the tests hold the same cases.

The homepage carries both too (`src/views/HomeView.vue`): its Headlines box shows the six newest stories from `api/v1/news.json` with an All /
Following switch (Following adds each followed club's own `news/<id>.json`), a star beside each club in its table follows the club, and the marked row and the poster's first game are a followed club's
(Juventus, the old fixed favourite, only while nothing is followed). Serie A's rows come from football-data's own names ("Inter", "Como 1907"), so
`src/data/clubid.ts` gives each the site's id (the rule of `teams.mjs`; a test holds the real feed's 20 names against the API's 20 ids).

`pages.mjs` also writes `/news/` (every headline, with an All / Following switch) and `/following/` (pick clubs; their league and European games from
`api/v1/today.json`; their headlines), and puts a star beside each club in the league tables and a Follow button on each club page.
`/leagues/follow.js`, served from the site itself so the CSP needs nothing new, keeps the followed clubs on the device
(`localStorage` key `golboard.following`, a list of team ids). The headlines are only as fresh as the last build, as is everything else
on these pages.

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
- **Game detail (lineups, timeline, shots, touch zones):** ESPN's football feeds, read by `scripts/api/fetch-espn.mjs` and reduced
  to our own small summary by `scripts/api/espn.mjs`. **Salah's decision, 25 November 2026: use them while golboard has no customers.**
  ESPN's terms (Disney's Terms of Use) allow personal, non-commercial use only and forbid automated access and public display without
  written permission; the feeds are undocumented and can change or close. So: only the build asks, never a visitor's browser; one
  scoreboard per league per day for the last three days, then each finished game once, six hours after kick-off, at most 40 a run;
  betting blocks are dropped; we publish our summary (counts by zone, shots), never the feeds. The Pages workflow keeps `data/espn`
  between runs so each run asks only for new games. Each game file links to ESPN's page for it. Checked on 25 November 2026: in
  Juventus 4-0 Venezia the shots per side (13 and 13) and Venezia's expected goals (0.83) equal ESPN's own box score; the goals in the
  timeline equal the score in every game read. Eredivisie and Primeira Liga shots carry no expected goals.
- **A second witness:** a score Wikipedia's grid filled in that ESPN's game contradicts is not used; the game waits for openfootball
  and `meta.json` names it (`espn.overruled`). On 23 November 2026 the grid said Juventus 0-10 Venezia for a 4-0, and the table had
  counted it.
- **Tournaments:** English Wikipedia pages (CC BY-SA 4.0), one match box per game with the date, the kick-off (a local time with its
  UTC offset, or Central European time for UEFA's) and the score (`scripts/api/tournament.mjs`; `data/api/tournaments.json` names the
  pages and what each one's headings mean). A tournament's pages are saved together or not at all, so a table never mixes two days. A score on a game dated the build day or later is not used yet. Group
  tables use CAF's rules: points, then head-to-head points, goal difference, goals and away goals, then overall goal difference and goals.
  A host (Kenya, Tanzania, Uganda) is in the finals already; its group sends the host and the best of the rest. On 14 November 2026 our
  Group A matched Wikipedia's own table, and later all twelve did; all 72 Champions League scores equal Wikipedia's separate results grid;
  Nations League groups A4, B1, B2 and B4 match the order Wikipedia's editors typed (`tests/api-tournament.test.ts`). UEFA's league
  phases use UEFA's in-season rules: points, goal difference, goals, away goals, wins, away wins.
- **Teams never shown:** `data/api/tournaments.json` `hide` (Israel: the national team, and clubs by their flag). Their rows and games
  are left out; every other team's record still counts its games against them, so places and zones stay true.
- **Tables are computed, never copied**, with each league's own tie-break rules (`data/api/leagues.json`) and any points a league took
  away (`data/api/adjustments.json`, each with its reason and source).
- **Checked against the official record** (`tests/api.test.ts`): for 2025-26, all 3,016 league scores equal the official results, and all
  eight final tables equal the official tables in order, games, goals and points. Four scores openfootball had missing or wrong are put
  right in `data/api/corrections.json`, each citing its source; a correction the source no longer needs stops the build.
- **Nothing broken is published:** a build checks every season (duplicate ids, a team playing itself, impossible scores, unknown teams)
  and writes nothing if any check fails, so the last good API stays up. A download that fails keeps the saved copy.

## Not here yet

- The AFCON finals (Kenya, Tanzania and Uganda, from 19 June 2027): groups, then a knockout bracket.
- The cups and AFCON in the app's home league choices; the cups' knockout rounds. (`today.json` has their games since 14 November 2026,
  under the tournament's id; the app skips an id it does not know.)

- Same-day and live results: SportScore's free API (attribution required, measured against ESPN on 31 October) or football-data.org once
  its terms for apps are confirmed.
- A schedule: a job that rebuilds every 30 minutes on match days. Netlify's free build minutes are too few for that, so it will publish
  from a separate place.
- Game detail and pages for the cups and internationals (ESPN has them all; AFCON qualifying without positions).
- Live minute-by-minute scores (licensed by the leagues), club crests and league logos (trademarks).
