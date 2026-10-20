<script setup lang="ts">
import type { StandingRow } from "../data/types";
defineProps<{ rows: StandingRow[] }>();
</script>

<template>
  <table class="standings">
    <caption class="sr-only">Serie A standings (sample data)</caption>
    <thead>
      <tr>
        <th scope="col"><span class="sr-only">Position</span></th>
        <th scope="col" class="left">Team</th>
        <th scope="col">P</th>
        <th scope="col">W</th>
        <th scope="col">D</th>
        <th scope="col">L</th>
        <th scope="col">Points</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.id">
        <td>{{ row.position }}</td>
        <th scope="row" class="left">{{ row.team.name }}</th>
        <td>{{ row.matches }}</td>
        <td>{{ row.wins }}</td>
        <td>{{ row.draws }}</td>
        <td>{{ row.losses }}</td>
        <td class="pts">{{ row.points }}</td>
      </tr>
    </tbody>
  </table>
</template>
