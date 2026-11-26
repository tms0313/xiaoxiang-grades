// ==================================================
// 歷屆畢業學生模考成績管理（獨立資料表）
// ==================================================

async function renderAlumniMockScores() {
  const content = $("adminContent");
  content.innerHTML =
    "<h2 class='section-title'>模考成績</h2>" +
    "<p class='muted'>此區資料獨立保存，不會影響目前在籍學生、家長查詢或教師查詢。</p>" +
    "<div class='alumni-score-form'>" +
      "<h3 id='alumniFormTitle' style='margin:0 0 7px;color:#23466b'>新增模考成績</h3>" +
      "<form id='alumniScoreForm'>" +
        "<div class='alumni-score-basic-grid'>" +
          "<div class='field'><label for='alumniAcademicYear'>學年度</label><input id='alumniAcademicYear' type='text' placeholder='例如：114學年度' maxlength='30' required></div>" +
          "<div class='field'><label for='alumniStudentName'>學生姓名</label><input id='alumniStudentName' type='text' maxlength='50' required></div>" +
          "<div class='field'><label for='alumniExamScope'>新增類型</label><select id='alumniExamScope' required><option value=''>請選擇類型</option><option value='班內模考'>班內模考</option><option value='正式模考'>北北基模考</option><option value='會考'>會考</option></select></div>" +
          "<div class='field' id='alumniExamRangeField'><label for='alumniExamRange'>考試範圍</label><input id='alumniExamRange' type='text' maxlength='100' placeholder='例如：第一次模擬考全範圍' required></div>" +
          "<div class='field alumni-rank-field' id='alumniGenderRankField' style='display:none'><label for='alumniGenderRank'>區（男／女）排名</label><input id='alumniGenderRank' type='number' min='1' step='1' placeholder='請輸入名次'></div>" +
          "<div class='field alumni-rank-field' id='alumniDistrictRankField' style='display:none'><label for='alumniDistrictRank'>區排名</label><input id='alumniDistrictRank' type='number' min='1' step='1' placeholder='請輸入名次'></div>" +
          "<div class='field alumni-rank-field' id='alumniCompositionScoreField' style='display:none'><label for='alumniCompositionScore'>作文（0～1.2分）</label><input id='alumniCompositionScore' type='number' min='0' max='1.2' step='0.1' placeholder='0～1.2'></div><div class='field' id='alumniAdmissionSchoolField' style='display:none'><label for='alumniAdmissionSchool'>錄取學校</label><input id='alumniAdmissionSchool' type='text' maxlength='100' placeholder='請輸入錄取學校'></div>" +
        "</div>" +
        "<div class='alumni-score-subject-grid'>" +
          "<div class='field'><label for='alumniChinese'>國文級分（0～7）</label><input id='alumniChinese' type='number' min='0' max='7' step='1' required></div>" +
          "<div class='field'><label for='alumniMath'>數學級分（0～7）</label><input id='alumniMath' type='number' min='0' max='7' step='1' required></div>" +
          "<div class='field'><label for='alumniEnglish'>英文級分（0～7）</label><input id='alumniEnglish' type='number' min='0' max='7' step='1' required></div>" +
          "<div class='field'><label for='alumniSocial'>社會級分（0～7）</label><input id='alumniSocial' type='number' min='0' max='7' step='1' required></div>" +
          "<div class='field'><label for='alumniScience'>自然級分（0～7）</label><input id='alumniScience' type='number' min='0' max='7' step='1' required></div>" +
          "<div class='alumni-score-total'><span>五科總級分</span><strong id='alumniTotalPreview'>0</strong></div>" +
        "</div>" +
        "<div class='toolbar' style='margin-bottom:0'>" +
          "<button class='btn btn-success' id='alumniSaveButton' type='submit'>新增成績</button>" +
          "<button class='btn btn-secondary' id='alumniCancelEdit' type='button' style='display:none'>取消修改</button>" +
        "</div>" +
      "</form>" +
    "</div>" +
    "<h3 id='alumniHistoryTitle' style='color:#23466b;margin:0 0 10px'>歷屆模考資料</h3>" +
    "<div class='alumni-filter-row'>" +
      "<select id='alumniYearFilter' aria-label='依學年度查詢'><option value=''>全部學年度</option></select>" +
      "<input id='alumniNameFilter' type='text' placeholder='搜尋學生姓名' aria-label='搜尋學生姓名'>" +
      "<select id='alumniTypeFilter' aria-label='依類型篩選'><option value=''>全部類型</option><option value='班內模考'>班內模考</option><option value='正式模考'>北北基模考</option><option value='會考'>會考</option></select>" +
      "<select id='alumniRangeFilter' aria-label='依考試範圍篩選'><option value=''>全部考試範圍</option></select>" +
      "<select id='alumniSubjectFilter' aria-label='依考試科目篩選'><option value=''>全部考試科目</option><option value='chinese'>國文</option><option value='math'>數學</option><option value='english'>英文</option><option value='social_studies'>社會</option><option value='natural_science'>自然</option></select>" +
      "<button type='button' class='btn btn-success' id='alumniFilteredExportButton' style='height:40px;min-height:40px;padding:0 10px;font-size: 14px;white-space:nowrap'>匯出成績</button>" +
    "</div>" +
    "<div id='alumniScoreTableArea'><div class='muted'>資料載入中……</div></div>";

  let editingId = "";
  let records = [];
  const fields = [
    ["chinese", "alumniChinese"],
    ["math", "alumniMath"],
    ["english", "alumniEnglish"],
    ["social_studies", "alumniSocial"],
    ["natural_science", "alumniScience"]
  ];

  function updateRankFields() {
    const examType = $("alumniExamScope").value;
    const isFormal = examType === "正式模考";
    const isExam = examType === "會考";
    $("alumniExamRangeField").style.display = isExam ? "none" : "block";
    $("alumniExamRange").required = !isExam;
    $("alumniGenderRankField").style.display = isFormal ? "block" : "none";
    $("alumniDistrictRankField").style.display = isFormal ? "block" : "none";
    $("alumniCompositionScoreField").style.display = (isFormal || isExam) ? "block" : "none";
    $("alumniAdmissionSchoolField").style.display = isExam ? "block" : "none";
  }

  function updateTotalPreview() {
    const subjectTotal = fields.reduce(function (sum, item) {
      const raw = $(item[1]).value;
      const value = Number(raw);
      return sum + (raw !== "" && Number.isInteger(value) && value >= 0 && value <= 7 ? value : 0);
    }, 0);
    const examType = $("alumniExamScope").value;
    const includesComposition = examType === "正式模考" || examType === "會考";
    const compositionRaw = $("alumniCompositionScore").value;
    const composition = includesComposition && compositionRaw !== "" ? Number(compositionRaw) : 0;
    const total = subjectTotal + (Number.isFinite(composition) ? composition : 0);
    $("alumniTotalPreview").textContent = Number.isInteger(total) ? String(total) : total.toFixed(1);
    const totalLabel = $("alumniTotalPreview").previousElementSibling;
    if (totalLabel) totalLabel.textContent = includesComposition ? "六科總級分" : "五科總級分";
  }

  function resetForm() {
    // 新增多筆資料時保留目前選定的學年度與模考類型，避免管理員重複輸入。
    const keepAcademicYear = $("alumniAcademicYear").value;
    const keepExamScope = $("alumniExamScope").value;
    const keepExamRange = $("alumniExamRange").value;
    editingId = "";
    $("alumniScoreForm").reset();
    $("alumniAcademicYear").value = keepAcademicYear;
    $("alumniExamScope").value = keepExamScope;
    $("alumniExamRange").value = keepExamRange;
    $("alumniGenderRank").value = "";
    $("alumniDistrictRank").value = "";
    $("alumniCompositionScore").value = "";
    $("alumniAdmissionSchool").value = "";
    updateRankFields();
    $("alumniFormTitle").textContent = "新增模考成績";
    $("alumniSaveButton").disabled = false;
    $("alumniSaveButton").textContent = "新增成績";
    $("alumniCancelEdit").style.display = "none";
    updateTotalPreview();
  }

  function startEdit(record) {
    editingId = String(record.id);
    $("alumniAcademicYear").value = record.academic_year || "";
    $("alumniStudentName").value = record.student_name || "";
    $("alumniExamScope").value = record.exam_scope || "";
    $("alumniExamRange").value = record.exam_range || "";
    $("alumniGenderRank").value = record.district_gender_rank == null ? "" : record.district_gender_rank;
    $("alumniDistrictRank").value = record.district_rank == null ? "" : record.district_rank;
    $("alumniCompositionScore").value = record.composition_score == null ? "" : record.composition_score;
    $("alumniAdmissionSchool").value = record.admission_school || "";
    updateRankFields();
    fields.forEach(function (item) { $(item[1]).value = record[item[0]]; });
    $("alumniFormTitle").textContent = "修改模考成績";
    $("alumniSaveButton").disabled = false;
    $("alumniSaveButton").textContent = "儲存修改";
    $("alumniCancelEdit").style.display = "inline-block";
    updateTotalPreview();
    $("alumniScoreForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderRows() {
    const yearQuery = $("alumniYearFilter").value.trim().toLowerCase();
    const nameQuery = $("alumniNameFilter").value.trim().toLowerCase();
    const typeQuery = $("alumniTypeFilter").value;
    const rangeQuery = $("alumniRangeFilter").value;
    const subjectQuery = $("alumniSubjectFilter").value;
    const filtered = records.filter(function (record) {
      return String(record.academic_year || "").toLowerCase().includes(yearQuery) &&
        String(record.student_name || "").toLowerCase().includes(nameQuery) &&
        (!typeQuery || String(record.exam_scope || "") === typeQuery) &&
        (!rangeQuery || record.exam_scope === "會考" || String(record.exam_range || "") === rangeQuery);
    });
    const isOnlyCeesExam = typeQuery === "會考";
    if (!filtered.length) {
      $("alumniScoreTableArea").innerHTML = "<div class='empty'>" +
        (records.length ? "沒有符合查詢條件的資料。" : "目前尚無模考成績。") + "</div>";
      $("alumniFilteredExportButton").disabled = true;
      return;
    }
    const subjectColumns = [
      ["chinese", "國文"],
      ["math", "數學"],
      ["english", "英文"],
      ["social_studies", "社會"],
      ["natural_science", "自然"]
    ].filter(function (item) { return !subjectQuery || item[0] === subjectQuery; });
    const rows = filtered.map(function (record) {
      const subjectCells = subjectColumns.map(function (item) {
        return "<td class='alumni-score-number'>" + escapeHtml(record[item[0]]) + "</td>";
      }).join("");
      return "<tr>" +
        "<td>" + escapeHtml(record.academic_year) + "</td>" +
        "<td>" + escapeHtml(record.student_name) + "</td>" +
        "<td>" + escapeHtml(record.exam_scope === "正式模考" ? "北北基" : record.exam_scope === "班內模考" ? "班內" : record.exam_scope) + "</td>" +
        (isOnlyCeesExam ? "" : "<td>" + escapeHtml(record.exam_scope === "會考" ? "" : (record.exam_range || "")) + "</td>" +
        "<td class='alumni-score-number'>" + (record.exam_scope === "正式模考" && record.district_gender_rank != null ? escapeHtml(Number(record.district_gender_rank).toLocaleString("en-US")) : "—") + "</td>" +
        "<td class='alumni-score-number'>" + (record.exam_scope === "正式模考" && record.district_rank != null ? escapeHtml(Number(record.district_rank).toLocaleString("en-US")) : "—") + "</td>") +
        "<td>" + (record.exam_scope === "會考" ? escapeHtml(record.admission_school || "") : "") + "</td>" +
        subjectCells +
        "<td class='alumni-score-number'>" + (record.composition_score != null && (record.exam_scope === "正式模考" || record.exam_scope === "會考") ? escapeHtml(record.composition_score) : "—") + "</td>" +
        "<td class='alumni-score-number'><strong>" + escapeHtml(record.total_grade) + "</strong></td>" +
        "<td><div class='alumni-score-actions'>" +
          "<button type='button' class='btn btn-small' data-alumni-edit='" + escapeHtml(record.id) + "'>修改</button>" +
          "<button type='button' class='btn btn-danger btn-small' data-alumni-delete='" + escapeHtml(record.id) + "'>刪除</button>" +
        "</div></td></tr>";
    }).join("");
    const subjectHeaders = subjectColumns.map(function (item) {
      return "<th>" + item[1] + "</th>";
    }).join("");
    $("alumniScoreTableArea").innerHTML =
      "<div class='table-wrap'><table class='alumni-score-table'>" +
        "<thead><tr><th>學年度</th><th>學生姓名</th><th>模考類型</th>" + (isOnlyCeesExam ? "" : "<th>考試範圍</th><th>區（男／女）排名</th><th>區排名</th>") + "<th>錄取學校</th>" + subjectHeaders + "<th>作文</th><th>總級分</th><th>操作</th></tr></thead>" +
        "<tbody>" + rows + "</tbody></table></div>" +
      "<p class='muted'>共 " + filtered.length + " 筆資料</p>";
    $("alumniFilteredExportButton").disabled = filtered.length === 0;
  }

  async function loadRecords() {
    const result = await db.from("alumni_mock_scores").select("id, academic_year, student_name, exam_scope, exam_range, district_gender_rank, district_rank, composition_score, admission_school, chinese, math, english, social_studies, natural_science, total_grade")
      .order("academic_year", { ascending: false })
      .order("exam_scope", { ascending: true })
      .order("total_grade", { ascending: false })
      .order("student_name", { ascending: true });
    if (result.error) {
      $("alumniScoreTableArea").innerHTML =
        "<div class='system-message error' style='display:block'>讀取歷屆成績失敗：" +
        escapeHtml(result.error.message) + "</div>";
      return;
    }
    records = result.data || [];
    function compareExamRange(a, b) {
      const left = String(a || "").trim();
      const right = String(b || "").trim();
      const leftIsRange = /[~～至-]/.test(left);
      const rightIsRange = /[~～至-]/.test(right);
      if (leftIsRange !== rightIsRange) return leftIsRange ? 1 : -1;
      return left.localeCompare(right, "zh-Hant", { numeric: true });
    }
    records.sort(function (a, b) {
      // 依學年度、模考類別、考試範圍排序；同一組內再依總級分由高到低排列。
      const yearOrder = String(b.academic_year || "").localeCompare(
        String(a.academic_year || ""), "zh-Hant", { numeric: true }
      );
      if (yearOrder) return yearOrder;
      const categoryOrder = { "班內模考": 0, "正式模考": 1, "會考": 2 };
      const aCategory = Object.prototype.hasOwnProperty.call(categoryOrder, a.exam_scope)
        ? categoryOrder[a.exam_scope] : 99;
      const bCategory = Object.prototype.hasOwnProperty.call(categoryOrder, b.exam_scope)
        ? categoryOrder[b.exam_scope] : 99;
      if (aCategory !== bCategory) return aCategory - bCategory;
      // 會考不使用考試範圍分組，直接依六科總級分由高到低排列。
      if (a.exam_scope !== "會考" || b.exam_scope !== "會考") {
        const rangeOrder = compareExamRange(a.exam_range, b.exam_range);
        if (rangeOrder) return rangeOrder;
      }
      const scoreA = Number(a.total_grade);
      const scoreB = Number(b.total_grade);
      const scoreOrder = (Number.isFinite(scoreB) ? scoreB : -Infinity) -
        (Number.isFinite(scoreA) ? scoreA : -Infinity);
      if (scoreOrder) return scoreOrder;
      return String(a.student_name || "").localeCompare(
        String(b.student_name || ""), "zh-Hant", { numeric: true }
      );
    });
    const yearSelect = $("alumniYearFilter");
    const selectedYear = yearSelect.value;
    const years = Array.from(new Set(records.map(function (record) {
      return String(record.academic_year || "").trim();
    }).filter(Boolean))).sort(function (a, b) {
      return b.localeCompare(a, "zh-Hant", { numeric: true });
    });
    yearSelect.innerHTML = "<option value=''>全部學年度</option>" +
      years.map(function (year) {
        return "<option value='" + escapeHtml(year) + "'>" + escapeHtml(year) + "</option>";
      }).join("");
    if (years.includes(selectedYear)) yearSelect.value = selectedYear;
    const rangeSelect = $("alumniRangeFilter");
    const selectedRange = rangeSelect.value;
    const ranges = Array.from(new Set(records.filter(function (record) {
      return record.exam_scope !== "會考";
    }).map(function (record) {
      return String(record.exam_range || "").trim();
    }).filter(Boolean))).sort(compareExamRange);
    rangeSelect.innerHTML = "<option value=''>全部考試範圍</option>" +
      ranges.map(function (range) {
        return "<option value='" + escapeHtml(range) + "'>" + escapeHtml(range) + "</option>";
      }).join("");
    if (ranges.includes(selectedRange)) rangeSelect.value = selectedRange;
    renderRows();
  }

  fields.forEach(function (item) {
    $(item[1]).addEventListener("input", updateTotalPreview);
  });
  $("alumniCompositionScore").addEventListener("input", updateTotalPreview);
  $("alumniYearFilter").addEventListener("change", renderRows);
  $("alumniNameFilter").addEventListener("input", renderRows);
  $("alumniTypeFilter").addEventListener("change", renderRows);
  $("alumniRangeFilter").addEventListener("change", renderRows);
  $("alumniSubjectFilter").addEventListener("change", renderRows);
  $("alumniFilteredExportButton").addEventListener("click", function () {
    const yearQuery = $("alumniYearFilter").value.trim().toLowerCase();
    const nameQuery = $("alumniNameFilter").value.trim().toLowerCase();
    const typeQuery = $("alumniTypeFilter").value;
    const rangeQuery = $("alumniRangeFilter").value;
    const subjectQuery = $("alumniSubjectFilter").value;
    const filtered = records.filter(function (record) {
      return String(record.academic_year || "").toLowerCase().includes(yearQuery) &&
        String(record.student_name || "").toLowerCase().includes(nameQuery) &&
        (!typeQuery || String(record.exam_scope || "") === typeQuery) &&
        (!rangeQuery || record.exam_scope === "會考" || String(record.exam_range || "") === rangeQuery);
    });
    if (!filtered.length) {
      alert("目前沒有符合篩選條件的成績可匯出。");
      return;
    }
    const subjectFields = [
      ["chinese", "國文"],
      ["math", "數學"],
      ["english", "英文"],
      ["social_studies", "社會"],
      ["natural_science", "自然"]
    ].filter(function (item) { return !subjectQuery || item[0] === subjectQuery; });
    const headers = ["學年度", "學生姓名", "模考類型", "考試範圍", "區（男／女）排名", "區排名", "錄取學校"]
      .concat(subjectFields.map(function (item) { return item[1]; }))
      .concat(["作文", "總級分"]);
    const rows = [headers.map(csvCell).join(",")].concat(filtered.map(function (record) {
      return [
        record.academic_year,
        record.student_name,
        record.exam_scope === "正式模考" ? "北北基模考" : record.exam_scope,
        record.exam_range,
        record.exam_scope === "正式模考" ? record.district_gender_rank : "",
        record.exam_scope === "正式模考" ? record.district_rank : "",
        record.exam_scope === "會考" ? record.admission_school : ""
      ].concat(subjectFields.map(function (item) { return record[item[0]]; }))
        .concat([
          record.composition_score != null && (record.exam_scope === "正式模考" || record.exam_scope === "會考") ? record.composition_score : "",
          record.total_grade
        ]).map(csvCell).join(",");
    }));
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    downloadText("小象歷屆模考成績_" + today + ".csv", rows.join("\r\n"), "text/csv;charset=utf-8");
    showMessage("已匯出符合篩選條件的 " + filtered.length + " 筆模考成績。", "success");
  });
  $("alumniCancelEdit").addEventListener("click", resetForm);
  $("alumniExamScope").addEventListener("change", function () { updateRankFields(); updateTotalPreview(); });
  updateRankFields();

  $("alumniScoreForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    const payload = {
      academic_year: $("alumniAcademicYear").value.trim(),
      student_name: $("alumniStudentName").value.trim(),
      exam_scope: $("alumniExamScope").value.trim(),
      exam_range: $("alumniExamScope").value === "會考" ? "" : $("alumniExamRange").value.trim(),
      district_gender_rank: null,
      district_rank: null,
      composition_score: null,
      admission_school: null
    };
    if (payload.exam_scope === "正式模考" || payload.exam_scope === "會考") {
      const genderRankRaw = $("alumniGenderRank").value.trim();
      const districtRankRaw = $("alumniDistrictRank").value.trim();
      if (genderRankRaw !== "" && (!Number.isInteger(Number(genderRankRaw)) || Number(genderRankRaw) < 1)) {
        alert("區（男／女）排名請填寫大於 0 的整數。");
        $("alumniGenderRank").focus();
        return;
      }
      if (districtRankRaw !== "" && (!Number.isInteger(Number(districtRankRaw)) || Number(districtRankRaw) < 1)) {
        alert("區排名請填寫大於 0 的整數。");
        $("alumniDistrictRank").focus();
        return;
      }
      if (payload.exam_scope === "正式模考") {
        payload.district_gender_rank = genderRankRaw === "" ? null : Number(genderRankRaw);
        payload.district_rank = districtRankRaw === "" ? null : Number(districtRankRaw);
      }
      const compositionRaw = $("alumniCompositionScore").value.trim();
      if (compositionRaw !== "") {
        const compositionValue = Number(compositionRaw);
        if (!Number.isFinite(compositionValue) || compositionValue < 0 || compositionValue > 1.2 ||
            Math.abs(compositionValue * 10 - Math.round(compositionValue * 10)) > 1e-8) {
          alert("作文請輸入 0～1.2 分，最多至小數點後 1 位。");
          $("alumniCompositionScore").focus();
          return;
        }
        payload.composition_score = compositionValue;
      }
      if (payload.exam_scope === "會考") {
        payload.admission_school = $("alumniAdmissionSchool").value.trim() || null;
      }
    }
    for (const item of fields) {
      const raw = $(item[1]).value;
      const value = Number(raw);
      if (raw === "" || !Number.isInteger(value) || value < 0 || value > 7) {
        alert("五科級分都必須填寫 0～7 的整數。");
        $(item[1]).focus();
        return;
      }
      payload[item[0]] = value;
    }
    if (!payload.academic_year || !payload.student_name || !payload.exam_scope ||
        (payload.exam_scope !== "會考" && !payload.exam_range)) {
      alert(payload.exam_scope === "會考"
        ? "學年度、學生姓名及模考類型都必須填寫。"
        : "學年度、學生姓名、模考類型及考試範圍都必須填寫。");
      return;
    }
    // 同一場模考（學年度＋模考類型＋考試範圍）不可重複登錄同一位學生。
    // 修改既有資料時排除目前這筆，避免自己與自己比對。
    const normalizedName = payload.student_name.replace(/\\s+/g, "").toLocaleLowerCase();
    const duplicate = records.find(function (record) {
      const existingName = String(record.student_name || "").replace(/\\s+/g, "").toLocaleLowerCase();
      return String(record.academic_year || "").trim() === payload.academic_year &&
        String(record.exam_scope || "").trim() === payload.exam_scope &&
        String(record.exam_range || "").trim() === payload.exam_range &&
        existingName === normalizedName &&
        String(record.id) !== String(editingId || "");
    });
    if (duplicate) {
      alert("已有「" + payload.student_name + "」在這次考試的成績，請勿重複輸入。");
      $("alumniStudentName").focus();
      return;
    }

    const button = $("alumniSaveButton");
    button.disabled = true;
    button.textContent = "儲存中……";
    try {
      let result;
      if (editingId) {
        result = await db.from("alumni_mock_scores")
          .update(Object.assign({}, payload, { updated_at: new Date().toISOString() }))
          .eq("id", editingId);
      } else {
        result = await db.from("alumni_mock_scores").insert(payload);
      }
      if (result.error) throw result.error;
      const wasEditing = !!editingId;
      resetForm();
      await loadRecords();
      showMessage(wasEditing ? "模考成績已修改。" : "模考成績已新增。", "success", true);
    } catch (error) {
      alert("儲存歷屆成績失敗：" + error.message);
      button.disabled = false;
      button.textContent = editingId ? "儲存修改" : "新增成績";
    }
  });

  $("alumniScoreTableArea").addEventListener("click", async function (event) {
    const editButton = event.target.closest("[data-alumni-edit]");
    if (editButton) {
      const record = records.find(item => String(item.id) === String(editButton.dataset.alumniEdit));
      if (record) startEdit(record);
      return;
    }

    const deleteButton = event.target.closest("[data-alumni-delete]");
    if (!deleteButton || deleteButton.disabled) return;
    const record = records.find(item => String(item.id) === String(deleteButton.dataset.alumniDelete));
    if (!record) return;
    if (!confirm("確定要刪除「" + record.student_name + "」的「" + record.exam_scope + "」成績嗎？此動作無法復原。")) return;

    deleteButton.disabled = true;
    deleteButton.textContent = "刪除中……";
    try {
      const result = await db.from("alumni_mock_scores").delete().eq("id", record.id);
      if (result.error) throw result.error;
      if (editingId === String(record.id)) resetForm();
      await loadRecords();
      showMessage("模考成績已刪除。", "success", true);
    } catch (error) {
      console.error("刪除歷屆模考成績失敗：", error);
      alert("刪除歷屆成績失敗：" + (error && error.message ? error.message : "請確認網路連線後重試。"));
    } finally {
      if (deleteButton.isConnected) {
        deleteButton.disabled = false;
        deleteButton.textContent = "刪除";
      }
    }
  });

  updateTotalPreview();
  await loadRecords();
}

// ==================================================
// 模考成績管理結束
// ==================================================

