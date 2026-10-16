import { flushPromises, mount } from "@vue/test-utils";
import { vi } from "vitest";
import { createMemoryHistory } from "vue-router";
import { makeRouter } from "../src/router";
import { route } from "./fixtures";

window.scrollTo = () => {}; // jsdom has none; the router scrolls to top on navigation

type Handler = (url: string) => [number, unknown] | Promise<[number, unknown]>;

/** Replace fetch. Anything the handler does not cover falls through to the fake API. */
export function mockFetch(handler: Handler = route) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: string) => {
    calls.push(input);
    const [status, body] = await handler(input);
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

export async function mountAt(path: string, component: object) {
  const router = makeRouter(createMemoryHistory());
  router.push(path);
  await router.isReady();
  const wrapper = mount(component, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}
