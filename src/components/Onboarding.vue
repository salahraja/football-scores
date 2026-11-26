<script setup lang="ts">
// The setup (Salah, 2026-11-25: "an onboarding process for setting up for users, like teams, national teams, leagues, players"): four
// steps over the site's own API, every choice kept on the device (data/follow.ts). Clubs and national teams join the stars' list.
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { competitions } from "../data/leagues";
import { loadFollowing, loadLeagues, loadPlayers, markSetup, saveFollowing, saveLeagues, savePlayers, type FollowedPlayer } from "../data/follow";

const emit = defineEmits<{ done: [] }>();
interface Comp { id: string; name: string; season: string; kind: "league" | "clubs" | "nations" }
interface Player { id: string; name: string; team: string; number: number | null; position: string | null; league: string; club: string }

const STEPS = ["Your leagues", "Your clubs", "National teams", "Players"] as const;
const step = ref(0);
const comps = ref<Comp[]>([]);
const leagues = ref<string[]>(loadLeagues());
const follow = ref<string[]>(loadFollowing());
const players = ref<FollowedPlayer[]>(loadPlayers());
const search = ref("");
const teamsOf = ref<Record<string, Record<string, string>>>({});
const squad = ref<Player[]>([]);
const box = ref<HTMLElement | null>(null);

async function read<T>(path: string): Promise<T | null> {
  try {
    const reply = await fetch(`/api/v1/${path}`);
    return reply.ok ? ((await reply.json()) as T) : null;
  } catch {
    return null;
  }
}
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

onMounted(async () => {
  const [l, t] = await Promise.all([competitions().catch(() => []), read<{ tournaments: { id: string; name: string; season: string; teams: string }[] }>("tournaments.json")]);
  comps.value = [...l.map((c) => ({ id: c.id, name: c.name, season: c.current, kind: "league" as const })),
    ...(t?.tournaments ?? []).map((c) => ({ id: c.id, name: c.name, season: c.season, kind: (c.teams === "nations" ? "nations" : "clubs") as Comp["kind"] }))];
  box.value?.focus();
});

async function teams(c: Comp) {
  if (!teamsOf.value[c.id]) teamsOf.value = { ...teamsOf.value, [c.id]: (await read<{ teams: Record<string, string> }>(`${c.id}/${c.season}/teams.json`))?.teams ?? {} };
  return teamsOf.value[c.id];
}
// the clubs of the chosen leagues and club cups (all the leagues when none is chosen); the national teams of every international
const clubComps = computed(() => {
  const chosen = comps.value.filter((c) => c.kind !== "nations" && leagues.value.includes(c.id));
  return chosen.length ? chosen : comps.value.filter((c) => c.kind === "league");
});
const options = ref<{ id: string; name: string }[]>([]);
async function loadOptions() {
  const from = step.value === 1 ? clubComps.value : comps.value.filter((c) => c.kind === "nations");
  const all = new Map<string, string>();
  for (const c of from) for (const [id, name] of Object.entries(await teams(c))) if (!all.has(id)) all.set(id, name);
  options.value = [...all].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}
async function loadSquads() {
  const from = clubComps.value.filter((c) => c.kind === "league");
  const out: Player[] = [];
  for (const c of from) {
    const names = await teams(c);
    const file = await read<{ players: Omit<Player, "league" | "club">[] }>(`${c.id}/${c.season}/players.json`);
    for (const p of file?.players ?? []) out.push({ ...p, league: c.id, club: names[p.team] ?? p.team });
  }
  squad.value = out;
}
watch(step, async (s) => {
  search.value = "";
  if (s === 1 || s === 2) await loadOptions();
  if (s === 3) await loadSquads();
  await nextTick();
  box.value?.focus();
});

const shown = computed(() => (search.value ? options.value.filter((o) => plain(o.name).includes(plain(search.value))) : options.value));
const found = computed(() => {
  const q = plain(search.value.trim());
  return q.length < 2 ? [] : squad.value.filter((p) => plain(p.name).includes(q)).slice(0, 20);
});
const flip = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
const toggleLeague = (id: string) => { leagues.value = flip(leagues.value, id); };
const toggleTeam = (id: string) => { follow.value = flip(follow.value, id); };
const hasPlayer = (id: string) => players.value.some((p) => p.id === id);
function togglePlayer(p: Player) {
  players.value = hasPlayer(p.id) ? players.value.filter((x) => x.id !== p.id) : [...players.value, { id: p.id, name: p.name, team: p.team, league: p.league, club: p.club }];
}
function finish() {
  saveLeagues(leagues.value);
  saveFollowing(follow.value);
  savePlayers(players.value);
  markSetup("done");
  emit("done");
}
function skip() {
  markSetup("skipped");
  emit("done");
}
const kinds = [["league", "Leagues"], ["clubs", "European cups"], ["nations", "International"]] as const;
</script>

