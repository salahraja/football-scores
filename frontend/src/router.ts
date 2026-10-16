import { createRouter, createWebHistory } from "vue-router";
import ClubView from "./views/ClubView.vue";
import FixturesView from "./views/FixturesView.vue";
import TableView from "./views/TableView.vue";
import TodayView from "./views/TodayView.vue";

export const routes = [
  { path: "/", name: "today", component: TodayView },
  { path: "/fixtures", name: "fixtures", component: FixturesView },
  { path: "/table", name: "table", component: TableView },
  { path: "/club/:id(\\d+)", name: "club", component: ClubView },
  { path: "/:rest(.*)*", redirect: "/" },
];

export const makeRouter = (history = createWebHistory()) =>
  createRouter({
    history,
    routes,
    scrollBehavior: () => ({ top: 0 }),
  });
