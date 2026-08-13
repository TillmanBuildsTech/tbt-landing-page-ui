#!/usr/bin/env node
/* CI guard: fail unless package.json's version in the working tree is
 * strictly GREATER than the version at the base ref (main). Run in workflows
 * on PRs to main:
 *   BASE_SHA=<sha> node scripts/check-version-bump.js
 * With BASE_SHA unset (manual/workflow_dispatch) the check is skipped.
 */
"use strict";
const fs = require("fs");
const { execFileSync } = require("child_process");

const BASE_SHA = (process.env.BASE_SHA || "").trim();

function readVersion(ref) {
  let txt;
  if (ref) {
    try { txt = execFileSync("git", ["show", ref + ":package.json"], { encoding: "utf8" }); }
    catch (e) { return ""; }
  } else {
    try { txt = fs.readFileSync("package.json", "utf8"); } catch (e) { return ""; }
  }
  try { return JSON.parse(txt).version || ""; } catch (e) { return ""; }
}

/* Numeric semver compare; a prerelease sorts below its release (0.2.0-rc1 < 0.2.0). */
function cmp(a, b) {
  const pa = String(a).split("-")[0].split(".").map(Number);
  const pb = String(b).split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  const aPre = String(a).includes("-"), bPre = String(b).includes("-");
  if (aPre !== bPre) return aPre ? -1 : 1;
  return 0;
}

if (!BASE_SHA) {
  console.log("No BASE_SHA (manual run) — skipping version-bump check.");
  process.exit(0);
}
if (!/^[0-9a-f]{40}$/.test(BASE_SHA)) {
  console.error("::error::BASE_SHA is not a full commit SHA (ref-injection guard).");
  process.exit(1);
}

const head = readVersion("");
const base = readVersion(BASE_SHA);

if (!head) {
  console.error("::error::package.json is missing a version on this branch.");
  process.exit(1);
}
if (!base) {
  console.error("::error::Could not read package.json version at base " + BASE_SHA + ".");
  process.exit(1);
}
if (cmp(head, base) <= 0) {
  console.error(
    "::error::Version not bumped: base=" + base + " head=" + head + ". " +
    "Run \"npm version patch --no-git-tag-version\" (or minor/major) and commit the new version."
  );
  process.exit(1);
}
console.log("Version bump OK: " + base + " → " + head);
