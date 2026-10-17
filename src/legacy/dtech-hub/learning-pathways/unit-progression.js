"use strict";

const unitProgress = { data: null, loading: 0, teacherEmail: "", filters: { homeroom: "", year: "", search: "" } };
const up = (name) => document.querySelector(`#unit-progress-${name}`);
const UNIT_PROGRESS_HOMEROOMS = ["JVE", "JPI", "JMM", "JSR", "JSD", "7S", "8S"];
const UNIT_STATUS_LABELS = { completed: "Completed", "in-progress": "In progress", "not-started": "Not started" };

function unitProgressStatus(message, error = false) {
    up("status").textContent = message;
    up("status").classList.toggle("is-error", error);
}

function unitProgressNormalise(value) {
    return String(value || "").trim().toUpperCase();
}

function unitProgressClasses(student) {
    return [student.timetableClass, student.homeroom, student.formClass].map(unitProgressNormalise).filter(Boolean);
}

function unitProgressMatching(students, { homeroom, year, search }) {
    const term = String(search || "").trim().toLowerCase();
    // Staff rows only appear under Year = Staff, where the homeroom filter does not apply.
    if (year === "staff") return students.filter((student) => student.isStaff
        && (!term || `${student.name} ${student.email}`.toLowerCase().includes(term)));
    return students.filter((student) => !student.isStaff
        && (!homeroom || unitProgressClasses(student).includes(unitProgressNormalise(homeroom)))
        && (!year || Number(student.yearLevel) === Number(year))
        && (!term || `${student.name} ${student.email}`.toLowerCase().includes(term)));
}

function unitProgressYearLabel(student) {
    return student.isStaff ? "Staff" : `Year ${student.yearLevel}`;
}

function unitProgressStateOf(progress, student, activityId) {
    return (student.email && progress?.[student.email]?.[activityId]?.status) || "not-started";
}

function unitProgressTerm(date = new Date()) {
    return Math.min(4, Math.floor(date.getMonth() / 3) + 1);
}

function unitProgressReset(message, error = false) {
    unitProgress.data = null;
    up("controls").disabled = true;
    up("card").hidden = true;
    up("retry").hidden = true;
    if (up("dialog").open) up("dialog").close();
    unitProgressStatus(message, error);
}

function unitProgressHomeroomOptions() {
    const homerooms = new Set(UNIT_PROGRESS_HOMEROOMS);
    unitProgress.data.students.forEach((student) => unitProgressClasses(student).forEach((value) => homerooms.add(value)));
    const select = up("homeroom");
    const selected = unitProgress.filters.homeroom;
    select.replaceChildren(new Option("All homerooms", ""));
    [...homerooms].sort().forEach((homeroom) => select.append(new Option(homeroom, homeroom)));
    select.value = homerooms.has(selected) ? selected : "";
}

function unitProgressStatusIcon(state, studentName, activityTitle) {
    const icon = document.createElement("span");
    icon.className = `unit-status is-${state}`;
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", `${studentName}: ${activityTitle} ${UNIT_STATUS_LABELS[state].toLowerCase()}`);
    icon.title = UNIT_STATUS_LABELS[state];
    return icon;
}

function unitProgressOpenEvidence(student) {
    const { activities, progress, unit } = unitProgress.data;
    up("dialog-title").textContent = student.name;
    up("dialog-meta").textContent = [unit.title, unitProgressYearLabel(student), student.timetableClass || student.homeroom || student.formClass]
        .filter(Boolean).join(" \u00b7 ");
    up("dialog-list").replaceChildren();
    for (const activity of activities) {
        const state = unitProgressStateOf(progress, student, activity.id);
        const saved = progress?.[student.email]?.[activity.id];
        const item = document.createElement("li");
        item.className = `unit-progress-evidence-item is-${state}`;
        const head = document.createElement("div");
        head.className = "unit-progress-evidence-head";
        const title = document.createElement("strong");
        title.textContent = activity.lessonLabel ? `${activity.title} (${activity.lessonLabel})` : activity.title;
        const pill = document.createElement("span");
        pill.className = "unit-progress-evidence-state";
        pill.textContent = UNIT_STATUS_LABELS[state];
        head.append(unitProgressStatusIcon(state, student.name, activity.title), title, pill);
        item.append(head);
        const lines = document.createElement("ul");
        const details = [...(Array.isArray(saved?.summary) ? saved.summary : [])];
        if (saved?.completedAt) details.unshift(`Completed ${new Date(saved.completedAt).toLocaleString()}`);
        if (!saved) details.push("No answers saved yet.");
        for (const text of details) {
            const line = document.createElement("li");
            line.textContent = String(text);
            lines.append(line);
        }
        item.append(lines);
        if (typeof activity.href === "string" && activity.href.startsWith("/")) {
            const link = document.createElement("a");
            link.href = activity.href;
            link.target = "_blank";
            link.rel = "noopener";
            link.textContent = "Open activity";
            item.append(link);
        }
        up("dialog-list").append(item);
    }
    if (!up("dialog").open) up("dialog").showModal();
}

