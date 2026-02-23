// ═══════════════════════════════════════════════════════
// WORKOUT TRACKER — app.js
// ═══════════════════════════════════════════════════════

// ── Storage ────────────────────────────────────────────
const STORE_KEY = 'workoutTrackerData';

function loadData() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultData();
    const d = JSON.parse(raw);
    if (!d.version) throw new Error('invalid');
    return d;
  } catch(e) {
    return defaultData();
  }
}

function saveData() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function defaultData() {
  return {
    version: 1,
    settings: { weeklyGoal: 3, maxExercises: 5, lastBackupReminder: today() },
    categories: [],
    exercises: [],
    workouts: [],
    history: []
  };
}

// ── Date Helpers ────────────────────────────────────────
function today() {
  const now = new Date();
  if (now.getHours() < 4) now.setDate(now.getDate() - 1);
  return now.toISOString().split('T')[0];
}

function todayRaw() {
  return new Date().toISOString().split('T')[0];
}

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(s) {
  const d = parseDate(s);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getMonday(d) {
  const dt = new Date(d.getTime());
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function weekKey(dateStr) {
  const monday = getMonday(parseDate(dateStr));
  return monday.toISOString().split('T')[0];
}

function currentWeekKey() {
  return weekKey(today());
}

// ── IDs ─────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ── State ────────────────────────────────────────────────
let state = loadData();
let activeWorkout = null; // { workoutId, exercises:[{id,name,catId,catName}], startTime, checked:Set }
let currentPage = 'dashboard';
let workoutTab = 'workouts';
let calendarDate = new Date();

// ── Navigation ───────────────────────────────────────────
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`.nav-btn[data-page="${page}"]`).classList.add('active');
  render();
}

// ── Streak Engine ────────────────────────────────────────
function computeStreak() {
  // Group history by week
  const weekCounts = {};
  state.history.forEach(log => {
    const wk = weekKey(log.date);
    weekCounts[wk] = (weekCounts[wk] || 0) + 1;
  });

  const goal = state.settings.weeklyGoal;
  const thisWeek = currentWeekKey();
  
  // Get all completed weeks (sorted desc)
  const completedWeeks = Object.entries(weekCounts)
    .filter(([, cnt]) => cnt >= goal)
    .map(([wk]) => wk)
    .sort()
    .reverse();

  if (!completedWeeks.length) return { current: 0, longest: 0 };

  // Current streak: start from this week or last week
  let streak = 0;
  let checkWeek = thisWeek;
  
  // If this week not complete, start from previous
  if (!weekCounts[thisWeek] || weekCounts[thisWeek] < goal) {
    const prev = mondayMinus(thisWeek, 1);
    if (!weekCounts[prev] || weekCounts[prev] < goal) return { current: 0, longest: longestStreak(completedWeeks) };
    checkWeek = prev;
  }

  // Count backwards
  while (weekCounts[checkWeek] >= goal) {
    streak++;
    checkWeek = mondayMinus(checkWeek, 1);
    if (!weekCounts[checkWeek]) break;
  }

  return { current: streak, longest: Math.max(streak, longestStreak(completedWeeks)) };
}

function mondayMinus(weekStr, weeks) {
  const d = parseDate(weekStr);
  d.setDate(d.getDate() - 7 * weeks);
  return d.toISOString().split('T')[0];
}

function longestStreak(sortedDescCompleted) {
  if (!sortedDescCompleted.length) return 0;
  const asc = [...sortedDescCompleted].reverse();
  let max = 1, cur = 1;
  for (let i = 1; i < asc.length; i++) {
    const prev = parseDate(asc[i-1]);
    const curr = parseDate(asc[i]);
    const diff = (curr - prev) / (7 * 86400000);
    if (Math.abs(diff - 1) < 0.01) { cur++; max = Math.max(max, cur); }
    else cur = 1;
  }
  return max;
}

function getWeekWorkouts(weekStr) {
  return state.history.filter(h => weekKey(h.date) === weekStr).length;
}

// ── Render Orchestrator ──────────────────────────────────
function render() {
  if (currentPage === 'dashboard') renderDashboard();
  else if (currentPage === 'workout') renderWorkout();
  else if (currentPage === 'history') renderHistory();
  else if (currentPage === 'stats') renderStats();
  else if (currentPage === 'settings') renderSettings();
}

