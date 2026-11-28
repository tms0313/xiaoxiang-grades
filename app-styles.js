// ==================================================
// 2. 畫面樣式
// ==================================================

const style = document.createElement("style");

style.textContent = [
  "body { margin:0; background:#f3f5f8; color:#263445; font-family:Arial,'Microsoft JhengHei',sans-serif; }",
  "* { box-sizing:border-box; }",
  "button,input,select { font:inherit; }",
  "h3:not([style*=\"font-size\"]) { font-size:20px !important; }",
  "small { font-size:14px; }",
  "button { cursor:pointer; }",

  ".login-wrap { min-height:100vh; display:flex; justify-content:center; align-items:center; padding:20px; }",
  ".login-card { width:min(420px,100%); background:#fff; padding:35px; border-radius:18px; box-shadow:0 8px 30px rgba(0,0,0,.08); }",
  ".login-card h1 { text-align:center; font-size: 24px; margin:0 0 8px; color:#23466b; }",
  ".login-card p { text-align:center; color:#315d86; font-size: 16px; font-weight:750; margin-bottom:25px; }",

  ".field { margin-bottom:16px; }",
  ".field label { display:block; font-weight:700; margin-bottom:7px; }",
  "/* 每週出缺席追蹤：選擇週次／班級標籤與下拉選單間距比照學生管理表單 */",
  ".attendance-weekly-filter { display:flex; flex-direction:column; align-items:stretch; gap:0; min-width:0; }",
  ".attendance-weekly-filter > label { display:block !important; text-align:left !important; margin:0 0 7px 0 !important; padding:0 !important; line-height:1.5 !important; }",
  ".attendance-weekly-filter > select { display:block; margin:0 !important; }",
  ".exam-date-range-field > label { font-size: 16px !important; font-weight:700 !important; line-height:1.5 !important; }",
  "#examFormRow { display:flex !important; align-items:flex-end !important; flex-wrap:wrap !important; gap:10px !important; }",
  "#examFormRow .exam-date-range-field { flex:0 1 420px !important; width:420px !important; max-width:100% !important; min-width:260px !important; margin:0 !important; }",
  "#examFormRow .exam-date-range-control { position:relative !important; width:100% !important; }",
  "#examFormRow #examDateRangeDisplay { display:block !important; width:100% !important; height:40px !important; min-height:40px !important; box-sizing:border-box !important; padding:0 42px 0 12px !important; }",
  "#examFormRow .exam-calendar-trigger { position:absolute !important; right:1px !important; top:1px !important; height:38px !important; min-height:38px !important; width:38px !important; padding:0 !important; border-radius:0 7px 7px 0 !important; }",
  "#examFormRow > button[type=submit], #examFormRow > button#examCancel { flex:0 0 auto !important; height:40px !important; min-height:40px !important; margin:0 0 0 0 !important; white-space:nowrap !important; }",
  "@media(max-width:600px) { #examFormRow { align-items:flex-end !important; gap:8px !important; } #examFormRow .exam-date-range-field { flex:1 1 100% !important; width:100% !important; min-width:0 !important; } }",
  ".field input,.field select { width:100%; padding:12px; border:1px solid #ccd4df; border-radius:8px; background:#fff; }",
  ".student-subject-field > label { display:block; margin-bottom:9px; }",
  ".student-subject-options { display:flex; align-items:center; flex-wrap:nowrap; gap:26px; }",
  ".student-subject-option { display:inline-flex !important; align-items:center; gap:7px; margin:0 !important; font-size: 16px; font-weight:700 !important; white-space:nowrap; cursor:pointer; }",
  ".student-subject-option input[type=checkbox] { appearance:auto; -webkit-appearance:checkbox; width:16px !important; height:16px !important; min-width:16px; margin:0; padding:0; accent-color:#315d86; cursor:pointer; }",
  "@media(max-width:600px) { .student-subject-options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); column-gap:18px; row-gap:10px; justify-items:start; } .student-subject-option { font-size: 16px; font-weight:700 !important; } }",

  ".btn { border:0; border-radius:8px; padding:10px 16px; background:#315d86; color:#fff; font-weight:700; }",
  ".btn:hover { filter:brightness(.94); }",
  ".btn-secondary { background:#64748b; }",
  ".btn-danger { background:#bd4242; }",
  ".btn-success { background:#27845b; }",
  "#scorePrevStudent { background:#27845b; }",
  "#scoreNextStudent { background:#64748b; }",
  "#scorePrevStudent:disabled, #scoreNextStudent:disabled { opacity:1; }",
  ".btn-small { padding:5px 9px; font-size: 14px; margin:0; white-space:nowrap; }",
  ".login-card .btn { width:100%; padding:13px; }",
  ".btn:disabled { opacity:.6; cursor:not-allowed; }",

  ".forgot-password { margin-top:18px; padding:13px; border-radius:8px; background:#f1f5f9; color:#526477; font-size: 14px; line-height:1.8; text-align:center; }",
  ".system-message { display:none; padding:12px 15px; border-radius:8px; margin-bottom:16px; background:#fff3cd; color:#765b13; }",
  ".system-message.error { background:#fde8e8; color:#a32626; }",
  ".system-message.success { background:#e3f5e9; color:#20683d; }",
  ".score-edit-overlay { position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; padding:18px; background:rgba(20,34,50,.58); overflow-y:auto; }",
  ".score-edit-dialog { width:min(480px,100%); max-height:calc(100vh - 36px); overflow-y:auto; background:#fff; border-radius:16px; padding:22px; box-shadow:0 18px 55px rgba(0,0,0,.24); }",
  ".score-edit-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:18px; }",
  ".score-edit-header h3 { margin:0 0 6px; color:#23466b; font-size: 20px; }",
  ".score-edit-header p { margin:0; color:#64748b; font-size: 14px; line-height:1.6; }",
  ".score-edit-close { border:0; background:#eef2f6; color:#475569; border-radius:8px; width:34px; height:34px; font-size: 24px; line-height:1; }",
  ".score-edit-dialog .field input,.score-edit-dialog .field select { min-height:40px; }",
  ".score-edit-note { margin:4px 0 16px; color:#64748b; font-size: 14px; line-height:1.6; }",
  ".score-edit-actions { display:flex; gap:10px; justify-content:flex-end; }",
  ".score-edit-actions .btn { min-width:104px; }",
  "@media(max-width:600px) { .score-edit-overlay { align-items:flex-end; padding:10px; } .score-edit-dialog { max-height:88vh; padding:18px; border-radius:16px 16px 12px 12px; } .score-edit-actions { position:sticky; bottom:-18px; background:#fff; padding:12px 0 2px; } .score-edit-actions .btn { flex:1; } }",

  ".topbar { background:#23466b; color:#fff; padding:16px 24px; display:flex; justify-content:space-between; align-items:center; gap:15px; flex-wrap:wrap; }",
  ".topbar h1 { font-size: 20px; margin:0; color:#fff; }",
  ".topbar small { color:#fff; }",
  ".parent-action-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:38px; padding:8px 12px; border:1px solid rgba(255,255,255,.34); border-radius:9px; color:#fff; font-size: 18px !important; font-weight:800; letter-spacing:.2px; vertical-align:middle; transition:background .15s,transform .15s,box-shadow .15s; }",
  ".parent-action-btn:hover { transform:translateY(-1px); box-shadow:0 3px 10px rgba(0,0,0,.18); }",
  ".parent-password-btn { background:#3c78a8; }",
  ".parent-password-btn:hover { background:#4b8bbd; }",
  ".parent-logout-btn { background:#a83e45; }",
  ".parent-logout-btn:hover { background:#c04d55; }",
  ".logout-action { background:#a83e45 !important; color:#fff !important; font-size: 16px !important; }",
  ".logout-action:hover { background:#c04d55 !important; color:#fff !important; }",
  ".parent-action-icon { width:18px; height:18px; flex:0 0 18px; fill:none; stroke:currentColor; stroke-width:1.9; stroke-linecap:round; stroke-linejoin:round; }",
  ".parent-bottom-nav { position:fixed; left:0; right:0; bottom:0; z-index:1000; display:flex; width:100%; padding:8px 10px calc(8px + env(safe-area-inset-bottom)); background:rgba(255,255,255,.98); border-top:1px solid #dce4ed; box-shadow:0 -4px 18px rgba(31,55,82,.12); }",
  ".teacher-bottom-nav { position:fixed; left:0; right:0; bottom:0; z-index:1000; display:flex !important; align-items:center; justify-content:center; width:100%; padding:7px 10px calc(7px + env(safe-area-inset-bottom)); background:rgba(255,255,255,.98); border-top:1px solid #dce4ed; box-shadow:0 -4px 18px rgba(31,55,82,.12); }",
  ".teacher-bottom-nav .parent-action-btn { flex:0 0 64px; width:64px; min-width:64px; min-height:52px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; border:0; border-radius:10px; color:#fff; font-size: 18px !important; font-weight:750; padding:5px 6px; background:#a83e45; }",
  ".teacher-bottom-nav .parent-action-icon { width:19px; height:19px; flex:0 0 19px; stroke-width:1.9; }",
  ".teacher-page { padding-bottom:88px; }",
  ".parent-page { padding-bottom:94px; }",

  ".dashboard { width:min(1200px,94%); margin:30px auto; background:#fff; padding:28px; border-radius:16px; box-shadow:0 8px 30px rgba(0,0,0,.08); }",
  ".tabs { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:22px; border-bottom:1px solid #e4e9ef; padding-bottom:15px; }",
  ".tab-btn { border:0; padding:10px 14px; border-radius:8px; background:#edf1f5; color:#34475b; font-weight:700; }",
  ".tabs .tab-btn, #adminTabs .tab-btn, .parent-bottom-nav .parent-action-btn, .teacher-bottom-nav .parent-action-btn { text-decoration:none !important; }",
  ".tab-btn:hover { background:#315d86; color:#fff; }",
  ".tab-btn.active { background:#315d86; color:#fff; }",

  ".section-title { font-size: 20px; margin:0 0 18px; color:#23466b; }",
  ".toolbar { display:flex; gap:10px; flex-wrap:wrap; margin:15px 0; align-items:center; }",
  ".toolbar input,.toolbar select { padding:9px; border:1px solid #ccd4df; border-radius:7px; }",
  ".teacher-toolbar { display:flex; flex-direction:column; align-items:stretch; gap:10px; }",
  ".teacher-filter-group { display:flex; flex-direction:column; align-items:stretch; gap:6px; width:100%; }",
  ".teacher-filter-group label { margin:0; }",
  ".teacher-filter-group select { width:100%; box-sizing:border-box; }",
  ".teacher-toolbar #teacherRefreshButton { align-self:flex-start; }",
  ".form-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:14px; }",
  "#teacherAssignmentPanel .form-grid { grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr)); }",
  "#teacherAssignmentPanel .form-grid .field { min-width:0; width:100%; }",
  "#teacherAssignmentPanel .form-grid select { display:block; box-sizing:border-box; width:100%; min-width:0; max-width:100%; min-height:40px; height:40px; padding:0 12px; line-height:1.4; white-space:nowrap; }",
  ".alumni-score-form { background:#f7f9fc; border:1px solid #dfe7ef; border-radius:12px; padding:18px; margin-bottom:20px; }",
  ".alumni-score-basic-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); column-gap:12px; row-gap:5px; }",
  ".alumni-score-subject-grid { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); column-gap:12px; row-gap:5px; align-items:end; margin-top:5px; }",
  ".alumni-score-form .field { margin-bottom:2px; min-width:0; }",
  ".alumni-score-form .field input,.alumni-score-form .field select { box-sizing:border-box; min-width:0; }",
  ".alumni-score-total { display:flex; flex-direction:column; justify-content:center; align-items:center; gap:6px; min-height:70px; box-sizing:border-box; padding:10px 8px; background:#eaf2f9; border-radius:8px; color:#23466b; font-weight:800; text-align:center; }",
  ".alumni-score-total strong { font-size: 20px; }",
  ".alumni-score-table { min-width:920px; }",
  ".alumni-score-table td { text-align:left; white-space:nowrap; }",
  ".alumni-score-table td.alumni-score-number { text-align:center; }",
  ".alumni-score-table th { text-align:center; white-space:nowrap; }",
  ".alumni-score-table th { padding:8px 9px; }",
  ".alumni-score-table td { padding:5px 9px; line-height:1.25; }",
  ".alumni-score-table tbody td,.alumni-score-table tbody td * { font-size:18px !important; }",
  ".alumni-filter-row { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); align-items:stretch; gap:8px; margin:0 0 14px; width:100%; }",
  "#alumniHistoryTitle,#termExamOverviewTitle { font-size:18px !important; }",
  ".alumni-filter-row select,.alumni-filter-row input { box-sizing:border-box; display:block; width:100%; min-width:0; max-width:none; height:40px; min-height:40px; margin:0; padding:9px 8px; border:1px solid #ccd4df; border-radius:8px; background:#fff; font-size: 18px !important; line-height:20px; }",
  ".alumni-filter-row > #alumniFilteredExportButton { font-size:18px !important; align-self:start !important; justify-self:stretch; display:block; box-sizing:border-box; width:100%; height:40px !important; min-height:40px !important; margin:0 !important; padding:0 10px !important; line-height:40px !important; vertical-align:top; }",
  "@media(max-width:900px) { .alumni-filter-row { grid-template-columns:repeat(3,minmax(0,1fr)); } }",
  "@media(max-width:600px) { .alumni-filter-row { grid-template-columns:minmax(0,1fr); gap:8px; } .alumni-filter-row select,.alumni-filter-row input { width:100%; min-width:0; height:40px; min-height:40px; box-sizing:border-box; padding:0 10px; font-size:18px !important; line-height:1.3; } .alumni-filter-row > #alumniFilteredExportButton { width:100%; font-size:18px !important; } }",
  ".alumni-score-table th:nth-child(2),.alumni-score-table th:nth-child(3) { text-align:left; }",
  ".alumni-score-actions { display:flex; gap:3px; justify-content:center; }",
  ".alumni-score-actions .btn { flex:0 0 auto !important; width:42px !important; min-width:42px !important; height:30px !important; min-height:30px !important; padding:0 !important; font-size:18px !important; font-weight:800 !important; line-height:30px !important; border-radius:6px !important; white-space:nowrap; }",
  "@media(max-width:760px) { .alumni-score-basic-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .alumni-score-subject-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }",
  "@media(max-width:600px) { .alumni-score-form { padding:13px; } .alumni-score-basic-grid { grid-template-columns:1fr; } .alumni-score-subject-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }",
  ".score-entry-fields-wrap { width:100%; overflow-x:auto; padding-bottom:4px; }",
  ".score-entry-fields { display:grid; grid-template-columns:repeat(6,minmax(130px,1fr)); gap:12px; min-width:852px; }",
  ".score-entry-fields .field { margin-bottom:0; }",
  ".panel { border:1px solid #e2e8ef; border-radius:12px; padding:18px; margin-bottom:18px; }",
  ".parent-page .panel { padding:20px 22px; margin:0 0 18px; border-radius:13px; }",
  ".parent-page .panel h3 { margin:0 0 17px; color:#315d86; font-size: 20px !important; font-weight:850; line-height:1.45; }",

  ".table-wrap { overflow-x:auto; width:100%; -webkit-overflow-scrolling:touch; }",
  "table { border-collapse:collapse; width:100%; min-width:650px; }",
  ".class-highest-preview-table { min-width:650px; table-layout:fixed; }",
  ".class-highest-preview-table th:nth-child(1),.class-highest-preview-table td:nth-child(1) { width:21%; white-space:nowrap; }",
  ".class-highest-preview-table th:nth-child(2),.class-highest-preview-table td:nth-child(2) { width:10%; white-space:nowrap; }",
  ".class-highest-preview-table th:nth-child(3),.class-highest-preview-table td:nth-child(3) { width:32%; }",
  ".class-highest-preview-table th:nth-child(4),.class-highest-preview-table td:nth-child(4) { width:21%; }",
  ".class-highest-preview-table th:nth-child(5),.class-highest-preview-table td:nth-child(5) { width:16%; }",
  "th,td { border-bottom:1px solid #e7ebf0; padding:11px 10px; text-align:left; vertical-align:middle; }",
  "th { background:#f3f6f9; color:#40566d; white-space:nowrap; }",
  "tr:hover td { background:#fafbfd; }",
  ".login-log-table { width:100%; min-width:0; table-layout:fixed; }",
  ".login-log-table th:first-child,.login-log-table td:first-child { width:40%; }",
  ".login-log-table th:last-child,.login-log-table td:last-child { width:60%; white-space:nowrap; }",
  ".login-log-table th,.login-log-table td { padding:9px 8px; }",
  ".login-log-table td:first-child { font-size: 14px; }",
  ".login-log-table .login-role-badge { font-size: 18px !important; }",
  "#clearLoginLogsButton { font-size: 18px !important; }",
  ".login-role-badge { display:inline-block; padding:3px 8px; border-radius:6px; font-size: 18px !important; font-weight:800; white-space:nowrap; }",
  ".login-role-admin { color:#2457a6; background:#eaf2ff !important; }",
  ".login-role-parent { color:#9a5700; background:#fff4e5 !important; }",
  ".login-role-teacher { color:#237447; background:#e9f7ef !important; }",
  ".login-role-unknown { color:#5b6470; background:#f3f4f6 !important; }",
  ".login-log-legend { display:flex; flex-wrap:wrap; gap:10px 16px; margin:10px 0 14px; font-size: 14px; }",
  ".login-log-legend-item { display:inline-flex; align-items:center; gap:6px; }",
  ".login-log-legend-swatch { width:13px; height:13px; border-radius:3px; border:1px solid rgba(0,0,0,.08); display:inline-block; }",
  ".login-log-legend-admin { background:#eaf2ff; }",
  ".login-log-legend-parent { background:#fff4e5; }",
  ".login-log-legend-teacher { background:#e9f7ef; }",

  ".overview-table { min-width:1050px; table-layout:fixed; }",
  ".overview-table th:nth-child(1),.overview-table td:nth-child(1) { width:13%; }",
  ".overview-table th:nth-child(2),.overview-table td:nth-child(2) { width:9%; }",
  ".overview-table th:nth-child(3),.overview-table td:nth-child(3) { width:8%; }",
  ".overview-table th:nth-child(4),.overview-table td:nth-child(4) { width:11%; }",
  ".overview-table th:nth-child(5),.overview-table td:nth-child(5) { width:8%; }",
  ".overview-table th:nth-child(6),.overview-table td:nth-child(6) { width:17%; }",
  ".overview-table th:nth-child(7),.overview-table td:nth-child(7) { width:13%; }",
  ".overview-table th:nth-child(8),.overview-table td:nth-child(8) { width:21%; }",
  ".overview-table .action-cell { min-width:100px; }",
  ".overview-table .action-buttons { gap:3px; }",
  ".overview-table .overview-status-button { display:inline-flex; align-items:center; justify-content:center; box-sizing:border-box; width:auto; min-width:58px; height:30px; min-height:30px; margin:0; padding:0 9px; border-radius:6px; font-size: 18px !important; font-weight:800; line-height:30px; white-space:nowrap; vertical-align:middle; }",
  ".overview-table .overview-status-leave { background:#e8f1fb !important; color:#1d4e89 !important; border:1px solid #b8d1ed; }",
  ".overview-table .overview-status-missing { background:#fde8e8 !important; color:#b42318 !important; border:1px solid #f4b8b8; }",
  ".overview-table .overview-missing-select { display:inline-flex; flex:0 0 auto; align-items:center; gap:4px; height:30px; margin-right:6px; font-size: 14px; line-height:30px; white-space:nowrap; box-sizing:border-box; }",
  ".overview-table .overview-missing-select input { appearance:auto; -webkit-appearance:checkbox; flex:0 0 14px; width:14px !important; min-width:14px !important; max-width:14px; height:14px !important; min-height:14px !important; max-height:14px; box-sizing:border-box; margin:0; padding:0; vertical-align:middle; accent-color:#315d86; }",
  ".overview-table .overview-missing-row .action-buttons { min-height:30px; height:30px; align-items:center; flex-wrap:nowrap; white-space:nowrap; }",
  ".overview-table .action-buttons .btn { padding:2.5px 4.5px; font-size: 14px; line-height:1.35; border-radius:5px; }",
  ".overview-table .action-buttons .btn { width:42px !important; min-width:42px !important; height:30px !important; min-height:30px !important; padding:0 !important; font-size: 18px !important; line-height:30px !important; border-radius:6px !important; }",
  ".overview-table .action-buttons .overview-exclude-reminder-btn { flex:0 0 auto !important; width:auto !important; min-width:0 !important; height:30px !important; min-height:30px !important; padding:0 9px !important; font-size: 18px !important; line-height:30px !important; border-radius:6px !important; white-space:nowrap; }",
  "#overviewMissingBatchBar #selectAllMissingButton,#overviewMissingBatchBar #clearMissingSelectionButton,#overviewMissingBatchBar #batchExcludeMissingButton { display:inline-flex !important; align-items:center !important; justify-content:center !important; box-sizing:border-box !important; height:40px !important; min-height:40px !important; max-height:40px !important; margin:0 !important; padding:0 12px !important; font-family:inherit !important; font-size:16px !important; font-weight:700 !important; line-height:20px !important; white-space:nowrap !important; vertical-align:middle !important; }",
  ".term-exam-overview-filters .field { min-width:0; display:flex; flex-direction:column; align-items:stretch; gap:5px; }",
  ".term-exam-overview-filters .field label { display:block; font-size:18px !important; height:auto !important; min-height:22px; margin:0 !important; padding:0 !important; line-height:1.5 !important; overflow:visible !important; white-space:nowrap; }",
  ".term-exam-overview-filters .field select,.term-exam-overview-filters .field input { display:block !important; width:100% !important; min-width:0 !important; height:40px !important; min-height:40px !important; max-height:40px !important; box-sizing:border-box !important; padding:0 10px !important; font-family:inherit !important; font-size: 18px !important; font-weight:400 !important; line-height:normal !important; vertical-align:middle; text-overflow:clip; }",
  ".term-exam-overview-filters .field select { overflow:visible !important; }",
  ".term-exam-overview-table td { padding:5px 10px; line-height:1.25; }",
  ".term-exam-overview-table { min-width:760px !important; table-layout:auto !important; }",
  ".term-exam-overview-table th,.term-exam-overview-table td { height:auto !important; min-height:0 !important; max-height:none !important; padding:9px 10px !important; line-height:1.5 !important; vertical-align:middle !important; overflow:visible !important; text-overflow:clip !important; white-space:nowrap !important; font-size: 18px !important; }",
  ".term-exam-overview-table th { font-size: 18px !important; }",
  ".term-exam-overview-table tbody td:not(.action-cell) { font-size: 18px !important; }",
  ".term-exam-overview-table th { font-weight:800 !important; }",
  ".term-exam-overview-table .action-cell { min-width:100px; }",
  ".term-exam-overview-table .action-buttons { gap:3px; }",
  ".term-exam-overview-table .action-buttons .btn { flex:0 0 auto !important; width:42px !important; min-width:42px !important; height:30px !important; min-height:30px !important; padding:0 !important; font-size:18px !important; font-weight:800 !important; line-height:30px !important; border-radius:6px !important; }",
  ".teacher-account-table .action-buttons { display:inline-flex; align-items:center; flex-wrap:nowrap; gap:4px; white-space:nowrap; }",
  ".teacher-account-table .action-buttons .btn { flex:0 0 auto !important; width:auto !important; min-width:0 !important; height:27px !important; min-height:27px !important; padding:0 7px !important; font-size: 14px !important; font-weight:700 !important; line-height:27px !important; border-radius:5px !important; white-space:nowrap; }",
  ".teacher-assignment-table td:last-child { white-space:nowrap; }",
  ".teacher-assignment-table td:last-child .btn { flex:0 0 auto !important; width:auto !important; min-width:0 !important; height:27px !important; min-height:27px !important; padding:0 7px !important; font-size: 14px !important; font-weight:700 !important; line-height:27px !important; border-radius:5px !important; white-space:nowrap; }",

  "/* 週考檢閱紀錄：檢閱時間欄位統一 18px，手機與桌面一致 */",
  "#appRoot #reviewRecordContent .student-record-table th:last-child,#appRoot #reviewRecordContent .student-record-table td:last-child { font-size:18px !important; }",
  ".action-cell { min-width:155px; white-space:nowrap; }",
  ".action-buttons { display:flex; align-items:center; justify-content:flex-start; flex-wrap:nowrap; gap:5px; white-space:nowrap; }",
  ".action-buttons .btn { flex:0 0 auto; margin:0; }",

  /* 家長成績：電腦與手機統一採用科目卡片式呈現 */
  ".parent-page .dashboard { max-width:1000px; padding:22px 24px; }",
  ".parent-brand { display:flex; flex:1 1 100%; flex-direction:row; align-items:center; justify-content:center; text-align:center; }",
  ".parent-brand h1 { width:100%; margin:0; color:#fff; text-align:center; font-size: 24px; line-height:1.4; letter-spacing:.3px; font-weight:850; }",
  ".teacher-page .topbar h1 { font-size:24px !important; line-height:1.4; letter-spacing:.3px; font-weight:850; }",
  ".teacher-dashboard { width:96% !important; max-width:none !important; margin:15px auto !important; }",
  "body.teacher-page, body.teacher-page #appRoot { background-color:#f3f5f8 !important; }",
  "body.teacher-page .topbar { background:#23466b !important; }",
  ".teacher-page .teacher-dashboard { background:#fff; border-radius:16px; box-shadow:0 8px 30px rgba(0,0,0,.08); }",
  ".teacher-class-panel { margin-bottom:10px; padding:12px 15px; }",
  ".teacher-class-heading { margin:0 0 9px; padding-bottom:7px; border-bottom:2px solid #dce7f1; color:#23466b; font-size: 20px; }",
  ".teacher-subject-section { margin:8px 0 10px; }",
  ".teacher-subject-heading { margin:0 0 5px; color:#315d86; font-size: 20px; }",
  ".teacher-scope-group { margin:0 0 7px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }",
  ".teacher-scope-heading { padding:7px 10px; background:#edf5f0; color:#267447; font-size: 20px; font-weight:800; line-height:1.45; }",
  ".teacher-score-rows { padding:0 9px; }",
  ".teacher-score-row { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; column-gap:14px; min-height:48px; padding:7px 4px; border-bottom:1px solid #edf0f3; }",
  ".teacher-score-row:last-child { border-bottom:0; }",
  ".teacher-score-student { display:flex; align-items:baseline; flex-wrap:nowrap; white-space:nowrap; gap:7px; min-width:0; color:#263445; font-size: 20px; font-weight:700; }",
  ".teacher-score-student small { color:#8a96a5; font-size: 14px; font-weight:500; white-space:nowrap; }",
  ".teacher-score-value { display:flex; flex-direction:row; align-items:center; justify-content:flex-start; justify-self:end; flex-wrap:nowrap; gap:6px; width:150px; min-width:150px; max-width:none; flex-shrink:0; padding-left:14px; border-left:1px solid #e8edf3; text-align:left; white-space:nowrap; font-size: 20px; font-weight:900; }",
  ".teacher-score-value .parent-score-number { font-size: 24px; font-weight:900; }",
  ".teacher-score-value .low-score { color:#d32626 !important; font-weight:900 !important; }",
  ".teacher-score-value .grade-tag { padding:4px 10px; font-size: 16px !important; }",
  ".teacher-score-value .grade-missing { padding:4px 10px; font-size: 16px; }",
  "/* 教師成績文字固定使用可讀色彩，避免繼承白色造成成績／未登錄狀態消失 */",
  ".teacher-page .teacher-score-value { color:#263445 !important; }",
  ".teacher-page .teacher-score-value .parent-score-number { color:#263445 !important; }",
  ".teacher-page .teacher-score-value .parent-score-number.low-score { color:#d32626 !important; }",
  ".teacher-page .teacher-score-value .grade-missing { color:#a35b08 !important; }",
  "@media(max-width:600px) { .teacher-class-panel { padding:10px; } .teacher-score-row { min-height:46px; column-gap:10px; padding:6px 2px; } .teacher-score-student { font-size: 20px; } .teacher-scope-heading { font-size: 20px; } .teacher-score-student small { font-size: 14px; } .teacher-score-value { justify-self:end; justify-content:flex-start; width:136px; min-width:136px; margin-left:auto; padding-left:10px; text-align:left; font-size: 20px; } .teacher-score-value .parent-score-number { font-size: 24px; } .teacher-score-value .grade-tag { font-size: 16px !important; } .teacher-score-value .grade-missing { font-size: 16px; } }",
  ".teacher-student-panel { margin-bottom:14px; }",
  ".teacher-student-panel h3 { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:12px; }",
  ".teacher-student-panel h3 small { color:#718096; font-size: 14px; font-weight:600; }",
  ".teacher-subject-card { max-width:780px; margin:8px auto; }",
  ".grade-missing { display:inline-block; padding:5px 9px; border-radius:7px; background:#fff4df; color:#a35b08; font-size: 14px; font-weight:800; white-space:nowrap; }",
  ".parent-score-list { display:flex; flex-direction:column; gap:6px; width:100%; max-width:820px; margin:0 auto; }",
  ".parent-subject-card { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:16px; border:1px solid #dfe7ef; border-radius:13px; padding:16px 18px; margin:0; background:#fff; }",
  ".parent-subject-info { min-width:0; }",
  ".parent-subject-name { font-size: 20px !important; font-weight:900; color:#23466b; margin-bottom:8px; line-height:1.4; }",
  ".parent-subject-scope { display:block; font-size: 14px; line-height:1.65; overflow-wrap:anywhere; word-break:break-word; }",
  ".parent-subject-scope-label { color:#8491a0; font-size: 14px; font-weight:800; }",
  ".parent-page .parent-subject-card .parent-subject-scope-text { display:inline-block !important; min-width:0; max-width:100%; padding:5px 11px !important; border:1px solid #c8ebd3 !important; border-radius:8px !important; background:#eaf8ef !important; color:#267447 !important; font-size: 14px !important; font-weight:700 !important; line-height:1.55; box-decoration-break:clone; -webkit-box-decoration-break:clone; }",
  ".parent-subject-result { min-width:104px; max-width:48%; text-align:left; padding-left:17px; border-left:1px solid #e8edf3; color:#263445; }",
  ".parent-subject-result-label { color:#8491a0; font-size: 14px; font-weight:800; margin-bottom:5px; }",
  ".parent-subject-result-value { font-size: 24px; font-weight:900; line-height:1.4; color:#173f68; overflow-wrap:anywhere; }",
  ".parent-subject-result-value .parent-score-number { font-size: 24px; font-weight:900; white-space:nowrap; }",
  ".parent-subject-result-value .grade-tag { display:inline-block; margin-top:3px; padding:4px 10px; font-size: 14px !important; line-height:1.4; vertical-align:middle; }",
  ".parent-subject-result-value .grade-absent { font-size: 16px; }",
  ".parent-score-crowned { display:inline-flex; flex-direction:column; align-items:center; vertical-align:middle; line-height:1.15; }",
  ".parent-highest-crown { position:relative; display:inline-block; width:23px; height:20px; margin:0 0 -2px; transform:rotate(0deg); filter:drop-shadow(0 1px 1px rgba(151,105,18,.28)); }",
  ".parent-highest-crown svg { display:block; width:100%; height:100%; overflow:visible; }",
  ".parent-highest-crown::after { content:none; }",

  ".student-management-table { width:100%; min-width:650px; table-layout:fixed; }",
  ".student-management-table td.student-subject-cell { font-size:inherit !important; font-weight:400 !important; }",
  ".student-management-table th:nth-child(1),.student-management-table td:nth-child(1) { width:15%; }",
  ".student-management-table th:nth-child(2),.student-management-table td:nth-child(2) { width:15%; }",
  ".student-management-table th:nth-child(3),.student-management-table td:nth-child(3) { width:15%; }",
  ".student-management-table th:nth-child(4),.student-management-table td:nth-child(4) { width:18%; }",
  ".student-management-table th:nth-child(5),.student-management-table td:nth-child(5) { width:15%; min-width:110px; }",
  ".student-management-table th:nth-child(6),.student-management-table td:nth-child(6) { width:15%; min-width:112px; }",
  ".student-status-active,.student-status-inactive { display:inline-block; padding:4px 8px; border-radius:6px; font-size: 18px !important; font-weight:800; white-space:nowrap; }",
  ".student-status-action { display:inline-flex; align-items:center; justify-content:center; gap:3px; min-width:42px; }",
  ".student-status-enable-icon { display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; font-size: 18px !important; font-weight:800; line-height:1; }",
  ".student-status-active { background:#e7f6ec; color:#237344; }",
  ".student-status-inactive { background:#f1f3f5; color:#697586; }",
  ".student-management-table .action-buttons { display:inline-flex; align-items:center; gap:9px; }",
  ".student-management-table .action-buttons .btn { padding:3px 6px; font-size: 14px; line-height:1.3; border-radius:6px; }",
  ".student-management-table .action-buttons .btn { width:42px !important; min-width:42px !important; height:30px !important; min-height:30px !important; padding:0 !important; font-size: 18px !important; line-height:30px !important; border-radius:6px !important; }",
  ".student-management-table td.student-action-cell { min-width:112px; padding-left:12px !important; text-align:left !important; white-space:nowrap; }",

  ".exam-management-table { min-width:600px; table-layout:fixed; }",
  ".exam-management-table th:nth-child(1),.exam-management-table td:nth-child(1) { width:30%; }",
  ".exam-management-table th:nth-child(2),.exam-management-table td:nth-child(2) { width:30%; }",
  ".exam-management-table th:nth-child(3),.exam-management-table td:nth-child(3) { width:40%; }",
  ".exam-management-table .action-cell { min-width:100px; }",
  ".exam-management-table .action-buttons { gap:3px; }",
  ".exam-management-table .action-buttons .btn { padding:2px 3px; font-size: 14px; line-height:1.3; border-radius:5px; }",
  ".exam-management-table .action-buttons .btn { width:42px !important; min-width:42px !important; height:30px !important; min-height:30px !important; padding:0 !important; font-size: 18px !important; line-height:30px !important; border-radius:6px !important; }",

  ".guardian-management-table { width:max-content; min-width:976px; table-layout:fixed; }",
  ".guardian-management-table th:nth-child(1),.guardian-management-table td:nth-child(1) { width:144px; white-space:nowrap; }",
  ".guardian-management-table th:nth-child(2),.guardian-management-table td:nth-child(2) { width:192px; }",
  ".guardian-management-table th:nth-child(3),.guardian-management-table td:nth-child(3) { width:300px; }",
  ".guardian-management-table th:nth-child(4),.guardian-management-table td:nth-child(4) { width:120px; }",
  ".guardian-linked-student { display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; min-width:0; padding:6px 8px; box-sizing:border-box; border-radius:6px; background:rgba(36,75,118,.06); }",
  ".guardian-linked-student-name { min-width:0; overflow-wrap:anywhere; }",
  ".guardian-linked-actions { display:inline-flex; align-items:center; justify-content:flex-end; flex:0 0 auto; gap:5px; }",
  ".guardian-linked-actions .btn { display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; width:auto !important; min-width:0 !important; height:30px !important; min-height:30px !important; padding:0 8px !important; font-size: 14px !important; font-weight:700; line-height:30px !important; border-radius:6px !important; white-space:nowrap; margin:0 !important; }",
  ".guardian-linked-actions [data-unbind] { min-width:42px !important; padding:0 7px !important; }",
  "/* 家長帳號管理清單：表頭、資料、未綁定狀態及所有操作文字統一 18px */",
  "#appRoot .guardian-management-table th,#appRoot .guardian-management-table td,#appRoot .guardian-management-table td * { font-size:18px !important; }",
  "#appRoot .guardian-management-table .guardian-status-unbound { font-size:18px !important; }",
  "#appRoot .guardian-management-table .guardian-linked-actions .btn { font-size:18px !important; font-weight:800 !important; }",
  ".guardian-management-table td { vertical-align:middle; }",
  ".guardian-unbound-row td { background:#fffaf0; }",
  ".password-table-wrap { max-width:820px; }",
  ".password-management-table { width:100%; min-width:0; max-width:820px; table-layout:fixed; }",
  ".password-management-table th:nth-child(1),.password-management-table td:nth-child(1) { width:24%; }",
  ".password-management-table th:nth-child(2),.password-management-table td:nth-child(2) { width:48%; }",
  ".password-management-table th:nth-child(3),.password-management-table td:nth-child(3) { width:28%; }",
  ".password-management-table .action-buttons { display:flex; align-items:center; flex-wrap:nowrap; gap:4px; }",
  ".password-management-table .action-buttons .btn { flex:0 0 auto !important; width:auto !important; min-width:0 !important; height:27px !important; min-height:27px !important; padding:0 7px !important; font-size: 18px !important; line-height:27px !important; border-radius:5px !important; white-space:nowrap; }",
  ".guardian-status-unbound { display:inline-flex; align-items:center; justify-content:center; box-sizing:border-box; width:auto; min-width:58px; height:30px; min-height:30px; margin:0; padding:0 9px; border-radius:6px; font-size: 14px; font-weight:800; line-height:30px; white-space:nowrap; vertical-align:middle; background:#e8f1fb !important; color:#1d4e89 !important; border:1px solid #b8d1ed; }",

  ".low-score { color:#d32626; font-weight:600; }",
  ".parent-score-list .low-score { color:#d32626 !important; font-weight:800 !important; }",
  ".grade-tag { display:inline-block; padding:4px 9px; border-radius:6px; background:#e8eff8; color:#315d86; font-weight:800; white-space:nowrap; }",
  ".grade-absent { color:#d32626 !important; background:#fde8e8 !important; font-weight:900 !important; }",
  ".grade-leave { color:#8a5a00 !important; background:#fff0cf !important; font-weight:900 !important; }",
  ".grade-select-absent { color:#d32626 !important; font-weight:900 !important; }",
  ".grade-select-leave { color:#8a5a00 !important; font-weight:900 !important; }",
  "#grade3MathGrade, #gradeLevel, #scoreEditGrade, .bulk-score-entry-table select[data-bulk-grade] { border-radius:9px !important; }",
  "option[value='缺考'] { color:#d32626; font-weight:900; }",
  "option[value='請假'] { color:#8a5a00; font-weight:900; }",

  ".export-panel { border:1px solid #e2e8ef; border-radius:12px; padding:20px; background:#fff; }",
  ".export-panel-title { font-size: 20px; font-weight:800; color:#315d86; margin-bottom:15px; }",
  ".export-select-all { display:flex; align-items:center; gap:11px; padding:15px 16px; border:1px solid #d8e2ed; border-radius:10px; background:#f2f6fa; margin-bottom:12px; cursor:pointer; }",
  ".export-select-all input { width:19px; height:19px; accent-color:#315d86; cursor:pointer; }",
  ".export-select-all span { font-weight:800; color:#23466b; }",
  ".export-period-list { display:flex; flex-direction:column; gap:8px; }",
  ".export-period-item { display:flex; align-items:center; gap:12px; padding:13px 16px; border:1px solid #e3e9f0; border-radius:9px; background:#fff; cursor:pointer; transition:background .15s,border-color .15s; }",
  ".export-period-item:hover { background:#f7f9fc; border-color:#b9cadb; }",
  ".export-period-item:has(input:checked) { background:#f0f5fa; border-color:#9db5cc; }",
  ".export-period-item input { width:18px; height:18px; accent-color:#315d86; flex:0 0 auto; cursor:pointer; }",
  ".export-period-date { font-weight:700; color:#34475b; }",
  ".export-summary { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; padding:15px 2px; color:#64748b; font-size: 14px; }",
  ".export-count { font-weight:800; color:#315d86; }",
  ".export-download { width:100%; padding:13px 18px; font-size: 14px; }",
  ".export-download:disabled { opacity:.45; cursor:not-allowed; }",
  ".export-empty { padding:25px; text-align:center; color:#8491a0; background:#f8fafc; border-radius:9px; }",
  ".overview-table .action-buttons .btn,.student-management-table .action-buttons .btn,.exam-management-table .action-buttons .btn { font-size: 18px !important; font-weight:800 !important; }",
  ".guardian-management-table .action-buttons .btn { font-size: 18px !important; font-weight:800 !important; padding:0 5px !important; }",
  ".export-panel-title,.export-select-all span,.export-period-date { font-size: 16px !important; font-weight:700 !important; line-height:1.5; }",
  ".export-period-list { gap:3px !important; }",
  ".export-period-item { padding:7px 12px !important; gap:10px !important; min-height:0; }",
  ".export-period-item input { width:19px; height:19px; }",
  ".export-summary { padding:9px 2px; }",
  ".login-card .field label { font-size: 20px !important; font-weight:800 !important; }",
  ".guardian-management-table .action-buttons .btn { width:42px !important; min-width:42px !important; height:30px !important; min-height:30px !important; padding:0 !important; font-size: 18px !important; font-weight:800 !important; line-height:30px !important; border-radius:6px !important; }",
  ".guardian-management-table th:nth-child(5),.guardian-management-table td:nth-child(5) { width:340px; min-width:340px; }",
  ".guardian-management-table .action-buttons [data-reset-parent],.guardian-management-table .action-buttons [data-delete-parent] { width:auto !important; min-width:82px !important; padding:0 8px !important; font-size:18px !important; white-space:nowrap !important; }",
  ".password-management-table .action-buttons .btn,.teacher-account-table .action-buttons .btn,[data-save-bulk-row] { flex:0 0 auto !important; width:auto !important; min-width:0 !important; height:30px !important; min-height:30px !important; padding:0 7px !important; font-size: 18px !important; font-weight:800 !important; line-height:30px !important; border-radius:6px !important; white-space:nowrap; }",
  ".term-roster-toolbar { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin:8px 0 12px; color:#526477; font-size: 14px; } .term-draft-status { color:#237344; font-weight:700; } .term-roster-wrap { max-height:68vh; overflow:auto; border:1px solid #e2e8ef; border-radius:9px; } .term-bulk-table { min-width:1120px; table-layout:fixed; } .term-bulk-table th,.term-bulk-table td { padding:7px 6px; text-align:center; white-space:nowrap; } .term-bulk-table tbody td { padding-top:4px !important; padding-bottom:4px !important; font-size: 16px !important; } .term-bulk-table th:first-child,.term-bulk-table td:first-child { width:150px; text-align:left; position:sticky; left:0; z-index:2; background:#fff; } .term-bulk-table th:first-child { z-index:3; background:#f1f5f9; } .term-bulk-table tbody td.term-student-name,.term-bulk-table tbody tr:hover td.term-student-name,.term-bulk-table tbody tr:focus-within td.term-student-name { background:#fff !important; background-color:#fff !important; } .term-bulk-table th { position:sticky; top:0; z-index:1; background:#f1f5f9; } .term-bulk-table input:not([type=\"checkbox\"]):not([type=\"radio\"]):not([type=\"hidden\"]):not([type=\"file\"]) { width:76px; box-sizing:border-box; height:40px !important; min-height:40px !important; max-height:40px !important; padding:0 8px; text-align:center; border:1px solid #ccd4df; border-radius:8px !important; } .term-bulk-table input[data-term-score],.term-bulk-table input[data-term-class-rank],.term-bulk-table input[data-term-school-rank] { font-size:inherit; } .term-bulk-table .term-student-name { box-sizing:border-box; display:flex; align-items:center !important; gap:6px; height:40px; min-height:40px; padding:4px 6px !important; line-height:1.2 !important; margin:0; color:#23466b; font-weight:400 !important; white-space:nowrap; vertical-align:middle !important; } .term-student-name-text { flex:0 0 auto; font-weight:400 !important; } .term-student-name small { display:inline; color:#8491a0; font-size: 14px; font-weight:500; } .term-completion-mark { display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; width:14px; height:14px; margin:0; padding:0; font-size: 14px; font-weight:900; line-height:1; } .term-completion-mark.is-complete { color:#168447; } .term-completion-mark.is-incomplete { color:#d32626; font-size: 14px; } .term-total-cell,.term-bulk-table tbody tr:hover .term-total-cell,.term-bulk-table tbody tr:focus-within .term-total-cell { font-weight:500; color:#23466b; background:#fff !important; background-color:#fff !important; box-shadow:none !important; filter:none !important; transition:none !important; } .term-bulk-actions { justify-content:flex-end; } .term-bulk-actions .btn { width:auto; min-width:150px; margin:0; }",
  "@media(max-width:600px) { .export-panel-title,.export-select-all span,.export-period-date { font-size: 16px !important; font-weight:700 !important; } .export-period-item { padding:6px 10px !important; } }",

  ".muted { color:#778494; font-size: 14px; }",
  ".empty { padding:25px; text-align:center; color:#8491a0; }",
  ".loading-message { position:fixed; top:15px; right:15px; z-index:9999; background:#23466b; color:#fff; padding:12px 18px; border-radius:8px; box-shadow:0 3px 12px rgba(0,0,0,.2); }",
  ".student-card { max-width:920px; border:1px solid #dce5ee; border-radius:15px; padding:25px 26px; margin:22px auto; background:#fff; box-shadow:0 4px 16px rgba(35,70,107,.045); }",
  ".student-card .student-heading { display:flex; align-items:center; flex-wrap:wrap; gap:10px 14px; margin:0 0 20px; padding:0 0 16px; border-bottom:1px solid #e6edf4; color:#23466b; line-height:1.4; }",
  ".student-card .student-name { font-size: 24px; font-weight:850; letter-spacing:.4px; color:#1e4165; }",
  ".student-card .student-class { display:inline-flex; align-items:center; min-height:31px; padding:5px 13px; border-radius:8px; background:#edf4fa; color:#315d86; font-size: 14px; font-weight:800; }",
  ".student-card .student-name { font-size: 24px; font-weight:850; letter-spacing:.3px; color:#1e4165; }",
  ".student-card .student-class { display:inline-flex; align-items:center; min-height:28px; padding:4px 11px; border-radius:7px; background:#edf4fa; color:#315d86; font-size: 14px; font-weight:800; }",
  ".footer { text-align:center; color:#8995a2; padding:25px; font-size: 14px; }",
  ".hidden { display:none !important; }",

  "@media(max-width:600px) {",
  ".dashboard { width:96%; padding:15px; margin:15px auto; }",
  ".parent-page .dashboard { max-width:none; padding:14px 12px; }",
  ".student-card { padding:18px 15px; margin:16px 0; border-radius:13px; }",
  ".student-card .student-heading { gap:8px 10px; margin-bottom:16px; padding-bottom:13px; }",
  ".student-card .student-class { min-height:29px; padding:4px 11px; font-size: 14px; }",
  ".parent-score-list { max-width:none; gap:6px; }",
  ".parent-page .panel { padding:16px 13px; margin-bottom:14px; }",
  ".parent-page .panel h3 { margin-bottom:14px; font-size: 20px !important; }",
  ".topbar { padding:14px; }",
  "body:not(.teacher-page):not(.parent-page) .topbar h1 { font-size:20px !important; }",
  ".parent-brand h1 { font-size: 24px; }",
  ".student-card .student-heading { align-items:center; }",
  ".login-card { padding:24px; }",
  ".tabs { gap:5px; }",
  "#adminTabs .tab-btn { padding:8px 10px; font-size:16px !important; }",

  /* 手機版維持科目左、成績右，縮小間距 */
  ".parent-subject-card { grid-template-columns:minmax(0,1fr) auto; gap:10px; padding:14px 12px; border-radius:11px; }",
  ".parent-subject-name { font-size: 20px !important; margin-bottom:7px; }",
  ".parent-subject-scope { font-size: 14px; line-height:1.6; }",
  ".parent-page .parent-subject-card .parent-subject-scope-text { padding:4px 9px !important; font-size: 14px !important; }",
  ".parent-subject-result-value { display:flex; align-items:center; justify-content:flex-start; flex-wrap:nowrap; gap:6px; }",
  ".parent-subject-result-value .grade-tag { margin-top:0; padding:3px 8px; font-size: 14px !important; line-height:1.35; vertical-align:middle; }",
  ".parent-subject-result { min-width:82px; max-width:45%; padding-left:10px; }",
  ".parent-subject-result-label { font-size: 14px; }",
  ".parent-subject-result-value { font-size: 24px; line-height:1.35; }",
  ".parent-subject-result-value .parent-score-number { font-size: 24px; }",
  ".student-card .student-heading { gap:0 9px; margin-bottom:14px; }",
  ".parent-page .parent-top-actions { display:flex !important; flex:0 0 100%; justify-content:center; }",
  ".parent-bottom-nav .parent-action-btn { flex:1 1 50%; min-width:0; min-height:56px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; border:0; border-radius:9px; color:#fff; font-size: 18px !important; font-weight:750; padding:5px 8px; }",
  ".parent-bottom-nav .parent-action-icon { width:19px; height:19px; flex:0 0 19px; stroke-width:1.9; }",
  ".parent-bottom-nav .parent-password-btn { background:#315f8b; }",
  ".parent-bottom-nav .parent-logout-btn { background:#a83e45; }",
  ".parent-bottom-nav .parent-action-btn:hover { transform:none; box-shadow:none; }",
  ".teacher-bottom-nav .parent-action-btn { flex:1 1 100%; }",

  ".student-management-table { min-width:650px; }",
  ".overview-table { min-width:1050px; }",
  ".exam-management-table { min-width:600px; }",
  ".export-panel { padding:14px; }",
  ".export-period-item { padding:12px; }",
  ".teacher-bottom-nav { position:fixed; left:0; right:0; bottom:0; z-index:1000; display:flex !important; width:100%; padding:8px 10px calc(8px + env(safe-area-inset-bottom)); background:rgba(255,255,255,.98); border-top:1px solid #dce4ed; box-shadow:0 -4px 18px rgba(31,55,82,.12); }",
  ".teacher-bottom-nav .parent-action-btn { flex:1 1 50%; min-width:0; min-height:56px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; border:0; border-radius:9px; color:#fff; font-size: 18px !important; font-weight:750; padding:5px 8px; }",
  ".teacher-bottom-nav .parent-password-btn { background:#315f8b; }",
  ".teacher-bottom-nav .parent-logout-btn { background:#a83e45; }",
  ".teacher-bottom-nav .parent-action-btn:hover { transform:none; box-shadow:none; }",
  ".teacher-page { padding-bottom:94px; }",
  "}"
].join("\n");

