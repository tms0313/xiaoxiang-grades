// ==================================================
// 小象成績管理系統｜考試場次管理模組
// 依賴 app.js 的全域狀態、app-utils.js 共用工具，
// 以及 app-score-entry.js 的日期選擇器與成績登錄畫面函式。
// ==================================================

// ==================================================
// 10. 考試管理
// ==================================================


function clearExamForm() {
  $("examForm").reset();
  $("examEditId").value = "";
  $("examFormTitle").textContent = "新增考試";
  setDefaultExamDates();
}

function editExam(id) {
  const exam = examsByIdCache.get(String(id));
  if (!exam) return;

  $("examEditId").value = exam.id;
  $("examStart").value = exam.start_date || "";
  $("examEnd").value = exam.end_date || "";
  updateExamDateRangeDisplay();
  examCalendarOpen = false;
  examCalendarSelectingEnd = false;
  renderExamDateCalendar();
  $("examFormTitle").textContent = "修改考試日期";

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function saveExam(event) {
  event.preventDefault();

  const id = $("examEditId").value;
  const startDate = $("examStart").value;
  const endDate = $("examEnd").value;

  if (!startDate || !endDate) {
    showMessage("請填寫開始日期及結束日期。", "error");
    return;
  }

  if (endDate < startDate) {
    showMessage("結束日期不可早於開始日期。", "error");
    $("examDateRangeDisplay").focus();
    return;
  }

  const duplicate = examsCache.find(function (exam) {
    return String(exam.id) !== String(id) &&
      String(exam.start_date || "") === startDate &&
      String(exam.end_date || "") === endDate;
  });
  if (duplicate) {
    alert(
      "無法新增或修改考試！\n\n" +
      "資料庫中已經存在相同的考試日期區間：\n" +
      formatDateRange(duplicate) +
      "\n\n為避免覆蓋原有考試及成績，系統已取消這次儲存。"
    );
    $("examDateRangeDisplay").focus();
    return;
  }

  if (id) {
    let linkedScoreCount = 0;
    scoresCache.forEach(score => {
      if (String(score.exam_id) === String(id)) linkedScoreCount += 1;
    });
    if (linkedScoreCount > 0 && !confirm(
      "這個考試場次目前已有 " + linkedScoreCount + " 筆成績。\n\n" +
      "修改日期只會改變考試週期的顯示，不會刪除或搬移成績。\n" +
      "確定要更新日期嗎？"
    )) return;
  }

  const payload = {
    title: startDate === endDate ? startDate : startDate + "～" + endDate,
    start_date: startDate,
    end_date: endDate
  };

  const submitButton = $("examForm").querySelector("button[type='submit']");
  const originalButtonText = submitButton ? submitButton.textContent : "";
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "儲存中…";
  }

  const sessionGeneration = appSessionGeneration;
  const sessionUserId = currentUser && currentUser.id;
  try {
    const result = id
      ? await db.from("exams").update(payload).eq("id", id)
      : await db.from("exams").insert(payload).select("id, title, start_date, end_date").single();

    if (result.error) throw result.error;
    if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;

    if (id) {
      examsCache = examsCache.map(function (exam) {
        return String(exam.id) === String(id)
          ? { ...exam, ...payload }
          : exam;
      });
    } else {
      // 新增場次回傳資料庫產生的 ID，直接同步本地快取，避免完整重載。
      examsCache.push(result.data);
    }
    rebuildExamIndexes();
    renderScoreEntry();
    showMessage(id ? "考試日期已更新。" : "考試場次已新增。", "success");

  } catch (error) {
    showMessage("考試資料儲存失敗：" + error.message, "error");
  } finally {
    if (submitButton && submitButton.isConnected) {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText || "儲存考試";
    }
  }
}

async function deleteExam(id) {
  const exam = examsByIdCache.get(String(id));
  if (!exam) return;

  if (!confirm(
    "確定刪除考試場次「" + formatDateRange(exam) + "」？\n\n" +
    "若已有成績資料，資料庫可能會拒絕刪除。"
  )) return;

  const sessionGeneration = appSessionGeneration;
  const sessionUserId = currentUser && currentUser.id;
  try {
    const result = await db.from("exams").delete().eq("id", id);
    if (result.error) throw result.error;
    if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;

    examsCache = examsCache.filter(function (item) {
      return String(item.id) !== String(id);
    });
    rebuildExamIndexes();
    renderScoreEntry();
    showMessage("考試資料已刪除。", "success");

  } catch (error) {
    showMessage("刪除考試失敗：" + error.message, "error");
  }
}
