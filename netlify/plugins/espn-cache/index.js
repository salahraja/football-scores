// Keeps data/espn (the ESPN games and squads that scripts/api/fetch-espn.mjs and fetch-squads.mjs save, git-ignored) in Netlify's
// build cache, so each build asks ESPN only for what is new: restored before the build command, saved after it. Without it every
// build started empty, fetched all 156 squads again, and saw only the last three days of games.
const DIR = "data/espn";

export const onPreBuild = async ({ utils }) => {
  await utils.cache.restore(DIR);
};

export const onPostBuild = async ({ utils }) => {
  await utils.cache.save(DIR);
};
