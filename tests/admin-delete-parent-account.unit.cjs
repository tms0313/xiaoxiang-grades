const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "supabase/functions/admin-delete-parent-account/index.ts"),
  "utf8"
).replace(
  /^import \{ createClient \} from "https:\/\/esm\.sh\/@supabase\/supabase-js\@2";\s*/m,
  "const { createClient } = __supabaseMock;"
)
  .replace(/^import .+\\n/m, "")
  .replace(/: unknown/g, "")
  .replace(/\\)!/g, ")");

const adminId = "11111111-1111-4111-8111-111111111111";
const parentId = "22222222-2222-4222-8222-222222222222";

function createHarness({ binding = null, bindingError = null } = {}) {
  let handler;
  let deleteCalls = 0;

  const adminClient = {
    from(table) {
      let filters = {};
      const query = {
        select() {
          return query;
        },
        eq(column, value) {
          filters[column] = value;
          return query;
        },
        limit() {
          return query;
        },
        async maybeSingle() {
          if (table === "profiles" && filters.id === adminId) {
            return { data: { id: adminId, role: "admin" }, error: null };
          }
          if (table === "profiles" && filters.id === parentId) {
            return { data: { id: parentId, role: "parent" }, error: null };
          }
          if (table === "profile_roles") {
            return { data: null, error: null };
          }
          if (table === "guardian_students") {
            return { data: binding, error: bindingError };
          }
          throw new Error("Unexpected query: " + table);
        }
      };
      return query;
    },
    auth: {
      admin: {
        async deleteUser(id) {
          deleteCalls += 1;
          assert.equal(id, parentId);
          return { error: null };
        }
      }
    }
  };

  const supabaseMock = {
    createClient(_url, key) {
      if (key === "service-role") return adminClient;
      return {
        auth: {
          async getUser() {
            return { data: { user: { id: adminId } }, error: null };
          }
        }
      };
    }
  };

  const context = {
    __supabaseMock: supabaseMock,
    Deno: {
      env: {
        get(name) {
          return {
            SUPABASE_URL: "https://example.supabase.co",
            SUPABASE_ANON_KEY: "anon",
            SUPABASE_SERVICE_ROLE_KEY: "service-role"
          }[name] ?? null;
        }
      },
      serve(fn) {
        handler = fn;
      }
    },
    Response,
    console
  };

  vm.runInNewContext(source, context, {
    filename: "admin-delete-parent-account/index.ts"
  });

  return {
    async invoke() {
      const request = new Request("https://example.supabase.co/functions/v1/admin-delete-parent-account", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ parentId })
      });
      const response = await handler(request);
      return { status: response.status, body: await response.json() };
    },
    get deleteCalls() {
      return deleteCalls;
    }
  };
}

test("refuses to delete a parent account that still has student bindings", async () => {
  const harness = createHarness({
    binding: { student_id: "33333333-3333-4333-8333-333333333333" }
  });

  const result = await harness.invoke();

  assert.equal(result.status, 409);
  assert.equal(result.body.success, false);
  assert.match(result.body.error, /仍綁定學生/);
  assert.equal(harness.deleteCalls, 0);
});

test("allows deletion only after all student bindings have been removed", async () => {
  const harness = createHarness();

  const result = await harness.invoke();

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(harness.deleteCalls, 1);
});

test("fails closed when the server cannot verify student bindings", async () => {
  const harness = createHarness({
    bindingError: { message: "guardian binding lookup failed" }
  });

  const result = await harness.invoke();

  assert.equal(result.status, 500);
  assert.equal(result.body.success, false);
  assert.equal(harness.deleteCalls, 0);
});
