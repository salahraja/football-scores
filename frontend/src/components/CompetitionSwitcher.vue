<script setup lang="ts">
import { COMPETITIONS, selectCompetition, selectedCompetition } from "../competitions";
</script>

<template>
  <div class="switcher" role="group" aria-label="Competition">
    <button
      v-for="c in COMPETITIONS"
      :key="c.code"
      type="button"
      class="pill"
      :aria-pressed="selectedCompetition === c.code"
      :title="c.name"
      @click="selectCompetition(c.code)"
    >
      {{ c.short }}
    </button>
  </div>
</template>
