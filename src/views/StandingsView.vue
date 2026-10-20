<script setup lang="ts">
import StandingsTable from "../components/StandingsTable.vue";
import { getStandings } from "../data";
const rows = getStandings();
</script>

<template>
  <section>
    <h1>League Table</h1>
    <p class="note">Sample data</p>
    <StandingsTable :rows="rows" />
  </section>
</template>
