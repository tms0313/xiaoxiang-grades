const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "functions", "admin-reset-parent-password", "index.ts"),
  "utf8"
);

test("parent password reset validates the explicit bearer access token", () => {
  assert.match(source, /authHeader\.replace\(\/\^Bearer\\s\+\/i,\s*""\)/);
  assert.match(source, /auth\.getUser\(accessToken\)/);
  assert.doesNotMatch(source, /auth\.getUser\(\s*\)/);
});

test("parent password reset retains administrator and parent-role authorization", () => {
  assert.match(source, /adminProfile\?\.role\s*!==\s*"admin"/);
  assert.match(source, /parentProfile\.role\s*!==\s*"parent"/);
  assert.match(source, /auth\.admin\.updateUserById\(/);
});
