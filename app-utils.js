// ==================================================
// 小象成績管理系統｜共用工具函式
// 由 index.html 在 app.js 前載入；保留原有全域函式名稱。
// ==================================================

// ==================================================
// 1. 基本工具
// ==================================================

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showMessage(message, type, keepScrollPosition) {
  const box = $("systemMessage");

  if (!box) {
    alert(message);
    return;
  }

  box.textContent = message;
  box.className = "system-message " + (type || "");
  box.style.display = "block";
  if (!keepScrollPosition) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function formatDate(value) {
  if (!value) return "—";
  return String(value).slice(0, 10);
}

function formatDateRange(exam) {
  if (!exam) return "—";

  const start = formatDate(exam.start_date);
  const end = formatDate(exam.end_date);

  if (!exam.start_date && !exam.end_date) {
    return exam.title || "未設定日期";
  }

  if (start === end || !exam.end_date) return start;
  if (!exam.start_date) return end;

  return start + "～" + end;
}


/**
 * 依考試結束日期計算該週六台灣時間 18:00 的發布時間。
 * 考試日期以 YYYY-MM-DD 台灣日曆日期處理，發布瞬間以 UTC timestamp 表示。
 */
function getExamReleaseTimestamp(exam) {
  if (!exam || !exam.end_date) return null;

  const dateText = String(exam.end_date).slice(0, 10);
  const match = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const endDate = new Date(Date.UTC(year, month - 1, day));
  if (
    endDate.getUTCFullYear() !== year ||
    endDate.getUTCMonth() !== month - 1 ||
    endDate.getUTCDate() !== day
  ) return null;

  const daysUntilSaturday = (6 - endDate.getUTCDay() + 7) % 7;
  endDate.setUTCDate(endDate.getUTCDate() + daysUntilSaturday);

  // 台灣時間 UTC+8；週六 18:00 對應 UTC 週六 10:00。
  return Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate(),
    10, 0, 0, 0
  );
}

function isExamReleasedAt(exam, now) {
  const releaseTimestamp = getExamReleaseTimestamp(exam);
  if (releaseTimestamp === null) return false;
  const currentTimestamp = now instanceof Date ? now.getTime() : Number(now);
  return Number.isFinite(currentTimestamp) && currentTimestamp >= releaseTimestamp;
}

function isGrade3Class(className) {
  return String(className || "").includes("國三");
}

function isGrade3Math(className, subject) {
  return isGrade3Class(className) && subject === "數學";
}

function scoreClass(score, className, subject) {
  if (
    isGrade3Math(className, subject) &&
    score !== null &&
    score !== undefined &&
    Number(score) < 60
  ) {
    return "low-score";
  }

  if (isGrade3Class(className)) return "";

  if (score !== null && score !== undefined && Number(score) < 60) {
    return "low-score";
  }

  return "";
}

function gradeTag(gradeLevel) {
  if (!gradeLevel) {
    return "<span class='grade-tag'>—</span>";
  }

  if (gradeLevel === "缺考") {
    return "<span class='grade-tag grade-absent'>缺考</span>";
  }

  if (gradeLevel === "請假") {
    return "<span class='grade-tag grade-leave'>請假</span>";
  }

  return "<span class='grade-tag'>" +
    escapeHtml(gradeLevel) +
    "</span>";
}

function updateScoreInputWarning(input, enabled) {
  if (!input) return;
  const value = String(input.value == null ? "" : input.value).trim();
  const isLow = enabled !== false && value !== "" &&
    Number.isFinite(Number(value)) && Number(value) < 60;
  input.classList.toggle("low-score", isLow);
  // 週成績登錄使用 number input；直接設定重要性最高的行內樣式，
  // 避免表格或瀏覽器輸入框樣式覆蓋低分的一般字重。
  if (isLow) {
    input.style.setProperty("color", "#d32626", "important");
    input.style.setProperty("font-weight", "400", "important");
  } else {
    input.style.removeProperty("color");
    input.style.removeProperty("font-weight");
  }
}

function updateGradeSelectStyle(selectElement) {
  if (!selectElement) return;

  selectElement.classList.toggle(
    "grade-select-absent",
    selectElement.value === "缺考"
  );
  selectElement.classList.toggle(
    "grade-select-leave",
    selectElement.value === "請假"
  );
}

function showLoading(message) {
  const root = $("appRoot");
  if (!root) return;

  const old = $("loadingMessage");
  if (old) old.remove();

  const div = document.createElement("div");
  div.id = "loadingMessage";
  div.className = "loading-message";
  div.textContent = message || "資料載入中……";
  root.appendChild(div);
}

function hideLoading() {
  const box = $("loadingMessage");
  if (box) box.remove();
}

function sortByDateDesc(items, field) {
  return items.slice().sort(function (a, b) {
    return String(b[field] || "").localeCompare(String(a[field] || ""));
  });
}

/**
 * 分頁讀取 Supabase 資料，避免單次查詢達到回傳筆數上限時遺漏紀錄。
 * queryFactory 每次都建立新的查詢，確保每一頁使用獨立查詢。
 */
async function fetchAllRows(queryFactory, pageSize) {
  const size = Math.max(1, Number(pageSize) || 1000);
  const rows = [];
  let offset = 0;

  while (true) {
    const result = await queryFactory().range(offset, offset + size - 1);
    if (result.error) return { data: null, error: result.error };

    const page = result.data || [];
    rows.push(...page);
    if (page.length < size) break;
    offset += size;
  }

  return { data: rows, error: null };
}

function downloadText(filename, content, mimeType) {
  const blob = new Blob(["\uFEFF", content], {
    type: mimeType || "text/plain;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  // 延後釋放下載網址，避免部分行動瀏覽器尚未開始讀取 Blob 就失效。
  window.setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}

function csvCell(value) {
  const text = String(value == null ? "" : value);
  return '"' + text.replace(/"/g, '""') + '"';
}

// 手機家長使用內部 Email 別名登入，不使用 Supabase Phone Auth 或 SMS
function normalizeTaiwanMobile(value) {
  const compact = String(value || "").replace(/[\s()-]/g, "");
  if (/^09\d{8}$/.test(compact)) return "+886" + compact.slice(1);
  if (/^8869\d{8}$/.test(compact)) return "+" + compact;
  if (/^\+8869\d{8}$/.test(compact)) return compact;
  throw new Error("請輸入有效的台灣手機號碼，例如 0912345678。");
}

function phoneLoginEmail(value) {
  const phone = normalizeTaiwanMobile(value);
  return phone.replace(/^\+/, "") + "@phone-login.invalid";
}

