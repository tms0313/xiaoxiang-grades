/* ==================================================
   小象文教機構｜管理員資料載入與索引
   依賴 app.js 提供的 db、快取狀態及 app-utils.js 共用工具。
   本檔在 app.js 前載入；函式只於 initializeApp 啟動後呼叫。
   ================================================== */

function hasLatestExamReachedReleaseTime(exam) {
  return isExamReleasedAt(exam, new Date());
}

async function cleanupPreviousWeekExclusions() {
  // 管理資料載入時已建立日期排序索引；週期性檢查直接重用，避免重複排序。
  const datedExams = examsByDateDescCache.filter(exam => exam.start_date || exam.end_date);

  // 必須有本週與上一週兩筆考試，且本週成績已到週六 18:00 開放時間。
  if (datedExams.length < 2 || !hasLatestExamReachedReleaseTime(datedExams[0])) {
    return;
  }

  const previousExamId = datedExams[1].id;
  const previousExamKey = String(previousExamId);

  // 快取中沒有上一週的排除紀錄時，不必再送出空的 DELETE 請求。
  const hasPreviousWeekExclusions = missingExclusionsCache.some(
    item => String(item.exam_id) === previousExamKey
  );
  if (!hasPreviousWeekExclusions) return;

  const result = await db.from("score_missing_exclusions")
    .delete()
    .eq("exam_id", previousExamId);

  if (result.error) throw result.error;

  // 同步更新前端快取，避免本次畫面仍顯示已清除的名單。
  missingExclusionsCache = missingExclusionsCache.filter(
    item => String(item.exam_id) !== previousExamKey
  );
}

async function loadAdminData() {
  const adminLoadStartedAt = performance.now();
  const adminQueriesStartedAt = performance.now();
  const measureAdminQuery = async (name, queryFactory) => {
    const startedAt = performance.now();
    const result = await fetchAllRows(queryFactory);
    return { ...result, elapsedMs: performance.now() - startedAt, metricName: name };
  };
  // profiles 原本分別查詢家長、教師及全部帳號；合併為一次讀取，降低後台啟動時的重複請求。
  const results = await Promise.all([
    measureAdminQuery("學生資料", () => db.from("students").select("id, student_code, full_name, class_name, is_active").order("id", { ascending: true })),
    measureAdminQuery("考試資料", () => db.from("exams").select("id, title, start_date, end_date").order("id", { ascending: true })),
    measureAdminQuery("全部帳號", () => db.from("profiles").select("id, role, display_name, email, phone").order("id", { ascending: true })),
    measureAdminQuery("成績資料", () => db.from("scores").select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level").order("id", { ascending: true })),
    measureAdminQuery("家長綁定資料", () => db.from("guardian_students").select("guardian_id, student_id").order("guardian_id", { ascending: true }).order("student_id", { ascending: true })),
    measureAdminQuery("學生修課資料", () => db.from("student_subjects").select("student_id, subject, is_active").order("student_id", { ascending: true }).order("subject", { ascending: true })),
    measureAdminQuery("教師授課權限", () => db.from("teacher_assignments").select("id, teacher_id, class_name, subject").order("id", { ascending: true })),
    measureAdminQuery("額外身分資料", () => db.from("profile_roles").select("user_id, role").eq("role", "teacher").order("user_id", { ascending: true })),
    measureAdminQuery("未登錄排除資料", () => db.from("score_missing_exclusions").select("id, exam_id, student_id, subject, scope").order("id", { ascending: true }))
  ]);
  const adminQueriesMs = performance.now() - adminQueriesStartedAt;

  const names = ["學生資料", "考試資料", "全部帳號", "成績資料", "家長綁定資料", "學生修課資料", "教師授課權限", "額外身分資料", "未登錄排除資料"];

  for (let i = 0; i < results.length; i++) {
    if (results[i].error) {
      throw new Error(names[i] + "讀取失敗：" + results[i].error.message);
    }
  }

  const allProfiles = results[2].data || [];
  studentsCache = results[0].data || [];
  examsCache = results[1].data || [];
  rebuildExamIndexes();
  scoresCache = results[3].data || [];
  rebuildScoresByIdCache();
  invalidateAdminHighestPreviewCache();
  guardianLinksCache = results[4].data || [];
  rebuildGuardianBindingIndexes();
  studentSubjectsCache = results[5].data || [];
  rebuildActiveSubjectsByStudentCache();
  teacherAssignmentsCache = results[6].data || [];
  profileRolesCache = results[7].data || [];
  teacherRoleIdsCache = new Set(profileRolesCache.filter(item => item.role === "teacher").map(item => String(item.user_id)));
  missingExclusionsCache = results[8].data || [];

  // 一次走訪帳號資料，同時建立家長清單與教師索引，避免重複 filter 全表。
  const additionalTeacherIds = new Set(profileRolesCache.map(item => String(item.user_id)));
  const parentProfiles = [];
  const teacherMap = new Map();
  allProfiles.forEach(profile => {
    const profileId = String(profile.id);
    if (profile.role === "parent") parentProfiles.push(profile);
    if (profile.role === "teacher") {
      teacherMap.set(profileId, {
        ...profile,
        isAdditionalTeacherRole: false
      });
    }
    if (additionalTeacherIds.has(profileId)) {
      teacherMap.set(profileId, {
        ...profile,
        isAdditionalTeacherRole: true
      });
    }
  });
  profilesCache = parentProfiles;
  rebuildAdminEntityIndexes();
  teacherProfilesCache = Array.from(teacherMap.values());
  teacherProfilesByIdCache = new Map(teacherProfilesCache.map(profile => [String(profile.id), profile]));

  // 新一週成績於週六 18:00 開放時，自動清除上一週的已排除提醒名單。
  try {
    await cleanupPreviousWeekExclusions();
  } catch (error) {
    console.error("清除上一週已排除提醒失敗：", error);
  }

  adminDataLoadMetrics = {
    queryMs: adminQueriesMs,
    totalMs: performance.now() - adminLoadStartedAt,
    students: studentsCache.length,
    exams: examsCache.length,
    scores: scoresCache.length,
    queryBreakdown: results.map(result => ({
      name: result.metricName,
      elapsedMs: result.elapsedMs,
      rows: (result.data || []).length
    }))
  };
}
