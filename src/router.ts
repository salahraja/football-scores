import { createRouter, createWebHistory } from "vue-router";
import HomeView from "./views/HomeView.vue";
import ResultsView from "./views/ResultsView.vue";
import StandingsView from "./views/StandingsView.vue";

export const routes = [
  { path: "/", name: "home", component: HomeView, meta: { title: "Football Scores" } },
  { path: "/standings", name: "standings", component: StandingsView, meta: { title: "Standings | Serie A" } },
  { path: "/results", name: "results", component: ResultsView, meta: { title: "Results | Serie A" } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.afterEach((to) => {
  document.title = (to.meta.title as string) ?? "Football Scores";
});
