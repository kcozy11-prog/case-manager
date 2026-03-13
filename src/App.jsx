<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>업무일지 — 변호사 전용</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&family=Noto+Sans+KR:wght@300;400;500&display=swap" rel="stylesheet">

<!-- Google API client (Google Calendar용) -->
<script src="https://apis.google.com/js/api.js" async defer
  onload="gapiLoaded()" onerror="console.warn('GAPI load failed')"></script>
<!-- Google Identity Services (Calendar OAuth — 로그인과 무관) -->
<script src="https://accounts.google.com/gsi/client" async defer></script>

<style>
:root {
  --ink: #1a1209; --ink2: #3d2e1e; --ink3: #7a6652;
  --paper: #faf7f2; --paper2: #f2ede4; --paper3: #e8e0d3;
  --accent: #8b2000; --accent2: #c4420a;
  --gold: #b8860b; --gold2: #d4a017;
  --shadow: rgba(26,18,9,0.12);
  --green: #2d5a27; --blue: #1a3a5c;
}
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Noto Sans KR',sans-serif; background:var(--paper); color:var(--ink); min-height:100vh; overflow-x:hidden; }
.app { display:flex; height:100dvh; }

/* ── LOCK SCREEN ── */
#lockScreen {
  position:fixed; inset:0; z-index:9999;
  background:var(--ink);
  display:flex; align-items:center; justify-content:center;
}
.lock-card {
  background:var(--paper); border-radius:16px;
  padding:48px 44px; width:360px;
  box-shadow:0 20px 60px rgba(0,0,0,0.5);
  text-align:center;
}
.lock-logo { font-family:'Noto Serif KR',serif; font-size:10px; font-weight:300; letter-spacing:0.32em; color:var(--gold); text-transform:uppercase; margin-bottom:8px; }
.lock-title { font-family:'Noto Serif KR',serif; font-size:26px; font-weight:600; color:var(--ink); margin-bottom:6px; }
.lock-divider { width:40px; height:2px; background:var(--gold); margin:15px auto 20px; border-radius:1px; }
.lock-desc { font-size:13px; color:var(--ink3); line-height:1.8; margin-bottom:32px; }
.lock-input {
  width:100%; padding:13px 20px; border:1.5px solid var(--paper3);
  border-radius:8px; font-family:'Noto Sans KR',sans-serif;
  font-size:14px; color:var(--ink); background:var(--paper2);
  outline:none; text-align:center; letter-spacing:0.1em;
  transition:border 0.2s;
  margin-bottom:12px;
}
.lock-input:focus { border-color:var(--gold); }
.lock-btn {
  width:100%; padding:13px 20px; background:var(--ink); color:var(--paper);
  border:none; border-radius:8px; font-family:'Noto Sans KR',sans-serif;
  font-size:14px; font-weight:500; cursor:pointer; transition:background 0.2s;
}
.lock-btn:hover { background:var(--ink2); }
.lock-error { font-size:12px; color:var(--accent); margin-top:8px; min-height:16px; }

/* ── SIDEBAR ── */
.sidebar { width:260px; min-width:260px; background:var(--ink); color:var(--paper2); display:flex; flex-direction:column; border-right:1px solid rgba(184,134,11,0.3); overflow:hidden; }
.sidebar-header { padding:20px 20px 14px; border-bottom:1px solid rgba(184,134,11,0.2); }
.sidebar-logo { font-family:'Noto Serif KR',serif; font-size:10px; font-weight:300; letter-spacing:0.32em; color:var(--gold); text-transform:uppercase; margin-bottom:4px; }
.sidebar-title { font-family:'Noto Serif KR',serif; font-size:17px; font-weight:600; color:var(--paper); }
.sidebar-date { font-size:11px; color:rgba(242,237,228,0.5); margin-top:2px; }

