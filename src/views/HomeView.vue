<script setup lang="ts">
import { computed } from "vue";
import { getDataNote, getResultRounds, getStandings } from "../data";

// The homepage (Salah, 2026-10-30, the Stadio "Poster" with glass boxes): the league's name and the newest round's result set as a
// poster (Juventus's when they played), then the table, the round's results, and places for top scorers and headlines that stay empty
// until their data exists.
const FAVOURITE = "Juventus";

const table = getStandings();
const newest = computed(() => getResultRounds()[0]);
const featured = computed(() => newest.value?.events.find((e) => [e.homeTeam.name, e.awayTeam.name].includes(FAVOURITE)) ?? newest.value?.events[0]);
const note = getDataNote();
</script>

<template>
  <section class="board">
    <!-- The poster: the league's name set huge, then the newest round's result (Juventus's when they played). -->
    <section v-if="featured" class="poster" data-test="hero" aria-label="Featured result">
      <h1 class="poster__title">Serie A</h1>
      <div class="poster__result">
        <span class="poster__team home">{{ featured.homeTeam.name }}</span>
        <span class="poster__score">{{ featured.homeScore.current }}–{{ featured.awayScore.current }}</span>
        <span class="poster__team away">{{ featured.awayTeam.name }}</span>
      </div>
      <p class="poster__meta">Matchday {{ featured.roundInfo.round }} · {{ note }}</p>
    </section>

    <div class="board__grid">
      <section class="glass" data-test="table" aria-labelledby="t-table">
        <h2 id="t-table">The table</h2>
        <table class="mini">
          <thead><tr><th class="left">#</th><th class="left">Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr></thead>
          <tbody>
            <tr v-for="row in table" :key="row.id" :class="{ mine: row.team.name === FAVOURITE }">
              <td class="pos">{{ row.position }}</td><td class="left">{{ row.team.name }}</td><td>{{ row.matches }}</td><td>{{ row.wins }}</td>
              <td>{{ row.draws }}</td><td>{{ row.losses }}</td><td class="pts">{{ row.points }}</td>
            </tr>
          </tbody>
        </table>
        <router-link class="more" to="/standings">Full table</router-link>
      </section>

      <div class="board__side">
        <section class="glass" data-test="round" aria-labelledby="t-round">
          <h2 id="t-round">Matchday {{ newest?.round }}</h2>
          <div v-for="m in newest?.events ?? []" :key="m.id" class="match">
            <span class="match__h">{{ m.homeTeam.name }}</span>
            <span class="dent match__s">{{ m.homeScore.current }}–{{ m.awayScore.current }}</span>
            <span>{{ m.awayTeam.name }}</span>
          </div>
          <router-link class="more" to="/results">All results</router-link>
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