function unitProgressRender() {
    const data = unitProgress.data;
    if (!data) return;
    const { unit, activities, progress } = data;
    const students = unitProgressMatching(data.students, unitProgress.filters);
    up("kicker").textContent = `${unit.strandTitle || ""} / Unit summary`.replace(/^ \/ /, "");
    up("title").textContent = unit.title;
    const now = new Date();
    up("meta").textContent = [String(now.getFullYear()), `Term ${unitProgressTerm(now)}`,
        ...(unitProgress.filters.year === "staff" ? ["Staff"] : [unitProgress.filters.year ? `Year ${unitProgress.filters.year}` : "Years 7-10",
            unitProgress.filters.homeroom || "All homerooms"])].join(" \u00b7 ");
    let completedCount = 0;
    const headRow = up("head-row");
    headRow.replaceChildren();
    const studentHead = document.createElement("th");
    studentHead.scope = "col";
    studentHead.textContent = "Student";
    headRow.append(studentHead);
    for (const activity of activities) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = activity.shortTitle || activity.title;
        th.title = activity.title;
        headRow.append(th);
    }
    const evidenceHead = document.createElement("th");
    evidenceHead.scope = "col";
    evidenceHead.textContent = "Unit evidence";
    headRow.append(evidenceHead);

    const rows = up("rows");
    rows.replaceChildren();
    for (const student of students) {
        const row = document.createElement("tr");
        const name = document.createElement("th");
        name.scope = "row";
        name.textContent = student.name;
        if (!student.isStaff && (data.students.filter((other) => other.name === student.name).length > 1 || !unitProgress.filters.homeroom)) {
            const detail = document.createElement("span");
            detail.className = "unit-progress-student-detail";
            detail.textContent = [unitProgressYearLabel(student), student.timetableClass || student.homeroom || student.formClass].filter(Boolean).join(" \u00b7 ");
            name.append(detail);
        }
        row.append(name);
        for (const activity of activities) {
            const cell = document.createElement("td");
            const state = unitProgressStateOf(progress, student, activity.id);
            if (state === "completed") completedCount++;
            cell.append(unitProgressStatusIcon(state, student.name, activity.title));
            row.append(cell);
        }
        const evidence = document.createElement("td");
        if (student.email) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "unit-progress-evidence-button";
            button.setAttribute("aria-label", `View unit evidence for ${student.name}`);
            button.title = "View unit evidence";
            button.addEventListener("click", () => unitProgressOpenEvidence(student));
            evidence.append(button);
        } else {
            const missing = document.createElement("span");
            missing.className = "unit-progress-no-email";
            missing.textContent = "No school email linked";
            evidence.append(missing);
        }
        row.append(evidence);
        rows.append(row);
    }
    const people = unitProgress.filters.year === "staff" ? ["staff member", "staff members"] : ["student", "students"];
    up("shown").textContent = `${students.length} ${people[students.length === 1 ? 0 : 1]} shown`;
    up("done").textContent = `${completedCount} completed activit${completedCount === 1 ? "y" : "ies"}`;
    up("empty").hidden = students.length > 0;
    up("card").hidden = false;
}

async function unitProgressLoad() {
    const request = ++unitProgress.loading;
    const email = typeof hubAuthState === "object" ? hubAuthState.profile?.email || "" : "";
    if (unitProgress.teacherEmail !== email) {
        unitProgress.teacherEmail = email;
        unitProgress.data = null;
    }
    if (!hasAllowedSignedInHubAccount()) {
        unitProgressReset("Sign in with a Teacher/Admin account to see unit progression.");
        return;
    }
    if (!hubAccessState.resolved) {
        unitProgressReset("Checking Teacher View access...");
        return;
    }
    if (!hubAccessState.canTeacherView && !hubAccessState.canAdmin) {
        unitProgressReset("Teacher/Admin access is required. Unit progression is not available in Student View.", true);
        return;
    }
    up("retry").hidden = true;
    unitProgressStatus("Loading unit progression...");
    try {
        const unit = up("unit").value;
        const response = await fetch(`/api/teacher/unit-progression${unit ? `?unit=${encodeURIComponent(unit)}` : ""}`, {
            cache: "no-store", headers: withHubAuthHeaders()
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        if (!data || !data.unit || !Array.isArray(data.units) || !Array.isArray(data.activities) || !Array.isArray(data.students)
            || typeof data.progress !== "object" || data.progress === null) {
            throw new Error("Unit progression response is invalid.");
        }
        if (request !== unitProgress.loading) return;
        data.students.sort((left, right) => String(left.name).localeCompare(String(right.name)));
        unitProgress.data = data;
        up("unit").replaceChildren(...data.units.map((item) => new Option(item.title, item.id)));
        up("unit").value = data.unit.id;
        unitProgressHomeroomOptions();
        up("controls").disabled = false;
        unitProgressRender();
        unitProgressStatus("Use the filters to show a homeroom, a year level or one student.");
    } catch (error) {
        if (request !== unitProgress.loading) return;
        console.error("Could not load unit progression", error);
        unitProgress.data = null;
        up("card").hidden = true;
        unitProgressStatus(error.message || "Could not load unit progression. Please retry.", true);
        up("retry").hidden = false;
    }
}

for (const [name, key, event] of [["homeroom", "homeroom", "change"], ["year", "year", "change"], ["search", "search", "input"]]) {
    up(name).addEventListener(event, () => {
        unitProgress.filters[key] = up(name).value;
        unitProgressRender();
    });
}
up("unit").addEventListener("change", () => { void unitProgressLoad(); });
up("retry").addEventListener("click", () => { void unitProgressLoad(); });
up("dialog-close").addEventListener("click", () => up("dialog").close());
window.addEventListener("hub-auth-state-changed", () => { void unitProgressLoad(); });
document.addEventListener("DOMContentLoaded", () => { void unitProgressLoad(); });
