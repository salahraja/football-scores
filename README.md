# Football Scores

A small static site for Serie A: a home page, a league table and match results.
Built with Vue 3, TypeScript, Vue Router and Vite, styled with plain CSS
(design tokens as custom properties in `src/styles/tokens.css`, light and dark
via `prefers-color-scheme`).

## Data

The pages show **sample data** (`src/data/sample.ts`), not live results. There is
no API key, no network call and no backend. Once a host and a data API are
chosen, replace the two functions in `src/data/index.ts`.

## Run

```bash
npm install
npm run dev        # dev server
npm run build      # type check, then build to dist/
npm run preview    # serve dist/
npm test           # vitest
npm run typecheck  # vue-tsc, the checker of record
```

`npm run typecheck:tsrs` runs the experimental `tsrs` checker. It does not
understand `.vue` files, so it is not a substitute for `vue-tsc`.