style.textContent += "\n" +
  ".parent-review-action { display:flex; justify-content:flex-end; margin-top:6px; padding-top:0; border-top:0; }" +
  ".parent-review-btn { width:100%; max-width:320px; min-height:44px; border:0; border-radius:9px; padding:10px 14px; background:#27845b; color:#fff; font-size: 14px; font-weight:800; }" +
  ".parent-review-btn:disabled { background:#e2e7ec; color:#64748b; border:1px solid #d2d9e1; opacity:1; cursor:not-allowed; box-shadow:none; }" +
  "@media(max-width:600px) { .parent-review-action { margin-top:5px; } .parent-review-btn { max-width:none; min-height:46px; font-size: 14px; } }";


/* 全站學生名單：統一採用週成績登錄的緊湊列距 */
style.textContent += "\n" +
  ".overview-table tbody td,.student-management-table tbody td,.exam-management-table tbody td,.term-bulk-table tbody td,.term-exam-overview-table tbody td,.alumni-score-table tbody td,.student-record-table tbody td { padding:5px 8px !important; line-height:1.3 !important; }" +
  ".bulk-score-entry-table tbody td { padding:0 8px !important; line-height:1.2 !important; vertical-align:middle !important; }" +
  ".bulk-score-entry-table tbody td input:not([type=\"checkbox\"]),.bulk-score-entry-table tbody td select { box-sizing:border-box !important; width:100% !important; height:40px !important; min-height:40px !important; max-height:40px !important; padding:0 10px !important; border:1px solid #ccd4df !important; border-radius:8px !important; background:#fff !important; line-height:1.3 !important; }" +
  ".bulk-score-entry-table tbody td [data-save-bulk-row] { min-height:28px !important; padding:4px 9px !important; line-height:1.2 !important; }" +
  ".teacher-score-row { min-height:0 !important; padding:5px 4px !important; }" +
  ".guardian-linked-student { padding:5px 8px !important; }" +
  ".student-card { margin:5px auto !important; }" +
  "@media(max-width:600px) { .teacher-score-row { min-height:0 !important; padding:5px 2px !important; } .student-card { margin:5px 0 !important; } }" +
  ".overview-table tbody td:nth-child(7),.overview-table tbody td:nth-child(7) * { font-size:18px !important; }" +
  ".term-exam-overview-table tbody td:not(.action-cell),.term-exam-overview-table tbody td:not(.action-cell) * { font-size: 18px !important; }" +
  ".term-bulk-table tbody td,.term-bulk-table tbody td .term-student-name-text { font-size: 16px !important; } .term-bulk-table tbody td.term-total-cell { font-size: 18px !important; } .term-bulk-table tbody td input[data-term-score],.term-bulk-table tbody td input[data-term-class-rank],.term-bulk-table tbody td input[data-term-school-rank] { font-size: 18px !important; }" +
  ".term-bulk-table tbody td .term-student-name small { font-size: 14px !important; }" +
  ".term-bulk-table tbody td .term-completion-mark { font-size: 18px !important; }" +
  "/* 模擬考等級與分數欄等高；週成績登錄學生列高比照週成績總覽 */" +
  ".bulk-score-entry-table tbody td [data-bulk-score],.bulk-score-entry-table tbody td [data-bulk-grade],.bulk-score-entry-table tbody td [data-bulk-status] { box-sizing:border-box !important; height:40px !important; min-height:40px !important; max-height:40px !important; border-radius:8px !important; line-height:1.3 !important; }";


