import assert from "node:assert/strict";
import {
  WC2026_POOL_START_ISO,
  defaultPoolStartsAtForCompetition,
  isRegistrationClosedByPoolStart,
  shouldRedactSquadsBeforePoolStart,
} from "../participant/competition-deadline.js";

const beforeStart = new Date("2026-06-11T17:59:59+02:00").getTime();
const atStart = new Date(WC2026_POOL_START_ISO).getTime();
const afterStart = new Date("2026-06-11T18:00:01+02:00").getTime();

assert.equal(defaultPoolStartsAtForCompetition({ slug: "wc2026" }), WC2026_POOL_START_ISO);
assert.equal(
  defaultPoolStartsAtForCompetition({
    league_type: "world_cup",
    season_label: "2026",
    apiFootballSeason: 2026,
  }),
  WC2026_POOL_START_ISO,
);
assert.equal(defaultPoolStartsAtForCompetition({ league_type: "premier_league", season_label: "2024" }), null);

assert.equal(shouldRedactSquadsBeforePoolStart(WC2026_POOL_START_ISO, beforeStart), true);
assert.equal(shouldRedactSquadsBeforePoolStart(WC2026_POOL_START_ISO, atStart), false);
assert.equal(shouldRedactSquadsBeforePoolStart(WC2026_POOL_START_ISO, afterStart), false);
assert.equal(shouldRedactSquadsBeforePoolStart(null, beforeStart), true);
assert.equal(shouldRedactSquadsBeforePoolStart("not-a-date", beforeStart), true);

assert.equal(isRegistrationClosedByPoolStart({ starts_at: WC2026_POOL_START_ISO }, beforeStart), false);
assert.equal(isRegistrationClosedByPoolStart({ starts_at: WC2026_POOL_START_ISO }, atStart), true);
assert.equal(isRegistrationClosedByPoolStart({ starts_at: WC2026_POOL_START_ISO }, afterStart), true);
assert.equal(isRegistrationClosedByPoolStart({ starts_at: null }, afterStart), false);

console.log(
  JSON.stringify(
    {
      ok: true,
      checked: [
        "wc2026-default-start",
        "redact-before-start",
        "show-after-start",
        "missing-start-redacts",
        "edit-lock-at-start",
      ],
    },
    null,
    2,
  ),
);
