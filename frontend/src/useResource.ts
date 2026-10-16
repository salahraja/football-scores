import { onScopeDispose, ref, shallowRef, watch, type WatchSource } from "vue";
import { errorMessage } from "./api";

export const RETRY_MS = 15_000;

interface Options {
  /** Reload this often (ms) while the page is visible. */
  refreshMs?: number;
  /** Reload from scratch when any of these change. */
  watch?: WatchSource[];
}

/**
 * Load something and keep it fresh. A failure leaves the last good data on screen,
 * says why in `error`, and tries again shortly.
 */
export function useResource<T>(load: () => Promise<T>, options: Options = {}) {
  const data = shallowRef<T | null>(null);
  const error = ref<string | null>(null);
  const loading = ref(true);
  let ticket = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule(ms: number | undefined) {
    clearTimeout(timer);
    if (ms) timer = setTimeout(() => run(false), ms);
  }

  async function run(fresh: boolean) {
    const mine = ++ticket;
    if (fresh) {
      data.value = null;
      loading.value = true;
    }
    // A background refresh of a hidden tab is skipped; the next tick tries again.
    if (!fresh && typeof document !== "undefined" && document.hidden) return schedule(options.refreshMs);
    try {
      const result = await load();
      if (mine !== ticket) return;
      data.value = result;
      error.value = null;
      schedule(options.refreshMs);
    } catch (err) {
      if (mine !== ticket) return;
      error.value = errorMessage(err);
      schedule(RETRY_MS);
    } finally {
      if (mine === ticket) loading.value = false;
    }
  }

  run(true);
  if (options.watch?.length) watch(options.watch, () => run(true));
  onScopeDispose(() => {
    ticket++;
    clearTimeout(timer);
  });

  return { data, error, loading, reload: () => run(true) };
}