/* 僅調整管理員手機版學生管理清單前四欄，不影響教師／家長成績頁 */
style.textContent += "\n@media(max-width:600px){.student-management-table tbody td:nth-child(-n+4){font-size:18px!important;}}";

style.textContent += "\n" +
  "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]):not([type=button]):not([type=reset]),select { box-sizing:border-box !important; height:40px !important; min-height:40px !important; max-height:40px !important; line-height:normal !important; }" +
  "#termExamRoster .term-bulk-table tbody td input[data-term-score],#termExamRoster .term-bulk-table tbody td input[data-term-class-rank],#termExamRoster .term-bulk-table tbody td input[data-term-school-rank] { display:block !important; box-sizing:border-box !important; width:76px !important; height:40px !important; min-height:40px !important; max-height:40px !important; padding:0 8px !important; border:1px solid #ccd4df !important; border-radius:8px !important; line-height:normal !important; }" +
  ".field input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]),.field select { padding-top:0 !important; padding-bottom:0 !important; line-height:normal !important; }" +
  "textarea { box-sizing:border-box !important; height:auto !important; min-height:80px !important; max-height:none !important; line-height:1.5 !important; padding:10px 12px !important; }" +
  ".term-bulk-table input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]),.bulk-score-entry-table tbody td input:not([type=checkbox]),.bulk-score-entry-table tbody td select { box-sizing:border-box !important; height:40px !important; min-height:40px !important; max-height:40px !important; border-radius:8px !important; }" +
  ".term-exam-overview-filters .field select,.term-exam-overview-filters .field input { height:40px !important; min-height:40px !important; max-height:40px !important; padding-top:0 !important; padding-bottom:0 !important; line-height:normal !important; }" +
  "/* 段考成績表：明確覆蓋各層既有規則，讓姓名與輸入框共用同一 40px 垂直中心 */" +
  "#termExamRoster .term-roster-wrap .term-bulk-table { border-collapse:separate !important; border-spacing:0 !important; }" +
  "#termExamRoster .term-roster-wrap .term-bulk-table tbody tr { height:46px !important; }" +
  "#termExamRoster .term-roster-wrap .term-bulk-table tbody td { box-sizing:border-box !important; height:46px !important; padding:3px 6px !important; vertical-align:middle !important; line-height:1.3 !important; }" +
  "#termExamRoster .term-roster-wrap .term-bulk-table tbody td.term-student-name { display:table-cell !important; height:46px !important; padding:3px 8px !important; vertical-align:middle !important; line-height:1.3 !important; }" +
  "#termExamRoster .term-roster-wrap .term-bulk-table tbody td.term-student-name .term-student-name-text { display:inline-block !important; vertical-align:middle !important; line-height:1.3 !important; }" +
  "#termExamRoster .term-roster-wrap .term-bulk-table tbody td.term-student-name small { display:inline-block !important; vertical-align:middle !important; line-height:1.3 !important; }" +
  "#termExamRoster .term-roster-wrap .term-bulk-table tbody td .term-completion-mark { display:inline-flex !important; vertical-align:middle !important; }" +
  "#termExamRoster .term-roster-wrap .term-bulk-table tbody td input[data-term-score],#termExamRoster .term-roster-wrap .term-bulk-table tbody td input[data-term-class-rank],#termExamRoster .term-roster-wrap .term-bulk-table tbody td input[data-term-school-rank] { display:block !important; position:relative !important; top:0 !important; float:none !important; margin:0 auto !important; box-sizing:border-box !important; width:76px !important; height:40px !important; min-height:40px !important; max-height:40px !important; padding:0 8px !important; border:1px solid #ccd4df !important; border-radius:8px !important; line-height:normal !important; vertical-align:middle !important; transform:none !important; }" +
  "#termAcademicYear { box-sizing:border-box !important; height:40px !important; min-height:40px !important; max-height:40px !important; padding:0 12px !important; line-height:20px !important; }" +
  "#termExamRoster .term-roster-wrap .term-bulk-table tbody td.term-total-cell { height:46px !important; padding:3px 6px !important; vertical-align:middle !important; line-height:40px !important; }" +
  
  ".overview-table .overview-missing-select input,.export-select-all input,.export-period-item input,.student-subject-option input[type=checkbox] { height:auto !important; min-height:0 !important; max-height:none !important; }";

