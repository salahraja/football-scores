<script setup lang="ts"></script>

<template>
  <header class="navbar">
    <nav class="links" aria-label="Main">
      <router-link to="/">Home</router-link>
      <router-link to="/standings">League Table</router-link>
      <router-link to="/results">Match Results</router-link>
      <!-- A built page outside this app, so a plain link: it opens all eight leagues, each table and each club. -->
      <a href="/leagues/">Leagues</a>
    </nav>
  </header>
</template>
