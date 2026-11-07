<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { getDataNote, getResultRounds, getStandings } from "../data";
import { competitions, league as loadLeague, zoneOf, type Competition, type League } from "../data/leagues";

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
const chosen = ref(new URLSearchParams(window.location.search).get("league") ?? HOME);
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
const games = computed(() => {
  if (other.value) return other.value.matches.map((m) => ({ home: m.home, away: m.away, score: m.score }));
  return (newest.value?.events ?? []).map((e) => ({ home: e.homeTeam.name, away: e.awayTeam.name, score: [e.homeScore.current, e.awayScore.current] as [number, number] }));
});
const shown = ref(0); // how far the arrows have moved from the first game shown
const first = computed(() => Math.max(0, games.value.findIndex((g) => g.home === FAVOURITE || g.away === FAVOURITE)));
const game = computed(() => {
  const all = games.value;
  return all.length ? all[(((first.value + shown.value) % all.length) + all.length) % all.length] : null;
});
const meta = computed(() => (other.value ? other.value.round : `Matchday ${newest.value?.round} · ${note}`));
function stepGame(by: number) {
  shown.value += by;
}
function neighbour(by: number) {
  const at = list.value.findIndex((c) => c.id === chosen.value);
  return list.value[(at + by + list.value.length) % list.value.length].name;
}
function step(by: number) {
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
  try {
    list.value = await competitions();
    await open(HOME);
    if (chosen.value !== HOME) await open(chosen.value);
  } catch {
    list.value = []; // the Serie A board stands on its own
  }
});
</script>

<template>
  <section class="board">
    <!-- The poster, as on the league pages: the league's name between its arrows, then a game between its arrows (Juventus's first when they played). -->
    <section v-if="game" class="poster" data-test="hero" aria-label="Featured result">
      <div class="poster__titlebar">
        <button v-if="list.length" type="button" class="arrow" :aria-label="`Previous league: ${neighbour(-1)}`" data-test="league-prev" @click="step(-1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
        <h1 class="poster__title" :style="{ '--chars': title.length }">{{ title }}</h1>
        <button v-if="list.length" type="button" class="arrow" :aria-label="`Next league: ${neighbour(1)}`" data-test="league-next" @click="step(1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></button>
      </div>
      <div class="poster__result">
        <button v-if="games.length > 1" type="button" class="arrow prev" aria-label="Previous game" data-test="game-prev" @click="stepGame(-1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
        <span class="poster__team home" :style="{ '--word': longestWord(game.home) }">{{ game.home }}</span>
        <span class="poster__score">{{ game.score[0] }}–{{ game.score[1] }}</span>
        <span class="poster__team away" :style="{ '--word': longestWord(game.away) }">{{ game.away }}</span>
        <button v-if="games.length > 1" type="button" class="arrow next" aria-label="Next game" data-test="game-next" @click="stepGame(1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></button>
        <p class="poster__meta">{{ meta }}</p>
      </div>
    </section>
    <nav v-if="list.length" ref="pick" class="pick" aria-label="Choose a league" data-test="leagues">
      <button v-for="c in list" :key="c.id" type="button" :aria-pressed="chosen === c.id" :class="{ on: chosen === c.id }" data-test="league" @click="choose(c.id)">{{ c.name }}</button>
    </nav>
    <p v-if="failed" class="note" role="status" data-test="league-failed">That league could not be read just now. <button type="button" class="again" @click="open(chosen)">Try again</button></p>

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
        <router-link v-else class="more" to="/standings">Full table</router-link>
      </section>

      <div class="board__side">
        <section class="glass" data-test="round" aria-labelledby="t-round">
          <template v-if="other">
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
            <router-link class="more" to="/results">All results</router-link>
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
  </section>
</template>
