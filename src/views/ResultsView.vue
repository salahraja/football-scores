<script setup lang="ts">
import { getResults } from "../data";
import { groupByRound, outcome } from "../data/helpers";
const rounds = [...groupByRound(getResults())];
</script>

<template>
  <section>
    <h1>Match Results</h1>
    <p class="note">Sample data</p>
    <template v-for="[round, events] in rounds" :key="round">
      <h2 class="round">Matchday {{ round }}</h2>
      <div class="cards">
        <article v-for="e in events" :key="e.id" class="card" :data-outcome="outcome(e.homeScore.current, e.awayScore.current)">
          <p class="status">{{ e.status.type }}</p>
          <div class="teams">
            <div class="side">
              <span class="score">{{ e.homeScore.current }}</span>
              <h3>{{ e.homeTeam.name }}</h3>
            </div>
            <span class="vs">vs</span>
            <div class="side">
              <span class="score">{{ e.awayScore.current }}</span>
              <h3>{{ e.awayTeam.name }}</h3>
            </div>
          </div>
          <p class="status">Matchday {{ e.roundInfo.round }}</p>
        </article>
      </div>
    </template>
  </section>
</template>
