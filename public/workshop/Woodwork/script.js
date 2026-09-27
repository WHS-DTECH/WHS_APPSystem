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

const libraryActivities = [
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

const thisWeekGrid = document.getElementById("thisWeekGrid");
const libraryGrid = document.getElementById("libraryGrid");
const activityCounter = document.getElementById("activityCounter");
const libraryStats = document.getElementById("libraryStats");

const searchInput = document.getElementById("searchInput");
const yearFilter = document.getElementById("yearFilter");
const typeFilter = document.getElementById("typeFilter");
const sortSelect = document.getElementById("sortSelect");

const YEAR_LEVEL_GROUPS = {
  Junior: ["Year 7", "Year 8"],
  Middle: ["Year 9", "Year 10"],
  Senior: ["Year 11", "Year 12", "Year 13"],
};

function buildPlaceholder(title, type) {
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
      <text x="80" y="494" fill="#deefff" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="600">Workshop Activity</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function durationLabel(hours) {
  return `${hours} hr${hours > 1 ? "s" : ""}`;
}

function createCard(activity) {
  const card = document.createElement("article");
  card.className = "activity-card";

  card.innerHTML = `
    <img class="thumb" src="${activity.image}" alt="${activity.title}" loading="lazy" />
    <div class="card-content">
      <div class="tags">
        <span class="tag">${activity.year}</span>
        <span class="tag">${activity.type}</span>
        <span class="tag">${durationLabel(activity.duration)}</span>
        <span class="tag">${activity.skillLabel}</span>
      </div>
      <h3 class="card-title">${activity.title}</h3>
      <p class="card-desc">${activity.description}</p>
    </div>
  `;

  return card;
}

function renderThisWeek() {
  thisWeekGrid.innerHTML = "";
  thisWeekActivities.forEach((activity) => thisWeekGrid.appendChild(createCard(activity)));
}

function getFilteredLibrary() {
  const searchValue = searchInput.value.trim().toLowerCase();
  const selectedYear = yearFilter.value;
  const selectedType = typeFilter.value;
  const sortBy = sortSelect.value;

  const filtered = libraryActivities.filter((activity) => {
    const matchesSearch =
      searchValue.length === 0 ||
      activity.title.toLowerCase().includes(searchValue) ||
      activity.description.toLowerCase().includes(searchValue) ||
      activity.type.toLowerCase().includes(searchValue);

    const selectedYearIsGroup = Object.prototype.hasOwnProperty.call(YEAR_LEVEL_GROUPS, selectedYear);
    const matchesYear = selectedYear === "all"
      || activity.year === selectedYear
      || (selectedYearIsGroup && YEAR_LEVEL_GROUPS[selectedYear].includes(activity.year));
    const matchesType = selectedType === "all" || activity.type === selectedType;

    return matchesSearch && matchesYear && matchesType;
  });

  filtered.sort((a, b) => {
    if (sortBy === "duration") {
      return a.duration - b.duration;
    }

    if (sortBy === "skill") {
      return a.skill - b.skill;
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
    empty.textContent = "No activities match these filters. Try broadening the search.";
    libraryGrid.appendChild(empty);
  } else {
    activities.forEach((activity) => libraryGrid.appendChild(createCard(activity)));
  }

  libraryStats.textContent = `${activities.length} shown`;
}

function initialise() {
  libraryActivities.forEach((activity) => {
    activity.image = buildPlaceholder(activity.title, activity.type);
  });

  activityCounter.textContent = `${libraryActivities.length} activities in the student library`;
  renderThisWeek();
  renderLibrary();

  [searchInput, yearFilter, typeFilter, sortSelect].forEach((el) => {
    el.addEventListener("input", renderLibrary);
    el.addEventListener("change", renderLibrary);
  });
}

initialise();