/* GCal status */
.gcal-status { display:flex; align-items:center; gap:7px; padding:8px 20px; font-size:11px; border-bottom:1px solid rgba(184,134,11,0.1); cursor:pointer; transition:background 0.15s; }
.gcal-status:hover { background:rgba(184,134,11,0.08); }
.gcal-dot { width:7px; height:7px; border-radius:50%; background:#555; flex-shrink:0; }
.gcal-dot.connected { background:#4caf50; }
.gcal-dot.loading { background:var(--gold); animation:pulse 1s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
.gcal-status-text { color:rgba(242,237,228,0.6); }

.sidebar-nav { padding:10px; flex:1; overflow-y:auto; }
.nav-section-label { font-size:10px; font-weight:500; letter-spacing:0.18em; color:var(--gold); text-transform:uppercase; padding:10px 12px 6px; opacity:0.7; }
.nav-btn { display:flex; align-items:center; gap:10px; width:100%; padding:10px 12px; border:none; background:none; color:rgba(242,237,228,0.7); font-family:'Noto Sans KR',sans-serif; font-size:13px; cursor:pointer; border-radius:6px; transition:all 0.15s; text-align:left; }
.nav-btn:hover { background:rgba(184,134,11,0.12); color:var(--paper); }
.nav-btn.active { background:rgba(184,134,11,0.2); color:var(--gold2); }
.nav-btn .icon { font-size:15px; opacity:0.8; }
.entries-list { overflow-y:auto; }
.entry-item { padding:9px 12px; border-radius:6px; cursor:pointer; transition:background 0.12s; margin:1px 0; }
.entry-item:hover { background:rgba(184,134,11,0.12); }
.entry-item.active { background:rgba(184,134,11,0.2); }
.entry-date-label { font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--gold2); letter-spacing:0.05em; }
.entry-preview { font-size:11px; color:rgba(242,237,228,0.5); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.new-entry-btn { margin:12px; padding:11px; background:var(--accent); color:white; border:none; border-radius:7px; font-family:'Noto Sans KR',sans-serif; font-size:13px; font-weight:500; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; transition:background 0.15s; }
.new-entry-btn:hover { background:var(--accent2); }

/* ── MAIN ── */
.main { flex:1; display:flex; flex-direction:column; overflow:hidden; }

/* ── ENTRY EDITOR ── */
#view-entry { flex:1; overflow-y:auto; padding:28px; max-width:900px; width:100%; margin:0 auto; }
.entry-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
.entry-date-display { font-family:'Noto Serif KR',serif; font-size:22px; font-weight:600; color:var(--ink); }
.entry-actions { display:flex; gap:8px; align-items:center; }
.btn-save { padding:9px 20px; background:var(--ink); color:var(--paper); border:none; border-radius:7px; font-family:'Noto Sans KR',sans-serif; font-size:13px; font-weight:500; cursor:pointer; transition:background 0.15s; }
.btn-save:hover { background:var(--ink2); }
.btn-save.saving { background:var(--green); }
.btn-secondary { padding:9px 16px; background:none; color:var(--ink3); border:1px solid var(--paper3); border-radius:7px; font-family:'Noto Sans KR',sans-serif; font-size:13px; cursor:pointer; transition:all 0.15s; }
.btn-secondary:hover { border-color:var(--ink3); color:var(--ink); }
.sync-status { font-size:11px; color:var(--ink3); }
.sync-status.ok { color:var(--green); }
.sync-status.error { color:var(--accent); }

/* GCal strip */
#gcalStrip { margin-bottom:20px; }
.gcal-strip-title { font-size:11px; font-weight:500; letter-spacing:0.1em; color:var(--gold); text-transform:uppercase; margin-bottom:8px; opacity:0.8; }
#gcalEventsRow { display:flex; gap:6px; flex-wrap:wrap; min-height:28px; align-items:center; }
.gcal-empty { font-size:12px; color:var(--ink3); font-style:italic; }
.gcal-chip { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; background:var(--paper2); border:1px solid var(--paper3); border-radius:20px; font-size:12px; color:var(--ink2); cursor:pointer; transition:all 0.12s; }
.gcal-chip:hover { background:var(--paper3); border-color:var(--gold); }
.gcal-chip-time { font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--ink3); }
.gcal-chip-allday { border-left:3px solid var(--gold); }

/* Fields */
.fields-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.field-card { background:white; border:1px solid var(--paper3); border-radius:10px; padding:14px 16px; transition:border 0.15s; }
.field-card:focus-within { border-color:var(--gold); }
.field-card.full { grid-column:1/-1; }
.field-label { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:500; color:var(--ink3); margin-bottom:8px; }
.field-label-icon { font-size:14px; }
.field-label-text { letter-spacing:0.05em; }
.field-label-badge { font-size:10px; padding:1px 6px; border-radius:10px; font-weight:500; }
.field-label-badge.green { background:#e8f5e8; color:var(--green); }
.field-label-badge.red { background:#fde8e8; color:var(--accent); }
.field-textarea { width:100%; border:none; outline:none; resize:none; font-family:'Noto Sans KR',sans-serif; font-size:13px; color:var(--ink); line-height:1.7; background:transparent; min-height:52px; }
.field-textarea.short { min-height:38px; }

/* Case tag */
.case-tag-wrap { position:relative; }
.case-tag-input { width:100%; border:none; outline:none; font-family:'Noto Sans KR',sans-serif; font-size:13px; color:var(--ink); background:transparent; padding:2px 0; }
.case-tags-display { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:6px; }
.case-tag { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; background:var(--paper2); border:1px solid var(--paper3); border-radius:12px; font-size:11px; color:var(--ink2); }
.case-tag-remove { cursor:pointer; color:var(--ink3); font-size:10px; opacity:0.7; }
.case-tag-remove:hover { opacity:1; color:var(--accent); }
.case-dropdown { position:absolute; top:100%; left:0; right:0; background:white; border:1px solid var(--paper3); border-radius:8px; box-shadow:0 8px 24px var(--shadow); z-index:100; max-height:200px; overflow-y:auto; }
.case-dropdown.open { display:block; }
.case-dropdown:not(.open) { display:none; }
.case-dropdown-item { padding:9px 12px; cursor:pointer; transition:background 0.1s; border-bottom:1px solid var(--paper2); }
.case-dropdown-item:last-child { border-bottom:none; }
.case-dropdown-item:hover, .case-dropdown-item.active { background:var(--paper2); }
.case-dropdown-title { font-size:13px; color:var(--ink); }
.case-dropdown-client { font-size:11px; color:var(--ink3); margin-top:2px; }
.case-dropdown-empty { padding:10px 12px; font-size:12px; color:var(--ink3); font-style:italic; }

/* Arrival */
.arrival-row { display:flex; gap:8px; align-items:center; }
.arrival-time-input { font-family:'JetBrains Mono',monospace; font-size:13px; color:var(--ink); border:none; outline:none; background:transparent; width:50px; }
.arrival-check { display:flex; align-items:center; gap:5px; font-size:12px; color:var(--ink3); cursor:pointer; }
.arrival-check input { accent-color:var(--accent); }

/* Date picker row */
.date-nav { display:flex; align-items:center; gap:8px; margin-bottom:20px; }
.date-nav-btn { width:28px; height:28px; border:1px solid var(--paper3); border-radius:6px; background:none; cursor:pointer; font-size:14px; color:var(--ink3); display:flex; align-items:center; justify-content:center; transition:all 0.12s; }
.date-nav-btn:hover { border-color:var(--ink3); color:var(--ink); }
.date-nav-label { font-family:'Noto Serif KR',serif; font-size:16px; font-weight:600; color:var(--ink); flex:1; text-align:center; }
#calendarMini { display:none; }
#calendarMini.open { display:block; }

/* ── LIST VIEW ── */
#view-list { flex:1; overflow-y:auto; padding:28px; }
.section-title { font-family:'Noto Serif KR',serif; font-size:20px; font-weight:600; color:var(--ink); margin-bottom:16px; display:flex; align-items:baseline; gap:10px; }
.section-title span { font-size:13px; font-weight:400; color:var(--ink3); font-family:'Noto Sans KR',sans-serif; }
.stats-bar { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
.stat-card { background:white; border:1px solid var(--paper3); border-radius:10px; padding:12px 18px; }
.stat-value { font-family:'Noto Serif KR',serif; font-size:22px; font-weight:600; color:var(--ink); }
.stat-label { font-size:11px; color:var(--ink3); margin-top:2px; }
#listView { display:flex; flex-direction:column; gap:8px; }
.search-result { background:white; border:1px solid var(--paper3); border-radius:10px; padding:14px 18px; cursor:pointer; transition:all 0.12s; }
.search-result:hover { border-color:var(--gold); box-shadow:0 2px 8px var(--shadow); }
.sr-date { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
.sr-content { font-size:13px; color:var(--ink2); line-height:1.6; }

/* ── SEARCH VIEW ── */
#view-search { flex:1; overflow-y:auto; padding:28px; }
#fullSearchInput { width:100%; padding:12px 18px; border:1px solid var(--paper3); border-radius:8px; font-family:'Noto Sans KR',sans-serif; font-size:14px; color:var(--ink); background:white; outline:none; margin-bottom:16px; }
#fullSearchInput:focus { border-color:var(--gold); }
#searchResults { display:flex; flex-direction:column; gap:8px; }

/* ── SETUP VIEW ── */
#view-setup { flex:1; overflow-y:auto; padding:28px; }
.setup-panel { background:white; border:1px solid var(--paper3); border-radius:12px; overflow:hidden; margin-bottom:20px; }
.setup-header { padding:14px 20px; background:linear-gradient(135deg,#4285f4,#34a853); color:white; }
.setup-header h2 { font-family:'Noto Serif KR',serif; font-size:15px; font-weight:500; }
.setup-body { padding:20px 22px; }
.setup-step { display:flex; gap:14px; padding:14px 0; border-bottom:1px solid var(--paper3); align-items:flex-start; }
.setup-step:last-child { border-bottom:none; }
.step-num { width:26px; height:26px; border-radius:50%; background:var(--ink); color:var(--paper2); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; flex-shrink:0; margin-top:1px; }
.step-num.done { background:#34a853; }
.step-content { flex:1; }
.step-title { font-size:13px; font-weight:500; color:var(--ink); margin-bottom:4px; }
.step-desc { font-size:12px; color:var(--ink3); line-height:1.7; }
.step-input-row { display:flex; gap:8px; margin-top:8px; }
.step-input { flex:1; padding:9px 13px; border:1px solid var(--paper3); border-radius:6px; font-family:'JetBrains Mono',monospace; font-size:12px; color:var(--ink); outline:none; transition:border 0.15s; }
.step-input:focus { border-color:#4285f4; }
.step-btn { padding:9px 16px; background:#4285f4; color:white; border:none; border-radius:6px; font-size:12px; font-family:'Noto Sans KR',sans-serif; cursor:pointer; white-space:nowrap; transition:background 0.15s; }
.step-btn:hover { background:#3367d5; }
.step-btn.danger { background:var(--accent); }
.step-btn.danger:hover { background:var(--accent2); }
.step-link { display:inline-flex; align-items:center; gap:4px; padding:7px 13px; border:1px solid #4285f4; border-radius:6px; font-size:12px; color:#4285f4; text-decoration:none; margin-top:8px; transition:all 0.12s; }
.step-link:hover { background:#4285f4; color:white; }

/* ── SETTINGS PANEL (비밀번호 + Sheets) ── */
.settings-panel { background:white; border:1px solid var(--paper3); border-radius:12px; padding:20px 22px; margin-bottom:16px; }
.settings-title { font-family:'Noto Serif KR',serif; font-size:15px; font-weight:600; color:var(--ink); margin-bottom:14px; }
.settings-row { display:flex; gap:8px; align-items:center; margin-bottom:10px; }
.settings-label { font-size:12px; color:var(--ink3); width:110px; flex-shrink:0; }
.settings-input { flex:1; padding:9px 13px; border:1px solid var(--paper3); border-radius:6px; font-size:13px; color:var(--ink); outline:none; font-family:'Noto Sans KR',sans-serif; transition:border 0.15s; }
.settings-input:focus { border-color:var(--gold); }
.settings-btn { padding:9px 16px; background:var(--ink); color:white; border:none; border-radius:6px; font-size:12px; cursor:pointer; transition:background 0.15s; white-space:nowrap; }
.settings-btn:hover { background:var(--ink2); }
.settings-note { font-size:11px; color:var(--ink3); margin-top:6px; line-height:1.6; }

/* ── CALENDAR MINI ── */
.cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:1px; }
.cal-day-name { text-align:center; font-size:9.5px; color:rgba(242,237,228,0.4); padding:3px 0; font-weight:500; }
.cal-day { text-align:center; font-size:11px; padding:5px 2px; border-radius:4px; cursor:pointer; color:rgba(242,237,228,0.65); transition:all 0.1s; position:relative; }
.cal-day:hover { background:rgba(184,134,11,0.2); color:var(--paper2); }
.cal-day.today { color:var(--gold2); font-weight:600; }
.cal-day.has-entry::after { content:''; position:absolute; bottom:2px; left:50%; transform:translateX(-50%); width:4px; height:4px; border-radius:50%; background:var(--accent2); }
.cal-day.has-gcal::after { background:#4285f4; }
.cal-day.selected { background:rgba(139,32,0,0.35); color:white; }
.cal-day.empty { cursor:default; }

/* Toast */
.toast { position:fixed; bottom:28px; right:28px; background:var(--ink); color:var(--paper); padding:11px 18px; border-radius:8px; font-size:13px; display:flex; align-items:center; gap:8px; box-shadow:0 4px 20px rgba(0,0,0,0.3); opacity:0; transform:translateY(10px); pointer-events:none; transition:all 0.25s; z-index:999; }
.toast.show { opacity:1; transform:translateY(0); }

/* ── SETTINGS VIEW ── */
#view-settings { flex:1; overflow-y:auto; padding:28px; }

/* Empty state */
.empty-state { text-align:center; padding:50px 20px; color:var(--ink3); }
.empty-state .es-icon { font-size:38px; margin-bottom:10px; opacity:0.4; }
.empty-state p { font-size:14px; line-height:1.7; }

/* Scrollbar */
::-webkit-scrollbar { width:5px; }
::-webkit-scrollbar-track { background:transparent; }
::-webkit-scrollbar-thumb { background:rgba(139,96,0,0.25); border-radius:3px; }

/* ── RESPONSIVE ── */
@media (max-width: 700px) {
  .sidebar { width:220px; min-width:220px; }
  #view-entry { padding:16px; }
  .fields-grid { grid-template-columns:1fr; }
  .field-card.full { grid-column:1; }
}
@media (max-width: 520px) {
  .sidebar { position:fixed; left:-260px; top:0; bottom:0; z-index:200; transition:left 0.25s; width:260px; min-width:260px; }
  .sidebar.open { left:0; }
  .main { width:100%; }
  .mobile-menu-btn { display:flex; }
}
.mobile-menu-btn {
  display:none; position:fixed; top:14px; left:14px; z-index:300;
  width:36px; height:36px; background:var(--ink); color:var(--paper);
  border:none; border-radius:8px; cursor:pointer; font-size:18px;
  align-items:center; justify-content:center;
}
.sidebar-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:199; }
.sidebar-overlay.open { display:block; }
</style>
</head>
<body>

<!-- Lock Screen -->
<div id="lockScreen">
  <div class="lock-card">
    <div class="lock-logo">Law Journal</div>
    <div class="lock-title">업무일지</div>
    <div class="lock-divider"></div>
    <div class="lock-desc">변호사 전용 업무일지 시스템입니다.</div>
    <input class="lock-input" type="password" id="lockInput" placeholder="비밀번호 입력"
      onkeydown="if(event.key==='Enter')checkLock()">
    <button class="lock-btn" onclick="checkLock()">입력</button>
    <div class="lock-error" id="lockError"></div>
  </div>
</div>

<!-- Mobile Menu -->
<button class="mobile-menu-btn" id="mobileMenuBtn" onclick="toggleMobileSidebar()">☰</button>
<div class="sidebar-overlay" id="sidebarOverlay" onclick="toggleMobileSidebar()"></div>

<!-- App -->
<div class="app" id="appContainer" style="display:none">

  <!-- Sidebar -->
  <div class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-logo">Law Journal</div>
      <div class="sidebar-title">업무일지</div>
      <div class="sidebar-date" id="sidebarDate"></div>
    </div>

    <!-- GCal Status -->
    <div class="gcal-status" onclick="handleGCalStatusClick()">
      <div class="gcal-dot" id="gcalDot"></div>
      <div class="gcal-status-text" id="gcalStatusText">Google Calendar 미연결</div>
    </div>

    <!-- Sheets Sync Status -->
    <div class="gcal-status" id="sheetsSyncStatus" style="cursor:default">
      <div class="gcal-dot" id="sheetsDot"></div>
      <div class="gcal-status-text" id="sheetsStatusText">Sheets 미설정</div>
    </div>

    <div class="sidebar-nav">
      <div class="nav-section-label">메뉴</div>
      <button class="nav-btn active" onclick="switchView('entry')" id="nav-entry">
        <span class="icon">📝</span> 오늘 일지
      </button>
      <button class="nav-btn" onclick="switchView('list')" id="nav-list">
        <span class="icon">📋</span> 일지 목록
      </button>
      <button class="nav-btn" onclick="switchView('search')" id="nav-search">
        <span class="icon">🔍</span> 전체 검색
      </button>
      <button class="nav-btn" onclick="switchView('setup')" id="nav-setup">
        <span class="icon">📅</span> Google Calendar
      </button>
      <button class="nav-btn" onclick="switchView('settings')" id="nav-settings">
        <span class="icon">⚙️</span> 설정
      </button>

      <div class="nav-section-label" style="margin-top:8px">최근 일지</div>
      <div class="entries-list" id="entriesList"></div>
    </div>

    <button class="new-entry-btn" onclick="newEntry()">
      ＋ 새 일지 작성
    </button>
  </div>

  <!-- Main -->
  <div class="main">

    <!-- ENTRY VIEW -->
    <div id="view-entry" style="display:flex;flex-direction:column">
      <div style="flex:1;overflow-y:auto;padding:28px;max-width:900px;width:100%;margin:0 auto">

        <div class="entry-header">
          <div>
            <div class="date-nav">
              <button class="date-nav-btn" onclick="navigateDate(-1)">‹</button>
              <div class="date-nav-label" id="currentDateLabel"></div>
              <button class="date-nav-btn" onclick="navigateDate(1)">›</button>
              <button class="btn-secondary" onclick="goToToday()" style="font-size:11px;padding:5px 10px">오늘</button>
            </div>
          </div>
          <div class="entry-actions">
            <span class="sync-status" id="syncStatus"></span>
            <button class="btn-secondary" onclick="syncFromSheets()">☁ 불러오기</button>
            <button class="btn-save" id="saveBtn" onclick="saveEntry()">저장</button>
          </div>
        </div>

        <!-- GCal Strip -->
        <div id="gcalStrip">
          <div class="gcal-strip-title">📅 오늘 일정</div>
          <div id="gcalEventsRow"><span class="gcal-empty">일정 없음</span></div>
        </div>

        <!-- Fields -->
        <div class="fields-grid">

          <div class="field-card full">
            <div class="field-label">
              <span class="field-label-icon">☀️</span>
              <span class="field-label-text">오늘 한 일</span>
            </div>
            <textarea class="field-textarea" id="todayWork" placeholder="주요 업무, 회의, 처리한 사건..." rows="4"></textarea>
          </div>

          <div class="field-card full">
            <div class="field-label">
              <span class="field-label-icon">⚖️</span>
              <span class="field-label-text">재판 메모</span>
            </div>
            <div style="margin-bottom:6px">
              <div class="arrival-row">
                <span style="font-size:12px;color:var(--ink3)">출근</span>
                <input class="arrival-time-input" id="arrivalTime" placeholder="--:--">
                <label class="arrival-check">
                  <input type="checkbox" id="businessTrip"> 출장/출석
                </label>
              </div>
            </div>
            <textarea class="field-textarea" id="courtMemo" placeholder="법원, 사건번호, 기일결과, 재판장 언급사항..." rows="4"></textarea>
          </div>

          <div class="field-card">
            <div class="field-label">
              <span class="field-label-icon">📤</span>
              <span class="field-label-text">제출한 서면</span>
              <span class="field-label-badge green">완료</span>
            </div>
            <textarea class="field-textarea short" id="writtenDocs" placeholder="서면명, 사건번호, 제출일..."></textarea>
          </div>

          <div class="field-card">
            <div class="field-label">
              <span class="field-label-icon">⏰</span>
              <span class="field-label-text">제출 예정 서면</span>
              <span class="field-label-badge red">D-day</span>
            </div>
            <textarea class="field-textarea short" id="pendingDocs" placeholder="서면명, 제출기한, 담당 사건..."></textarea>
          </div>

          <div class="field-card full">
            <div class="field-label">
              <span class="field-label-icon">📥</span>
              <span class="field-label-text">달일 수령 문서</span>
            </div>
            <textarea class="field-textarea short" id="receivedDocs" placeholder="수령한 서면명, 사건번호, 발송인..."></textarea>
          </div>

          <div class="field-card">
            <div class="field-label">
              <span class="field-label-icon">📞</span>
              <span class="field-label-text">통화 내용</span>
            </div>
            <textarea class="field-textarea" id="callNotes" placeholder="통화 상대방, 통화 시각, 주요 내용..." rows="3"></textarea>
          </div>

          <div class="field-card">
            <div class="field-label">
              <span class="field-label-icon">👥</span>
              <span class="field-label-text">직원에게 위임한 일</span>
            </div>
            <textarea class="field-textarea" id="delegated" placeholder="담당 직원, 업무 내용, 기한..." rows="3"></textarea>
          </div>

          <div class="field-card full">
            <div class="field-label">
              <span class="field-label-icon">🗂️</span>
              <span class="field-label-text">사건 업데이트 (직원 보고)</span>
            </div>
            <textarea class="field-textarea short" id="caseUpdates" placeholder="직원 보고 내용, 사건 진행상황..."></textarea>
          </div>

          <div class="field-card full">
            <div class="field-label">
              <span class="field-label-icon">💡</span>
              <span class="field-label-text">오늘 업무에서 배운 점</span>
            </div>
            <textarea class="field-textarea" id="learned" placeholder="법리 해석, 실무 팁, 판례 정리..." rows="3"></textarea>
          </div>

          <div class="field-card full">
            <div class="field-label">
              <span class="field-label-icon">📌</span>
              <span class="field-label-text">기타 / 내일 할 일</span>
            </div>
            <textarea class="field-textarea" id="etc" placeholder="기타 도움될 내용, 내일 우선순위..." rows="3"></textarea>
          </div>

          <!-- KakaoTalk Parser -->
          <div class="field-card full">
            <div class="field-label">
              <span class="field-label-icon">💬</span>
              <span class="field-label-text">KakaoTalk 업데이트 붙여넣기</span>
            </div>
            <textarea class="field-textarea short" id="kakaoPaste" placeholder="카카오톡 대화 복사 후 붙여넣기 → 자동 파싱"></textarea>
            <button class="btn-secondary" onclick="parseKakao()" style="margin-top:8px;font-size:12px;padding:6px 14px">파싱하기</button>
            <div id="kakaoUpdatesWrap" style="margin-top:8px;display:none">
              <div style="font-size:11px;color:var(--ink3);margin-bottom:6px">파싱 결과 (오늘)</div>
              <div id="kakaoUpdatesList"></div>
            </div>
          </div>

          <!-- Case Tags -->
          <div class="field-card full">
            <div class="field-label">
              <span class="field-label-icon">🔗</span>
              <span class="field-label-text">연결 사건 (사건관리앱)</span>
            </div>
            <div class="case-tag-wrap" id="caseTagWrap">
              <div class="case-tags-display" id="caseTagsDisplay"></div>
              <input class="case-tag-input" id="caseTagInput" placeholder="사건명 또는 의뢰인 검색..."
                oninput="searchCases(this.value)"
                onkeydown="handleCaseKeydown(event)">
              <div class="case-dropdown" id="caseDropdown"></div>
            </div>
          </div>

        </div><!-- /fields-grid -->
      </div>
    </div><!-- /view-entry -->

    <!-- LIST VIEW -->
    <div id="view-list" style="display:none;flex:1;overflow-y:auto;padding:28px">
      <div class="section-title">일지 목록 <span id="listCountLabel"></span></div>
      <div class="stats-bar" id="statBar"></div>
      <div id="listView"></div>
    </div>

    <!-- SEARCH VIEW -->
    <div id="view-search" style="display:none;flex:1;overflow-y:auto;padding:28px">
      <div class="section-title">전체 검색 <span id="searchCount"></span></div>
      <div style="max-width:900px">
        <input type="text" id="fullSearchInput" placeholder="검색어 입력 (사건번호, 상대방, 서면명...)"
          oninput="fullSearch(this.value)">
        <div id="searchResults">
          <div class="empty-state"><div class="es-icon">🔍</div><p>검색어를 입력하면 과거 일지를 검색합니다</p></div>
        </div>
      </div>
    </div>

    <!-- SETUP VIEW (Google Calendar) -->
    <div id="view-setup" style="display:none;flex:1;overflow-y:auto;padding:28px">
      <div class="section-title">Google Calendar 연동</div>
      <div class="setup-panel">
        <div class="setup-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style="vertical-align:middle;margin-right:8px"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          <strong>Google Calendar API 직접 연동</strong>
        </div>
        <div class="setup-body">
          <div class="setup-step">
            <div class="step-num" id="stepNum1">1</div>
            <div class="step-content">
              <div class="step-title">Google Cloud Console에서 프로젝트 생성 및 API 활성화</div>
              <div class="step-desc">아래 링크에서 새 프로젝트를 만들고, <strong>Google Calendar API</strong>를 검색해 활성화합니다. (이미 프로젝트가 있다면 그대로 사용하셔도 됩니다)</div>
              <a class="step-link" href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank">🔗 Google Calendar API 활성화 페이지 열기</a>
            </div>
          </div>
          <div class="setup-step">
            <div class="step-num" id="stepNum2">2</div>
            <div class="step-content">
              <div class="step-title">OAuth 2.0 클라이언트 ID 발급</div>
              <div class="step-desc"><strong>사용자 인증 정보</strong> → <strong>사용자 인증 정보 만들기</strong> → <strong>OAuth 클라이언트 ID</strong><br>애플리케이션 유형: <strong>웹 애플리케이션</strong><br>승인된 JavaScript 원본: <code style="font-family:monospace;font-size:11px;background:var(--paper2);padding:1px 4px;border-radius:3px">https://kcozy11-prog.github.io</code></div>
              <a class="step-link" href="https://console.cloud.google.com/apis/credentials" target="_blank">🔗 사용자 인증 정보 페이지 열기</a>
            </div>
          </div>
          <div class="setup-step">
            <div class="step-num" id="stepNum3">3</div>
            <div class="step-content">
              <div class="step-title">클라이언트 ID 입력</div>
              <div class="step-input-row">
                <input class="step-input" id="clientIdInput" placeholder="....apps.googleusercontent.com">
                <button class="step-btn" onclick="saveClientId()">저장</button>
              </div>
            </div>
          </div>
          <div class="setup-step">
            <div class="step-num" id="stepNum4">4</div>
            <div class="step-content">
              <div class="step-title">Google Calendar 연결</div>
              <div class="step-desc">클라이언트 ID 저장 후 아래 버튼으로 연결하세요.</div>
              <button class="step-btn" id="syncBtn" onclick="requestCalendarAccess()" disabled style="margin-top:8px">📅 Google Calendar 연결</button>
              <button class="step-btn danger" onclick="disconnectGCal()" style="margin-top:8px;margin-left:8px">연결 해제</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- SETTINGS VIEW -->
    <div id="view-settings" style="display:none;flex:1;overflow-y:auto;padding:28px">
      <div class="section-title">설정</div>

      <div class="settings-panel">
        <div class="settings-title">🔐 비밀번호</div>
        <div class="settings-row">
          <span class="settings-label">현재 비밀번호</span>
          <input class="settings-input" type="password" id="pwCurrent" placeholder="현재 비밀번호">
        </div>
        <div class="settings-row">
          <span class="settings-label">새 비밀번호</span>
          <input class="settings-input" type="password" id="pwNew" placeholder="새 비밀번호">
        </div>
        <div class="settings-row">
          <span class="settings-label">확인</span>
          <input class="settings-input" type="password" id="pwConfirm" placeholder="새 비밀번호 확인">
          <button class="settings-btn" onclick="changePassword()">변경</button>
        </div>
        <div class="settings-note">비밀번호는 이 기기의 브라우저에 저장됩니다.</div>
      </div>

      <div class="settings-panel">
        <div class="settings-title">☁ Google Sheets 연동</div>
        <div class="settings-row">
          <span class="settings-label">Apps Script URL</span>
          <input class="settings-input" id="sheetsUrlInput" placeholder="https://script.google.com/macros/s/.../exec" style="font-size:11px;font-family:monospace">
          <button class="settings-btn" onclick="saveSettings()">저장</button>
        </div>
        <div class="settings-note">
          Google Sheets에 저장하면 어디서든 같은 데이터를 볼 수 있습니다.<br>
          case-manager와 같은 Apps Script URL을 사용하면 사건 목록을 자동으로 불러옵니다.
        </div>
        <div class="settings-row" style="margin-top:12px">
          <span class="settings-label">상태</span>
          <span id="sheetsSettingsStatus" style="font-size:12px;color:var(--ink3)">미설정</span>
        </div>
        <button class="settings-btn" onclick="exportData()" style="margin-top:8px;background:var(--green)">📥 로컬 데이터 내보내기 (JSON)</button>
      </div>

      <div class="settings-panel">
        <div class="settings-title">ℹ️ 앱 정보</div>
        <div class="settings-note">
          업무일지 v2.0 — Google 로그인 없이 사용<br>
          데이터: Google Sheets 또는 브라우저 로컬 저장<br>
          개발: 따뜻한김변 × Claude
        </div>
      </div>
    </div>

  </div><!-- /main -->
</div><!-- /app -->

<div id="toast" class="toast"></div>

<script>
// ═══════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════
const APP_PW_KEY     = 'lj_password';
const SESSION_KEY    = 'lj_session';
const ENTRIES_KEY    = 'lj_entries_v2';
const CLIENT_KEY     = 'lj_gcal_client';
const TOKEN_KEY      = 'lj_gcal_token';
const SHEETS_KEY     = 'lj_sheets_url';
const KAKAO_KEY      = 'lj_kakao';
const SCOPE          = 'https://www.googleapis.com/auth/calendar.readonly';
const DISCOVERY      = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';

let DEFAULT_PW = localStorage.getItem(APP_PW_KEY) || 'lawfirm2024';
let sheetsUrl  = localStorage.getItem(SHEETS_KEY) || '';
let entries    = {};   // { 'YYYY-MM-DD': { fields... } }
let currentDate = todayKey();
let accessToken = null;
let tokenClient = null;
let gapiReady   = false;
let linkedCases = [];
let caseDropdownItems = [];
let caseDropdownIdx   = -1;
let allCases          = [];  // case-manager에서 불러온 사건 목록
let autoSaveTimer;

// ═══════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════
function todayKey() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}
function fmtDate(k) {
  const d = new Date(k + 'T00:00:00');
  const days = ['일','월','화','수','목','금','토'];
  return `${k} (${days[d.getDay()]})`;
}

// ═══════════════════════════════════════════════════════
// LOCK
// ═══════════════════════════════════════════════════════
function checkLock() {
  const val = document.getElementById('lockInput').value;
  if (val === DEFAULT_PW) {
    sessionStorage.setItem(SESSION_KEY, '1');
    document.getElementById('lockScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    document.getElementById('mobileMenuBtn').style.display = '';
    init();
  } else {
    document.getElementById('lockError').textContent = '비밀번호가 틀렸습니다.';
    document.getElementById('lockInput').value = '';
    setTimeout(() => document.getElementById('lockError').textContent = '', 2000);
  }
}

function changePassword() {
  const cur = document.getElementById('pwCurrent').value;
  const nw  = document.getElementById('pwNew').value;
  const cf  = document.getElementById('pwConfirm').value;
  if (cur !== DEFAULT_PW) { showToast('❌ 현재 비밀번호가 틀렸습니다.'); return; }
  if (!nw) { showToast('❌ 새 비밀번호를 입력하세요.'); return; }
  if (nw !== cf) { showToast('❌ 비밀번호가 일치하지 않습니다.'); return; }
  DEFAULT_PW = nw;
  localStorage.setItem(APP_PW_KEY, nw);
  ['pwCurrent','pwNew','pwConfirm'].forEach(id => document.getElementById(id).value = '');
  showToast('✅ 비밀번호가 변경되었습니다.');
}

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
function init() {
  loadEntries();
  renderSidebarDate();
  renderEntriesList();
  loadEntryToForm(currentDate);
  switchView('entry');
  updateSetupStepNums();
  updateSheetsBadge();
  if (sheetsUrl) { document.getElementById('sheetsUrlInput').value = sheetsUrl; syncFromSheets(); }
  // load today after listener is set up
  loadEntryToForm(currentDate);
}

function loadEntries() {
  try {
    const saved = localStorage.getItem(ENTRIES_KEY);
    if (saved) entries = JSON.parse(saved);
  } catch(e) {}
}

function saveEntriesToLocal() {
  try { localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries)); } catch(e) {}
}

// ═══════════════════════════════════════════════════════
// DATE NAV
// ═══════════════════════════════════════════════════════
function renderSidebarDate() {
  const d = new Date();
  const days = ['일','월','화','수','목','금','토'];
  document.getElementById('sidebarDate').textContent =
    `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} (${days[d.getDay()]})`;
}

function navigateDate(delta) {
  const d = new Date(currentDate + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  currentDate = [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  loadEntryToForm(currentDate);
  if (accessToken) syncGCalEvents();
}

function goToToday() {
  currentDate = todayKey();
  loadEntryToForm(currentDate);
  if (accessToken) syncGCalEvents();
}

// ═══════════════════════════════════════════════════════
// FORM ↔ DATA
// ═══════════════════════════════════════════════════════
const FIELDS = ['todayWork','courtMemo','writtenDocs','pendingDocs','receivedDocs','callNotes','delegated','caseUpdates','learned','etc','arrivalTime'];

function collectForm() {
  const data = {};
  FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) data[id] = el.value;
  });
  data.businessTrip = document.getElementById('businessTrip')?.checked || false;
  data.linkedCases  = [...linkedCases];
  data.entryDate    = currentDate;
  return data;
}

function loadEntryToForm(dateKey) {
  document.getElementById('currentDateLabel').textContent = fmtDate(dateKey);
  const e = entries[dateKey] || {};
  FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = e[id] || '';
  });
  const bt = document.getElementById('businessTrip');
  if (bt) bt.checked = e.businessTrip || false;
  linkedCases = e.linkedCases ? [...e.linkedCases] : [];
  renderLinkedCases();
  renderKakaoUpdates();
}

// ═══════════════════════════════════════════════════════
// SAVE
// ═══════════════════════════════════════════════════════
async function saveEntry() {
  const btn = document.getElementById('saveBtn');
  btn.classList.add('saving'); btn.textContent = '저장 중...';
  const data = collectForm();
  const dateKey = data.entryDate || currentDate;
  entries[dateKey] = { ...entries[dateKey], ...data };
  saveEntriesToLocal();
  renderEntriesList();
  if (sheetsUrl) await saveToSheets(dateKey, entries[dateKey]);
  btn.classList.remove('saving'); btn.textContent = '저장';
  showToast('✅ 저장되었습니다.');
}

// ═══════════════════════════════════════════════════════
// GOOGLE SHEETS
// ═══════════════════════════════════════════════════════
function updateSheetsBadge() {
  const dot  = document.getElementById('sheetsDot');
  const text = document.getElementById('sheetsStatusText');
  if (!sheetsUrl) {
    dot.className = 'gcal-dot'; text.textContent = 'Sheets 미설정';
  } else {
    dot.className = 'gcal-dot connected'; text.textContent = 'Sheets 연동됨';
  }
  const ss = document.getElementById('sheetsSettingsStatus');
  if (ss) ss.textContent = sheetsUrl ? '✅ 연동됨 — ' + sheetsUrl.substring(0,40) + '...' : '미설정';
}

async function saveToSheets(dateKey, data) {
  if (!sheetsUrl) return;
  setSyncStatus('저장 중...','');
  try {
    await fetch(sheetsUrl, {
      method:'POST',
      headers:{'Content-Type':'text/plain'},
      body: JSON.stringify({ action:'save_journal', dateKey, data })
    });
    setSyncStatus('✓ 저장됨','ok');
    setTimeout(() => setSyncStatus('',''), 3000);
  } catch(e) {
    setSyncStatus('저장 실패','error');
    setTimeout(() => setSyncStatus('',''), 4000);
  }
}

async function syncFromSheets() {
  if (!sheetsUrl) return;
  setSyncStatus('불러오는 중...','');
  try {
    const res  = await fetch(sheetsUrl);
    const data = await res.json();
    // journal 데이터 수신
    if (data.journal) {
      entries = { ...entries, ...data.journal };
      saveEntriesToLocal();
      loadEntryToForm(currentDate);
      renderEntriesList();
      setSyncStatus('✓ 동기화됨','ok');
      setTimeout(() => setSyncStatus('',''), 3000);
    }
    // case-manager 사건 목록도 함께 수신 (같은 URL이면)
    if (data.cases) {
      allCases = data.cases.map(c => c.data || c).filter(c => c.title || c.caseNumber);
    }
  } catch(e) {
    setSyncStatus('불러오기 실패','error');
    setTimeout(() => setSyncStatus('',''), 4000);
  }
}

function setSyncStatus(msg, cls) {
  const el = document.getElementById('syncStatus');
  el.textContent = msg; el.className = 'sync-status' + (cls ? ' '+cls : '');
}

function saveSettings() {
  const url = document.getElementById('sheetsUrlInput').value.trim();
  sheetsUrl = url;
  localStorage.setItem(SHEETS_KEY, url);
  updateSheetsBadge();
  showToast('✅ 설정 저장됨');
  if (url) syncFromSheets();
}

function exportData() {
  const blob = new Blob([JSON.stringify(entries, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `law-journal-${todayKey()}.json`;
  a.click();
}

// ═══════════════════════════════════════════════════════
// VIEWS
// ═══════════════════════════════════════════════════════
const VIEWS = ['entry','list','search','setup','settings'];
function switchView(name) {
  VIEWS.forEach(v => {
    document.getElementById('view-'+v).style.display = 'none';
    const nb = document.getElementById('nav-'+v);
    if (nb) nb.classList.remove('active');
  });
  document.getElementById('view-'+name).style.display = 'flex';
  const nb = document.getElementById('nav-'+name);
  if (nb) nb.classList.add('active');
  if (name === 'list')   { renderStats(); renderListView(); }
  if (name === 'search') { document.getElementById('fullSearchInput').focus(); }
  if (name === 'setup')  { updateSetupStepNums(); }
  if (name === 'settings') {
    document.getElementById('sheetsUrlInput').value = sheetsUrl;
    updateSheetsBadge();
  }
  closeMobileSidebar();
}

// ═══════════════════════════════════════════════════════
// SIDEBAR ENTRIES LIST
// ═══════════════════════════════════════════════════════
function renderEntriesList() {
  const el = document.getElementById('entriesList');
  const keys = Object.keys(entries).sort((a,b) => b.localeCompare(a)).slice(0, 30);
  if (!keys.length) { el.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:rgba(242,237,228,0.3);font-style:italic">저장된 일지가 없습니다</div>'; return; }
  el.innerHTML = keys.map(k => {
    const e = entries[k];
    const preview = (e.todayWork || e.courtMemo || '').slice(0,30);
    return `<div class="entry-item${k===currentDate?' active':''}" onclick="calSelectDate('${k}')">
      <div class="entry-date-label">${k}</div>
      ${preview ? `<div class="entry-preview">${preview}${preview.length>=30?'…':''}</div>` : ''}
    </div>`;
  }).join('');
}

function calSelectDate(k) {
  currentDate = k;
  loadEntryToForm(k);
  switchView('entry');
  renderEntriesList();
  if (accessToken) syncGCalEvents();
}

function newEntry() {
  currentDate = todayKey();
  loadEntryToForm(currentDate);
  switchView('entry');
  renderEntriesList();
}

// ═══════════════════════════════════════════════════════
// LIST VIEW
// ═══════════════════════════════════════════════════════
function renderStats() {
  const keys = Object.keys(entries);
  const thisMonth = todayKey().slice(0,7);
  document.getElementById('statBar').innerHTML = `
    <div class="stat-card"><div class="stat-value">${keys.length}</div><div class="stat-label">총 일지 수</div></div>
    <div class="stat-card"><div class="stat-value">${keys.filter(k=>k.startsWith(thisMonth)).length}</div><div class="stat-label">이번 달</div></div>
    <div class="stat-card"><div class="stat-value">${keys.filter(k=>entries[k].courtMemo?.trim()).length}</div><div class="stat-label">재판 기록</div></div>
    <div class="stat-card"><div class="stat-value">${keys.filter(k=>entries[k].businessTrip&&entries[k].businessTrip!=='없음').length}</div><div class="stat-label">출장/출석</div></div>`;
  document.getElementById('listCountLabel').textContent = `전체 ${keys.length}건`;
}

function renderListView() {
  const keys = Object.keys(entries).sort((a,b) => b.localeCompare(a));
  const el = document.getElementById('listView');
  if (!keys.length) { el.innerHTML = '<div class="empty-state"><div class="es-icon">📋</div><p>저장된 일지가 없습니다</p></div>'; return; }
  el.innerHTML = `<div style="max-width:900px">${keys.map(k => {
    const e = entries[k];
    const fields = [
      e.todayWork&&{icon:'☀️',label:'오늘 한 일',val:e.todayWork},
      e.courtMemo&&{icon:'⚖️',label:'재판 메모',val:e.courtMemo},
      e.writtenDocs&&{icon:'📤',label:'제출한 서면',val:e.writtenDocs}
    ].filter(Boolean);
    return `<div class="search-result" onclick="calSelectDate('${k}')">
      <div class="sr-date" style="display:flex;align-items:center;gap:10px">
        ${fmtDate(k)}
        ${e.arrivalTime?`<span style="font-size:11px;color:var(--ink3)">출근 ${e.arrivalTime}</span>`:''}
        ${e.businessTrip?`<span style="font-size:10.5px;padding:1px 8px;background:rgba(139,32,0,0.1);color:var(--accent);border-radius:20px">${e.businessTrip}</span>`:''}
      </div>
      <div class="sr-content" style="margin-top:7px">
        ${fields.map(f=>`<div style="margin-bottom:4px"><strong style="font-size:11px;color:var(--ink3)">${f.icon} ${f.label}</strong> — ${f.val.slice(0,80)}${f.val.length>80?'…':''}</div>`).join('')}
      </div>
    </div>`;
  }).join('')}</div>`;
}

// ═══════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════
function fullSearch(q) {
  const el = document.getElementById('searchResults');
  if (!q.trim()) { el.innerHTML = '<div class="empty-state"><div class="es-icon">🔍</div><p>검색어를 입력하면 과거 일지를 검색합니다</p></div>'; document.getElementById('searchCount').textContent=''; return; }
  const lower = q.toLowerCase();
  const keys = Object.keys(entries).sort((a,b)=>b.localeCompare(a)).filter(k => {
    const e = entries[k];
    return Object.values(e).some(v => typeof v==='string' && v.toLowerCase().includes(lower));
  });
  document.getElementById('searchCount').textContent = `${keys.length}건`;
  if (!keys.length) { el.innerHTML = '<div class="empty-state"><div class="es-icon">🔍</div><p>검색 결과가 없습니다</p></div>'; return; }
  el.innerHTML = `<div style="max-width:900px">${keys.map(k=>{
    const e=entries[k];
    const hits=Object.entries(e).filter(([fk,v])=>typeof v==='string'&&v.toLowerCase().includes(lower)&&fk!=='entryDate');
    return `<div class="search-result" onclick="calSelectDate('${k}')">
      <div class="sr-date">${fmtDate(k)}</div>
      <div class="sr-content" style="margin-top:7px">
        ${hits.slice(0,3).map(([fk,v])=>{
          const idx=v.toLowerCase().indexOf(lower);
          const snip=v.slice(Math.max(0,idx-20),idx+60);
          return `<div style="margin-bottom:4px;font-size:12px;color:var(--ink3)">${fk}: …${snip}…</div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('')}</div>`;
}

// ═══════════════════════════════════════════════════════
// CASE TAGS (case-manager 연동)
// ═══════════════════════════════════════════════════════
function renderLinkedCases() {
  const el = document.getElementById('caseTagsDisplay');
  el.innerHTML = linkedCases.map(c => `
    <span class="case-tag">
      ${c.title||'(제목 없음)'}${c.client?` <span style="color:var(--ink3)">· ${c.client}</span>`:''}
      <span class="case-tag-remove" onclick="removeCaseTag('${c.id}')">×</span>
    </span>`).join('');
}

function searchCases(q) {
  if (!q.trim()) { closeCaseDropdown(); return; }
  const lower = q.toLowerCase();
  const results = allCases.filter(c =>
    (c.title||'').toLowerCase().includes(lower) ||
    (c.client||'').toLowerCase().includes(lower) ||
    (c.caseNumber||'').toLowerCase().includes(lower)
  ).slice(0, 8);
  showCaseDropdown(results);
}

function showCaseDropdown(list) {
  const dd = document.getElementById('caseDropdown');
  caseDropdownItems = list; caseDropdownIdx = -1;
  if (!list.length) {
    dd.innerHTML = '<div class="case-dropdown-empty">검색 결과 없음</div>';
  } else {
    dd.innerHTML = list.map((c,i) => `
      <div class="case-dropdown-item" onmousedown="event.preventDefault();addCaseTag(caseDropdownItems[${i}])">
        <div class="case-dropdown-title">${c.title||(c.caseNumber||'(제목 없음)')}</div>
        ${c.client?`<div class="case-dropdown-client">의뢰인: ${c.client}</div>`:''}
      </div>`).join('');
  }
  dd.classList.add('open');
}

function closeCaseDropdown() {
  document.getElementById('caseDropdown').classList.remove('open');
  caseDropdownIdx = -1;
}

function addCaseTag(c) {
  if (!c) return;
  if (!linkedCases.find(x => x.id === c.id)) {
    linkedCases.push({id: c.id, title: c.title||'', client: c.client||''});
  }
  document.getElementById('caseTagInput').value = '';
  closeCaseDropdown();
  renderLinkedCases();
}

function removeCaseTag(id) {
  linkedCases = linkedCases.filter(c => c.id !== id);
  renderLinkedCases();
}

function handleCaseKeydown(e) {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveCaseDropdown(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveCaseDropdown(-1); }
  else if (e.key === 'Enter') { e.preventDefault(); selectCaseDropdownCurrent(); }
  else if (e.key === 'Escape') { closeCaseDropdown(); }
}

function moveCaseDropdown(dir) {
  caseDropdownIdx = Math.max(-1, Math.min(caseDropdownItems.length-1, caseDropdownIdx+dir));
  document.querySelectorAll('.case-dropdown-item').forEach((el,i) => el.classList.toggle('active', i===caseDropdownIdx));
}

function selectCaseDropdownCurrent() {
  if (caseDropdownIdx >= 0 && caseDropdownItems[caseDropdownIdx]) addCaseTag(caseDropdownItems[caseDropdownIdx]);
}

// ═══════════════════════════════════════════════════════
// KAKAO PARSING
// ═══════════════════════════════════════════════════════
function parseKakao() {
  const raw = document.getElementById('kakaoPaste').value.trim();
  if (!raw) { showToast('⚠️ 붙여넣을 내용이 없습니다'); return; }
  const lines = raw.split('\n');
  const updates = [];
  lines.forEach(line => {
    const m = line.match(/^[[\(,·]?([가-힣]{2,4})[,\s]*(?:\d{1,2}:\d{2})?\s*[:]\s*(.+)$/);
    if (m) updates.push({ name: m[1], content: m[2].trim(), time: new Date().toISOString() });
  });
  if (!updates.length) { showToast('⚠️ 파싱할 수 있는 메시지가 없습니다'); return; }
  const stored = JSON.parse(localStorage.getItem(KAKAO_KEY)||'{}');
  const k = currentDate;
  stored[k] = [...(stored[k]||[]), ...updates];
  localStorage.setItem(KAKAO_KEY, JSON.stringify(stored));
  document.getElementById('kakaoPaste').value = '';
  renderKakaoUpdates();
  showToast(`✅ ${updates.length}건 파싱됨`);
}

function renderKakaoUpdates() {
  const stored = JSON.parse(localStorage.getItem(KAKAO_KEY)||'{}');
  const updates = (stored[currentDate]||[]).slice(-8);
  const wrap = document.getElementById('kakaoUpdatesWrap');
  const list = document.getElementById('kakaoUpdatesList');
  if (!updates.length) { wrap.style.display='none'; return; }
  wrap.style.display='block';
  list.innerHTML = updates.map(u => `<div class="kakao-update-item" style="display:flex;gap:8px;font-size:12px;padding:4px 0;border-bottom:1px solid var(--paper2)">
    <span style="color:var(--ink3);font-size:11px;white-space:nowrap">${u.time?new Date(u.time).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):'--:--'}</span>
    <span>${u.name?`<strong>${u.name}</strong> : `:''}${u.content}</span>
  </div>`).join('');
}

// ═══════════════════════════════════════════════════════
// GCAL STRIP
// ═══════════════════════════════════════════════════════
function renderGCalStrip(events, dateKey) {
  const row   = document.getElementById('gcalEventsRow');
  const title = document.querySelector('.gcal-strip-title');
  title.textContent = `📅 ${dateKey || currentDate} 일정 (Google Calendar)`;
  if (!events || !events.length) { row.innerHTML = '<span class="gcal-empty">일정이 없습니다.</span>'; return; }
  row.innerHTML = events.map(ev => {
    const isAllDay  = !ev.start.dateTime;
    const isLbox    = ev._src === 'LBOX';
    const timeStr   = isAllDay ? '종일' :
      new Date(ev.start.dateTime).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}) + ' ~ ' +
      new Date(ev.end.dateTime).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
    const badge = isLbox ? `<span style="font-size:9.5px;padding:1px 5px;background:#c00;color:white;border-radius:3px;margin-right:2px">LBOX</span>` : '';
    return `<div class="gcal-chip${isAllDay?' gcal-chip-allday':''}"
      onclick="insertEventToJournal('${ev.summary.replace(/'/g,"\\'")}','${timeStr}')"
      title="클릭하면 재판메모에 추가">
      <span class="gcal-chip-time">${timeStr}</span>
      ${badge}<span>${ev.summary}</span>
    </div>`;
  }).join('');
}

function insertEventToJournal(title, time) {
  const field = document.getElementById('courtMemo');
  const line = `[${time}] ${title}`;
  field.value = (field.value ? field.value + '\n' : '') + line;
  showToast(`⚖️ 재판 메모에 추가: ${title}`);
}

// ═══════════════════════════════════════════════════════
// GCAL STATUS
// ═══════════════════════════════════════════════════════
function setGCalStatus(state, text) {
  const dot  = document.getElementById('gcalDot');
  const span = document.getElementById('gcalStatusText');
  dot.className = 'gcal-dot' + (state ? ' '+state : '');
  span.textContent = text;
}

function handleGCalStatusClick() {
  if (!accessToken) switchView('setup');
}

function updateSetupStepNums() {
  const hasClient = !!localStorage.getItem(CLIENT_KEY);
  const hasToken  = !!accessToken;
  document.getElementById('stepNum1').className = 'step-num';
  document.getElementById('stepNum2').className = 'step-num';
  document.getElementById('stepNum3').className = hasClient ? 'step-num done' : 'step-num';
  document.getElementById('stepNum4').className = hasToken  ? 'step-num done' : 'step-num';
  const ci = document.getElementById('clientIdInput');
  if (ci) ci.value = localStorage.getItem(CLIENT_KEY)||'';
  const sb = document.getElementById('syncBtn');
  if (sb) sb.disabled = !hasClient;
}

// ═══════════════════════════════════════════════════════
// GAPI BOOTSTRAP
// ═══════════════════════════════════════════════════════
function gapiLoaded() {
  gapi.load('client', async () => {
    try {
      await gapi.client.init({ discoveryDocs: [DISCOVERY] });
      gapiReady = true;
      const saved = localStorage.getItem(TOKEN_KEY);
      if (saved) {
        try {
          const t = JSON.parse(saved);
          if (t.expires_at > Date.now()) {
            accessToken = t.access_token;
            gapi.client.setToken({ access_token: accessToken });
            setGCalStatus('connected', '연결됨 — 동기화 준비');
            document.getElementById('syncBtn').disabled = false;
            syncGCalEvents(); fetchTasks();
          } else { localStorage.removeItem(TOKEN_KEY); }
        } catch {}
      }
      initTokenClient();
    } catch(e) { console.warn('GAPI init error', e); }
  });
}

function initTokenClient() {
  const clientId = localStorage.getItem(CLIENT_KEY);
  if (!clientId || !window.google) return;
  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: handleTokenResponse,
    });
  } catch(e) { console.warn('GIS init error', e); }
}

function handleTokenResponse(resp) {
  if (resp.error) { showToast('❌ 로그인 실패: ' + resp.error); setGCalStatus('', '로그인 실패'); return; }
  accessToken = resp.access_token;
  const expires_at = Date.now() + (resp.expires_in||3600)*1000;
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ access_token: accessToken, expires_at }));
  setGCalStatus('connected', '연결됨 — 동기화 준비');
  document.getElementById('syncBtn').disabled = false;
  updateSetupStepNums();
  syncGCalEvents(); fetchTasks();
}

function saveClientId() {
  const val = document.getElementById('clientIdInput').value.trim();
  if (!val) return;
  localStorage.setItem(CLIENT_KEY, val);
  initTokenClient();
  updateSetupStepNums();
  showToast('✅ 클라이언트 ID 저장됨');
}

function requestCalendarAccess() {
  if (!tokenClient) { showToast('❌ 클라이언트 ID를 먼저 저장해주세요.'); return; }
  setGCalStatus('loading', '연결 중...');
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

function disconnectGCal() {
  accessToken = null;
  localStorage.removeItem(TOKEN_KEY);
  if (gapi?.client) gapi.client.setToken(null);
  setGCalStatus('', 'Google Calendar 미연결');
  document.getElementById('gcalEventsRow').innerHTML = '<span class="gcal-empty">연결 해제됨</span>';
  updateSetupStepNums();
  showToast('🔌 Google Calendar 연결 해제됨');
}

async function syncGCalEvents() {
  if (!accessToken || !gapiReady) return;
  setGCalStatus('loading', '동기화 중...');
  try {
    const d = new Date(currentDate + 'T00:00:00');
    const nextD = new Date(d); nextD.setDate(nextD.getDate()+1);
    const res = await gapi.client.calendar.events.list({
      calendarId: 'primary',
      timeMin: d.toISOString(),
      timeMax: nextD.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20,
    });
    const events = res.result.items || [];
    renderGCalStrip(events, currentDate);
    setGCalStatus('connected', '연결됨');
  } catch(e) {
    setGCalStatus('', '동기화 실패');
    console.warn('GCal sync error', e);
  }
}

async function fetchTasks() {
  // placeholder — 추후 Tasks API 연동 시 활용
}

// ═══════════════════════════════════════════════════════
// TOAST / AUTOSAVE / SHORTCUTS
// ═══════════════════════════════════════════════════════
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// 자동저장 (60초)
setInterval(async () => {
  if (!sessionStorage.getItem(SESSION_KEY)) return;
  const data = collectForm();
  if (Object.values(data).some(v => v && v.toString().trim())) {
    const dateKey = data.entryDate || currentDate;
    entries[dateKey] = { ...entries[dateKey], ...data };
    saveEntriesToLocal();
    if (sheetsUrl) await saveToSheets(dateKey, entries[dateKey]);
  }
}, 60000);

// Ctrl+S
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveEntry(); }
});

// dropdown 닫기
document.addEventListener('click', e => {
  if (!e.target.closest('#caseTagWrap')) closeCaseDropdown();
});

// ═══════════════════════════════════════════════════════
// MOBILE SIDEBAR
// ═══════════════════════════════════════════════════════
function toggleMobileSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

// ═══════════════════════════════════════════════════════
// INIT ON LOAD
// ═══════════════════════════════════════════════════════
window.onload = function() {
  if (sessionStorage.getItem(SESSION_KEY)) {
    document.getElementById('lockScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    init();
  } else {
    document.getElementById('lockScreen').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('lockInput').focus();
  }
};
</script>
</body>
</html>
