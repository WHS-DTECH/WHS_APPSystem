const thisWeekActivities = [
  {
    title: "Pocket-Hole Side Table",
    year: "Year 10",
    type: "Build",
    duration: 3,
    skill: 2,
    skillLabel: "Intermediate",
    description: "Cut rails, drill pocket joints, and assemble a compact side table frame.",
    image: "https://picsum.photos/seed/woodwork-side-table/900/560"
  },
  {
    title: "Mitre Frame Clamp Jig",
    year: "Year 9",
    type: "Design",
    duration: 2,
    skill: 1,
    skillLabel: "Beginner",
    description: "Design and build a reusable jig for accurate mitre-frame glue ups.",
    image: "https://picsum.photos/seed/woodwork-jig/900/560"
  },
  {
    title: "Upcycled Stool Restoration",
    year: "Year 11",
    type: "Repair",
    duration: 2,
    skill: 2,
    skillLabel: "Intermediate",
    description: "Repair loose joints, replace broken braces, and prep surfaces for refinishing.",
    image: "https://picsum.photos/seed/woodwork-restore/900/560"
  },
  {
    title: "Laminate Edge Trimming",
    year: "Year 12",
    type: "Finishing",
    duration: 1,
    skill: 3,
    skillLabel: "Advanced",
    description: "Apply and trim laminate edging cleanly with hand tools and router bits.",
    image: "https://picsum.photos/seed/woodwork-laminate/900/560"
  },
  {
    title: "Dovetail Drawer Box",
    year: "Year 11",
    type: "Build",
    duration: 4,
    skill: 3,
    skillLabel: "Advanced",
    description: "Lay out and cut half-blind dovetails for a hardwood drawer box.",
    image: "https://picsum.photos/seed/woodwork-dovetail/900/560"
  },
  {
    title: "Bench Hook Safety Drill",
    year: "Year 9",
    type: "Design",
    duration: 1,
    skill: 1,
    skillLabel: "Beginner",
    description: "Create a bench hook and practice controlled handsaw cuts safely.",
    image: "https://picsum.photos/seed/woodwork-benchhook/900/560"
  }
];

const seedLibraryActivities = [
  ...thisWeekActivities,
  {
    title: "Floating Shelf Joinery",
    year: "Year 10",
    type: "Build",
    duration: 2,
    skill: 2,
    skillLabel: "Intermediate",
    description: "Build a hidden-bracket shelf with precise wall cleat alignment.",
    image: "https://picsum.photos/seed/woodwork-shelf/900/560"
  },
  {
    title: "Cabinet Door Hinge Refit",
    year: "Year 12",
    type: "Repair",
    duration: 1,
    skill: 2,
    skillLabel: "Intermediate",
    description: "Reposition and align concealed hinges on damaged cabinet doors.",
    image: "https://picsum.photos/seed/woodwork-hinge/900/560"
  },
  {
    title: "Coffee Table Concept Sketch",
    year: "Year 9",
    type: "Design",
    duration: 1,
    skill: 1,
    skillLabel: "Beginner",
    description: "Develop a scaled concept sketch and materials list for a coffee table.",
    image: "https://picsum.photos/seed/woodwork-sketch/900/560"
  },
  {
    title: "Polyurethane Topcoat Lab",
    year: "Year 11",
    type: "Finishing",
    duration: 1,
    skill: 2,
    skillLabel: "Intermediate",
    description: "Compare brush and wipe-on topcoat outcomes on different timber grains.",
    image: "https://picsum.photos/seed/woodwork-topcoat/900/560"
  },
  {
    title: "Mortise and Tenon Practice",
    year: "Year 10",
    type: "Build",
    duration: 2,
    skill: 2,
    skillLabel: "Intermediate",
    description: "Produce repeatable mortise and tenon joints with hand and machine methods.",
    image: "https://picsum.photos/seed/woodwork-tenon/900/560"
  },
  {
    title: "Chair Seat Reupholstery",
    year: "Year 12",
    type: "Repair",
    duration: 3,
    skill: 3,
    skillLabel: "Advanced",
    description: "Strip and replace seat foam and fabric while maintaining frame integrity.",
    image: "https://picsum.photos/seed/woodwork-upholstery/900/560"
  },
  {
    title: "Tool Wall Layout Plan",
    year: "Year 9",
    type: "Design",
    duration: 1,
    skill: 1,
    skillLabel: "Beginner",
    description: "Draft an efficient pegboard and rack layout for a shared workshop wall.",
    image: "https://picsum.photos/seed/woodwork-toolwall/900/560"
  }
];