// ── Dashboard ────────────────────────────────────────────
function renderDashboard() {
  const el = document.getElementById('page-dashboard');
  const streakData = computeStreak();
  const thisWeek = currentWeekKey();
  const weekCount = getWeekWorkouts(thisWeek);
  const goal = state.settings.weeklyGoal;
  const pct = Math.min(100, (weekCount / goal) * 100);

  // Days of week
  const now = new Date();
  const monday = getMonday(now);
  const days = ['M','T','W','T','F','S','S'];
  const todayStr = today();
  
  const weekDots = days.map((d, i) => {
    const dt = new Date(monday);
    dt.setDate(dt.getDate() + i);
    const ds = dt.toISOString().split('T')[0];
    const done = state.history.some(h => h.date === ds);
    const isToday = ds === todayStr;
    const isPast = ds < todayStr;
    return `<div class="week-dot ${done ? 'done' : ''} ${isToday ? 'today' : ''} ${!done && isPast && !isToday ? 'past' : ''}">
      ${done ? '✓' : d}
    </div>`;
  }).join('');

  // Greetings
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';

  // Quick workouts
  const workoutCards = state.workouts.length === 0
    ? `<div class="empty-state">
        <div class="empty-state-icon">🏋️</div>
        <div class="empty-state-text">No workouts yet</div>
        <div class="empty-state-sub">Create a workout in the Workout tab</div>
       </div>`
    : state.workouts.map(w => {
        const exCount = w.exerciseIds.length;
        const cats = [...new Set(w.exerciseIds.map(id => {
          const ex = state.exercises.find(e => e.id === id);
          if (!ex) return null;
          const cat = state.categories.find(c => c.id === ex.categoryId);
          return cat ? cat.name : null;
        }).filter(Boolean))];
        return `<div class="workout-quick-card" onclick="startWorkout('${w.id}')">
          <div>
            <div class="wqc-name">${esc(w.name)}</div>
            <div class="wqc-meta">${exCount} exercises · ${cats.slice(0,3).join(', ')}${cats.length > 3 ? '…' : ''}</div>
          </div>
          <div class="wqc-arrow"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>`;
      }).join('');

  el.innerHTML = `
    <div class="dash-hero">
      <div class="dash-date">${new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'})}</div>
      <div class="dash-greeting">${greeting}</div>
      <div class="dash-streak-row">
        <div class="streak-badge">
          <span class="streak-fire">🔥</span>
          <span class="streak-num">${streakData.current}</span>
          <span class="streak-label">Week Streak</span>
        </div>
      </div>
    </div>

    <div class="week-progress">
      <div class="week-progress-header">
        <div class="section-title">This Week</div>
        <div class="week-count">${weekCount}<span> / ${goal}</span></div>
      </div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill ${weekCount >= goal ? 'complete' : ''}" style="width:${pct}%"></div>
      </div>
      <div class="week-dots">${weekDots}</div>
    </div>

    <div class="quick-start">
      <div class="section-title" style="margin-bottom:12px">Start a Workout</div>
      <div class="quick-start-grid">${workoutCards}</div>
    </div>
  `;
}

// ── Active Workout View ───────────────────────────────────
function startWorkout(workoutId) {
  const workout = state.workouts.find(w => w.id === workoutId);
  if (!workout) return;

  const exercises = generateExercises(workout);
  activeWorkout = {
    workoutId,
    workoutName: workout.name,
    exercises,
    startTime: Date.now(),
    checked: new Set()
  };

  navigate('workout');
  renderActiveWorkout();
}

