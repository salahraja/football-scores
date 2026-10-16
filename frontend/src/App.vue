<script setup lang="ts">
import { onMounted } from "vue";
import { findJuventus, juventusId } from "./juventus";

onMounted(findJuventus);
</script>

<template>
  <a class="skip" href="#main">Skip to content</a>
  <header class="top">
    <div class="top-inner">
      <router-link to="/" class="brand">Football<span>scores</span></router-link>
      <nav aria-label="Main">
        <router-link to="/" exact-active-class="active">Today</router-link>
        <router-link to="/fixtures" active-class="active">Fixtures</router-link>
        <router-link to="/table" active-class="active">Table</router-link>
        <router-link v-if="juventusId" :to="`/club/${juventusId}`" class="pinned" active-class="active">Juventus</router-link>
      </nav>
    </div>
  </header>
  <main id="main" tabindex="-1"><router-view /></main>
  <footer class="foot">
    <p>
      Data provided by <a href="https://www.football-data.org/" rel="noopener">football-data.org</a>. Free tier, so
      scores can lag.
    </p>
  </footer>
</template>