/* 週成績總覽未登錄提醒批次操作按鈕：手機版文字放大，避免過小 */
style.textContent += "\n" +
  "#overviewMissingBatchBar #selectAllMissingButton,#overviewMissingBatchBar #clearMissingSelectionButton,#overviewMissingBatchBar #batchExcludeMissingButton { display:inline-flex !important; align-items:center !important; justify-content:center !important; box-sizing:border-box !important; height:40px !important; min-height:40px !important; max-height:40px !important; padding:0 12px !important; font-size:16px !important; line-height:20px !important; white-space:nowrap !important; flex:0 0 auto !important; }" +
  "@media(max-width:600px){#overviewMissingBatchBar{gap:8px !important;align-items:flex-start !important;flex-wrap:wrap !important}#overviewMissingBatchBar #selectAllMissingButton,#overviewMissingBatchBar #clearMissingSelectionButton,#overviewMissingBatchBar #batchExcludeMissingButton{max-width:100% !important}}";

/* Login log calendar uses attendance-style month grid, replacing the native date input */
style.textContent += "\n.login-log-calendar{width:100%;max-width:400px;margin:6px 0 10px;padding:10px;border:1px solid #d7e0e9;border-radius:9px;background:#fff}.login-log-calendar-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.login-log-calendar-heading strong{color:#23466b;font-size:20px}.login-log-calendar-heading button{width:36px;height:34px;min-height:34px;margin:0;padding:0;border:0;border-radius:7px;background:#edf1f5;color:#315d86;font-size:20px}.login-log-calendar-weekdays,.login-log-calendar-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;text-align:center}.login-log-calendar-weekdays{margin-bottom:5px;color:#64748b;font-size:16px;font-weight:700}.login-log-calendar-weekdays span{padding:3px 0}.login-log-calendar-day{display:flex;align-items:center;justify-content:center;width:100%;height:44px;min-height:44px;margin:0;padding:2px;border:1px solid transparent;border-radius:6px;background:#fff;color:#263445;font-size:16px}.login-log-calendar-day:hover{background:#edf3f9}.login-log-calendar-day.selected{border-color:#315d86;background:#315d86;color:#fff}.login-log-calendar-empty{height:44px}.login-log-calendar-clear{margin-top:8px;min-height:40px;padding:8px 12px;border:0;border-radius:7px;background:#edf1f5;color:#315d86;font-size:16px}";

