// ==================================================
// 小象成績管理系統｜成績匯出模組
// 由 index.html 在 app.js 前載入；沿用既有全域函式與快取。
// ==================================================

// 14. 成績匯出
// ==================================================

function renderExport() {
  const content = $("adminContent");

  // 直接重用管理資料載入時已排序的考試索引，避免重複排序。
  const examList = examsByDateDescCache;

  const examOptions = examList.map(function (exam) {
    return (
      "<label class='export-period-item'>" +
        "<input type='checkbox' class='exportExam' value='" +
          escapeHtml(exam.id) +
        "'>" +
        "<span class='export-period-date'>" +
          escapeHtml(formatDateRange(exam)) +
        "</span>" +
      "</label>"
    );
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>成績匯出</h2>" +

    "<div class='export-panel'>" +

      "<div class='export-panel-title'>選擇要匯出的考試週期</div>" +

      "<label class='export-select-all'>" +
        "<input type='checkbox' id='exportSelectAll'>" +
        "<span>全部選取</span>" +
      "</label>" +

      "<div class='export-period-list' id='exportExamList'>" +
        (
          examOptions ||
          "<div class='export-empty'>目前沒有考試週期資料</div>"
        ) +
      "</div>" +

      "<div class='export-summary'>" +
        "<span id='exportSelectedCount' class='export-count'>已選取 0 個考試週期</span>" +
        "<span>可同時選取多個考試週期</span>" +
      "</div>" +

      "<button class='btn btn-success export-download' id='downloadCsv' disabled>" +
        "下載 CSV 成績表" +
      "</button>" +

    "</div>" +

    "<p class='muted' style='margin-top:14px;line-height:1.8'>" +
      "匯出欄位：週考區間、班級、學生編號、學生姓名、科目、考試範圍、一般成績、答對題數、模擬考等級。" +
    "</p>";

  const selectAll = $("exportSelectAll");
  const checkboxes = Array.from(
    document.querySelectorAll(".exportExam")
  );
  const downloadButton = $("downloadCsv");

  function updateExportSelection() {
    let selectedCount = 0;
    const totalCount = checkboxes.length;

    checkboxes.forEach(function (checkbox) {
      if (checkbox.checked) selectedCount++;
    });

    selectAll.checked =
      totalCount > 0 && selectedCount === totalCount;

    selectAll.indeterminate =
      selectedCount > 0 && selectedCount < totalCount;

    $("exportSelectedCount").textContent =
      "已選取 " + selectedCount + " 個考試週期";

    downloadButton.disabled = selectedCount === 0;
  }

  selectAll.addEventListener("change", function () {
    checkboxes.forEach(function (checkbox) {
      checkbox.checked = selectAll.checked;
    });

    updateExportSelection();
  });

  checkboxes.forEach(function (checkbox) {
    checkbox.addEventListener("change", updateExportSelection);
  });

  downloadButton.addEventListener("click", exportCsv);

  updateExportSelection();
}

// ==================================================
// 14-1. 匯出 CSV 成績資料
// ==================================================

function exportCsv() {
  const selectedIds = Array.from(
    document.querySelectorAll(".exportExam:checked")
  ).map(function (checkbox) {
    return String(checkbox.value);
  });

  if (selectedIds.length === 0) {
    showMessage("請至少選擇一個考試週期。", "error");
    return;
  }

  const headers = [
    "週考區間",
    "班級",
    "學生編號",
    "學生姓名",
    "科目",
    "考試範圍",
    "一般成績",
    "答對題數",
    "模擬考等級"
  ];

  const rows = [
    headers.map(csvCell).join(",")
  ];

  const selectedIdSet = new Set(selectedIds);
  const studentsById = studentsByIdCache;
  // 直接重用管理資料載入時建立的考試索引，避免每次匯出都重新掃描全部考試。
  const examsById = examsByIdCache;

  let exportedCount = 0;
  scoresCache.forEach(function (score) {
    if (!selectedIdSet.has(String(score.exam_id))) return;

    const student = studentsById.get(String(score.student_id));
    const exam = examsById.get(String(score.exam_id));
    if (!student || !exam) return;

    rows.push([
      formatDateRange(exam),
      student.class_name,
      student.student_code,
      student.full_name,
      score.subject,
      score.scope,
      score.score,
      score.correct_count,
      score.grade_level
    ].map(csvCell).join(","));
    exportedCount++;
  });

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Taipei"
  });

  downloadText(
    "小象成績資料_" + today + ".csv",
    rows.join("\r\n"),
    "text/csv;charset=utf-8"
  );

  showMessage(
    "CSV 成績表已產生，共匯出 " +
    exportedCount +
    " 筆成績資料。",
    "success"
  );
}
