const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "app-teachers.js"),
  "utf8"
);

function createHarness() {
  const listeners = new Map();
  const content = { innerHTML: "", onclick: null };
  const elements = {
    adminContent: content,
    createTeacherForm: {
      addEventListener(type, handler) {
        listeners.set("createTeacherForm:" + type, handler);
      }
    },
    teacherAssignmentForm: {
      addEventListener(type, handler) {
        listeners.set("teacherAssignmentForm:" + type, handler);
      }
    },
    teacherAccountSelect: {
      value: "",
      addEventListener(type, handler) {
        listeners.set("teacherAccountSelect:" + type, handler);
      }
    },
    teacherAssignmentFilter: {
      value: "",
      addEventListener(type, handler) {
        listeners.set("teacherAssignmentFilter:" + type, handler);
      }
    }
  };

  const context = {
    Map,
    Set,
    Array,
    String,
    Object,
    SUBJECTS: ["國文", "英文", "數學", "自然"],
    teacherProfilesCache: [{
      id: "teacher-1",
      email: "teacher@example.com",
      isAdditionalTeacherRole: false
    }],
    teacherProfilesByIdCache: new Map(),
    teacherAssignmentsCache: [],
    escapeHtml(value) {
      return String(value ?? "");
    },
    $(id) {
      return elements[id] || null;
    }
  };

  vm.runInNewContext(source, context, { filename: "app-teachers.js" });
  context.renderTeacherManagement();

  return { context, content, listeners };
}

test("teacher management no longer offers converting an existing parent account", () => {
  const { context, content, listeners } = createHarness();

  assert.doesNotMatch(content.innerHTML, /既有家長帳號增加教師身分/);
  assert.doesNotMatch(content.innerHTML, /existingParentForTeacher|addTeacherRoleForm|增加教師身分/);
  assert.equal(listeners.has("addTeacherRoleForm:submit"), false);
  assert.equal(typeof context.addTeacherRoleToParent, "undefined");
});

test("independent teacher account and teaching assignment management remain available", () => {
  const { context, content } = createHarness();

  assert.match(content.innerHTML, /建立獨立教師帳號/);
  assert.match(content.innerHTML, /教師帳號管理/);
  assert.match(content.innerHTML, /設定授課班級與科目/);
  assert.match(content.innerHTML, /教師授課權限清單/);
  assert.equal(typeof context.createTeacherAccount, "function");
  assert.equal(typeof context.saveTeacherAssignment, "function");
});

test("legacy parent-and-teacher accounts can still have the teacher role removed", () => {
  const { context } = createHarness();

  assert.equal(typeof context.removeAdditionalTeacherRole, "function");
});