/* 週成績登錄表：成績／出席狀態欄位置中對齊表頭，欄距比照出缺席管理的160px規格 */
style.textContent += "\n" +
  ".table-wrap table.bulk-score-entry-table { width:820px !important; min-width:820px !important; max-width:none !important; table-layout:fixed !important; }" +
  ".bulk-score-entry-table th:nth-child(1),.bulk-score-entry-table td:nth-child(1) { width:140px !important; }" +
  ".bulk-score-entry-table th:nth-child(2),.bulk-score-entry-table td:nth-child(2) { width:160px !important; }" +
  ".bulk-score-entry-table th:nth-child(3),.bulk-score-entry-table td:nth-child(3) { width:160px !important; text-align:center !important; }" +
  ".bulk-score-entry-table th:nth-child(4),.bulk-score-entry-table td:nth-child(4) { width:160px !important; text-align:center !important; }" +
  ".bulk-score-entry-table th:nth-child(5),.bulk-score-entry-table td:nth-child(5) { width:200px !important; text-align:left !important; padding-left:16px !important; }" +
  ".bulk-score-entry-table tbody td:nth-child(3) input[data-bulk-score],.bulk-score-entry-table tbody td:nth-child(4) select[data-bulk-status],.bulk-score-entry-table tbody td:nth-child(4) select[data-bulk-grade] { display:block !important; width:120px !important; min-width:120px !important; max-width:120px !important; margin:0 auto !important; }" +
  ".bulk-score-entry-table thead th:nth-child(3),.bulk-score-entry-table thead th:nth-child(4) { text-align:left !important; padding-left:20px !important; box-sizing:border-box !important; }" +
  ".bulk-score-entry-table tbody td:nth-child(5) [data-save-bulk-row] { margin:0 !important; }" +
  "#appRoot .bulk-score-entry-table tbody td button[data-save-bulk-row] { font-size:18px !important; }";



