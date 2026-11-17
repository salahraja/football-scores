<script setup lang="ts">
// The glass nav: plain links, since each page is its own built page (no client router). `current` marks the page you are on.
defineProps<{ current?: string }>();
// One menu on every page, the same as the built league pages' (Salah, 2026-11-15). League Table and Match Results are linked from Home.
const pages = [
  { to: "/", label: "Home" },
  { to: "/leagues/", label: "Leagues" },
  { to: "/news/", label: "News" },
  { to: "/following/", label: "Following" },
];
</script>

<template>
  <header class="navbar">
    <nav class="links" aria-label="Main">
      <a v-for="p in pages" :key="p.to" :href="p.to" :aria-current="current === p.to ? 'page' : undefined">{{ p.label }}</a>
    </nav>
  </header>
</template>