let worksheetLibraryItems = [];
let lessonNoteLibraryItems = [];
let libraryItems = [];

const thisWeekGrid = document.getElementById("thisWeekGrid");
const libraryGrid = document.getElementById("libraryGrid");
const activityCounter = document.getElementById("activityCounter");
const libraryStats = document.getElementById("libraryStats");

const searchInput = document.getElementById("searchInput");
const showFilterGroup = document.getElementById("showFilterGroup");
const yearFilterGroup = document.getElementById("yearFilterGroup");
const typeFilterGroup = document.getElementById("typeFilterGroup");
const categoryFilterGroup = document.getElementById("categoryFilterGroup");
const sortSelect = document.getElementById("sortSelect");

const filterState = {
  show: "all",
  year: "all",
  type: "all",
  category: "all",
};

const YEAR_LEVEL_GROUPS = {
  Junior: ["Year 7", "Year 8"],
  Middle: ["Year 9", "Year 10"],
  Senior: ["Year 11", "Year 12", "Year 13"],
};

function buildPlaceholder(title, type, footerLabel = "Workshop Activity") {
  const palette = {
    Build: ["#234d7c", "#3f89c9"],
    Repair: ["#34543c", "#5b9b5f"],
    Design: ["#5a3d2f", "#b57a53"],
    Finishing: ["#5d465f", "#9a76a8"]
  };

  const [start, end] = palette[type] || ["#315f89", "#5e95c8"];
  const safeTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560" role="img" aria-label="${safeTitle}">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${start}" />
          <stop offset="100%" stop-color="${end}" />
        </linearGradient>
      </defs>
      <rect width="900" height="560" fill="url(#g)" />
      <circle cx="760" cy="90" r="140" fill="rgba(255,255,255,0.2)" />
      <rect x="52" y="390" width="796" height="118" rx="18" fill="rgba(10,23,37,0.35)" />
      <text x="80" y="450" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="44" font-weight="700">${safeTitle}</text>
      <text x="80" y="494" fill="#deefff" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="600">${footerLabel}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function durationLabel(hours) {
  return `${hours} hr${hours > 1 ? "s" : ""}`;
}

function normaliseActivity(activity) {
  return {
    ...activity,
    kind: "activity",
    category: "Activity",
    uploadType: activity.uploadType || "ACTIVITY",
    keywords: [activity.type, activity.skillLabel, "activity"].filter(Boolean).join(" "),
    image: activity.image || buildPlaceholder(activity.title, activity.type, "Workshop Activity"),
  };
}

function mapWorksheetToLibraryItem(worksheet) {
  const strandLabel = worksheet.strand_number
    ? `Strand ${worksheet.strand_number}${worksheet.strand_title ? ` - ${worksheet.strand_title}` : ""}`
    : (worksheet.strand_title || "");

  const descriptionBits = [
    worksheet.worksheet_category ? `Category: ${worksheet.worksheet_category}` : null,
    strandLabel ? `Strand: ${strandLabel}` : null,
    worksheet.lesson_note_title ? `Lesson note: ${worksheet.lesson_note_title}` : null,
  ].filter(Boolean);

  return {
    title: worksheet.worksheet_title || "Untitled Worksheet",
    year: worksheet.year_level || "Junior",
    type: "Worksheet",
    duration: null,
    skill: null,
    skillLabel: worksheet.worksheet_category || "Worksheet",
    description: descriptionBits.length
      ? descriptionBits.join(" • ")
      : "Worksheet resource available in the Workshop Library.",
    kind: "worksheet",
    category: worksheet.worksheet_category || "Worksheet",
    uploadType: "WORKSHEET",
    keywords: ["worksheet", worksheet.worksheet_category, worksheet.strand_title, worksheet.lesson_note_title].filter(Boolean).join(" "),
    image: buildPlaceholder(worksheet.worksheet_title || "Worksheet", "Design", "Workshop Worksheet"),
  };
}

function mapLessonNoteToLibraryItem(lessonNote) {
  const strandLabel = lessonNote.strand_number
    ? `Strand ${lessonNote.strand_number}${lessonNote.strand_title ? ` - ${lessonNote.strand_title}` : ""}`
    : (lessonNote.strand_title || "");

  return {
    title: lessonNote.lesson_note_title || "Untitled Lesson Note",
    year: lessonNote.year_level || "Junior",
    type: "Lesson Notes",
    duration: null,
    skill: null,
    skillLabel: strandLabel || "Lesson Notes",
    description: [
      strandLabel ? `Strand: ${strandLabel}` : null,
      `Linked worksheets: ${Number(lessonNote.linked_worksheet_count || 0)}`,
    ].filter(Boolean).join(" • "),
    kind: "lesson-note",
    category: "Lesson Notes",
    uploadType: "LESSON NOTES",
    keywords: ["lesson notes", lessonNote.strand_title, lessonNote.lesson_note_title].filter(Boolean).join(" "),
    image: buildPlaceholder(lessonNote.lesson_note_title || "Lesson Notes", "Finishing", "Workshop Lesson Notes"),
  };
}

function rebuildLibraryItems() {
  libraryItems = [
    ...seedLibraryActivities.map(normaliseActivity),
    ...worksheetLibraryItems,
    ...lessonNoteLibraryItems,
  ];

  activityCounter.textContent = `${libraryItems.length} items in the student library`;
}

function renderCategoryFilters() {
  const uniqueCategories = [...new Set(libraryItems.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const buttons = [
    '<button type="button" class="chip-btn is-active" data-category="all">All categories</button>',
    ...uniqueCategories.map((category) => `<button type="button" class="chip-btn" data-category="${category}">${category}</button>`),
  ];

  categoryFilterGroup.innerHTML = buttons.join("");
}

function setActiveButton(container, selector, activeValue, attrName) {
  const nodes = container.querySelectorAll(selector);
  nodes.forEach((node) => {
    node.classList.toggle("is-active", node.getAttribute(attrName) === activeValue);
  });
}

function wireFilterButtons() {
  showFilterGroup.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-show]");
    if (!target) return;
    filterState.show = target.dataset.show || "all";
    setActiveButton(showFilterGroup, "button[data-show]", filterState.show, "data-show");
    renderLibrary();
  });

  yearFilterGroup.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-year]");
    if (!target) return;
    filterState.year = target.dataset.year || "all";
    setActiveButton(yearFilterGroup, "button[data-year]", filterState.year, "data-year");
    renderLibrary();
  });

  typeFilterGroup.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-type]");
    if (!target) return;
    filterState.type = target.dataset.type || "all";
    setActiveButton(typeFilterGroup, "button[data-type]", filterState.type, "data-type");
    renderLibrary();
  });

  categoryFilterGroup.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-category]");
    if (!target) return;
    filterState.category = target.dataset.category || "all";
    setActiveButton(categoryFilterGroup, "button[data-category]", filterState.category, "data-category");
    renderLibrary();
  });
}

