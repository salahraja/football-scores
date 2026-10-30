<script setup lang="ts">
import { computed } from "vue";
import { getDataNote, getResultRounds, getStandings } from "../data";

// The homepage as a matchday board (Salah, 2026-10-30, "Stadio clay"): the newest round's result as the hero (Juventus's when they
// played), the table, the round's results, and places for top scorers and headlines that stay empty until their data exists.
const FAVOURITE = "Juventus";
const KITS: Record<string, string> = { Juventus: "juve", Milan: "milan", Inter: "inter", Napoli: "napoli", Roma: "roma", Lazio: "lazio", Atalanta: "atalanta", Fiorentina: "fiorentina" };

const table = getStandings();
const newest = computed(() => getResultRounds()[0]);
const featured = computed(() => newest.value?.events.find((e) => [e.homeTeam.name, e.awayTeam.name].includes(FAVOURITE)) ?? newest.value?.events[0]);
const note = getDataNote();
const kitOf = (name: string) => KITS[name] ?? "";
</script>

<template>
  <section class="board">
    <header class="board__head">
      <p class="board__kick">Serie A</p>
      <h1 class="board__title">Matchday {{ newest?.round }}</h1>
      <p class="note">{{ note }}</p>
    </header>

    <section v-if="featured" class="clay hero" data-test="hero" aria-label="Featured result">
      <div class="hero__side">
        <span class="kit" :class="kitOf(featured.homeTeam.name) || 'kit--plain'" aria-hidden="true">{{ kitOf(featured.homeTeam.name) ? "" : featured.homeTeam.name.slice(0, 3) }}</span>
        <span class="hero__team">{{ featured.homeTeam.name }}</span>
      </div>
      <span class="clay accent pebble">{{ featured.homeScore.current }}–{{ featured.awayScore.current }}</span>
      <div class="hero__side">
        <span class="kit" :class="kitOf(featured.awayTeam.name) || 'kit--plain'" aria-hidden="true">{{ kitOf(featured.awayTeam.name) ? "" : featured.awayTeam.name.slice(0, 3) }}</span>
        <span class="hero__team">{{ featured.awayTeam.name }}</span>
      </div>
      <p class="hero__when">Full time · Matchday {{ featured.roundInfo.round }}</p>
    </section>

    <div class="board__grid">
      <section class="clay" data-test="table" aria-labelledby="t-table">
        <h2 id="t-table">The table</h2>
        <table class="mini">
          <thead><tr><th>#</th><th class="left">Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr></thead>
          <tbody>
            <tr v-for="row in table" :key="row.id" :class="{ mine: row.team.name === FAVOURITE }">
              <td>{{ row.position }}</td><td class="left">{{ row.team.name }}</td><td>{{ row.matches }}</td><td>{{ row.wins }}</td>
              <td>{{ row.draws }}</td><td>{{ row.losses }}</td><td class="pts">{{ row.points }}</td>
            </tr>
          </tbody>
        </table>
        <router-link class="more" to="/standings">Full table</router-link>
      </section>

      <div class="board__side">
        <section class="clay" data-test="round" aria-labelledby="t-round">
          <h2 id="t-round">Matchday {{ newest?.round }}</h2>
          <div v-for="m in newest?.events ?? []" :key="m.id" class="match">
            <span class="match__h">{{ m.homeTeam.name }}</span>
            <span class="dent match__s">{{ m.homeScore.current }}–{{ m.awayScore.current }}</span>
            <span>{{ m.awayTeam.name }}</span>
          </div>
          <router-link class="more" to="/results">All results</router-link>
        </section>
        <section class="clay accent" data-test="scorers" aria-labelledby="t-scorers">
          <h2 id="t-scorers">Top scorers</h2>
          <p class="slot">Goals, assists and penalties arrive with the live build.</p>
        </section>
        <section class="clay" data-test="headlines" aria-labelledby="t-news">
          <h2 id="t-news">Headlines</h2>
          <p class="slot">A news feed we are allowed to show, still to choose.</p>
        </section>
      </div>
    </div>
  </section>
</template>
