<template>
  <section class="home">
    <p class="greeting">Hello,&nbsp;<code>stranger!</code></p>
    <p class="welcome">
      Welcome and enjoy checking the latest scores and table standings for your favorite Italian club in Serie A.
    </p>
    <img class="logo" src="/seriea.png" alt="Italian Serie A Logo" width="510" height="437" />
    <div class="cta">
      <router-link to="/standings">League Table</router-link>
      <router-link to="/results">Match Results</router-link>
    </div>
  </section>
</template>