/* 管理員手機版清單資料文字統一 18px；僅限管理後台，不影響家長／教師成績查詢頁 */
style.textContent += "\n" +
  "@media(max-width:600px){" +
    "#adminContent .overview-table tbody td,#adminContent .overview-table tbody td *{font-size:18px!important;}" +
    "#adminContent .student-record-table tbody td,#adminContent .student-record-table tbody td *{font-size:18px!important;}" +
    "#adminContent .bulk-score-entry-table tbody td:nth-child(-n+2),#adminContent .bulk-score-entry-table tbody td:nth-child(-n+2) *{font-size:18px!important;}" +
    "#adminContent .alumni-score-table tbody td,#adminContent .alumni-score-table tbody td *{font-size:18px!important;}" +
  "}";

/* 管理端低分紅字統一中粗體；教師與家長查詢頁保留各自的粗體規則 */
style.textContent += "\n" +
  ".low-score," +
  ".bulk-score-entry-table input.low-score {" +
    "color:#d32626 !important;" +
    "font-weight:600 !important;" +
  "}";

document.head.appendChild(style);


/* Android 與窄螢幕家長端版面：抑制瀏覽器非預期文字膨脹，避免成績卡片欄位互相擠壓。 */
style.textContent += "\n" +
  "html { -webkit-text-size-adjust:100%; text-size-adjust:100%; }" +
  "@media(max-width:600px) {" +
    ".parent-page .student-card { min-width:0; width:100%; }" +
    ".parent-page .parent-attendance-summary-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }" +
    ".parent-page .parent-attendance-stat { min-width:0; gap:5px; padding:10px 8px; flex-wrap:wrap; }" +
    ".parent-page .parent-attendance-stat-label { min-width:0; overflow-wrap:anywhere; }" +
    ".parent-page .parent-attendance-stat-value { min-width:0; white-space:nowrap; }" +
    ".parent-page .parent-score-list { width:100%; min-width:0; }" +
    ".parent-page .parent-subject-card { grid-template-columns:minmax(0,1fr) minmax(78px,38%); gap:8px; min-width:0; padding:12px 10px; }" +
    ".parent-page .parent-subject-info { min-width:0; }" +
    ".parent-page .parent-subject-name { overflow-wrap:anywhere; }" +
    ".parent-page .parent-subject-scope { min-width:0; overflow-wrap:anywhere; word-break:normal; }" +
    ".parent-page .parent-subject-result { box-sizing:border-box; min-width:0; max-width:none; padding-left:8px; }" +
    ".parent-page .parent-subject-result-value { min-width:0; flex-wrap:wrap; gap:4px; font-size:20px; line-height:1.3; overflow-wrap:anywhere; }" +
    ".parent-page .parent-subject-result-value .parent-score-number { font-size:20px; white-space:normal; }" +
    ".parent-page .parent-subject-result-value .grade-tag { white-space:nowrap; }" +
  "}" +
  "@media(max-width:360px) {" +
    ".parent-page .parent-subject-card { grid-template-columns:minmax(0,1fr) minmax(70px,36%); gap:6px; padding:10px 8px; }" +
    ".parent-page .parent-subject-result { padding-left:6px; }" +
    ".parent-page .parent-subject-result-value,.parent-page .parent-subject-result-value .parent-score-number { font-size:18px; }" +
    ".parent-page .parent-attendance-stat { padding:9px 6px; }" +
  "}";
