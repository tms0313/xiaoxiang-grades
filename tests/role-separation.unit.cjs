const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("login routing accepts only the single role stored on profiles", () => {
  const auth = read("app-auth.js");
  assert.match(auth, /\.from\("profiles"\)[\s\S]*?\.select\("role"\)/);
  assert.match(auth, /\["admin", "parent", "teacher"\]\.includes\(currentProfile\.role\)/);
  assert.doesNotMatch(auth, /profile_roles|currentHasTeacher|currentMode|renderModeChooser/);
});

test("admin teacher and parent lists are separated by profiles.role", () => {
  const adminData = read("app-admin-data.js");
  assert.match(adminData, /profilesCache = allProfiles\.filter\(profile => profile\.role === "parent"\)/);
  assert.match(adminData, /teacherProfilesCache = allProfiles\.filter\(profile => profile\.role === "teacher"\)/);
  assert.doesNotMatch(adminData, /profile_roles|isAdditionalTeacherRole|teacherRoleIdsCache/);
});

test("teacher management does not create or remove additional roles on parent accounts", () => {
  const teachers = read("app-teachers.js");
  assert.doesNotMatch(teachers, /profile_roles|addTeacherRoleToParent|removeAdditionalTeacherRole|既有家長帳號增加教師身分|移除教師身分/);
  assert.match(teachers, /function createTeacherAccount/);
  assert.match(teachers, /function saveTeacherAssignment/);
});

test("role authorization migration removes profile_roles as an authorization source", () => {
  const migration = read("supabase/migrations/20261128100000_enforce_single_profile_role.sql");
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.has_app_role/);
  assert.match(migration, /FROM public\.profiles/);
  assert.match(migration, /role = p_role/);
  assert.doesNotMatch(migration, /FROM\\s+public\\.profile_roles|OR\\s+EXISTS/);
});
