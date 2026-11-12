<script setup lang="ts">
// The glass nav: plain links, since each page is its own built page (no client router). `current` marks the page you are on.
defineProps<{ current?: string }>();
const pages = [
  { to: "/", label: "Home" },
  { to: "/standings", label: "League Table" },
  { to: "/results", label: "Match Results" },
];
</script>

<template>
  <header class="navbar">
    <nav class="links" aria-label="Main">
      <a v-for="p in pages" :key="p.to" :href="p.to" :aria-current="current === p.to ? 'page' : undefined">{{ p.label }}</a>
      <!-- Built by npm run api: all eight leagues, each table and each club. -->
      <a href="/leagues/">Leagues</a>
      <!-- Built by npm run api too: the headlines, and the clubs you follow (kept on the device). -->
      <a href="/news/">News</a>
      <a href="/following/">Following</a>
    </nav>
  </header>
</template>