async function loadWorksheetLibraryItems() {
  try {
    const response = await fetch("/api/worksheets", { cache: "no-store" });
    if (!response.ok) {
      worksheetLibraryItems = [];
      return;
    }

    const json = await response.json();
    const worksheets = Array.isArray(json.worksheets) ? json.worksheets : [];
    worksheetLibraryItems = worksheets.map(mapWorksheetToLibraryItem);
  } catch {
    worksheetLibraryItems = [];
  }
}

async function loadLessonNoteLibraryItems() {
  try {
    const response = await fetch("/api/lesson-notes", { cache: "no-store" });
    if (!response.ok) {
      lessonNoteLibraryItems = [];
      return;
    }

    const json = await response.json();
    const lessonNotes = Array.isArray(json.lessonNotes) ? json.lessonNotes : [];
    lessonNoteLibraryItems = lessonNotes.map(mapLessonNoteToLibraryItem);
  } catch {
    lessonNoteLibraryItems = [];
  }
}

function createCard(activity) {
  const card = document.createElement("article");
  card.className = "activity-card";

  // Determine upload type/category label (default: ACTIVITY)
  let uploadType = "ACTIVITY";
  if (activity.uploadType) {
    uploadType = String(activity.uploadType).toUpperCase();
  } else if (activity.type && activity.type.toLowerCase().includes("url")) {
    uploadType = "URL IDEA";
  } else if (activity.type && activity.type.toLowerCase().includes("assessment")) {
    uploadType = "ASSESSMENT TASK";
  }

  const tags = [
    `<span class="tag">${activity.year}</span>`,
    `<span class="tag">${activity.type}</span>`,
  ];

  if (typeof activity.duration === "number" && activity.duration > 0) {
    tags.push(`<span class="tag">${durationLabel(activity.duration)}</span>`);
  }

  if (activity.skillLabel) {
    tags.push(`<span class="tag">${activity.skillLabel}</span>`);
  }

  card.innerHTML = `
    <img class="thumb" src="${activity.image}" alt="${activity.title}" loading="lazy" />
    <div class="card-content">
      <div class="tags">${tags.join("")}</div>
      <h3 class="card-title">${activity.title}</h3>
      <p class="card-desc">${activity.description}</p>
    </div>
    <div class="card-upload-type">${uploadType}</div>
  `;

  return card;
}

