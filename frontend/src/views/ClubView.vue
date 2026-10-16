<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";
import { competitionName } from "../competitions";
import { kickoffDay, kickoffTime, scoreNote, scoreText } from "../format";
import { useResource } from "../useResource";
import Crest from "../components/Crest.vue";
import DataNote from "../components/DataNote.vue";
import FormChips from "../components/FormChips.vue";
import MatchCard from "../components/MatchCard.vue";
import StateBox from "../components/StateBox.vue";

const route = useRoute();
const id = computed(() => String(route.params.id));
const { data, error, loading } = useResource(() => api.team(id.value), { watch: [id] });

const form = computed(() => (data.value?.recentMatches ?? []).map((m) => ({ result: m.result, shootout: m.shootout })));

function opponent(m: { homeTeam: { id: number; shortName: string }; awayTeam: { shortName: string } }) {
  return m.homeTeam.id === data.value?.team.id ? `v ${m.awayTeam.shortName}` : `at ${m.homeTeam.shortName}`;
}
</script>

<template>
  <section aria-labelledby="club-title">
    <StateBox v-if="loading" kind="loading" message="Loading the club..." />
    <StateBox v-else-if="!data" kind="error" :message="error ?? ''" />
    <template v-else>
      <header class="club-head">
        <Crest :src="data.team.crest" :name="data.team.name" :size="72" />
        <div>
          <h1 id="club-title">{{ data.team.name }}</h1>
          <p class="lede">
            <span v-if="data.team.venue">{{ data.team.venue }}</span>
            <span v-if="data.team.venue && data.team.founded"> &middot; </span>
            <span v-if="data.team.founded">Founded {{ data.team.founded }}</span>
          </p>
        </div>
      </header>
      <DataNote :stale="data.stale" :partial="data.partial" :age="data.age" :error="error" />

      <section class="group" aria-label="Next match">
        <h2>Next match</h2>
        <MatchCard v-if="data.nextMatch" :match="data.nextMatch" show-day />
        <StateBox v-else kind="empty" message="No upcoming match is scheduled." />
      </section>

      <section class="group" aria-label="Last five">
        <h2>Last five <FormChips :items="form" /></h2>
        <StateBox v-if="!data.recentMatches.length" kind="empty" message="No finished matches yet." />
        <ul v-else class="recent">
          <li v-for="m in data.recentMatches" :key="m.id">
            <span class="chip" :class="`chip-${m.result}`" :title="m.result === 'D' && m.shootout ? (m.shootout === 'W' ? 'Draw, won on pens' : 'Draw, lost on pens') : { W: 'Win', D: 'Draw', L: 'Loss' }[m.result]">{{ m.result }}</span>
            <span class="recent-text">
              {{ opponent(m) }}
              <span class="muted">{{ kickoffDay(m.utcDate) }}, {{ kickoffTime(m.utcDate) }}</span>
            </span>
            <span class="recent-score">
              {{ scoreText(m.score) }}
              <span v-if="scoreNote(m.score)" class="muted">{{ scoreNote(m.score) }}</span>
              <span v-if="m.shootout" class="muted">{{ m.shootout === "W" ? "won" : "lost" }} on pens</span>
            </span>
          </li>
        </ul>
      </section>

      <section class="group" aria-label="League positions">
        <h2>Positions</h2>
        <StateBox v-if="!data.positions.length" kind="empty" message="No league position to show." />
        <ul v-else class="positions">
          <li v-for="p in data.positions" :key="p.competition">
            <span>{{ competitionName(p.competition) }}</span>
            <strong>{{ p.position }}<span class="muted">, {{ p.points }} pts</span></strong>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>
