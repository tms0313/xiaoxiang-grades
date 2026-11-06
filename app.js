```javascript
// ==================================================
// 小象文教機構｜成績管理系統
// 完整 App.js
// 版本：
// 1. 家長密碼管理
// 2. 最近三次週考
// 3. 相同考試範圍重複成績覆蓋確認
// 4. 修改學生資料（保留成績及家長綁定）
// 5. 多場次成績 CSV 匯出
// 6. 國文、英文、數學、自然四科
// 7. 國一、國二：一般數字成績，低於 60 紅色粗體
// 8. 國三：答對題數＋模擬考等級，不判斷 60 分
// 9. 同一科目可登錄多個不同考試範圍
// 10. 總覽、家長頁、CSV 均支援多範圍及國三等級
// ==================================================

const db = supabaseClient;

// ==================================================
// 1. 畫面樣式
// ==================================================

const style = document.createElement("style");

style.textContent = `
.dashboard {
  width: min(1200px, 94%);
  margin: 30px auto;
  background: #fff;
  padding: 28px;
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(0,0,0,.08);
  box-sizing: border-box;
}

.dashboard h1 { color: #17365d; margin-bottom: 8px; }

.dashboard h2 {
  color: #17365d;
  border-bottom: 2px solid #d9b66f;
  padding-bottom: 10px;
}

.dashboard .topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.dashboard .user-info { color: #666; font-size: 14px; }

.dashboard button {
  background: #17365d;
  color: white;
  border: 0;
  border-radius: 7px;
  padding: 10px 16px;
  cursor: pointer;
  margin: 4px 4px 4px 0;
}

.dashboard button:hover { opacity: .88; }
.dashboard button:disabled { opacity: .55; cursor: not-allowed; }
.dashboard button.secondary { background: #777; }

.dashboard button.danger {
  background: #b42318;
  padding: 7px 12px;
  font-size: 13px;
}

.dashboard button.edit-btn {
  background: #3974a5;
  padding: 7px 12px;
  font-size: 13px;
}

.dashboard input,
.dashboard select {
  width: 100%;
  padding: 11px;
  margin: 6px 0 14px;
  border: 1px solid #ccc;
  border-radius: 7px;
  box-sizing: border-box;
}

.dashboard label { display: block; font-weight: 600; }

.dashboard .panel {
  background: #f7f9fc;
  padding: 18px;
  border-radius: 10px;
  margin-top: 18px;
}

.dashboard table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  background: white;
}

.dashboard th,
.dashboard td {
  border: 1px solid #ddd;
  padding: 10px;
  text-align: left;
  white-space: nowrap;
}

.dashboard th { background: #edf1f7; color: #17365d; }

.dashboard .notice { color: #666; font-size: 14px; }
.dashboard .success { color: #187344; }
.dashboard .error { color: #b42318; }

.dashboard .low-score {
  color: #b42318;
  font-weight: 700;
}

.dashboard .form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.dashboard .table-scroll { overflow-x: auto; width: 100%; }

.dashboard .password-result {
  background: #fff;
  border: 1px solid #d9b66f;
  border-radius: 10px;
  padding: 16px;
  margin-top: 16px;
}

.dashboard .password-result input {
  font-size: 17px;
  font-weight: bold;
  letter-spacing: 1px;
  background: #fff;
}

.dashboard .edit-student-box {
  background: #fff;
  border: 1px solid #d9b66f;
  padding: 14px;
  border-radius: 8px;
  margin-top: 12px;
}

.dashboard .export-exam-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
  padding: 12px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  max-height: 260px;
  overflow-y: auto;
  margin: 8px 0 14px;
}

.dashboard .export-exam-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: normal;
  padding: 6px;
  margin: 0;
}

.dashboard .export-exam-item input {
  width: 18px;
  height: 18px;
  margin: 0;
  flex-shrink: 0;
}

.dashboard .score-record {
  padding: 8px 0;
  border-bottom: 1px solid #eee;
  white-space: normal;
}

.dashboard .score-record:last-child { border-bottom: 0; }

.dashboard .grade-level {
  color: #17365d;
  font-weight: 700;
  font-size: 16px;
}

.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #edf1f7;
  padding: 20px;
  box-sizing: border-box;
}

.login-card {
  width: min(420px, 100%);
  background: white;
  padding: 32px;
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(0,0,0,.08);
  box-sizing: border-box;
}

.login-card .logo {
  font-size: 42px;
  font-weight: bold;
  color: #17365d;
  text-align: center;
}

.login-card .school-name { text-align: center; color: #777; }
.login-card h1 { text-align: center; color: #17365d; }

.login-card .subtitle {
  text-align: center;
  color: #777;
  font-size: 14px;
  margin-bottom: 26px;
}

.login-card label {
  display: block;
  font-weight: 600;
  margin-top: 12px;
}

.login-card input {
  width: 100%;
  padding: 12px;
  margin-top: 6px;
  border: 1px solid #ccc;
  border-radius: 7px;
  box-sizing: border-box;
}

.login-card button {
  width: 100%;
  background: #17365d;
  color: white;
  border: 0;
  border-radius: 7px;
  padding: 13px;
  margin-top: 20px;
  cursor: pointer;
}

.login-card #message { color: #b42318; font-size: 14px; }

.login-card footer {
  text-align: center;
  color: #999;
  font-size: 12px;
  margin-top: 25px;
}

@media(max-width:600px) {
  .dashboard { padding: 16px; margin: 12px auto; }
  .dashboard table { font-size: 13px; }
  .dashboard th, .dashboard td { padding: 7px; }
  .login-card { padding: 24px; }
}
`;

document.head.appendChild(style);

// ==================================================
// 2. 全域變數
// ==================================================

let currentUser = null;
let currentProfile = null;

let studentsCache = [];
let examsCache = [];

let overviewRows = [];
let overviewExamId = "";

const SUBJECTS = ["國文", "英文", "數學", "自然"];

const GRADE_LEVELS = [
  "A++",
  "A+",
  "A",
  "B++",
  "B+",
  "B",
  "C"
];

// ==================================================
// 3. 共用函式
// ==================================================

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showMessage(message, type = "") {
  const area = document.getElementById("appMessage");

  if (area) {
    area.textContent = message;
    area.className = type || "notice";
  }
}

function formatDate(dateString) {
  if (!dateString) return "";

  const date = new Date(dateString + "T00:00:00");

  return (
    String(date.getMonth() + 1).padStart(2, "0") +
    "月" +
    String(date.getDate()).padStart(2, "0") +
    "日"
  );
}

function scoreClass(score, className) {
  if (className === "國三班") return "";

  if (score === "" || score === null || score === undefined) {
    return "";
  }

  return Number(score) < 60 ? "low-score" : "";
}

function isGrade3Class(className) {
  return className === "國三班";
}

function getStudentById(studentId) {
  return studentsCache.find(s => s.id === studentId);
}

function renderGradeOptions(selectedValue = "") {
  return `
    <option value="">請選擇等級</option>
    ${GRADE_LEVELS.map(level => `
      <option value="${level}" ${selectedValue === level ? "selected" : ""}>
        ${level}
      </option>
    `).join("")}
  `;
}

// ==================================================
// 4. 登入畫面
// ==================================================

function loginPage() {
  document.body.innerHTML = `
    <main class="login-page">
      <section class="login-card">
        <div class="logo">小象</div>
        <p class="school-name">小象文教機構・七堵校區</p>
        <h1>成績管理系統</h1>
        <p class="subtitle">學生學習紀錄與成績查詢平台</p>

        <form id="loginForm">
          <label for="email">電子郵件</label>
          <input
            id="email"
            type="email"
            placeholder="請輸入電子郵件"
            autocomplete="username"
            required
          >

          <label for="password">登入密碼</label>
          <input
            id="password"
            type="password"
            placeholder="請輸入密碼"
            autocomplete="current-password"
            required
          >

          <button type="submit">登入系統</button>
          <p id="message" role="status"></p>
        </form>

        <p style="text-align:center;color:#777;font-size:13px;">
          忘記密碼？請聯絡管理員協助重設。
        </p>

        <footer>© 小象文教機構 七堵校區</footer>
      </section>
    </main>
  `;

  document.getElementById("loginForm")
    .addEventListener("submit", login);
}

// ==================================================
// 5. 登入處理
// ==================================================

async function login(event) {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const message = document.getElementById("message");

  message.textContent = "登入中，請稍候……";

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    message.textContent = "登入失敗：" + error.message;
    return;
  }

  currentUser = data.user;
  await loadCurrentProfile();
}

// ==================================================
// 6. 讀取登入者資料
// ==================================================

async function loadCurrentProfile() {
  const { data: profile, error } = await db
    .from("profiles")
    .select("id,email,display_name,role")
    .eq("id", currentUser.id)
    .single();

  if (error || !profile) {
    alert("無法讀取帳號權限，請聯絡管理員。");
    await db.auth.signOut();
    loginPage();
    return;
  }

  currentProfile = profile;

  await db.from("login_events").insert({
    user_id: currentUser.id
  });

  renderDashboard();
}

// ==================================================
// 7. 主畫面
// ==================================================

function renderDashboard() {
  const roleNames = {
    admin: "管理者",
    parent: "家長"
  };

  if (!["admin", "parent"].includes(currentProfile.role)) {
    alert("此帳號身分未開放使用，請聯絡管理者。");
    db.auth.signOut();
    loginPage();
    return;
  }

  document.body.innerHTML = `
    <main class="dashboard">
      <div class="topbar">
        <div>
          <h1>小象文教機構｜成績管理系統</h1>

          <div class="user-info">
            ${
              currentProfile.role === "parent"
                ? "親愛的家長，您好！"
                : escapeHTML(
                    currentProfile.display_name ||
                    currentProfile.email
                  ) + "・" + roleNames[currentProfile.role]
            }
          </div>
        </div>

        <button id="logoutBtn" class="secondary">登出</button>
      </div>

      <p id="appMessage" class="notice"></p>

      <div id="mainContent">
        ${
          currentProfile.role === "parent"
            ? parentView()
            : staffView()
        }
      </div>
    </main>
  `;

  document.getElementById("logoutBtn")
    .addEventListener("click", logout);

  if (currentProfile.role === "parent") {
    const passwordForm =
      document.getElementById("changePasswordForm");

    if (passwordForm) {
      passwordForm.addEventListener(
        "submit",
        changeParentPassword
      );
    }

    loadParentScores();
  } else {
    loadStaffData();
  }
}

// ==================================================
// 8. 管理者畫面
// ==================================================

function staffView() {
  return `
    <section class="panel">
      <h2>一、學生資料管理</h2>

      <form id="studentForm">
        <div class="form-grid">
          <div>
            <label>學生姓名</label>
            <input name="full_name" required placeholder="請輸入學生姓名">
          </div>

          <div>
            <label>學生編號</label>
            <input name="student_code" required placeholder="例如：A001">
          </div>

          <div>
            <label>班級</label>
            <select name="class_name" required>
              <option value="國一班">國一班</option>
              <option value="國二班">國二班</option>
              <option value="國三班">國三班</option>
            </select>
          </div>
        </div>

        <button type="submit">新增學生</button>
      </form>

      <div id="studentList"></div>
    </section>

    <section class="panel">
      <h2>二、周考場次管理</h2>

      <form id="examForm">
        <div class="form-grid">
          <div>
            <label>開始日期</label>
            <input type="date" name="start_date" required>
          </div>

          <div>
            <label>結束日期</label>
            <input type="date" name="end_date" required>
          </div>
        </div>

        <button type="submit">建立周考場次</button>
      </form>

      <div id="examList"></div>
    </section>

    <section class="panel">
      <h2>三、學生成績登錄</h2>

      <p class="notice">
        國一、國二輸入一般成績；國三輸入答對題數及模擬考等級。
      </p>

      <form id="scoreForm">
        <label>選擇學生</label>
        <select name="student_id" id="scoreStudent" required></select>

        <label>選擇考試場次</label>
        <select name="exam_id" id="scoreExam" required></select>

        <label>考試科目</label>
        <select name="subject" id="scoreSubject" required>
          <option value="國文">國文</option>
          <option value="英文">英文</option>
          <option value="數學">數學</option>
          <option value="自然">自然</option>
        </select>

        <label>科目範圍</label>
        <input
          type="text"
          name="scope"
          placeholder="例如：第三課～第五課"
          required
        >

        <div id="normalScoreFields">
          <label>考試成績（0～100 分）</label>
          <input
            type="number"
            name="score"
            id="scoreInput"
            min="0"
            max="100"
            step="0.1"
          >
        </div>

        <div id="grade3ScoreFields" style="display:none;">
          <label>答對題數</label>
          <input
            type="number"
            name="correct_count"
            id="correctCountInput"
            min="0"
            step="1"
            placeholder="例如：31"
          >

          <label>模擬考等級</label>
          <select name="grade_level" id="gradeLevelInput">
            ${renderGradeOptions()}
          </select>
        </div>

        <button type="submit">儲存成績</button>
      </form>
    </section>

    <section class="panel">
      <h2>四、全校成績總覽</h2>

      <h3>單場次成績查詢</h3>

      <div class="form-grid">
        <div>
          <label>選擇班級</label>
          <select id="overviewClass">
            <option value="國一班">國一班</option>
            <option value="國二班">國二班</option>
            <option value="國三班">國三班</option>
          </select>
        </div>

        <div>
          <label>選擇考試場次</label>
          <select id="overviewExam"></select>
        </div>
      </div>

      <button type="button" id="queryOverviewBtn">
        查詢全班成績
      </button>

      <div id="overviewResult">
        <p class="notice">請選擇班級及考試場次後查詢。</p>
      </div>

      <hr style="margin:24px 0;border:0;border-top:1px solid #ddd;">

      <h3>多場次成績匯出</h3>

      <p class="notice">
        選擇班級後，可一次勾選多個週考場次。
        國三會匯出答對題數及模擬考等級。
      </p>

      <label>選擇匯出班級</label>
      <select id="exportClass">
        <option value="國一班">國一班</option>
        <option value="國二班">國二班</option>
        <option value="國三班">國三班</option>
      </select>

      <label>選擇要匯出的週考場次</label>

      <div>
        <button type="button" class="secondary" id="selectAllExportExamsBtn">
          全選場次
        </button>

        <button type="button" class="secondary" id="clearExportExamsBtn">
          清除選取
        </button>

        <span id="exportExamCount" class="notice">
          已選取 0 個場次
        </span>
      </div>

      <div id="exportExamList" class="export-exam-list">
        <p class="notice">正在載入考試場次……</p>
      </div>

      <button type="button" id="exportOverviewBtn">
        匯出所選場次 Excel CSV
      </button>
    </section>

    <section class="panel">
      <h2>五、家長帳號綁定</h2>

      <p class="notice">
        請先在 Supabase 建立家長登入帳號，
        再輸入該帳號的電子郵件進行綁定。
      </p>

      <form id="bindForm">
        <label>家長電子郵件</label>
        <input type="email" name="email" required>

        <label>要綁定的學生</label>
        <select name="student_id" id="bindStudent" required></select>

        <button type="submit">綁定家長與學生</button>
      </form>
    </section>

    <section class="panel">
      <h2>六、家長密碼管理</h2>

      <p class="notice">
        家長忘記密碼時，由管理員協助重設。
        系統會產生臨時密碼，請管理員透過 LINE 私下傳送給家長。
      </p>

      <label>選擇家長帳號</label>

      <select id="resetParentSelect">
        <option value="">正在讀取家長帳號……</option>
      </select>

      <button type="button" id="resetParentPasswordBtn">
        重設家長密碼
      </button>

      <div id="temporaryPasswordArea"></div>
    </section>

    <section class="panel">
      <h2>七、家長登入紀錄</h2>
      <div id="loginList"></div>
    </section>
  `;
}

// ==================================================
// 9. 家長畫面
// ==================================================

function parentView() {
  return `
    <section class="panel">
      <h2>孩子的學習成績</h2>

      <p class="notice">
        以下僅顯示已與此家長帳號綁定的學生資料。
        每位學生顯示最近三次有成績的週考。
      </p>

      <div id="parentScores">正在讀取成績……</div>
    </section>

    <section class="panel">
      <h2>修改登入密碼</h2>

      <p class="notice">
        請輸入目前密碼，再設定新的登入密碼。
        新密碼至少需要 8 個字元。
      </p>

      <form id="changePasswordForm">
        <label>目前密碼</label>
        <input
          type="password"
          name="currentPassword"
          autocomplete="current-password"
          required
        >

        <label>新密碼（至少 8 個字元）</label>
        <input
          type="password"
          name="newPassword"
          minlength="8"
          autocomplete="new-password"
          required
        >

        <label>確認新密碼</label>
        <input
          type="password"
          name="confirmPassword"
          minlength="8"
          autocomplete="new-password"
          required
        >

        <button type="submit">修改密碼</button>
      </form>
    </section>
  `;
}

// ==================================================
// 10. 成績輸入欄位依學生年級切換
// ==================================================

function setupScoreInputMode() {
  const studentSelect = document.getElementById("scoreStudent");
  const normalFields = document.getElementById("normalScoreFields");
  const grade3Fields = document.getElementById("grade3ScoreFields");

  const scoreInput = document.getElementById("scoreInput");
  const correctInput = document.getElementById("correctCountInput");
  const gradeInput = document.getElementById("gradeLevelInput");

  if (!studentSelect) return;

  function updateMode() {
    const student = getStudentById(studentSelect.value);
    const isGrade3 = isGrade3Class(student?.class_name);

    normalFields.style.display = isGrade3 ? "none" : "block";
    grade3Fields.style.display = isGrade3 ? "block" : "none";

    scoreInput.required = !isGrade3;
    correctInput.required = isGrade3;
    gradeInput.required = isGrade3;

    scoreInput.disabled = isGrade3;
    correctInput.disabled = !isGrade3;
    gradeInput.disabled = !isGrade3;
  }

  studentSelect.addEventListener("change", updateMode);
  updateMode();
}

// ==================================================
// 11. 載入管理者資料
// ==================================================

async function loadStaffData() {
  const [studentResult, examResult] = await Promise.all([
    db.from("students")
      .select("id,student_code,full_name,class_name")
      .order("class_name")
      .order("student_code"),

    db.from("exams")
      .select("id,title,start_date,end_date")
      .order("start_date", { ascending: false })
  ]);

  if (studentResult.error || examResult.error) {
    showMessage(
      "讀取資料失敗：" +
      (studentResult.error?.message || examResult.error?.message),
      "error"
    );
    return;
  }

  studentsCache = studentResult.data || [];
  examsCache = examResult.data || [];

  document.getElementById("studentList").innerHTML =
    studentsCache.length
      ? `
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>編號</th>
                <th>姓名</th>
                <th>班級</th>
                <th>操作</th>
              </tr>
            </thead>

            <tbody>
              ${studentsCache.map(s => `
                <tr>
                  <td>${escapeHTML(s.student_code)}</td>
                  <td>${escapeHTML(s.full_name)}</td>
                  <td>${escapeHTML(s.class_name)}</td>
                  <td>
                    <button
                      type="button"
                      class="edit-btn"
                      onclick="editStudent('${escapeHTML(s.id)}')"
                    >修改</button>

                    <button
                      type="button"
                      class="danger"
                      onclick="deleteStudent('${escapeHTML(s.id)}')"
                    >刪除學生</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `
      : `<p class="notice">目前尚未建立學生資料。</p>`;

  document.getElementById("examList").innerHTML =
    examsCache.length
      ? `
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>考試場次</th>
                <th>開始日期</th>
                <th>結束日期</th>
                <th>操作</th>
              </tr>
            </thead>

            <tbody>
              ${examsCache.map(e => `
                <tr>
                  <td>${escapeHTML(e.title)}</td>
                  <td>${escapeHTML(e.start_date)}</td>
                  <td>${escapeHTML(e.end_date)}</td>
                  <td>
                    <button
                      type="button"
                      class="danger"
                      onclick="deleteExam('${escapeHTML(e.id)}')"
                    >刪除場次</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `
      : `<p class="notice">目前尚未建立考試場次。</p>`;

  const studentOptions = studentsCache.map(s => `
    <option value="${escapeHTML(s.id)}">
      ${escapeHTML(s.class_name)}｜${escapeHTML(s.full_name)}
    </option>
  `).join("");

  const examOptions = examsCache.map(e => `
    <option value="${escapeHTML(e.id)}">
      ${escapeHTML(e.title)}
    </option>
  `).join("");

  document.getElementById("scoreStudent").innerHTML =
    studentOptions || `<option value="">請先新增學生</option>`;

  document.getElementById("bindStudent").innerHTML =
    studentOptions || `<option value="">請先新增學生</option>`;

  document.getElementById("scoreExam").innerHTML =
    examOptions || `<option value="">請先建立考試場次</option>`;

  document.getElementById("overviewExam").innerHTML =
    examOptions || `<option value="">目前沒有考試場次</option>`;

  renderExportExamOptions();
  setupScoreInputMode();

  if (currentProfile.role === "admin") {
    await Promise.all([
      loadLoginEvents(),
      loadParentAccounts()
    ]);
  }

  document.getElementById("studentForm").onsubmit = addStudent;
  document.getElementById("examForm").onsubmit = addExam;
  document.getElementById("scoreForm").onsubmit = saveScore;
  document.getElementById("bindForm").onsubmit = bindGuardian;

  setupOverviewControls();
}

// ==================================================
// 12. 修改學生資料
// ==================================================

function editStudent(studentId) {
  if (currentProfile?.role !== "admin") {
    alert("只有管理者可以修改學生資料。");
    return;
  }

  const student = studentsCache.find(s => s.id === studentId);

  if (!student) {
    alert("找不到這位學生的資料。");
    return;
  }

  const oldForm = document.getElementById("editStudentForm");
  if (oldForm) oldForm.remove();

  const editBox = document.createElement("div");
  editBox.id = "editStudentForm";
  editBox.className = "edit-student-box";

  editBox.innerHTML = `
    <h3>修改學生資料</h3>

    <form id="updateStudentForm">
      <div class="form-grid">
        <div>
          <label>學生姓名</label>
          <input name="full_name" value="${escapeHTML(student.full_name)}" required>
        </div>

        <div>
          <label>學生編號</label>
          <input name="student_code" value="${escapeHTML(student.student_code)}" required>
        </div>

        <div>
          <label>班級</label>
          <select name="class_name" required>
            <option value="國一班" ${student.class_name === "國一班" ? "selected" : ""}>國一班</option>
            <option value="國二班" ${student.class_name === "國二班" ? "selected" : ""}>國二班</option>
            <option value="國三班" ${student.class_name === "國三班" ? "selected" : ""}>國三班</option>
          </select>
        </div>
      </div>

      <button type="submit">儲存修改</button>
      <button type="button" class="secondary" id="cancelEditStudentBtn">取消</button>
    </form>

    <p class="notice">
      修改學生基本資料不會刪除原有成績，也不會解除家長綁定。
      若更改年級，之後成績畫面會依目前班級顯示。
    </p>
  `;

  document.getElementById("studentList").appendChild(editBox);

  document.getElementById("updateStudentForm").onsubmit =
    event => updateStudent(event, studentId);

  document.getElementById("cancelEditStudentBtn").onclick =
    () => editBox.remove();

  editBox.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

async function updateStudent(event, studentId) {
  event.preventDefault();

  if (currentProfile?.role !== "admin") {
    showMessage("只有管理者可以修改學生資料。", "error");
    return;
  }

  const form = new FormData(event.target);

  const fullName = String(form.get("full_name") || "").trim();
  const studentCode = String(form.get("student_code") || "").trim();
  const className = form.get("class_name");

  if (!fullName || !studentCode || !className) {
    showMessage("請完整填寫學生資料。", "error");
    return;
  }

  const validClasses = ["國一班", "國二班", "國三班"];

  if (!validClasses.includes(className)) {
    showMessage("班級資料不正確。", "error");
    return;
  }

  const duplicate = studentsCache.find(s =>
    s.id !== studentId &&
    s.student_code.toLowerCase() === studentCode.toLowerCase()
  );

  if (duplicate) {
    showMessage("這個學生編號已經被使用，請更換編號。", "error");
    return;
  }

  const { error } = await db
    .from("students")
    .update({
      full_name: fullName,
      student_code: studentCode,
      class_name: className
    })
    .eq("id", studentId);

  if (error) {
    showMessage("修改學生資料失敗：" + error.message, "error");
    return;
  }

  overviewRows = [];

  showMessage(
    "學生資料修改成功！原有成績及家長綁定均已保留。",
    "success"
  );

  await loadStaffData();
}

// ==================================================
// 13. 讀取家長帳號清單
// ==================================================

async function loadParentAccounts() {
  if (currentProfile?.role !== "admin") return;

  const select = document.getElementById("resetParentSelect");
  if (!select) return;

  select.innerHTML =
    `<option value="">正在讀取家長帳號……</option>`;

  const { data: parents, error } = await db
    .from("profiles")
    .select("id,email,display_name")
    .eq("role", "parent")
    .order("email");

  if (error) {
    select.innerHTML = `<option value="">讀取失敗</option>`;
    showMessage("讀取家長帳號失敗：" + error.message, "error");
    return;
  }

  if (!parents || parents.length === 0) {
    select.innerHTML = `<option value="">目前沒有家長帳號</option>`;
    return;
  }

  select.innerHTML = `
    <option value="">請選擇家長帳號</option>
    ${parents.map(parent => `
      <option value="${escapeHTML(parent.id)}">
        ${escapeHTML(parent.display_name || parent.email || "家長帳號")}
        （${escapeHTML(parent.email || "")}）
      </option>
    `).join("")}
  `;

  const button = document.getElementById("resetParentPasswordBtn");
  if (button) button.onclick = resetParentPassword;
}

// ==================================================
// 14. 管理員重設家長密碼
// ==================================================

async function resetParentPassword() {
  if (currentProfile?.role !== "admin") {
    showMessage("只有管理員可以重設家長密碼。", "error");
    return;
  }

  const select = document.getElementById("resetParentSelect");
  const parentUserId = select?.value;

  if (!parentUserId) {
    showMessage("請先選擇要重設密碼的家長帳號。", "error");
    return;
  }

  const selectedText =
    select.options[select.selectedIndex]?.text || "此家長帳號";

  const confirmed = confirm(
    `確定要重設以下帳號的密碼嗎？\n\n${selectedText}\n\n` +
    "重設後，家長原本的密碼將立即失效。"
  );

  if (!confirmed) return;

  const button = document.getElementById("resetParentPasswordBtn");
  const area = document.getElementById("temporaryPasswordArea");

  button.disabled = true;
  button.textContent = "正在重設密碼……";

  if (area) area.innerHTML = "";

  try {
    const { data, error } = await db.functions.invoke(
      "admin-reset-parent-password",
      {
        body: { parentUserId }
      }
    );

    if (error) {
      throw new Error(error.message || "呼叫密碼重設服務失敗");
    }

    if (!data?.success || !data?.temporaryPassword) {
      throw new Error(data?.error || "伺服器沒有回傳臨時密碼");
    }

    area.innerHTML = `
      <div class="password-result">
        <h3 class="success">家長臨時密碼已重設</h3>

        <p class="notice">
          請將以下臨時密碼透過 LINE 私下傳送給家長。
          家長登入後，請立即修改密碼。
        </p>

        <label>臨時密碼</label>

        <input
          type="text"
          id="temporaryPasswordValue"
          readonly
          value="${escapeHTML(data.temporaryPassword)}"
        >

        <button type="button" id="copyTemporaryPasswordBtn">
          複製臨時密碼
        </button>
      </div>
    `;

    document.getElementById("copyTemporaryPasswordBtn")
      .addEventListener("click", copyTemporaryPassword);

    showMessage("家長密碼已成功重設。", "success");

  } catch (error) {
    showMessage("重設密碼失敗：" + error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "重設家長密碼";
  }
}

// ==================================================
// 15. 複製家長臨時密碼
// ==================================================

async function copyTemporaryPassword() {
  const input = document.getElementById("temporaryPasswordValue");
  if (!input) return;

  try {
    await navigator.clipboard.writeText(input.value);

    showMessage(
      "臨時密碼已複製，請透過 LINE 私下傳送給家長。",
      "success"
    );
  } catch (error) {
    input.focus();
    input.select();

    const copied = document.execCommand("copy");

    showMessage(
      copied
        ? "臨時密碼已複製，請透過 LINE 傳送給家長。"
        : "複製失敗，請手動選取並複製臨時密碼。",
      copied ? "success" : "error"
    );
  }
}

// ==================================================
// 16. 家長修改自己的密碼
// ==================================================

async function changeParentPassword(event) {
  event.preventDefault();

  if (currentProfile?.role !== "parent") {
    showMessage("只有家長可以使用此功能。", "error");
    return;
  }

  const form = new FormData(event.target);

  const currentPassword = form.get("currentPassword");
  const newPassword = form.get("newPassword");
  const confirmPassword = form.get("confirmPassword");

  if (!currentPassword || !newPassword || !confirmPassword) {
    showMessage("請完整填寫所有密碼欄位。", "error");
    return;
  }

  if (newPassword.length < 8) {
    showMessage("新密碼至少需要 8 個字元。", "error");
    return;
  }

  if (newPassword !== confirmPassword) {
    showMessage("兩次輸入的新密碼不一致。", "error");
    return;
  }

  if (newPassword === currentPassword) {
    showMessage("新密碼不能與目前密碼相同。", "error");
    return;
  }

  const button = event.target.querySelector("button[type='submit']");

  button.disabled = true;
  button.textContent = "正在修改密碼……";

  try {
    const { data: loginData, error: loginError } =
      await db.auth.signInWithPassword({
        email: currentUser.email,
        password: currentPassword
      });

    if (loginError || !loginData?.user) {
      throw new Error("目前密碼不正確，請重新確認。");
    }

    if (loginData.user.id !== currentUser.id) {
      await db.auth.signOut();
      throw new Error("帳號驗證異常，請重新登入。");
    }

    currentUser = loginData.user;

    const { error: updateError } = await db.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      throw new Error(updateError.message);
    }

    event.target.reset();

    showMessage(
      "密碼修改成功！下次請使用新密碼登入。",
      "success"
    );

  } catch (error) {
    showMessage("修改密碼失敗：" + error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "修改密碼";
  }
}

// ==================================================
// 17. 新增學生
// ==================================================

async function addStudent(event) {
  event.preventDefault();

  const form = new FormData(event.target);

  const record = {
    full_name: String(form.get("full_name") || "").trim(),
    student_code: String(form.get("student_code") || "").trim(),
    class_name: form.get("class_name")
  };

  if (!record.full_name || !record.student_code) {
    showMessage("請完整填寫學生姓名及編號。", "error");
    return;
  }

  const duplicate = studentsCache.find(s =>
    s.student_code.toLowerCase() === record.student_code.toLowerCase()
  );

  if (duplicate) {
    showMessage("這個學生編號已經存在。", "error");
    return;
  }

  const { error } = await db
    .from("students")
    .insert(record);

  if (error) {
    showMessage("新增學生失敗：" + error.message, "error");
    return;
  }

  showMessage("學生新增成功！", "success");
  event.target.reset();

  await loadStaffData();
}

// ==================================================
// 18. 刪除學生及相關資料
// ==================================================

async function deleteStudent(studentId) {
  if (currentProfile?.role !== "admin") {
    alert("只有管理者可以刪除學生。");
    return;
  }

  const student = studentsCache.find(s => s.id === studentId);

  if (!student) {
    alert("找不到這位學生的資料。");
    return;
  }

  const confirmed = confirm(
    `確定要刪除學生「${student.full_name}」嗎？\n\n` +
    "此操作會一併刪除：\n" +
    "1. 該學生所有考試成績\n" +
    "2. 該學生的家長綁定資料\n" +
    "3. 學生名單資料\n\n" +
    "刪除後無法直接復原，請確認。"
  );

  if (!confirmed) return;

  showMessage("正在刪除學生資料……");

  const { error: scoreError } = await db
    .from("scores")
    .delete()
    .eq("student_id", studentId);

  if (scoreError) {
    showMessage("刪除學生成績失敗：" + scoreError.message, "error");
    return;
  }

  const { error: guardianError } = await db
    .from("guardian_students")
    .delete()
    .eq("student_id", studentId);

  if (guardianError) {
    showMessage("刪除家長綁定失敗：" + guardianError.message, "error");
    return;
  }

  const { error: studentError } = await db
    .from("students")
    .delete()
    .eq("id", studentId);

  if (studentError) {
    showMessage("刪除學生失敗：" + studentError.message, "error");
    return;
  }

  overviewRows = [];

  showMessage(
    `學生「${student.full_name}」及相關資料已刪除。`,
    "success"
  );

  await loadStaffData();
}

// ==================================================
// 19. 建立考試場次
// ==================================================

async function addExam(event) {
  event.preventDefault();

  const form = new FormData(event.target);

  const start = form.get("start_date");
  const end = form.get("end_date");

  if (end < start) {
    showMessage("結束日期不能早於開始日期。", "error");
    return;
  }

  const title = `${formatDate(start)}～${formatDate(end)}周考`;

  const { error } = await db
    .from("exams")
    .insert({
      title,
      start_date: start,
      end_date: end
    });

  if (error) {
    showMessage("建立考試場次失敗：" + error.message, "error");
    return;
  }

  showMessage("考試場次建立成功：" + title, "success");
  event.target.reset();

  await loadStaffData();
}

// ==================================================
// 20. 刪除周考場次及該場次成績
// ==================================================

async function deleteExam(examId) {
  if (currentProfile?.role !== "admin") {
    alert("只有管理者可以刪除周考場次。");
    return;
  }

  const exam = examsCache.find(e => e.id === examId);

  if (!exam) {
    alert("找不到這個考試場次。");
    return;
  }

  const confirmed = confirm(
    `確定要刪除「${exam.title}」嗎？\n\n` +
    "此操作會一併刪除這個場次的所有學生各科成績。\n" +
    "刪除後無法直接復原，請確認。"
  );

  if (!confirmed) return;

  showMessage("正在刪除周考場次及相關成績……");

  const { error: scoreError } = await db
    .from("scores")
    .delete()
    .eq("exam_id", examId);

  if (scoreError) {
    showMessage("刪除該場次成績失敗：" + scoreError.message, "error");
    return;
  }

  const { error: examError } = await db
    .from("exams")
    .delete()
    .eq("id", examId);

  if (examError) {
    showMessage("刪除考試場次失敗：" + examError.message, "error");
    return;
  }

  overviewRows = [];

  showMessage(`「${exam.title}」及該場次所有成績已刪除。`, "success");

  await loadStaffData();
}

// ==================================================
// 21. 儲存學生成績
// ==================================================

async function saveScore(event) {
  event.preventDefault();

  if (currentProfile?.role !== "admin") {
    showMessage("只有管理者可以登錄成績。", "error");
    return;
  }

  const form = new FormData(event.target);

  const studentId = form.get("student_id");
  const examId = form.get("exam_id");
  const subject = form.get("subject");
  const scope = String(form.get("scope") || "").trim();

  if (!studentId || !examId || !subject || !scope) {
    showMessage("請完整選擇學生、考試場次、科目及考試範圍。", "error");
    return;
  }

  const student = getStudentById(studentId);

  if (!student) {
    showMessage("找不到學生資料，請重新整理頁面。", "error");
    return;
  }

  const isGrade3 = isGrade3Class(student.class_name);

  let record;

  if (isGrade3) {
    const correctCountText = String(
      form.get("correct_count") ?? ""
    ).trim();

    const gradeLevel = String(
      form.get("grade_level") || ""
    ).trim();

    if (correctCountText === "") {
      showMessage("國三學生必須輸入答對題數。", "error");
      return;
    }

    const correctCount = Number(correctCountText);

    if (
      !Number.isInteger(correctCount) ||
      correctCount < 0
    ) {
      showMessage("答對題數必須是 0 或以上的整數。", "error");
      return;
    }

    if (!GRADE_LEVELS.includes(gradeLevel)) {
      showMessage("請選擇正確的模擬考等級。", "error");
      return;
    }

    record = {
      student_id: studentId,
      exam_id: examId,
      subject,
      scope,
      score: null,
      correct_count: correctCount,
      grade_level: gradeLevel
    };

  } else {
    const scoreText = String(form.get("score") ?? "").trim();

    if (scoreText === "") {
      showMessage("請輸入考試成績。", "error");
      return;
    }

    const score = Number(scoreText);

    if (!Number.isFinite(score) || score < 0 || score > 100) {
      showMessage("成績必須介於 0 到 100 分。", "error");
      return;
    }

    record = {
      student_id: studentId,
      exam_id: examId,
      subject,
      scope,
      score,
      correct_count: null,
      grade_level: null
    };
  }

  // 只查詢相同學生、相同場次、相同科目、相同範圍
  const { data: existingScore, error: lookupError } = await db
    .from("scores")
    .select("id,score,scope,correct_count,grade_level")
    .eq("student_id", studentId)
    .eq("exam_id", examId)
    .eq("subject", subject)
    .eq("scope", scope)
    .maybeSingle();

  if (lookupError) {
    showMessage("查詢原有成績失敗：" + lookupError.message, "error");
    return;
  }

  let saveError = null;

  if (existingScore) {
    const exam = examsCache.find(e => e.id === examId);

    const oldResult = isGrade3
      ? `${existingScore.correct_count ?? "未填"} 題／${existingScore.grade_level || "未填等級"}`
      : `${existingScore.score ?? "未填"} 分`;

    const newResult = isGrade3
      ? `${record.correct_count} 題／${record.grade_level}`
      : `${record.score} 分`;

    const confirmed = confirm(
      `【相同考試範圍已有成績】\n\n` +
      `學生：${student.full_name}\n` +
      `考試：${exam?.title || "此考試場次"}\n` +
      `科目：${subject}\n` +
      `範圍：${scope}\n\n` +
      `原紀錄：${oldResult}\n` +
      `新紀錄：${newResult}\n\n` +
      `是否確定覆蓋原紀錄？`
    );

    if (!confirmed) {
      showMessage("已取消覆蓋，原有成績保留不變。", "notice");
      return;
    }

    const { error } = await db
      .from("scores")
      .update({
        score: record.score,
        correct_count: record.correct_count,
        grade_level: record.grade_level
      })
      .eq("id", existingScore.id);

    saveError = error;

  } else {
    const { error } = await db
      .from("scores")
      .insert(record);

    saveError = error;
  }

  if (saveError) {
    showMessage("成績儲存失敗：" + saveError.message, "error");
    return;
  }

  showMessage(
    existingScore
      ? "相同考試範圍的成績已成功覆蓋更新！"
      : "新考試範圍及成績新增成功！",
    "success"
  );

  event.target.reset();

  // 重設後重新依學生年級切換欄位
  setupScoreInputMode();
}

// ==================================================
// 22. 全校成績總覽按鈕
// ==================================================

function setupOverviewControls() {
  const queryBtn = document.getElementById("queryOverviewBtn");
  const exportBtn = document.getElementById("exportOverviewBtn");

  if (queryBtn) {
    queryBtn.onclick = queryOverviewScores;
  }

  if (exportBtn) {
    exportBtn.onclick = exportSelectedExamsCSV;
  }

  const selectAllBtn =
    document.getElementById("selectAllExportExamsBtn");

  const clearBtn =
    document.getElementById("clearExportExamsBtn");

  if (selectAllBtn) {
    selectAllBtn.onclick = () => {
      document.querySelectorAll(".export-exam-checkbox")
        .forEach(input => input.checked = true);

      updateExportExamCount();
    };
  }

  if (clearBtn) {
    clearBtn.onclick = () => {
      document.querySelectorAll(".export-exam-checkbox")
        .forEach(input => input.checked = false);

      updateExportExamCount();
    };
  }
}

// ==================================================
// 23. 多場次匯出選項
// ==================================================

function renderExportExamOptions() {
  const area = document.getElementById("exportExamList");
  if (!area) return;

  if (!examsCache.length) {
    area.innerHTML = `<p class="notice">目前沒有考試場次。</p>`;
    updateExportExamCount();
    return;
  }

  area.innerHTML = examsCache.map(exam => `
    <label class="export-exam-item">
      <input
        type="checkbox"
        class="export-exam-checkbox"
        value="${escapeHTML(exam.id)}"
      >
      <span>${escapeHTML(exam.title)}</span>
    </label>
  `).join("");

  area.querySelectorAll(".export-exam-checkbox")
    .forEach(input => {
      input.addEventListener("change", updateExportExamCount);
    });

  updateExportExamCount();
}

function updateExportExamCount() {
  const count = document.querySelectorAll(
    ".export-exam-checkbox:checked"
  ).length;

  const area = document.getElementById("exportExamCount");

  if (area) {
    area.textContent = `已選取 ${count} 個場次`;
  }
}

// ==================================================
// 24. 查詢單場次成績
// ==================================================

async function queryOverviewScores() {
  const className = document.getElementById("overviewClass").value;
  const examId = document.getElementById("overviewExam").value;
  const resultArea = document.getElementById("overviewResult");

  if (!examId) {
    resultArea.textContent = "請先建立考試場次。";
    return;
  }

  resultArea.textContent = "正在讀取成績……";
  overviewExamId = examId;

  const { data: students, error: studentError } = await db
    .from("students")
    .select("id,student_code,full_name,class_name")
    .eq("class_name", className)
    .order("student_code");

  if (studentError) {
    resultArea.textContent = "讀取學生資料失敗：" + studentError.message;
    return;
  }

  if (!students || students.length === 0) {
    overviewRows = [];
    resultArea.textContent = "這個班級目前沒有學生資料。";
    return;
  }

  const studentIds = students.map(s => s.id);

  const { data: scores, error: scoreError } = await db
    .from("scores")
    .select("id,student_id,subject,score,scope,correct_count,grade_level")
    .eq("exam_id", examId)
    .in("student_id", studentIds);

  if (scoreError) {
    resultArea.textContent = "讀取成績失敗：" + scoreError.message;
    return;
  }

  const scoreMap = {};

  (scores || []).forEach(s => {
    if (!scoreMap[s.student_id]) {
      scoreMap[s.student_id] = [];
    }

    scoreMap[s.student_id].push(s);
  });

  overviewRows = students.map(student => ({
    id: student.id,
    student_code: student.student_code,
    full_name: student.full_name,
    class_name: student.class_name,
    scores: scoreMap[student.id] || []
  }));

  renderOverviewTable();
}

// ==================================================
// 25. 顯示單場次成績總覽
// ==================================================

function renderOverviewTable() {
  const resultArea = document.getElementById("overviewResult");

  if (!overviewRows.length) {
    resultArea.textContent = "目前沒有可顯示的學生資料。";
    return;
  }

  const isAdmin = currentProfile.role === "admin";
  const isGrade3 = overviewRows[0]?.class_name === "國三班";

  function renderSubjectRecords(student, subject) {
    const records = student.scores
      .filter(s => s.subject === subject)
      .sort((a, b) => String(a.scope || "").localeCompare(String(b.scope || ""), "zh-TW"));

    if (records.length === 0) {
      return `<span class="notice">—</span>`;
    }

    return records.map(record => {
      const resultText = isGrade3
        ? `
          <div>
            <strong>答對題數：</strong>
            ${escapeHTML(record.correct_count ?? "—")} 題
          </div>
          <div>
            <strong>模擬考等級：</strong>
            <span class="grade-level">${escapeHTML(record.grade_level || "—")}</span>
          </div>
        `
        : `
          <div>
            <strong>成績：</strong>
            <span class="${scoreClass(record.score, student.class_name)}">
              ${escapeHTML(record.score ?? "—")}
            </span>
            分
          </div>
        `;

      return `
        <div class="score-record">
          <div><strong>範圍：</strong>${escapeHTML(record.scope || "未填寫")}</div>
          ${resultText}

          ${
            isAdmin
              ? `
                <button
                  type="button"
                  class="danger"
                  onclick="deleteScore('${escapeHTML(record.id)}')"
                >刪除此筆</button>
              `
              : ""
          }
        </div>
      `;
    }).join("");
  }

  resultArea.innerHTML = `
    <p>共 ${overviewRows.length} 位學生</p>

    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>學生編號</th>
            <th>學生姓名</th>
            ${SUBJECTS.map(subject => `<th>${subject}（範圍及成績）</th>`).join("")}
          </tr>
        </thead>

        <tbody>
          ${overviewRows.map(student => `
            <tr>
              <td>${escapeHTML(student.student_code)}</td>
              <td>${escapeHTML(student.full_name)}</td>

              ${SUBJECTS.map(subject => `
                <td style="min-width:190px;white-space:normal;">
                  ${renderSubjectRecords(student, subject)}
                </td>
              `).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// ==================================================
// 26. 刪除單筆成績
// ==================================================

async function deleteScore(scoreId) {
  if (currentProfile?.role !== "admin") {
    alert("只有管理者可以刪除成績。");
    return;
  }

  const student = overviewRows.find(s =>
    s.scores.some(score => score.id === scoreId)
  );

  if (!student) {
    alert("找不到這筆成績資料。");
    return;
  }

  const targetScore = student.scores.find(
    score => score.id === scoreId
  );

  if (!targetScore) {
    alert("找不到指定的成績。");
    return;
  }

  const resultText = student.class_name === "國三班"
    ? `${targetScore.correct_count ?? "—"} 題／${targetScore.grade_level || "—"}`
    : `${targetScore.score ?? "—"} 分`;

  const confirmed = confirm(
    `確定要刪除這筆成績嗎？\n\n` +
    `學生：${student.full_name}\n` +
    `科目：${targetScore.subject}\n` +
    `範圍：${targetScore.scope || "未填寫"}\n` +
    `成績：${resultText}\n\n` +
    "只會刪除這一筆成績。"
  );

  if (!confirmed) return;

  const { error } = await db
    .from("scores")
    .delete()
    .eq("id", scoreId);

  if (error) {
    showMessage("刪除成績失敗：" + error.message, "error");
    return;
  }

  showMessage(
    `${student.full_name} 的 ${targetScore.subject}（${targetScore.scope}）成績已刪除。`,
    "success"
  );

  await queryOverviewScores();
}

// ==================================================
// 27. 多場次成績匯出 CSV
// ==================================================

async function exportSelectedExamsCSV() {
  if (currentProfile?.role !== "admin") {
    showMessage("只有管理者可以匯出成績。", "error");
    return;
  }

  const className = document.getElementById("exportClass").value;

  const selectedExamIds = [
    ...document.querySelectorAll(".export-exam-checkbox:checked")
  ].map(input => input.value);

  if (selectedExamIds.length === 0) {
    alert("請至少勾選一個週考場次。");
    return;
  }

  const selectedExams = examsCache
    .filter(exam => selectedExamIds.includes(exam.id))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  if (selectedExams.length === 0) {
    alert("找不到所選考試場次，請重新整理頁面。");
    return;
  }

  const button = document.getElementById("exportOverviewBtn");

  button.disabled = true;
  button.textContent = "正在整理成績……";

  try {
    const { data: students, error: studentError } = await db
      .from("students")
      .select("id,student_code,full_name,class_name")
      .eq("class_name", className)
      .order("student_code");

    if (studentError) {
      throw new Error("讀取學生資料失敗：" + studentError.message);
    }

    if (!students || students.length === 0) {
      throw new Error("這個班級目前沒有學生資料。");
    }

    const studentIds = students.map(s => s.id);

    let allScores = [];
    const batchSize = 200;

    for (let i = 0; i < studentIds.length; i += batchSize) {
      const batchIds = studentIds.slice(i, i + batchSize);

      const { data: scores, error: scoreError } = await db
        .from("scores")
        .select("student_id,exam_id,subject,score,scope,correct_count,grade_level")
        .in("student_id", batchIds)
        .in("exam_id", selectedExamIds);

      if (scoreError) {
        throw new Error("讀取成績失敗：" + scoreError.message);
      }

      allScores = allScores.concat(scores || []);
    }

    const scoreMap = {};

    allScores.forEach(score => {
      const key = [
        score.student_id,
        score.exam_id,
        score.subject
      ].join("|");

      if (!scoreMap[key]) {
        scoreMap[key] = [];
      }

      scoreMap[key].push(score);
    });

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

    const rows = [];

    students.forEach(student => {
      selectedExams.forEach(exam => {
        let hasAnyScore = false;

        SUBJECTS.forEach(subject => {
          const key = [
            student.id,
            exam.id,
            subject
          ].join("|");

          const records = (scoreMap[key] || [])
            .slice()
            .sort((a, b) =>
              String(a.scope || "").localeCompare(
                String(b.scope || ""),
                "zh-TW"
              )
            );

          records.forEach(record => {
            hasAnyScore = true;

            rows.push([
              exam.title,
              student.class_name,
              student.student_code,
              student.full_name,
              subject,
              record.scope || "",
              student.class_name === "國三班" ? "" : (record.score ?? ""),
              student.class_name === "國三班" ? (record.correct_count ?? "") : "",
              student.class_name === "國三班" ? (record.grade_level || "") : ""
            ]);
          });
        });

        if (!hasAnyScore) {
          rows.push([
            exam.title,
            student.class_name,
            student.student_code,
            student.full_name,
            "",
            "",
            "",
            "",
            ""
          ]);
        }
      });
    });

    const csvCell = value =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const csv = "\uFEFF" + [
      headers,
      ...rows
    ].map(row =>
      row.map(csvCell).join(",")
    ).join("\r\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const today = new Date();

    const dateText =
      today.getFullYear() +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");

    link.href = url;
    link.download =
      `小象成績_${className}_${selectedExams.length}個週考_${dateText}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showMessage(
      `匯出成功！${className}，共 ${students.length} 位學生、${selectedExams.length} 個週考場次，已整理 ${rows.length} 列資料。`,
      "success"
    );

  } catch (error) {
    showMessage("匯出失敗：" + error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "匯出所選場次 Excel CSV";
  }
}

// ==================================================
// 28. 綁定家長與學生
// ==================================================

async function bindGuardian(event) {
  event.preventDefault();

  const form = new FormData(event.target);

  const email = String(form.get("email") || "").trim().toLowerCase();
  const studentId = form.get("student_id");

  const { data: profiles, error: profileError } = await db
    .from("profiles")
    .select("id,email,role")
    .ilike("email", email);

  if (profileError) {
    showMessage("查詢家長帳號失敗：" + profileError.message, "error");
    return;
  }

  const guardian = (profiles || []).find(
    p => (p.email || "").toLowerCase() === email
  );

  if (!guardian) {
    showMessage(
      "找不到這個家長帳號，請先在 Supabase 建立帳號。",
      "error"
    );
    return;
  }

  if (guardian.role !== "parent") {
    showMessage("此帳號不是家長帳號，無法進行綁定。", "error");
    return;
  }

  const { error } = await db
    .from("guardian_students")
    .insert({
      guardian_id: guardian.id,
      student_id: studentId
    });

  if (error) {
    if (error.code === "23505") {
      showMessage("這位家長已經綁定該學生。", "error");
    } else {
      showMessage("綁定失敗：" + error.message, "error");
    }
    return;
  }

  showMessage("家長與學生綁定成功！", "success");
  event.target.reset();
}

// ==================================================
// 29. 管理者查看家長登入紀錄
// ==================================================

async function loadLoginEvents() {
  if (currentProfile?.role !== "admin") return;

  const area = document.getElementById("loginList");
  if (!area) return;

  area.textContent = "正在讀取登入紀錄……";

  const { data: events, error } = await db
    .from("login_events")
    .select("user_id,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    area.textContent = "讀取登入紀錄失敗：" + error.message;
    return;
  }

  if (!events || events.length === 0) {
    area.textContent = "目前尚無登入紀錄。";
    return;
  }

  const userIds = [...new Set(events.map(e => e.user_id))];

  const { data: profiles, error: profileError } = await db
    .from("profiles")
    .select("id,email,display_name,role")
    .in("id", userIds);

  if (profileError) {
    area.textContent = "讀取帳號資料失敗：" + profileError.message;
    return;
  }

  const profileMap = {};

  (profiles || []).forEach(p => {
    profileMap[p.id] = p;
  });

  const parentEvents = events.filter(e =>
    profileMap[e.user_id]?.role === "parent"
  );

  if (parentEvents.length === 0) {
    area.textContent = "目前尚無家長登入紀錄。";
    return;
  }

  const loginCounts = {};
  const lastLogin = {};

  parentEvents.forEach(e => {
    loginCounts[e.user_id] =
      (loginCounts[e.user_id] || 0) + 1;

    if (!lastLogin[e.user_id]) {
      lastLogin[e.user_id] = e.created_at;
    }
  });

  const parentIds = Object.keys(loginCounts);

  const { data: guardianLinks, error: guardianError } = await db
    .from("guardian_students")
    .select("guardian_id,student_id")
    .in("guardian_id", parentIds);

  if (guardianError) {
    area.textContent = "讀取家長綁定資料失敗：" + guardianError.message;
    return;
  }

  const studentIds = [
    ...new Set((guardianLinks || []).map(link => link.student_id))
  ];

  let students = [];

  if (studentIds.length > 0) {
    const { data: studentData, error: studentError } = await db
      .from("students")
      .select("id,full_name")
      .in("id", studentIds);

    if (studentError) {
      area.textContent = "讀取學生姓名失敗：" + studentError.message;
      return;
    }

    students = studentData || [];
  }

  const studentMap = {};

  students.forEach(student => {
    studentMap[student.id] = student.full_name;
  });

  const guardianStudentNames = {};

  (guardianLinks || []).forEach(link => {
    const studentName = studentMap[link.student_id];
    if (!studentName) return;

    if (!guardianStudentNames[link.guardian_id]) {
      guardianStudentNames[link.guardian_id] = [];
    }

    if (!guardianStudentNames[link.guardian_id].includes(studentName)) {
      guardianStudentNames[link.guardian_id].push(studentName);
    }
  });

  area.innerHTML = `
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>學生姓名</th>
            <th>登入次數</th>
            <th>最後登入時間</th>
          </tr>
        </thead>

        <tbody>
          ${parentIds.map(id => {
            const names = guardianStudentNames[id] || [];

            return `
              <tr>
                <td>
                  ${escapeHTML(
                    names.length > 0
                      ? names.join("、")
                      : "尚未綁定學生"
                  )}
                </td>

                <td>${loginCounts[id]}</td>

                <td>
                  ${escapeHTML(
                    new Date(lastLogin[id]).toLocaleString("zh-TW")
                  )}
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// ==================================================
// 30. 家長查詢成績：每位學生只顯示最近三次週考
// ==================================================

async function loadParentScores() {
  const area = document.getElementById("parentScores");
  if (!area) return;

  area.textContent = "正在讀取成績……";

  const { data: links, error: linkError } = await db
    .from("guardian_students")
    .select("student_id")
    .eq("guardian_id", currentUser.id);

  if (linkError) {
    area.textContent = "讀取學生綁定資料失敗：" + linkError.message;
    return;
  }

  if (!links || links.length === 0) {
    area.textContent = "目前尚未綁定學生資料。";
    return;
  }

  const studentIds = links.map(link => link.student_id);

  const { data: students, error: studentError } = await db
    .from("students")
    .select("id,student_code,full_name,class_name")
    .in("id", studentIds);

  if (studentError) {
    area.textContent = "讀取學生資料失敗：" + studentError.message;
    return;
  }

  const { data: scores, error: scoreError } = await db
    .from("scores")
    .select("id,student_id,exam_id,subject,score,scope,correct_count,grade_level")
    .in("student_id", studentIds);

  if (scoreError) {
    area.textContent = "讀取成績失敗：" + scoreError.message;
    return;
  }

  const examIds = [...new Set((scores || []).map(s => s.exam_id))];

  let exams = [];

  if (examIds.length > 0) {
    const { data: examData, error: examError } = await db
      .from("exams")
      .select("id,title,start_date,end_date")
      .in("id", examIds)
      .order("start_date", { ascending: false });

    if (examError) {
      area.textContent = "讀取考試場次失敗：" + examError.message;
      return;
    }

    exams = examData || [];
  }

  const examMap = {};

  exams.forEach(e => {
    examMap[e.id] = e;
  });

  area.innerHTML = (students || []).map(student => {
    const isGrade3 = isGrade3Class(student.class_name);

    const studentScores = (scores || []).filter(
      s => s.student_id === student.id
    );

    const studentExamIds = [
      ...new Set(studentScores.map(s => s.exam_id))
    ];

    const studentExams = studentExamIds
      .map(id => examMap[id])
      .filter(Boolean)
      .sort((a, b) => {
        const dateCompare = b.start_date.localeCompare(a.start_date);

        if (dateCompare !== 0) return dateCompare;

        return b.end_date.localeCompare(a.end_date);
      });

    const recentStudentExams = studentExams.slice(0, 3);

    return `
      <section class="panel">
        <h3>
          ${escapeHTML(student.class_name)}
          ｜${escapeHTML(student.full_name)}
        </h3>

        <p class="notice">顯示最近三次週考紀錄</p>

        ${
          recentStudentExams.length === 0
            ? `<p class="notice">目前尚無成績資料。</p>`
            : recentStudentExams.map(exam => {
                const examScores = studentScores
                  .filter(s => s.exam_id === exam.id)
                  .sort((a, b) => {
                    const aIndex = SUBJECTS.indexOf(a.subject);
                    const bIndex = SUBJECTS.indexOf(b.subject);

                    return (
                      (aIndex === -1 ? 99 : aIndex) -
                      (bIndex === -1 ? 99 : bIndex)
                    );
                  });

                return `
                  <h4>${escapeHTML(exam.title)}</h4>

                  <div class="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>科目</th>
                          <th>考試範圍</th>
                          ${
                            isGrade3
                              ? "<th>答對題數</th><th>模擬考等級</th>"
                              : "<th>成績</th>"
                          }
                        </tr>
                      </thead>

                      <tbody>
                        ${examScores.map(s => `
                          <tr>
                            <td>${escapeHTML(s.subject)}</td>
                            <td>${escapeHTML(s.scope || "—")}</td>

                            ${
                              isGrade3
                                ? `
                                  <td>${escapeHTML(s.correct_count ?? "—")} 題</td>
                                  <td>
                                    <span class="grade-level">
                                      ${escapeHTML(s.grade_level || "—")}
                                    </span>
                                  </td>
                                `
                                : `
                                  <td>
                                    <span class="${scoreClass(s.score, student.class_name)}">
                                      ${escapeHTML(s.score ?? "—")}
                                    </span>
                                  </td>
                                `
                            }
                          </tr>
                        `).join("")}
                      </tbody>
                    </table>
                  </div>
                `;
              }).join("")
        }
      </section>
    `;
  }).join("");
}

// ==================================================
// 31. 登出
// ==================================================

async function logout() {
  await db.auth.signOut();

  currentUser = null;
  currentProfile = null;

  studentsCache = [];
  examsCache = [];

  overviewRows = [];
  overviewExamId = "";

  loginPage();
}

// ==================================================
// 32. 網站啟動
// ==================================================

async function initializeApp() {
  const { data, error } = await db.auth.getSession();

  if (error) {
    loginPage();
    return;
  }

  if (data.session?.user) {
    currentUser = data.session.user;
    await loadCurrentProfile();
  } else {
    loginPage();
  }
}

initializeApp();
```
