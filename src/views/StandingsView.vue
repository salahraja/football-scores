<script setup lang="ts">
import StandingsTable from "../components/StandingsTable.vue";
import { getDataNote, getStandings } from "../data";
const rows = getStandings();
const note = getDataNote();
</script>

<template>
  <section>
    <h1>League Table</h1>
    <p class="note">{{ note }}</p>
    <StandingsTable :rows="rows" :note="note" />
  </section>
</template>
