<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { getDataNote, getResultRounds, getStandings } from "../data";
import { competitions, league as loadLeague, zoneOf, type Competition, type League } from "../data/leagues";
import { covered, today, type TodayGame } from "../data/live";
import { clubColour } from "../data/clubColours";

// The homepage (Salah, 2026-10-30, the Stadio "Poster" with glass boxes): the league's name and the newest round's result set as a
// poster (Juventus's when they played), then the table, the round's results, and places for top scorers and headlines that stay empty
// until their data exists. Since 2026-11-07 any of the eight leagues (Salah: the home page should carry what the league pages have).
// Serie A, shown first, keeps its fresher feed; the others come from the site's own API, and show only once they have arrived.
const FAVOURITE = "Juventus";
const HOME = "it-1";

const table = getStandings();
const newest = computed(() => getResultRounds()[0]);
const note = getDataNote();

const list = ref<Competition[]>([]);
// Built as HTML with Serie A chosen; the league in the address, if any, is opened once the page runs (so the built HTML and the
// first render in the browser agree).
const chosen = ref(HOME);
const loaded = ref<Record<string, League>>({});
const failed = ref(false);
const pick = ref<HTMLElement | null>(null);
const other = computed(() => (chosen.value === HOME ? null : loaded.value[chosen.value] ?? null));
const zones = computed(() => loaded.value[chosen.value]?.zones ?? []);
const zoneNote = computed(() => loaded.value[chosen.value]?.note ?? "");
const clubIds = computed(() => Object.fromEntries((loaded.value[HOME]?.table ?? []).map((r) => [r.name, r.id])));

