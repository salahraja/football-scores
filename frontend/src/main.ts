import { createApp } from "vue";
import App from "./App.vue";
import { makeRouter } from "./router";
import "./styles/global.css";

createApp(App).use(makeRouter()).mount("#app");
