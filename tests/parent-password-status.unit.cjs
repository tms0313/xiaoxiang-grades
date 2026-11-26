const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const edgeFunctionSource = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "functions", "admin-parent-password-status", "index.ts"),
  "utf8"
);
const helperMatch = edgeFunctionSource.match(
  /function classifyParentPasswordStatus\(user: any\) \{[\s\S]*?\n\}/
);

assert.ok(helperMatch, "password status classifier must exist in the Edge Function");

const sandbox = { Date, Number };
const helperSource = helperMatch[0].replace("(user: any)", "(user)");
vm.runInNewContext(
  helperSource + "\nthis.classifyParentPasswordStatus = classifyParentPasswordStatus;",
  sandbox
);

const classify = sandbox.classifyParentPasswordStatus;
const requiredAt = "2026-11-26T10:00:00.000Z";

test("new account with no login is waiting for its first password change", () => {
  assert.equal(classify({
    app_metadata: {
      must_change_password: true,
      password_change_required_at: requiredAt
    },
    last_sign_in_at: null
  }), "not_logged_in_pending");
});

test("login before the latest reset does not count as a post-reset login", () => {
  assert.equal(classify({
    app_metadata: {
      must_change_password: true,
      password_change_required_at: requiredAt
    },
    last_sign_in_at: "2026-11-26T09:59:59.000Z"
  }), "not_logged_in_pending");
});

test("login after the latest reset is waiting for password change", () => {
  assert.equal(classify({
    app_metadata: {
      must_change_password: true,
      password_change_required_at: requiredAt
    },
    last_sign_in_at: "2026-11-26T10:00:01.000Z"
  }), "logged_in_pending");
});

test("explicit completed marker means password change is complete", () => {
  assert.equal(classify({
    app_metadata: {
      must_change_password: false,
      password_changed_at: "2026-11-26T10:05:00.000Z"
    },
    last_sign_in_at: "2026-11-26T10:00:01.000Z"
  }), "completed");
});

test("legacy account with sign-in history but no marker remains unknown", () => {
  assert.equal(classify({
    app_metadata: {},
    last_sign_in_at: "2026-11-20T10:00:00.000Z"
  }), "legacy_unknown");
});

test("legacy account that never signed in remains unknown, not assumed unchanged", () => {
  assert.equal(classify({
    app_metadata: {},
    last_sign_in_at: null
  }), "never_logged_in_unknown");
});

test("pending marker without a valid required timestamp is not over-interpreted", () => {
  assert.equal(classify({
    app_metadata: { must_change_password: true },
    last_sign_in_at: "2026-11-20T10:00:00.000Z"
  }), "pending_login_unknown");
});