function renderThisWeek() {
  thisWeekGrid.innerHTML = "";
  thisWeekActivities.forEach((activity) => thisWeekGrid.appendChild(createCard(activity)));
}

function getFilteredLibrary() {
  const searchValue = searchInput.value.trim().toLowerCase();
  const selectedShow = filterState.show;
  const selectedYear = filterState.year;
  const selectedType = filterState.type;
  const selectedCategory = filterState.category;
  const sortBy = sortSelect.value;

  const filtered = libraryItems.filter((activity) => {
    const matchesShow = selectedShow === "all"
      || (selectedShow === "activities" && activity.kind === "activity")
      || (selectedShow === "worksheets" && activity.kind === "worksheet")
      || (selectedShow === "lesson-notes" && activity.kind === "lesson-note");

    const matchesSearch =
      searchValue.length === 0 ||
      activity.title.toLowerCase().includes(searchValue) ||
      activity.description.toLowerCase().includes(searchValue) ||
      activity.type.toLowerCase().includes(searchValue) ||
      String(activity.category || "").toLowerCase().includes(searchValue) ||
      String(activity.keywords || "").toLowerCase().includes(searchValue);

    const selectedYearIsGroup = Object.prototype.hasOwnProperty.call(YEAR_LEVEL_GROUPS, selectedYear);
    const matchesYear = selectedYear === "all"
      || activity.year === selectedYear
      || (selectedYearIsGroup && YEAR_LEVEL_GROUPS[selectedYear].includes(activity.year));
    const matchesType = selectedType === "all" || activity.type === selectedType;
    const matchesCategory = selectedCategory === "all" || activity.category === selectedCategory;

    return matchesShow && matchesSearch && matchesYear && matchesType && matchesCategory;
  });

  filtered.sort((a, b) => {
    if (sortBy === "year") {
      return a.year.localeCompare(b.year);
    }

    if (sortBy === "type") {
      return a.type.localeCompare(b.type);
    }

    if (sortBy === "category") {
      return String(a.category || "").localeCompare(String(b.category || ""));
    }

    return a.title.localeCompare(b.title);
  });

  return filtered;
}

function renderLibrary() {
  const activities = getFilteredLibrary();
  libraryGrid.innerHTML = "";

  if (activities.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No items match these filters. Try broadening the search.";
    libraryGrid.appendChild(empty);
  } else {
    activities.forEach((activity) => libraryGrid.appendChild(createCard(activity)));
  }

  libraryStats.textContent = `${activities.length} items shown`;
}

// ── Google Auth ────────────────────────────────────────────────────────────
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
}

function getPrimaryRole(roles) {
  const priority = ['Admin', 'Lead Teacher', 'Teacher', 'Technician', 'Manager', 'Staff', 'Student'];
  for (const p of priority) {
    if (roles.some(r => r.role === p)) return p;
  }
  return 'Member';
}

fetch('/api/user')
  .then(res => res.json())
  .then(async user => {
    if (user) {
      document.getElementById('googleSignIn').style.display = 'none';
      const chip = document.getElementById('userChip');
      chip.style.display = 'inline-flex';
      document.getElementById('userInitials').textContent = getInitials(user.name);
      // Fetch roles and show highest role
      try {
        const rolesRes = await fetch('/api/my-roles');
        const roles = await rolesRes.json();
        document.getElementById('userRoleBadge').textContent = getPrimaryRole(roles);
        if (roles.some(r => r.role === 'Admin')) {
          document.getElementById('adminMenu').style.display = 'flex';
        }
      } catch {
        document.getElementById('userRoleBadge').textContent = 'Member';
      }
    }
  })
  .catch(() => {}); // static fallback — no server running locally

// Admin dropdown toggle
document.addEventListener('DOMContentLoaded', () => {
  const dropdown = document.getElementById('adminMenu');
  if (!dropdown) return;
  const btn = dropdown.querySelector('.nav-dropdown-btn');
  btn.addEventListener('click', e => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });
  document.addEventListener('click', () => dropdown.classList.remove('open'));
});

async function initialise() {
  await loadWorksheetLibraryItems();
  await loadLessonNoteLibraryItems();
  rebuildLibraryItems();
  renderCategoryFilters();
  renderThisWeek();
  renderLibrary();

  wireFilterButtons();
  [searchInput, sortSelect].forEach((el) => {
    el.addEventListener("input", renderLibrary);
    el.addEventListener("change", renderLibrary);
  });
}

initialise();
