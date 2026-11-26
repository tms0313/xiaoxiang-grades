const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "supabase/functions/admin-create-parent-account/index.ts"),
  "utf8"
);

function loadGenerator(randomValues) {
  const start = source.indexOf("function makeTemporaryPassword()");
  assert.notEqual(start, -1, "parent initial password generator must exist");

  const end = source.indexOf("\n}\n", start);
  assert.notEqual(end, -1, "parent initial password generator must be complete");

  const functionSource = source.slice(start, end + 2);
  let calls = 0;
  const crypto = {
    getRandomValues(array) {
      assert.ok(randomValues.length > 0, "generator requested an unexpected random value");
      array[0] = randomValues.shift();
      calls += 1;
      return array;
    }
  };

  const generator = vm.runInNewContext(
    "(" + functionSource + ")",
    { crypto, Uint32Array, String, Math }
  );

  return {
    generate: generator,
    get calls() {
      return calls;
    }
  };
}

test("parent initial password is always six numeric digits, including leading zeros", () => {
  const harness = loadGenerator([42, 999999, 0]);

  assert.equal(harness.generate(), "000042");
  assert.equal(harness.generate(), "999999");
  assert.equal(harness.generate(), "000000");
  assert.equal(harness.calls, 3);
});

test("generator rejects values outside the unbiased six-digit range", () => {
  const harness = loadGenerator([0xffffffff, 0x1_0000_0000 % 1000000]);

  const password = harness.generate();

  assert.match(password, /^\d{6}$/);
  assert.equal(password, "483648");
  assert.equal(harness.calls, 2);
});