function zoneClass(position: number) {
  const zone = zoneOf(zones.value, position);
  return zone ? `zone--${zone.kind}` : "";
}
// A name's longest word sets its size in the poster, so "Manchester" fits beside the score and never breaks mid-word.
function longestWord(name: string) {
  return Math.max(...name.split(/\s+/).map((w) => w.length));
}
function places(z: { from: number; to: number }) {
  return z.from === z.to ? `${z.from}` : `${z.from}–${z.to}`;
}
async function open(id: string) {
  failed.value = false;
  const c = list.value.find((x) => x.id === id);
  if (!c || loaded.value[id]) return;
  try {
    loaded.value = { ...loaded.value, [id]: await loadLeague(c) };
  } catch {
    failed.value = true;
  }
}
function choose(id: string) {
  chosen.value = id;
  const url = new URL(window.location.href);
  if (id === HOME) url.searchParams.delete("league");
  else url.searchParams.set("league", id);
  window.history.replaceState(window.history.state, "", url);
}
// The poster's arrows, as on the league pages: one pair walks the leagues, one the round's games, and both go round at the ends.
const title = computed(() => other.value?.name ?? "Serie A");
const longName = computed(() => title.value.includes(" ")); // each word its own line on a phone: taller and bolder, never squeezed
// Salah, 2026-11-07: "live scores should always show first". Today's games lead whenever there are any, with those on now at the front; the last round fills in.
const todays = ref<Record<string, TodayGame[]>>({});
const nowGames = computed(() => todays.value[chosen.value] ?? []);
const games = computed(() => {
  if (nowGames.value.length) return nowGames.value.map((g) => ({ home: g.home, away: g.away, score: g.score, status: g.status, text: g.text }));
  if (other.value) return other.value.matches.map((m) => ({ home: m.home, away: m.away, score: m.score as [number, number] | null, status: "finished", text: other.value!.round }));
  return (newest.value?.events ?? []).map((e) => ({ home: e.homeTeam.name, away: e.awayTeam.name, score: [e.homeScore.current, e.awayScore.current] as [number, number] | null, status: "finished", text: `Matchday ${newest.value?.round} · ${note}` }));
});
const shown = ref(0); // how far the arrows have moved from the first game shown
const first = computed(() => {
  if (games.value[0]?.status === "live") return 0;
  return Math.max(0, games.value.findIndex((g) => g.home === FAVOURITE || g.away === FAVOURITE));
});
const game = computed(() => {
  const all = games.value;
  return all.length ? all[(((first.value + shown.value) % all.length) + all.length) % all.length] : null;
});
const meta = computed(() => game.value?.text ?? "");
// the poster in the two clubs' colours (clubColours.ts); a club we have no colour for keeps the slate on its side
const clubs = computed(() => {
  const home = clubColour(game.value?.home), away = clubColour(game.value?.away);
  return home || away ? { "--home-c": home ?? "var(--club-base)", "--away-c": away ?? "var(--club-base)" } : null;
});
function liveIn(id: string) {
  return (todays.value[id] ?? []).some((g) => g.status === "live");
}
async function readToday(id: string) {
  const games = await today(id);
  todays.value = { ...todays.value, [id]: games }; // spread after the wait: leagues arrive in any order, and none may overwrite another
}
let poll: ReturnType<typeof setInterval> | undefined;
onUnmounted(() => clearInterval(poll));
function stepGame(by: number) {
  slide.value = { name: by > 0 ? "from-right" : "from-left", league: false };
  shown.value += by;
}
// A swipe on a phone or tablet does what the arrows do: on the score it changes the game, anywhere else on the poster the league. Mostly-sideways only, so scrolling
// down the page stays a scroll.
const SWIPE = 45;
// Salah, 2026-11-07: the name goes tall into the space above it, and stays bold ("I like the bolder look vs skinnier look"): a capped stretch, with a heavier outline to hold the weight.
const titleEl = ref<HTMLElement | null>(null);
function stretchTitle() {
  const el = titleEl.value;
  if (!el) return;
  el.style.setProperty("--stretch", "1");
  el.style.marginTop = "0";
  const phone = window.innerWidth <= 760;
  const room = window.innerHeight * (phone ? 0.38 : 0.46);
  const stretch = Math.min(1.75, Math.max(1, room / Math.max(el.offsetHeight, 1)));
  el.style.setProperty("--stretch", String(stretch));
  el.style.marginTop = `${el.offsetHeight * (stretch - 1)}px`;
}
watch([title, titleEl], async () => {
  await nextTick();
  stretchTitle();
});
onMounted(() => {
  stretchTitle();
  document.fonts?.ready?.then(stretchTitle);
  window.addEventListener("resize", stretchTitle);
});
onUnmounted(() => window.removeEventListener("resize", stretchTitle));
// Which way the new league or game slides in, and whether the league moved too: a game alone leaves the league's name still
// (Salah, 2026-11-07: "the league also refreshes even though I'm not swiping that").
const slide = ref<{ name: string; league: boolean }>({ name: "", league: false });
let slideDone: ReturnType<typeof setTimeout> | undefined;
watch(slide, ({ name }) => {
  clearTimeout(slideDone);
  if (name) slideDone = setTimeout(() => (slide.value = { name: "", league: false }), 260); // handed back, so the scroll's own drift runs again
});
let touch: { x: number; y: number; game: boolean } | null = null;
function swipeStart(e: TouchEvent) {
  const t = e.changedTouches[0];
  touch = { x: t.clientX, y: t.clientY, game: !!(e.target as Element | null)?.closest?.('[data-swipe="game"]') };
}
function swipeEnd(e: TouchEvent) {
  if (!touch) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touch.x;
  const dy = t.clientY - touch.y;
  const onGame = touch.game;
  touch = null;
  if (Math.abs(dx) < SWIPE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  const by = dx < 0 ? 1 : -1;
  if (onGame && games.value.length > 1) stepGame(by);
  else if (list.value.length) step(by);
}
function neighbour(by: number) {
  const at = list.value.findIndex((c) => c.id === chosen.value);
  return list.value[(at + by + list.value.length) % list.value.length].name;
}
function step(by: number) {
  slide.value = { name: by > 0 ? "from-right" : "from-left", league: true };
  const at = list.value.findIndex((c) => c.id === chosen.value);
  choose(list.value[(at + by + list.value.length) % list.value.length].id);
}
watch(other, () => {
  shown.value = 0;
});
watch(chosen, async (id) => {
  await nextTick();
  pick.value?.querySelector(".on")?.scrollIntoView?.({ inline: "center", block: "nearest", behavior: "smooth" });
  await open(id);
});
onMounted(async () => {
  const asked = new URLSearchParams(window.location.search).get("league");
  if (asked) chosen.value = asked;
  try {
    list.value = await competitions();
    await open(HOME);
    if (chosen.value !== HOME) await open(chosen.value);
    await Promise.all(list.value.map((c) => readToday(c.id)));
    // nothing on in the first league and a game on elsewhere: open on the game that is on, unless the address asked for a league
    if (!new URLSearchParams(window.location.search).get("league") && !liveIn(HOME)) {
      const on = list.value.find((c) => liveIn(c.id));
      if (on) choose(on.id);
    }
    poll = setInterval(() => {
      if (covered(chosen.value) && nowGames.value.some((g) => g.status !== "finished")) readToday(chosen.value);
    }, 60000);
  } catch {
    list.value = []; // the Serie A board stands on its own
  }
});
</script>

<template>
  <section class="board">
    <!-- The poster, as on the league pages: the league's name between its arrows, then a game between its arrows (Juventus's first when they played). -->
    <section v-if="game" class="poster" data-test="hero" aria-label="Featured result" @touchstart.passive="swipeStart" @touchend.passive="swipeEnd">
      <div v-if="clubs" :key="`${game.home}-${game.away}`" class="poster__club" :style="clubs" aria-hidden="true"></div>
      <div class="poster__titlebar" :key="title" :class="slide.league ? slide.name : ''">
        <button v-if="list.length" type="button" class="arrow" :aria-label="`Previous league: ${neighbour(-1)}`" data-test="league-prev" @click="step(-1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12H6M12 5l-7 7 7 7" /></svg></button>
        <h1 ref="titleEl" class="poster__title" :aria-label="title">
          <span class="poster__line" :class="{ wide: longName }" :style="{ '--len': title.length }">{{ title }}</span>
          <template v-if="longName"><span v-for="w in title.split(' ')" :key="w" class="poster__word" :style="{ '--chars': w.length }" aria-hidden="true">{{ w }}</span></template>
        </h1>
        <button v-if="list.length" type="button" class="arrow" :aria-label="`Next league: ${neighbour(1)}`" data-test="league-next" @click="step(1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12h16M12 5l7 7-7 7" /></svg></button>
      </div>
      <div class="poster__result" data-swipe="game" :key="`${game.home}-${game.away}`" :class="slide.name">
        <span class="poster__team home" :style="{ '--word': longestWord(game.home) }">{{ game.home }}</span>
        <span class="poster__score">{{ game.score ? `${game.score[0]}–${game.score[1]}` : "v" }}</span>
        <span class="poster__team away" :style="{ '--word': longestWord(game.away) }">{{ game.away }}</span>
        <div v-if="games.length > 1" class="poster__gamenav">
          <button type="button" class="arrow long" aria-label="Previous game" data-test="game-prev" @click="stepGame(-1)"><svg viewBox="0 0 48 24" aria-hidden="true"><path d="M47 12H6M12 5l-7 7 7 7" /></svg></button>
          <button type="button" class="arrow long" aria-label="Next game" data-test="game-next" @click="stepGame(1)"><svg viewBox="0 0 48 24" aria-hidden="true"><path d="M1 12h41M36 5l7 7-7 7" /></svg></button>
        </div>
        <p class="poster__meta" :class="{ onair: game.status === 'live' }" data-test="state">{{ meta }}</p>
      </div>
      <nav v-if="list.length" ref="pick" class="pick" aria-label="Choose a league" data-test="leagues">
        <button v-for="c in list" :key="c.id" type="button" :aria-pressed="chosen === c.id" :class="{ on: chosen === c.id }" data-test="league" @click="choose(c.id)"><span v-if="liveIn(c.id)" class="ondot" aria-label="Live now"></span>{{ c.name }}</button>
      </nav>
      <p v-if="nowGames.length" class="poster__credit">Live scores powered by <a href="https://sportscore.com">SportScore</a></p>
    </section>
    <p v-if="failed" class="note" role="status" data-test="league-failed">That league could not be read just now. <button type="button" class="again" @click="open(chosen)">Try again</button></p>

    <div class="sheet">
    <div class="board__grid">
      <section class="glass" data-test="table" aria-labelledby="t-table">
        <h2 id="t-table">The table</h2>
        <table class="mini">
          <thead><tr><th class="left">#</th><th class="left">Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr></thead>
          <tbody>
            <template v-if="other">
              <tr v-for="row in other.table" :key="row.id" :class="zoneClass(row.position)">
                <td class="pos">{{ row.position }}</td><td class="left"><a class="club" :href="`/leagues/${other.id}/${row.id}/`">{{ row.name }}</a></td><td>{{ row.played }}</td><td>{{ row.won }}</td>
                <td>{{ row.drawn }}</td><td>{{ row.lost }}</td><td class="pts">{{ row.points }}</td>
              </tr>
            </template>
            <template v-else>
            <tr v-for="row in table" :key="row.id" :class="[{ mine: row.team.name === FAVOURITE }, zoneClass(row.position)]">
              <td class="pos">{{ row.position }}</td><td class="left"><a v-if="clubIds[row.team.name]" class="club" :href="`/leagues/it-1/${clubIds[row.team.name]}/`">{{ row.team.name }}</a><template v-else>{{ row.team.name }}</template></td><td>{{ row.matches }}</td><td>{{ row.wins }}</td>
              <td>{{ row.draws }}</td><td>{{ row.losses }}</td><td class="pts">{{ row.points }}</td>
            </tr>
                      </template>
