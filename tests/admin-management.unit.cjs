const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "app-students.js"),
  "utf8"
);

function createHarness({ studentUpdateError = null, subjectUpsertError = null } = {}) {
  const messages = [];
  const calls = [];
  let reloadCount = 0;
  const submitButton = {
    disabled: false,
    textContent: "儲存學生資料",
    isConnected: true
  };
  const elements = {
    studentEditId: { value: "student-1" },
    studentCode: { value: "G101" },
    studentName: { value: "測試學生" },
    studentClass: { value: "國一班" },
    studentForm: { querySelector: () => submitButton }
  };
  const context = {
    console,
    Intl,
    Map,
    Set,
    Array,
    String,
    Object,
    Error,
    SUBJECTS: ["國文", "英文", "數學", "自然"],
    studentsCache: [{
      id: "student-1",
      student_code: "G101",
      full_name: "原姓名",
      class_name: "國一班",
      is_active: true
    }],
    studentsByIdCache: new Map([["student-1", {
      id: "student-1",
      student_code: "G101",
      full_name: "原姓名",
      class_name: "國一班",
      is_active: true
    }]]),
    studentSubjectsCache: [],
    activeSubjectsByStudentCache: new Map(),
    document: {
      querySelectorAll(selector) {
        if (selector === "input[name='studentSubject']:checked") {
          return [{ value: "國文" }, { value: "英文" }];
        }
        return [];
      }
    },
    $(id) {
      return elements[id];
    },
    showMessage(message, type) {
      messages.push({ message, type });
    },
    rebuildAdminEntityIndexes() {},
    rebuildActiveSubjectsByStudentCache() {},
    clearStudentForm() {},
    renderStudents() {},
    async loadAdminData() {
      reloadCount += 1;
    },
    db: {
      from(table) {
        if (table === "students") {
          return {
            update(payload) {
              calls.push({ table, payload });
              return {
                async eq(column, value) {
                  calls.push({ operation: "update", column, value });
                  return { error: studentUpdateError };
                }
              };
            }
          };
        }
        if (table === "student_subjects") {
          return {
            async upsert(rows, options) {
              calls.push({ table, rows, options });
              return { error: subjectUpsertError };
            }
          };
        }
        throw new Error("Unexpected table: " + table);
      }
    }
  };

  vm.runInNewContext(source, context, { filename: "app-students.js" });
  // Keep this unit test focused on save recovery rather than rendering DOM markup.
  context.renderStudents = () => {};

  return {
    context,
    messages,
    calls,
    submitButton,
    get reloadCount() {
      return reloadCount;
    }
  };
}

test("student subject write failure reloads server state after student row was saved", async () => {
  const harness = createHarness({
    subjectUpsertError: { message: "student_subjects write denied" }
  });

  await harness.context.saveStudent({ preventDefault() {} });

  assert.equal(harness.reloadCount, 1);
  assert.equal(harness.messages.length, 1);
  assert.match(harness.messages[0].message, /學生基本資料已儲存/);
  assert.match(harness.messages[0].message, /修課科目更新失敗/);
  assert.equal(harness.messages[0].type, "error");
  assert.equal(harness.submitButton.disabled, false);
});

test("student row write failure does not trigger recovery reload", async () => {
  const harness = createHarness({
    studentUpdateError: { message: "students update denied" }
  });

  await harness.context.saveStudent({ preventDefault() {} });

  assert.equal(harness.reloadCount, 0);
  assert.equal(harness.messages.length, 1);
  assert.match(harness.messages[0].message, /學生資料儲存失敗/);
  assert.equal(harness.messages[0].type, "error");
  assert.equal(harness.submitButton.disabled, false);
});
