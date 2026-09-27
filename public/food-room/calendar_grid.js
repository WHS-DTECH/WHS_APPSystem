// Booking Calendar Grid JS
// This script renders a week-view calendar grid with bookings, similar to the provided screenshot.

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const PERIODS = ["P1", "P2", "P3", "P4", "P5"];

let weekOffset = 0; // 0 = current week, -1 = previous, +1 = next, etc.
let allBookings = [];

window.addEventListener('DOMContentLoaded', () => {
  fetch('/api/bookings/all')
    .then(res => res.json())
    .then(data => {
      allBookings = data.bookings || [];
      renderWeekControls();
      renderCalendarGrid();
    });
});

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday as first day
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

function formatDate(d) {
  return d.toISOString().slice(0,10);
}

function formatDisplayDate(d) {
  // Use user's system locale
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function renderWeekControls() {
  const controls = document.getElementById('weekControls');
  if (!controls) return;
  const today = new Date();
  const monday = getMondayOfWeek(new Date(today.getFullYear(), today.getMonth(), today.getDate() + weekOffset * 7));
  const weekDates = [];
  for (let i = 0; i < 5; ++i) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push(d);
  }
  controls.innerHTML = `<h2 style="margin-bottom:0.5rem;">Week of ${formatDisplayDate(weekDates[0])} to ${formatDisplayDate(weekDates[4])}</h2>
    <button id="prevWeekBtn">&larr; Previous</button>
    <button id="todayWeekBtn">Today</button>
    <button id="nextWeekBtn">Next &rarr;</button>`;
  document.getElementById('prevWeekBtn').onclick = () => { weekOffset--; renderWeekControls(); renderCalendarGrid(); };
  document.getElementById('nextWeekBtn').onclick = () => { weekOffset++; renderWeekControls(); renderCalendarGrid(); };
  document.getElementById('todayWeekBtn').onclick = () => { weekOffset = 0; renderWeekControls(); renderCalendarGrid(); };
}

// Assign a color to each teacher (by staff_name)
const TEACHER_COLORS = [
  '#e3f7e3', // light green
  '#e3eaf7', // light blue
  '#f7e3e3', // light red
  '#f7f3e3', // light yellow
  '#f7e3f3', // light pink
  '#e3f7f3', // light teal
  '#f7e9e3', // light orange
  '#e3f7e9', // light mint
  '#e3e3f7', // light purple
];
const teacherColorMap = {};
function getTeacherColor(teacher) {
  if (!teacherColorMap[teacher]) {
    const keys = Object.keys(teacherColorMap);
    teacherColorMap[teacher] = TEACHER_COLORS[keys.length % TEACHER_COLORS.length];
  }
  return teacherColorMap[teacher];
}

function renderCalendarGrid() {
  const table = document.getElementById('calendarTable');
  if (!table) return;
  // Calculate week dates
  const today = new Date();
  const monday = getMondayOfWeek(new Date(today.getFullYear(), today.getMonth(), today.getDate() + weekOffset * 7));
  const weekDates = [];
  for (let i = 0; i < 5; ++i) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push(d);
  }
  // Build header with dates
  let thead = '<thead><tr><th></th>';
  for (let i = 0; i < DAYS.length; ++i) {
    thead += `<th>${DAYS[i]}<br><span style="font-size:0.98em;font-weight:400;">${formatDisplayDate(weekDates[i])}</span></th>`;
  }
  thead += '</tr></thead>';
  // Build body
  let tbody = '<tbody>';
  for (let p = 0; p < PERIODS.length; ++p) {
    tbody += `<tr><th>${PERIODS[p]}</th>`;
    for (let d = 0; d < DAYS.length; ++d) {
      const cellDate = formatDate(weekDates[d]);
      const cellBookings = allBookings.filter(b => {
        return b.booking_date === cellDate && String(b.period) === String(p + 1);
      });
      tbody += '<td>';
      for (const b of cellBookings) {
        const color = getTeacherColor(b.staff_name);
        tbody += `<div class="calendar-booking" style="background:${color};">
          <div class="class"><strong>Class:</strong> ${b.class_name}</div>
          <div class="teacher"><strong>Teacher:</strong> ${b.staff_name}</div>
          <div class="servings"><strong>Servings:</strong> ${b.class_size}</div>
          <div><strong>Recipe:</strong> ${b.recipe}</div>
          <div style="font-size:0.93em;color:#888;">${b.booking_date}</div>
        </div>`;
      }
      tbody += '</td>';
    }
    tbody += '</tr>';
  }
  tbody += '</tbody>';
  table.innerHTML = thead + tbody;
}
