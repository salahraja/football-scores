<script setup lang="ts">
import { computed } from "vue";
import { kickoffDay, phase, scoreNote, scoreText, statusText } from "../format";
import type { Match } from "../types";
import Crest from "./Crest.vue";

const props = defineProps<{ match: Match; showDay?: boolean; timeZone?: string }>();

const p = computed(() => phase(props.match.status));
const hasScore = computed(() => p.value === "live" || p.value === "finished");
const note = computed(() => (hasScore.value ? scoreNote(props.match.score) : null));
const label = computed(() => {
  const m = props.match;
  const score = hasScore.value ? `${scoreText(m.score).replace("–", " to ")}` : "";
  return `${m.homeTeam.name} v ${m.awayTeam.name}${score ? ", " + score : ""}`;
});
</script>

<template>
  <article class="match" :class="`match-${p}`" :aria-label="label">
    <router-link class="side side-home" :to="`/club/${match.homeTeam.id}`">
      <span class="team-name">{{ match.homeTeam.shortName }}</span>
      <Crest :src="match.homeTeam.crest" :name="match.homeTeam.name" />
    </router-link>
    <div class="middle">
      <span v-if="hasScore" class="score" data-test="score">{{ scoreText(match.score) }}</span>
      <span v-else class="score score-time" data-test="time">{{ statusText(match, timeZone) }}</span>
      <span v-if="note" class="score-note" data-test="note">{{ note }}</span>
      <span v-if="hasScore" class="status" :class="{ 'status-live': p === 'live' }" data-test="status">{{
        statusText(match, timeZone)
      }}</span>
      <span v-if="showDay" class="status">{{ kickoffDay(match.utcDate, timeZone) }}</span>
    </div>
    <router-link class="side side-away" :to="`/club/${match.awayTeam.id}`">
      <Crest :src="match.awayTeam.crest" :name="match.awayTeam.name" />
      <span class="team-name">{{ match.awayTeam.shortName }}</span>
    </router-link>
  </article>
</template>