<template>
  <div class="setup" role="dialog" aria-modal="true" aria-labelledby="setup-title" data-test="setup">
    <div ref="box" class="setup__box" tabindex="-1">
      <p class="setup__count">Set up golboard · {{ step + 1 }} of {{ STEPS.length }}</p>
      <h2 id="setup-title" class="setup__title" data-test="setup-step">{{ STEPS[step] }}</h2>

      <template v-if="step === 0">
        <p class="note">Pick the competitions you follow. Home opens on the first one.</p>
        <div v-for="[kind, label] in kinds" :key="kind" class="setup__group">
          <h3>{{ label }}</h3>
          <div class="chips">
            <button v-for="c in comps.filter((x) => x.kind === kind)" :key="c.id" type="button" class="chip" :data-pick="c.id"
              :aria-pressed="leagues.includes(c.id)" @click="toggleLeague(c.id)">{{ c.name }}</button>
          </div>
        </div>
      </template>

      <template v-else-if="step === 1 || step === 2">
        <p class="note">{{ step === 1 ? "Your clubs' games come first on Home, and their headlines on Following." : "Their games show up on Home during international breaks." }}</p>
        <input v-model="search" class="setup__search" type="search" :placeholder="step === 1 ? 'Search clubs' : 'Search national teams'"
          :aria-label="step === 1 ? 'Search clubs' : 'Search national teams'" data-test="setup-search" />
        <div class="chips">
          <button v-for="o in shown" :key="o.id" type="button" class="chip" :data-club="o.id" :aria-pressed="follow.includes(o.id)"
            @click="toggleTeam(o.id)">{{ o.name }}</button>
        </div>
        <p v-if="!shown.length" class="note">None found.</p>
      </template>

      <template v-else>
        <p class="note">Find players by name. Following shows their goals and their last game.</p>
        <input v-model="search" class="setup__search" type="search" placeholder="Search players" aria-label="Search players" data-test="setup-search" />
        <ul class="setup__players">
          <li v-for="p in found" :key="p.id">
            <button type="button" class="player" :data-player="p.id" :aria-pressed="hasPlayer(p.id)" @click="togglePlayer(p)">
              <b>{{ p.name }}</b><span>{{ p.club }}<template v-if="p.number !== null"> · #{{ p.number }}</template><template v-if="p.position"> · {{ p.position }}</template></span>
            </button>
          </li>
        </ul>
        <p v-if="search.trim().length >= 2 && !found.length" class="note">No player by that name in these leagues.</p>
        <p v-if="players.length" class="note">Following: {{ players.map((p) => p.name).join(", ") }}</p>
      </template>

      <div class="setup__foot">
        <button type="button" class="link" data-test="setup-skip" @click="skip">Skip</button>
        <span class="setup__nav">
          <button v-if="step > 0" type="button" class="btn ghost" @click="step--">Back</button>
          <button v-if="step < STEPS.length - 1" type="button" class="btn" data-test="setup-next" @click="step++">Next</button>
          <button v-else type="button" class="btn" data-test="setup-done" @click="finish">Done</button>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.setup { position: fixed; inset: 0; z-index: 1001; /* above the theme button (z-index 1000), which would cover a choice */ background: var(--bg); overflow-y: auto; -webkit-overflow-scrolling: touch;
  padding: calc(16px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px)); }
.setup__box { max-width: 640px; margin: 0 auto; outline: none; padding-bottom: 96px; }
.setup__count { margin: 0; color: var(--fg-muted); font-size: 0.875rem; }
.setup__title { font: 800 clamp(2.4rem, 11vw, 4rem)/0.95 var(--font-display); text-transform: uppercase; color: var(--accent); margin: 6px 0 12px; }
.setup__group h3 { margin: 18px 0 8px; font-size: 1rem; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { font: 600 1rem var(--font-sans); padding: 10px 14px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--fg); cursor: pointer; }
/* chosen: pressed in, like the menu's current page (base.css .links a[aria-current="page"]; Salah, 2026-11-26: "a depressed button look") */
.chip, .player { transition: box-shadow 0.15s ease, background-color 0.15s ease; }
.chip[aria-pressed="true"], .player[aria-pressed="true"] { background: rgb(255 255 255 / 62%); border-color: transparent; color: #c4302a; box-shadow: inset 0 3px 6px rgb(0 0 0 / 28%), inset 0 1px 2px rgb(0 0 0 / 22%), inset 0 -1px 1px rgb(255 255 255 / 60%); }
@media (prefers-color-scheme: dark) {
  .chip[aria-pressed="true"], .player[aria-pressed="true"] { background: rgb(0 0 0 / 35%); box-shadow: inset 0 3px 7px rgb(0 0 0 / 65%), inset 0 1px 2px rgb(0 0 0 / 55%), inset 0 -1px 1px rgb(255 255 255 / 8%); }
}
@media (prefers-reduced-motion: reduce) { .chip, .player { transition: none; } }
.setup__search { width: 100%; box-sizing: border-box; font: 1rem inherit; padding: 12px 14px; margin: 4px 0 14px; border-radius: 14px; border: 1px solid var(--border); background: transparent; color: var(--fg); }
.setup__players { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.player { width: 100%; text-align: left; display: grid; gap: 2px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border); background: transparent; color: var(--fg); cursor: pointer; font: inherit; }
.player span { color: var(--fg-muted); font-size: 0.875rem; } .player[aria-pressed="true"] span { color: var(--fg-muted); }
.setup__foot { position: fixed; left: 0; right: 0; bottom: 0; display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 12px max(16px, calc(50% - 320px)) calc(12px + env(safe-area-inset-bottom, 0px)); background: var(--bg); border-top: 1px solid var(--border); }
.setup__nav { display: flex; gap: 8px; }
.btn { font: 700 1rem inherit; padding: 12px 20px; border-radius: 999px; border: 0; background: var(--accent); color: #fff; cursor: pointer; }
.btn.ghost { background: transparent; color: var(--fg); border: 1px solid var(--border); }
.link { background: none; border: 0; color: var(--fg-muted); font: 600 1rem inherit; text-decoration: underline; cursor: pointer; padding: 12px 0; }
.chip:focus-visible, .player:focus-visible, .btn:focus-visible, .link:focus-visible, .setup__search:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
</style>