function generateExercises(workout) {
  const allExercises = workout.exerciseIds
    .map(id => state.exercises.find(e => e.id === id))
    .filter(Boolean);

  // Group by category
  const byCategory = {};
  allExercises.forEach(ex => {
    if (!byCategory[ex.categoryId]) byCategory[ex.categoryId] = [];
    byCategory[ex.categoryId].push(ex);
  });

  const categories = Object.keys(byCategory);
  const C = categories.length;
  let M = state.settings.maxExercises;
  if (M < C) M = C;

  // Step 2: guarantee coverage
  const selected = [];
  const remaining = [];

  categories.forEach(catId => {
    const pool = byCategory[catId];
    const picked = pool[Math.floor(Math.random() * pool.length)];
    selected.push(picked);
    pool.forEach(ex => { if (ex.id !== picked.id) remaining.push(ex); });
  });

  // Step 3: fill up to M
  const shuffledRemaining = shuffle([...remaining]);
  while (selected.length < M && shuffledRemaining.length > 0) {
    selected.push(shuffledRemaining.pop());
  }

  return shuffle(selected).map(ex => {
    const cat = state.categories.find(c => c.id === ex.categoryId);
    return { id: ex.id, name: ex.name, catId: ex.categoryId, catName: cat ? cat.name : '' };
  });
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let timerInterval = null;

function renderActiveWorkout() {
  const el = document.getElementById('page-workout');
  if (!activeWorkout) return;

  const items = activeWorkout.exercises.map((ex, i) => {
    const checked = activeWorkout.checked.has(ex.id);
    const color = categoryColor(ex.catId);
    return `<div class="exercise-workout-item">
      <div class="ewi-num">${i + 1}</div>
      <div class="ewi-info">
        <div class="ewi-name">${esc(ex.name)}</div>
        <div class="ewi-cat" style="color:${color}">${esc(ex.catName)}</div>
      </div>
      <button class="ewi-check ${checked ? 'checked' : ''}" onclick="toggleExerciseCheck('${ex.id}')">
        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="active-workout-screen">
      <div class="aw-header">
        <div>
          <div class="aw-name">${esc(activeWorkout.workoutName)}</div>
          <div class="aw-timer" id="aw-timer">0:00</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="cancelWorkout()">Cancel</button>
      </div>
      <div class="exercise-list-workout">${items}</div>
      <button class="btn btn-primary" id="complete-btn" onclick="completeWorkout()">
        ✓ Mark Complete
      </button>
    </div>
  `;

  // Timer
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const el = document.getElementById('aw-timer');
    if (!el || !activeWorkout) { clearInterval(timerInterval); return; }
    const s = Math.floor((Date.now() - activeWorkout.startTime) / 1000);
    el.textContent = `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  }, 1000);
}

function toggleExerciseCheck(exId) {
  if (!activeWorkout) return;
  if (activeWorkout.checked.has(exId)) activeWorkout.checked.delete(exId);
  else activeWorkout.checked.add(exId);
  renderActiveWorkout();
}

function cancelWorkout() {
  if (!confirm('Cancel this workout?')) return;
  activeWorkout = null;
  if (timerInterval) clearInterval(timerInterval);
  renderWorkout();
}

function completeWorkout() {
  if (!activeWorkout) return;
  const btn = document.getElementById('complete-btn');
  btn.classList.add('btn-complete-anim');
  btn.textContent = '✓ Saved!';

  const log = {
    id: uid(),
    date: today(),
    workoutId: activeWorkout.workoutId,
    exerciseIds: activeWorkout.exercises.map(e => e.id)
  };

  state.history.push(log);
  saveData();

  setTimeout(() => {
    showConfetti();
    showToast('Workout complete! 💪');
    activeWorkout = null;
    if (timerInterval) clearInterval(timerInterval);
    navigate('dashboard');
  }, 400);
}

// ── Workout Tab ───────────────────────────────────────────
function renderWorkout() {
  if (activeWorkout) { renderActiveWorkout(); return; }
  const el = document.getElementById('page-workout');

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">Workouts</div>
    </div>
    <div class="tab-row">
      <button class="tab-btn ${workoutTab === 'workouts' ? 'active' : ''}" onclick="switchWorkoutTab('workouts')">Templates</button>
      <button class="tab-btn ${workoutTab === 'exercises' ? 'active' : ''}" onclick="switchWorkoutTab('exercises')">Exercises</button>
      <button class="tab-btn ${workoutTab === 'categories' ? 'active' : ''}" onclick="switchWorkoutTab('categories')">Categories</button>
    </div>
    <div id="workout-tab-content"></div>
  `;

  renderWorkoutTabContent();
}

function switchWorkoutTab(tab) {
  workoutTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => {
    if (b.textContent.toLowerCase().includes(tab === 'workouts' ? 'template' : tab)) b.classList.add('active');
  });
  renderWorkoutTabContent();
}

function renderWorkoutTabContent() {
  const el = document.getElementById('workout-tab-content');
  if (!el) return;

  if (workoutTab === 'categories') {
    renderCategoryTab(el);
  } else if (workoutTab === 'exercises') {
    renderExerciseTab(el);
  } else {
    renderWorkoutTemplateTab(el);
  }
}

function renderCategoryTab(el) {
  const items = state.categories.map(cat => {
    const exCount = state.exercises.filter(e => e.categoryId === cat.id).length;
    return `<div class="list-item">
      <div class="list-item-main">
        <div class="list-item-name">${esc(cat.name)}</div>
        <div class="list-item-sub">${exCount} exercise${exCount !== 1 ? 's' : ''}</div>
      </div>
      <div class="list-item-actions">
        <button class="icon-btn" onclick="editCategory('${cat.id}')">
          <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn danger" onclick="deleteCategory('${cat.id}')">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="tab-content active">
    <button class="btn btn-primary" style="margin-bottom:20px" onclick="showAddCategory()">+ New Category</button>
    ${state.categories.length === 0
      ? `<div class="empty-state"><div class="empty-state-icon">🏷️</div><div class="empty-state-text">No categories yet</div></div>`
      : `<div class="card">${items}</div>`
    }
  </div>`;
}

function renderExerciseTab(el) {
  const items = state.exercises.map(ex => {
    const cat = state.categories.find(c => c.id === ex.categoryId);
    return `<div class="list-item">
      <div class="list-item-main">
        <div class="list-item-name">${esc(ex.name)}</div>
        <div class="list-item-sub">${cat ? `<span class="pill" style="background:${categoryColor(ex.categoryId)}22;color:${categoryColor(ex.categoryId)};border-color:${categoryColor(ex.categoryId)}44">${esc(cat.name)}</span>` : 'No category'}</div>
      </div>
      <div class="list-item-actions">
        <button class="icon-btn" onclick="editExercise('${ex.id}')">
          <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn danger" onclick="deleteExercise('${ex.id}')">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="tab-content active">
    <button class="btn btn-primary" style="margin-bottom:20px" onclick="showAddExercise()">+ New Exercise</button>
    ${state.exercises.length === 0
      ? `<div class="empty-state"><div class="empty-state-icon">💪</div><div class="empty-state-text">No exercises yet</div><div class="empty-state-sub">Add categories first</div></div>`
      : `<div class="card">${items}</div>`
    }
  </div>`;
}

function renderWorkoutTemplateTab(el) {
  const items = state.workouts.map(w => {
    const exCount = w.exerciseIds.length;
    const validEx = w.exerciseIds.filter(id => state.exercises.find(e => e.id === id));
    return `<div class="list-item">
      <div class="list-item-main">
        <div class="list-item-name">${esc(w.name)}</div>
        <div class="list-item-sub">${validEx.length} exercise${validEx.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="list-item-actions">
        <button class="icon-btn" onclick="editWorkout('${w.id}')">
          <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn danger" onclick="deleteWorkout('${w.id}')">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
        <button class="icon-btn" onclick="startWorkout('${w.id}')" style="background:var(--accent-dim);color:var(--accent)">
          <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="tab-content active">
    <button class="btn btn-primary" style="margin-bottom:20px" onclick="showAddWorkout()">+ New Workout</button>
    ${state.workouts.length === 0
      ? `<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">No workout templates</div><div class="empty-state-sub">Create one to get started</div></div>`
      : `<div class="card">${items}</div>`
    }
  </div>`;
}

// ── History ────────────────────────────────────────────
function renderHistory() {
  const el = document.getElementById('page-history');

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const monthName = calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Days with workouts
  const workoutDays = new Set(state.history.map(h => h.date));
  const todayStr = todayRaw();

  // Build calendar
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startDow = firstDay.getDay(); // 0=sun
  startDow = startDow === 0 ? 6 : startDow - 1; // make monday=0

  const dayLabels = ['M','T','W','T','F','S','S'].map(d => `<div class="cal-day-label">${d}</div>`).join('');

  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<div class="cal-day empty"></div>`;
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const hasW = workoutDays.has(ds);
    const isToday = ds === todayStr;
    cells += `<div class="cal-day ${hasW ? 'has-workout' : ''} ${isToday ? 'today' : ''}" 
      ${hasW ? `onclick="showDayWorkouts('${ds}')"` : ''}>
      ${d}
    </div>`;
  }

  // Recent history
  const recentLogs = [...state.history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  const logItems = recentLogs.map(log => {
    const workout = state.workouts.find(w => w.id === log.workoutId);
    const exercises = log.exerciseIds.map(id => {
      const ex = state.exercises.find(e => e.id === id);
      return ex ? ex.name : null;
    }).filter(Boolean);

    return `<div class="history-entry">
      <div class="he-header">
        <div>
          <div class="he-date">${formatDate(log.date)}</div>
          <div class="he-name">${esc(workout ? workout.name : 'Deleted Workout')}</div>
        </div>
        <button class="icon-btn danger" onclick="deleteHistoryEntry('${log.id}')">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
        </button>
      </div>
      <div class="he-exercises">
        ${exercises.slice(0,6).map(n => `<span class="pill">${esc(n)}</span>`).join('')}
        ${exercises.length > 6 ? `<span class="pill">+${exercises.length - 6}</span>` : ''}
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">History</div>
    </div>
    <div class="calendar-wrap">
      <div class="cal-nav">
        <button class="icon-btn" onclick="calNav(-1)"><svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
        <div class="cal-month">${monthName}</div>
        <button class="icon-btn" onclick="calNav(1)"><svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>
      </div>
      <div class="cal-grid">
        ${dayLabels}
        ${cells}
      </div>
    </div>
    <div class="history-log-section">
      <div class="section-title" style="margin-bottom:12px">Recent</div>
      ${recentLogs.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-text">No workouts logged yet</div></div>`
        : logItems
      }
    </div>
  `;
}

function calNav(dir) {
  calendarDate.setMonth(calendarDate.getMonth() + dir);
  renderHistory();
}

function showDayWorkouts(dateStr) {
  const logs = state.history.filter(h => h.date === dateStr);
  const content = logs.map(log => {
    const workout = state.workouts.find(w => w.id === log.workoutId);
    const exercises = log.exerciseIds.map(id => {
      const ex = state.exercises.find(e => e.id === id);
      return ex ? ex.name : null;
    }).filter(Boolean);

    return `<div style="margin-bottom:16px">
      <div class="he-name" style="margin-bottom:8px">${esc(workout ? workout.name : 'Deleted Workout')}</div>
      <div class="he-exercises">${exercises.map(n => `<span class="pill">${esc(n)}</span>`).join('')}</div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn btn-danger btn-sm" onclick="deleteHistoryEntry('${log.id}');closeModal()">Delete Entry</button>
      </div>
    </div>`;
  }).join('<div class="divider"></div>');

  showModal(`<div class="modal-handle"></div>
    <div class="modal-title">${formatDate(dateStr)}</div>
    ${content}
    <button class="btn btn-secondary" onclick="closeModal()" style="margin-top:8px">Close</button>
  `);
}

function deleteHistoryEntry(id) {
  if (!confirm('Delete this workout entry?')) return;
  state.history = state.history.filter(h => h.id !== id);
  saveData();
  renderHistory();
  showToast('Entry deleted');
}

// ── Stats ──────────────────────────────────────────────
function renderStats() {
  const el = document.getElementById('page-stats');
  const streakData = computeStreak();
  const total = state.history.length;

  // Last 8 weeks bar chart
  const now = new Date();
  const weekBars = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - 7 * i);
    const wk = weekKey(d.toISOString().split('T')[0]);
    const count = getWeekWorkouts(wk);
    const label = i === 0 ? 'Now' : `W-${i}`;
    weekBars.push({ count, label, wk });
  }
  const maxBar = Math.max(...weekBars.map(b => b.count), state.settings.weeklyGoal);
  const barCols = weekBars.map(b => {
    const pct = maxBar > 0 ? (b.count / maxBar) * 100 : 0;
    const isCurrent = b.label === 'Now';
    const goalMet = b.count >= state.settings.weeklyGoal;
    return `<div class="bar-col">
      <div class="bar-fill ${isCurrent ? 'current' : ''} ${goalMet && !isCurrent ? 'goal-met' : ''}" style="height:${pct}%"></div>
      <div class="bar-lbl">${b.label}</div>
    </div>`;
  }).join('');

  // Top workouts
  const workoutCounts = {};
  state.history.forEach(h => {
    workoutCounts[h.workoutId] = (workoutCounts[h.workoutId] || 0) + 1;
  });
  const topWorkouts = Object.entries(workoutCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, cnt]) => {
      const w = state.workouts.find(w => w.id === id);
      return { name: w ? w.name : 'Deleted', count: cnt };
    });

  // Top exercises
  const exCounts = {};
  state.history.forEach(h => {
    h.exerciseIds.forEach(eid => {
      exCounts[eid] = (exCounts[eid] || 0) + 1;
    });
  });
  const topExercises = Object.entries(exCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, cnt]) => {
      const ex = state.exercises.find(e => e.id === id);
      return { name: ex ? ex.name : 'Deleted', count: cnt };
    });

  const maxWo = topWorkouts[0]?.count || 1;
  const maxEx = topExercises[0]?.count || 1;

  function rankList(items, max) {
    return items.map((item, i) => `
      <div class="ranking-item">
        <div class="rank-num">${i + 1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(item.name)}</div>
          <div class="rank-bar"><div class="rank-bar-fill" style="width:${(item.count/max)*100}%"></div></div>
        </div>
        <div class="rank-count">${item.count}</div>
      </div>
    `).join('');
  }

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">Stats</div>
    </div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-val">${total}</div>
        <div class="stat-lbl">Total Workouts</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${streakData.current}🔥</div>
        <div class="stat-lbl">Current Streak</div>
      </div>
      <div class="stat-card full">
        <div class="stat-lbl" style="margin-bottom:12px">Weekly Activity (Last 8 Weeks)</div>
        <div class="bar-chart">${barCols}</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${streakData.longest}</div>
        <div class="stat-lbl">Longest Streak</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${state.settings.weeklyGoal}</div>
        <div class="stat-lbl">Weekly Goal</div>
      </div>
      <div class="stat-card full">
        <div class="stat-lbl" style="margin-bottom:4px">Top Workouts</div>
        ${topWorkouts.length === 0 ? '<div style="color:var(--text3);font-size:14px;padding:12px 0">No data yet</div>' : `<div class="ranking-list">${rankList(topWorkouts, maxWo)}</div>`}
      </div>
      <div class="stat-card full">
        <div class="stat-lbl" style="margin-bottom:4px">Top Exercises</div>
        ${topExercises.length === 0 ? '<div style="color:var(--text3);font-size:14px;padding:12px 0">No data yet</div>' : `<div class="ranking-list">${rankList(topExercises, maxEx)}</div>`}
      </div>
    </div>
  `;
}

// ── Settings ───────────────────────────────────────────
function renderSettings() {
  const el = document.getElementById('page-settings');
  const daysSinceBackup = Math.floor((Date.now() - new Date(state.settings.lastBackupReminder).getTime()) / 86400000);
  const showBackupReminder = daysSinceBackup > 30;

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">Settings</div>
    </div>
    ${showBackupReminder ? `<div class="backup-reminder">⚠️ It's been ${daysSinceBackup} days since your last backup. Consider exporting your data.</div>` : ''}
    <div class="settings-section">
      <div class="section-title">Goals</div>
      <div class="card">
        <div class="setting-row">
          <div>
            <div class="setting-row-label">Weekly Goal</div>
            <div class="setting-row-desc">Workouts per week</div>
          </div>
          <div class="setting-row-input">
            <div class="num-input-wrap">
              <button class="num-btn" onclick="adjustSetting('weeklyGoal', -1)">−</button>
              <div class="num-val" id="val-weeklyGoal">${state.settings.weeklyGoal}</div>
              <button class="num-btn" onclick="adjustSetting('weeklyGoal', 1)">+</button>
            </div>
          </div>
        </div>
        <div class="setting-row">
          <div>
            <div class="setting-row-label">Max Exercises</div>
            <div class="setting-row-desc">Per workout session</div>
          </div>
          <div class="setting-row-input">
            <div class="num-input-wrap">
              <button class="num-btn" onclick="adjustSetting('maxExercises', -1)">−</button>
              <div class="num-val" id="val-maxExercises">${state.settings.maxExercises}</div>
              <button class="num-btn" onclick="adjustSetting('maxExercises', 1)">+</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="settings-section">
      <div class="section-title">Data</div>
      <div class="card">
        <div class="setting-row">
          <div>
            <div class="setting-row-label">Export Backup</div>
            <div class="setting-row-desc">Download your data as JSON</div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="exportData()">Export</button>
        </div>
        <div class="setting-row">
          <div>
            <div class="setting-row-label">Import Backup</div>
            <div class="setting-row-desc">Restore from JSON file</div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('import-file').click()">Import</button>
        </div>
        <div class="setting-row" style="border-bottom:none">
          <div>
            <div class="setting-row-label">Reset All Data</div>
            <div class="setting-row-desc">Cannot be undone</div>
          </div>
          <button class="btn btn-danger btn-sm" onclick="resetData()">Reset</button>
        </div>
      </div>
      <input type="file" id="import-file" accept=".json" style="display:none" onchange="importData(event)">
    </div>
    <div style="padding:0 20px 20px;color:var(--text3);font-size:12px;text-align:center">
      All data is stored locally on this device. No account required.
    </div>
  `;
}

function adjustSetting(key, delta) {
  const min = key === 'weeklyGoal' ? 1 : 1;
  const max = key === 'weeklyGoal' ? 14 : 20;
  state.settings[key] = Math.max(min, Math.min(max, state.settings[key] + delta));
  saveData();
  const el = document.getElementById('val-' + key);
  if (el) el.textContent = state.settings[key];
}

function exportData() {
  state.settings.lastBackupReminder = today();
  saveData();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `workout-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup exported!');
  renderSettings();
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.version || !Array.isArray(data.history) || !Array.isArray(data.exercises)) {
        throw new Error('Invalid structure');
      }
      if (!confirm('This will replace all current data. Continue?')) return;
      state = data;
      saveData();
      showToast('Data imported successfully!');
      navigate('dashboard');
    } catch(err) {
      alert('Invalid backup file. Please try again with a valid JSON backup.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function resetData() {
  if (!confirm('Reset all data? This cannot be undone.')) return;
  state = defaultData();
  saveData();
  showToast('Data reset');
  navigate('dashboard');
}

// ── Category CRUD ──────────────────────────────────────
function showAddCategory(id) {
  const cat = id ? state.categories.find(c => c.id === id) : null;
  showModal(`<div class="modal-handle"></div>
    <div class="modal-title">${cat ? 'Edit Category' : 'New Category'}</div>
    <div class="input-group">
      <label class="input-label">Name</label>
      <input type="text" id="cat-name" value="${cat ? esc(cat.name) : ''}" placeholder="e.g. Biceps" maxlength="40">
    </div>
    <button class="btn btn-primary" onclick="saveCategory('${id || ''}')">Save</button>
  `);
  setTimeout(() => document.getElementById('cat-name')?.focus(), 100);
}

function editCategory(id) { showAddCategory(id); }

function saveCategory(id) {
  const name = document.getElementById('cat-name')?.value.trim();
  if (!name) { showToast('Name required'); return; }
  if (id) {
    const cat = state.categories.find(c => c.id === id);
    if (cat) cat.name = name;
  } else {
    state.categories.push({ id: uid(), name });
  }
  saveData();
  closeModal();
  renderWorkout();
  showToast(id ? 'Category updated' : 'Category created');
}

function deleteCategory(id) {
  const hasEx = state.exercises.some(e => e.categoryId === id);
  if (hasEx) { showToast('Remove exercises first'); return; }
  if (!confirm('Delete this category?')) return;
  state.categories = state.categories.filter(c => c.id !== id);
  saveData();
  renderWorkout();
  showToast('Category deleted');
}

// ── Exercise CRUD ──────────────────────────────────────
function showAddExercise(id) {
  if (state.categories.length === 0) { showToast('Add a category first'); return; }
  const ex = id ? state.exercises.find(e => e.id === id) : null;
  const catOptions = state.categories.map(c =>
    `<option value="${c.id}" ${ex && ex.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`
  ).join('');

  showModal(`<div class="modal-handle"></div>
    <div class="modal-title">${ex ? 'Edit Exercise' : 'New Exercise'}</div>
    <div class="input-group">
      <label class="input-label">Name</label>
      <input type="text" id="ex-name" value="${ex ? esc(ex.name) : ''}" placeholder="e.g. Dumbbell Curl" maxlength="60">
    </div>
    <div class="input-group">
      <label class="input-label">Category</label>
      <select id="ex-cat">${catOptions}</select>
    </div>
    <div class="input-group">
      <label class="input-label">Notes (optional)</label>
      <input type="text" id="ex-desc" value="${ex ? esc(ex.description || '') : ''}" placeholder="Any notes...">
    </div>
    <button class="btn btn-primary" onclick="saveExercise('${id || ''}')">Save</button>
  `);
  setTimeout(() => document.getElementById('ex-name')?.focus(), 100);
}

function editExercise(id) { showAddExercise(id); }

function saveExercise(id) {
  const name = document.getElementById('ex-name')?.value.trim();
  const categoryId = document.getElementById('ex-cat')?.value;
  const description = document.getElementById('ex-desc')?.value.trim();
  if (!name) { showToast('Name required'); return; }
  if (!categoryId) { showToast('Select a category'); return; }
  if (id) {
    const ex = state.exercises.find(e => e.id === id);
    if (ex) { ex.name = name; ex.categoryId = categoryId; ex.description = description; }
  } else {
    state.exercises.push({ id: uid(), name, categoryId, description });
  }
  saveData();
  closeModal();
  renderWorkout();
  showToast(id ? 'Exercise updated' : 'Exercise created');
}

function deleteExercise(id) {
  if (!confirm('Delete this exercise?')) return;
  state.exercises = state.exercises.filter(e => e.id !== id);
  // Remove from workout templates
  state.workouts.forEach(w => {
    w.exerciseIds = w.exerciseIds.filter(eid => eid !== id);
  });
  saveData();
  renderWorkout();
  showToast('Exercise deleted');
}

// ── Workout Template CRUD ──────────────────────────────
function showAddWorkout(id) {
  if (state.exercises.length === 0) { showToast('Add exercises first'); return; }
  const wo = id ? state.workouts.find(w => w.id === id) : null;
  const selected = new Set(wo ? wo.exerciseIds : []);

  // Group by category
  const byCategory = {};
  state.exercises.forEach(ex => {
    if (!byCategory[ex.categoryId]) byCategory[ex.categoryId] = [];
    byCategory[ex.categoryId].push(ex);
  });

  let exerciseHTML = '';
  Object.entries(byCategory).forEach(([catId, exercises]) => {
    const cat = state.categories.find(c => c.id === catId);
    exerciseHTML += `<div class="category-group-header">${esc(cat ? cat.name : 'Unknown')}</div>`;
    exercises.forEach(ex => {
      const chk = selected.has(ex.id) ? 'checked' : '';
      exerciseHTML += `<div class="exercise-check-item" onclick="toggleWoExercise('${ex.id}')">
        <div class="eci-checkbox ${chk}" id="eci-${ex.id}">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div>${esc(ex.name)}</div>
      </div>`;
    });
  });

  showModal(`<div class="modal-handle"></div>
    <div class="modal-title">${wo ? 'Edit Workout' : 'New Workout'}</div>
    <div class="input-group">
      <label class="input-label">Workout Name</label>
      <input type="text" id="wo-name" value="${wo ? esc(wo.name) : ''}" placeholder="e.g. Upper Body Day" maxlength="50">
    </div>
    <div class="input-group">
      <label class="input-label">Exercises</label>
      <div id="wo-exercises">${exerciseHTML}</div>
    </div>
    <button class="btn btn-primary" onclick="saveWorkout('${id || ''}')">Save</button>
  `, true);
  setTimeout(() => document.getElementById('wo-name')?.focus(), 100);
}

// Store selected exercises for modal
let modalSelectedExercises = new Set();

function showAddWorkoutWithState(id) {
  const wo = id ? state.workouts.find(w => w.id === id) : null;
  modalSelectedExercises = new Set(wo ? wo.exerciseIds : []);
  showAddWorkout(id);
}

function toggleWoExercise(exId) {
  const el = document.getElementById('eci-' + exId);
  if (!el) return;
  el.classList.toggle('checked');
}

function saveWorkout(id) {
  const name = document.getElementById('wo-name')?.value.trim();
  if (!name) { showToast('Name required'); return; }
  
  const checked = document.querySelectorAll('.eci-checkbox.checked');
  const exerciseIds = Array.from(checked).map(el => el.id.replace('eci-', ''));
  
  if (exerciseIds.length === 0) { showToast('Select at least 1 exercise'); return; }

  if (id) {
    const wo = state.workouts.find(w => w.id === id);
    if (wo) { wo.name = name; wo.exerciseIds = exerciseIds; }
  } else {
    state.workouts.push({ id: uid(), name, exerciseIds });
  }
  saveData();
  closeModal();
  renderWorkout();
  showToast(id ? 'Workout updated' : 'Workout created');
}

function editWorkout(id) { showAddWorkout(id); }

function deleteWorkout(id) {
  if (!confirm('Delete this workout template?')) return;
  state.workouts = state.workouts.filter(w => w.id !== id);
  saveData();
  renderWorkout();
  showToast('Workout deleted');
}

// ── Modal ──────────────────────────────────────────────
function showModal(html, tall = false) {
  document.getElementById('modal-content').innerHTML = html;
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  document.getElementById('modal').style.maxHeight = tall ? '92svh' : '80svh';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// Close modal on overlay click
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// ── Toast ───────────────────────────────────────────────
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

// ── Confetti ────────────────────────────────────────────
function showConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const pieces = Array.from({ length: 80 }, () => ({
    x: Math.random() * canvas.width,
    y: -10,
    r: Math.random() * 6 + 3,
    d: Math.random() * 20 + 10,
    color: ['#ff5c1a','#ff8c42','#2dce6e','#fff','#ffb347'][Math.floor(Math.random() * 5)],
    tilt: Math.floor(Math.random() * 10) - 10,
    tiltAngle: 0,
    tiltSpeed: Math.random() * 0.07 + 0.05
  }));

  let angle = 0;
  let frame;
  const start = Date.now();

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    angle += 0.01;
    pieces.forEach(p => {
      p.tiltAngle += p.tiltSpeed;
      p.y += (Math.cos(angle + p.d) + 3) * 2;
      p.x += Math.sin(angle) * 1.5;
      p.tilt = Math.sin(p.tiltAngle) * 12;
      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
      ctx.stroke();
    });

    if (Date.now() - start < 2000) {
      frame = requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  requestAnimationFrame(draw);
}

// ── Color per category ──────────────────────────────────
const CAT_COLORS = ['#ff5c1a','#2dce6e','#4dabf7','#ffd43b','#cc5de8','#ff8787','#51cf66','#74c0fc'];
const categoryColorMap = {};
function categoryColor(catId) {
  if (!categoryColorMap[catId]) {
    const idx = Object.keys(categoryColorMap).length % CAT_COLORS.length;
    categoryColorMap[catId] = CAT_COLORS[idx];
  }
  return categoryColorMap[catId];
}

// Pre-assign colors to existing categories
function initCategoryColors() {
  state.categories.forEach((cat, i) => {
    categoryColorMap[cat.id] = CAT_COLORS[i % CAT_COLORS.length];
  });
}

// ── Escape HTML ────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ───────────────────────────────────────────────
function init() {
  initCategoryColors();

  // Nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });

  // Keyboard on modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter' && !document.getElementById('modal-overlay').classList.contains('hidden')) {
      // Don't auto-submit
    }
  });

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  navigate('dashboard');
}

init();