</tbody>
        </table>
        <ul v-if="zones.length" class="zones" data-test="zones">
          <li v-for="z in zones" :key="z.kind" :class="`zone--${z.kind}`"><span class="zones__key"></span>{{ places(z) }} {{ z.label }}</li>
        </ul>
        <p v-if="zoneNote" class="note zones__note">{{ zoneNote }}</p>
        <a v-if="other" class="more" :href="`/leagues/${other.id}/`">Full table</a>
        <a v-else class="more" href="/standings">Full table</a>
      </section>

      <div class="board__side">
        <section class="glass" data-test="round" aria-labelledby="t-round">
          <template v-if="nowGames.length">
            <h2 id="t-round">Today</h2>
            <div v-for="m in nowGames" :key="m.home" class="match" :class="{ onair: m.status === 'live' }">
              <span class="match__h">{{ m.home }}</span>
              <span class="dent match__s">{{ m.score ? `${m.score[0]}–${m.score[1]}` : m.text.replace("Today ", "") }}</span>
              <span>{{ m.away }}</span>
            </div>
            <a class="more" :href="`/leagues/${chosen}/`">All results</a>
          </template>
          <template v-else-if="other">
            <h2 id="t-round">{{ other.round }}</h2>
            <div v-for="m in other.matches" :key="m.id" class="match">
              <span class="match__h">{{ m.home }}</span>
              <span class="dent match__s">{{ m.score[0] }}–{{ m.score[1] }}</span>
              <span>{{ m.away }}</span>
            </div>
            <a class="more" :href="`/leagues/${other.id}/`">All results</a>
          </template>
          <template v-else>
            <h2 id="t-round">Matchday {{ newest?.round }}</h2>
            <div v-for="m in newest?.events ?? []" :key="m.id" class="match">
              <span class="match__h">{{ m.homeTeam.name }}</span>
              <span class="dent match__s">{{ m.homeScore.current }}–{{ m.awayScore.current }}</span>
              <span>{{ m.awayTeam.name }}</span>
            </div>
            <a class="more" href="/results">All results</a>
          </template>
        </section>
        <section class="glass accent" data-test="scorers" aria-labelledby="t-scorers">
          <h2 id="t-scorers">Top scorers</h2>
          <p class="slot">Goals, assists and penalties arrive with the live build.</p>
        </section>
        <section class="glass dark" data-test="headlines" aria-labelledby="t-news">
          <h2 id="t-news">Headlines</h2>
          <p class="slot">A news feed we are allowed to show, still to choose.</p>
        </section>
      </div>
    </div>
    </div>
  </section>
</template>
