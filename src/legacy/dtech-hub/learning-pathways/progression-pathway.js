"use strict";

const progressionPathways = [
    ["digital-systems", "Digital Systems", "digital-systems"],
    ["data", "Data and Information", "data-and-information"],
    ["digital-citizenship", "Digital Citizenship", "digital-citizenship"],
    ["programming-and-algorithms", "Programming & Algorithms", "programming-and-algorithms"],
    ["systems-and-control", "Systems and Control", "systems-and-control"]
];
const progressionDescriptors = ["emerging", "developing", "consolidating", "proficient", "exceeding"];
const progressionDisciplines = [["dtech", "DTECH"], ["textiles", "Textiles"], ["food", "Food"], ["wood", "Wood"], ["dvc", "DVC"]];
const progressionCoverageOptions = [["not-taught", "No Evidence"], ["partly-taught", "Some Evidence"], ["taught", "Full Evidence"]];
let progressionDefaultMapping = null;
// Published Admin > Curriculum Mapping, or the seeded default until it loads.
function progressionMappingData() {
    return progression.mapping || (progressionDefaultMapping ||= progressionMapping.defaultMapping());
}
function progressionLinks(statementId) {
    return progressionMappingData().links?.[statementId] || [];
}
const progressionRoleLabels = { primary: "Primary", supporting: "Supporting", context: "Context dependent" };
function progressionActivityNote(statementId) {
    const result = progressionStatementResult(statementId);
    return (progressionMappingData().activities || []).filter((link) => link.statement === statementId && link.autoSet !== "no")
        .map((link) => ({ link, activity: progression.completed.find((item) => item.id === link.activity) }))
        .filter((item) => item.activity)
        .map(({ link, activity }) => result.autoFrom === link.activity && result.coverage === "partly-taught"
            ? `Auto-set to Some Evidence: ${activity.title} completed`
            : link.autoSet === "review" ? `${activity.title} completed - review whether this statement was covered` : `${activity.title} completed`)
        .join(" | ");
}
const progressionPathwayChips = {
    "digital-systems": "DS", data: "D&I", "digital-citizenship": "DC", "programming-and-algorithms": "P&A", "systems-and-control": "S&C"
};
const progressionStrands = [["digital-technology", "Digital Technology"], ["systems-and-control", "Systems and Control"]];
function progressionCurriculumStatements(yearLevel) {
    const curriculum = typeof progressionCurriculum === "undefined" ? null : progressionCurriculum;
    return curriculum?.statements?.[String(Number(yearLevel))] || [];
}
function progressionStatementResult(id) {
    return (progression.record?.statements || []).find((row) => row.id === id) || { id, discipline: "dtech", coverage: "not-taught" };
}
function progressionStatement(id, yearLevel) {
    const year = Number(yearLevel);
    const linked = progressionCurriculumStatements(year).filter((statement) => progressionLinks(statement.id).some((link) => link.pathway === id));
    if (!linked.length) return "Select the student year level to see the linked curriculum statements.";
    const results = linked.map((statement) => progressionStatementResult(statement.id).coverage);
    const taught = results.filter((value) => value === "taught").length;
    const partly = results.filter((value) => value === "partly-taught").length;
    return `Year ${year}: ${taught} of ${linked.length} linked curriculum statements with Full Evidence${partly ? `, ${partly} with Some Evidence` : ""}.`;
}
function progressionUpdateHints() {
    for (const element of document.querySelectorAll("#progression-rows [data-statement]")) {
        element.textContent = progressionStatement(element.dataset.statement, pp("level").value);
    }
}
function progressionCoverageColour(select) {
    select.className = `coverage-chip coverage-${select.value}`;
}
function progressionDescriptorColour(select) {
    select.className = select.value ? `descriptor-chip ${select.value}` : "";
}
function progressionDescriptorSelect(label, value) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", label);
    select.append(new Option("Not determined", ""));
    progressionDescriptors.forEach((item, index) => select.append(new Option(`${index + 1} - ${item[0].toUpperCase() + item.slice(1)}`, item)));
    select.value = value || "";
    progressionDescriptorColour(select);
    return select;
}
function progressionStatementSelect(label, options, value, onChange) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", label);
    for (const [optionValue, optionLabel] of options) select.append(new Option(optionLabel, optionValue));
    select.value = value;
    select.addEventListener("change", () => onChange(select.value));
    return select;
}
function progressionStrandDescriptor(strand, kind) {
    return (progression.record?.strandProgress || []).find((row) => row.strand === strand && row.kind === kind)?.descriptor || null;
}
function progressionSetCoverages(strand, kind, yearLevel) {
    return progressionCurriculumStatements(yearLevel).filter((statement) => statement.strand === strand && statement.kind === kind)
        .map((statement) => progressionStatementResult(statement.id).coverage);
}
function progressionSetStrandDescriptor(strand, kind, descriptor) {
    const rows = progression.record.strandProgress ||= [];
    const entry = rows.find((row) => row.strand === strand && row.kind === kind);
    if (entry) entry.descriptor = descriptor; else rows.push({ strand, kind, descriptor });
}
// One Set Progress indicator per Statement Set (strand Knowledge / Practices table): levels 1-3 are
// calculated from statement evidence; the teacher may raise a Consolidating set to 4 or 5.
function progressionStrandProgress(strand, kind, title) {
    const label = document.createElement("label");
    label.className = "progression-strand-progress";
    label.append("Set Progress");
    const strandLabel = progressionStrands.find(([id]) => id === strand)?.[1] || strand;
    const select = progressionDescriptorSelect(`${strandLabel} ${title} set progress`, progressionStrandDescriptor(strand, kind));
    select.dataset.strandProgress = `${strand}:${kind}`;
    select.addEventListener("change", () => {
        progressionSetStrandDescriptor(strand, kind, select.value || null);
        progressionDescriptorColour(select);
        progression.dirty = true;
        progressionRefreshPathways();
    });
    label.append(select);
    return label;
}
function progressionCurriculumTable(title, statements, strand, kind) {
    const header = document.createElement("div");
    header.className = "progression-strand-header";
    const heading = document.createElement("h4");
    heading.textContent = title;
    header.append(heading, progressionStrandProgress(strand, kind, title));
    const wrap = document.createElement("div");
    wrap.className = "curriculum-table-wrap";
    const table = document.createElement("table");
    table.className = "curriculum-table progression-statement-table";
    table.innerHTML = '<thead><tr><th scope="col">Statement</th><th scope="col">Discipline</th><th scope="col">Coverage</th></tr></thead>';
    const body = document.createElement("tbody");
    const groups = [...new Set(statements.map((statement) => statement.heading))].sort((a, b) => (a ? 1 : 0) - (b ? 1 : 0));
    for (const group of groups) {
        if (group) {
            const groupRow = document.createElement("tr");
            groupRow.className = "progression-statement-group";
            const cell = document.createElement("th");
            cell.scope = "colgroup"; cell.colSpan = 3; cell.textContent = group;
            groupRow.append(cell); body.append(groupRow);
        }
        for (const statement of statements.filter((item) => item.heading === group)) {
            const result = progressionStatementResult(statement.id);
            const row = document.createElement("tr");
            row.dataset.curriculumStatement = statement.id;
            const text = document.createElement("td");
            const words = document.createElement("span");
            words.textContent = statement.text;
            const chips = document.createElement("span");
            chips.className = "progression-chips";
            for (const link of progressionLinks(statement.id)) {
                const chip = document.createElement("span");
                chip.className = `progression-chip role-${link.role}`;
                chip.textContent = progressionPathwayChips[link.pathway] || link.pathway;
                chip.title = `${progressionPathways.find(([id]) => id === link.pathway)?.[1] || link.pathway} - ${progressionRoleLabels[link.role] || link.role}`;
                chips.append(chip);
            }
            const note = document.createElement("span");
            note.className = "progression-activity-note";
            const showNote = () => { note.textContent = progressionActivityNote(statement.id); note.hidden = !note.textContent; };
            showNote();
            text.append(words, chips, note);
            let coverage;
            const update = (key, value) => {
                const rows = progression.record.statements ||= [];
                let entry = rows.find((item) => item.id === statement.id);
                if (!entry) { entry = { id: statement.id, discipline: "dtech", coverage: "not-taught", descriptor: null }; rows.push(entry); }
                entry[key] = value;
                // Statement-level Progress is retired; clear any legacy value so No Evidence stays valid.
                if (key === "coverage" && value === "not-taught") entry.descriptor = null;
                coverage.value = entry.coverage;
                progressionCoverageColour(coverage);
                progression.dirty = true;
                showNote();
                progressionRefreshPathways();
            };
            const discipline = progressionStatementSelect(`Discipline for: ${statement.text}`, progressionDisciplines, result.discipline || "dtech", (value) => update("discipline", value));
            coverage = progressionStatementSelect(`Coverage for: ${statement.text}`, progressionCoverageOptions, result.coverage, (value) => update("coverage", value));
            progressionCoverageColour(coverage);
            row.append(text);
            for (const element of [discipline, coverage]) { const cell = document.createElement("td"); cell.append(element); row.append(cell); }
            body.append(row);
        }
    }
    table.append(body); wrap.append(table);
    return [header, wrap];
}
function progressionRenderCurriculum() {
    const container = pp("curriculum");
    if (!container) return;
    const year = Number(pp("level").value);
    const statements = progressionCurriculumStatements(year);
    container.replaceChildren();
    if (!statements.length) {
        const empty = document.createElement("p");
        empty.textContent = "Select the student year level to see the curriculum statements.";
        container.append(empty);
        return;
    }
    for (const [strand, label] of progressionStrands) {
        const strandStatements = statements.filter((statement) => statement.strand === strand);
        if (!strandStatements.length) continue;
        const heading = document.createElement("h3");
        const page = progressionCurriculum.pages?.[strand]?.[year];
        heading.textContent = `${label} - Year ${year}${page ? ` (curriculum p. ${page})` : ""}`;
        container.append(heading);
        container.append(...progressionCurriculumTable("Knowledge", strandStatements.filter((statement) => statement.kind === "knowledge"), strand, "knowledge"));
        container.append(...progressionCurriculumTable("Practices", strandStatements.filter((statement) => statement.kind === "practices"), strand, "practices"));
    }
}
function progressionUpdateStatements() {
    progressionAutoSet();
    progressionRenderCurriculum();
    progressionRefreshPathways();
}
// Approved Admin > Curriculum Mapping links for completed tracked activities set statements to Some Evidence.
function progressionAutoSet() {
    if (!progression.record) return [];
    return progressionMapping.autoApply(progressionMappingData(), Number(pp("level").value), progression.record.statements ||= [],
        progression.completed.map((activity) => activity.id));
}
// Pathway Coverage is calculated from its linked statements. Any legacy pathway descriptor is kept (hidden)
// but cleared at No Evidence so the record stays valid.
function progressionRefreshPathways() {
    const record = progression.record;
    if (!record) return false;
    const year = Number(pp("level").value);
    let changed = false;
    for (const result of record.pathways) {
        const coverage = progressionMapping.derivePathwayCoverage(progressionMappingData(), year, result.id, (id) => progressionStatementResult(id).coverage);
        const descriptor = coverage === "not-taught" ? null : result.descriptor;
        if (coverage !== result.coverage || descriptor !== result.descriptor) { changed = true; result.coverage = coverage; result.descriptor = descriptor; }
        const chip = document.querySelector(`[data-pathway-coverage="${result.id}"]`);
        if (chip) {
            chip.className = `coverage-chip coverage-${coverage}`;
            chip.textContent = progressionCoverageOptions.find(([value]) => value === coverage)[1];
        }
    }
    for (const [strand] of progressionStrands) for (const kind of ["knowledge", "practices"]) {
        const coverages = progressionSetCoverages(strand, kind, year);
        if (!coverages.length) continue;
        const current = progressionStrandDescriptor(strand, kind);
        const level = progressionMapping.deriveSetProgress(coverages, current);
        if (level !== current) { progressionSetStrandDescriptor(strand, kind, level); changed = true; }
        const select = document.querySelector(`[data-strand-progress="${strand}:${kind}"]`);
        if (select) {
            const consolidated = progressionMapping.deriveSetProgress(coverages, null) === "consolidating";
            for (const option of select.options) option.disabled = consolidated ? !["consolidating", "proficient", "exceeding"].includes(option.value) : option.value !== (level || "");
            select.value = level || "";
            select.disabled = !consolidated;
            select.title = consolidated ? "All statements have Full Evidence: choose 4 - Proficient or 5 - Exceeding if earned"
                : "Set automatically: 1 Emerging with any evidence, 2 Developing with 3 or more, 3 Consolidating when all have Full Evidence";
            progressionDescriptorColour(select);
        }
    }
    progressionUpdateHints();
    progressionDialogSummary();
    return changed;
}
// Summary bars show the four Statement Set Progress levels (strand Knowledge / Practices).
const progressionSummaryKinds = [["knowledge", "Knowledge"], ["practices", "Practices"]];
function progressionSummary(student) {
    const summary = document.createElement("div");
    summary.className = "progression-summary";
    const progress = student.progress;
    const caption = document.createElement("p");
    caption.className = "progression-summary-caption";
    caption.textContent = progress ? `Latest results: ${progress.schoolYear} Term ${progress.term}` : "No results saved yet";
    const cards = document.createElement("div");
    cards.className = "progression-summary-cards";
    summary.append(caption, cards);
    for (const [strand, group] of progressionStrands) {
        const section = document.createElement("div");
        section.className = `progression-summary-group strand-${strand}`;
        const heading = document.createElement("strong");
        heading.className = "progression-summary-strand";
        heading.textContent = group;
        section.append(heading);
        progressionSummaryKinds.forEach(([kind, kindLabel]) => {
            const descriptor = progress?.strandProgress?.find((row) => row.strand === strand && row.kind === kind)?.descriptor;
            const level = progressionDescriptors.indexOf(descriptor) + 1;
            const label = level ? `${descriptor[0].toUpperCase()}${descriptor.slice(1)}` : progress ? "Not determined" : "Not recorded";
            const value = document.createElement("div");
            value.className = `progression-summary-row${level ? ` is-${descriptor}` : " is-empty"}`;
            const badge = document.createElement("span");
            badge.className = `progression-summary-badge${level ? ` ${descriptor}` : ""}`;
            badge.setAttribute("aria-hidden", "true");
            badge.textContent = level || "-";
            const name = document.createElement("span");
            name.className = "progression-summary-name";
            name.textContent = kindLabel;
            const bar = document.createElement("span");
            bar.className = "progression-bar";
            bar.setAttribute("role", "img");
            bar.setAttribute("aria-label", `${group} ${kindLabel}: ${label}${level ? ` (${level} of 5)` : ""}`);
            progressionDescriptors.forEach((descriptor, step) => {
                const segment = document.createElement("span");
                segment.className = step < level ? `progression-bar-segment ${descriptor}` : "progression-bar-segment";
                bar.append(segment);
            });
            const text = document.createElement("span");
            text.className = `progression-bar-label${level ? "" : " is-empty"}`;
            text.textContent = label;
            value.append(badge, name, text, bar);
            section.append(value);
        });
        cards.append(section);
    }
    return summary;
}
const progression = { students: [], records: [], record: null, selected: "digital-systems", dirty: false, loading: 0, saving: false, teacherEmail: "",
    changeSeq: 0, autosaveTimer: null, saveAgain: false, mapping: null, completed: [], commentBank: null, commentPicks: {} };
const pp = (name) => document.querySelector(`#progression-${name}`);
function progressionStatus(message, error = false) {
    pp("status").textContent = message;
    pp("status").classList.toggle("is-error", error);
    pp("dialog-status").textContent = message;
    pp("dialog-status").classList.toggle("is-error", error);
}
function progressionHideEditor() {
    pp("editor").hidden = true;
    if (pp("dialog").open) pp("dialog").close();
}
function progressionOpenDialog(student) {
    pp("dialog-title").textContent = student ? student.name : "Student results";
    pp("dialog-meta").textContent = student ? [student.isStaff ? "Staff" : `Year ${student.yearLevel}`, student.timetableClass || student.formClass || student.homeroom]
        .filter(Boolean).join(" | ") : "";
    if (!pp("dialog").open) pp("dialog").showModal();
}
async function progressionCloseDialog() {
    if (!await progressionLeave()) return false;
    if (progression.dirty && progression.record) {
        progression.dirty = false;
        const saved = progression.records.find((record) => record.schoolYear === progression.record.schoolYear && record.term === progression.record.term);
        const student = progression.students.find((item) => item.email === progression.record.studentEmail);
        if (saved || student) progressionRender(saved || progressionNewRecord(student));
    }
    pp("dialog").close();
    return true;
}
async function progressionApi(path, options = {}) {
    const response = await fetch(`/api/teacher/progression/${path}`, {
        ...options, headers: withHubAuthHeaders({ "Content-Type": "application/json" }), cache: "no-store"
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
}
function progressionDiscard() {
    return !progression.dirty || window.confirm("Discard unsaved student result changes?");
}
// Saves any pending changes first; only asks to discard if the auto-save failed.
async function progressionLeave() {
    if (await progressionFlush()) return true;
    return progressionDiscard();
}
function progressionSavedText(message, error = false) {
    pp("saved").textContent = message;
    pp("saved").classList.toggle("is-error", error);
    pp("save").hidden = !error;
}
function progressionQueueSave(delay = 1200) {
    if (!progression.record) return;
    progression.dirty = true;
    progression.changeSeq += 1;
    clearTimeout(progression.autosaveTimer);
    progressionSavedText("Unsaved changes - saving automatically...");
    progression.autosaveTimer = setTimeout(() => { void progressionSave(); }, delay);
}
async function progressionSave() {
    clearTimeout(progression.autosaveTimer);
    progression.autosaveTimer = null;
    if (!progression.record || !progression.dirty) return true;
    if (progression.saving) { progression.saveAgain = true; return false; }
    const target = progression.record;
    const seq = progression.changeSeq;
    const record = { ...target, schoolYear: Number(pp("year").value), term: Number(pp("term").value),
        yearLevel: Number(pp("level").value), formClass: pp("class").value, homeroom: pp("homeroom").value,
        timetableClass: pp("timetable-class").value, learningNarrative: pp("narrative").value, nextLearning: pp("next").value };
    progression.saving = true;
    // Year and term identify the saved record, so they cannot change once saving starts.
    pp("year").disabled = true; pp("term").disabled = true;
    const teacherEmail = hubAuthState.profile?.email;
    progressionSavedText("Saving...");
    let saved = false;
    try {
        const data = await progressionApi("records", { method: "PUT", body: JSON.stringify(record) });
        if (!hasAllowedSignedInHubAccount() || hubAuthState.profile?.email !== teacherEmail) return false;
        if (!data.record || !data.record.revision) throw new Error("Save response is invalid. Reload to confirm saved results.");
        progression.records = [data.record, ...progression.records.filter((old) => old.schoolYear !== record.schoolYear || old.term !== record.term)]
            .sort((a, b) => b.schoolYear - a.schoolYear || b.term - a.term);
        const latest = progression.records[0];
        const savedStudent = progression.students.find((student) => student.email === data.record.studentEmail);
        if (savedStudent && latest) {
            savedStudent.progress = { schoolYear: latest.schoolYear, term: latest.term,
                pathways: latest.pathways.map(({ id, coverage, descriptor }) => ({ id, coverage, descriptor })) };
            progressionStudentOptions();
        }
        saved = true;
        if (progression.record !== target) return true;
        Object.assign(target, { schoolYear: record.schoolYear, term: record.term, revision: data.record.revision,
            updatedAt: data.record.updatedAt, updatedBy: data.record.updatedBy });
        if (progression.changeSeq === seq) progression.dirty = false;
        progressionSavedText(`All changes saved automatically - ${new Date(data.record.updatedAt).toLocaleString()} by ${data.record.updatedBy}`);
        progressionStatus("Student results saved automatically.");
        progressionDialogSummary();
        return !progression.dirty;
    } catch (error) {
        if (!hasAllowedSignedInHubAccount() || hubAuthState.profile?.email !== teacherEmail) return false;
        console.error("Could not save progression term results", error);
        if (progression.record === target && !target.revision) { pp("year").disabled = false; pp("term").disabled = false; }
        progressionSavedText(`Changes not saved: ${error.message}`, true);
        progressionStatus(error.message, true); pp("retry").hidden = false;
        progression.saveAgain = false;
        return false;
    } finally {
        progression.saving = false;
        if (!hasAllowedSignedInHubAccount() || hubAuthState.profile?.email !== teacherEmail) { if (hasAllowedSignedInHubAccount()) void progressionInit(); }
        else if (saved && progression.saveAgain && progression.dirty && progression.record === target) {
            progression.saveAgain = false;
            progression.autosaveTimer = setTimeout(() => { void progressionSave(); }, 200);
        }
    }
}
async function progressionFlush() {
    for (let attempt = 0; attempt < 5 && progression.record && (progression.dirty || progression.saving); attempt += 1) {
        while (progression.saving) await new Promise((resolve) => setTimeout(resolve, 100));
        if (progression.dirty && !await progressionSave() && !progression.saving && progression.dirty
            && pp("saved").classList.contains("is-error")) return false;
    }
    return !progression.dirty;
}
function progressionMatchingStudents(students, homeroom, year, search) {
    const normalise = (value) => String(value || "").trim().toUpperCase();
    // Staff only appear under Year level = Staff, where timetable class does not apply.
    if (year === "staff") return students.filter((student) => student.isStaff
        && `${student.name} ${student.email}`.toLowerCase().includes(search.trim().toLowerCase()));
    return students.filter((student) => !student.isStaff && (!homeroom || (student.timetableClass === undefined
        ? [student.homeroom, student.formClass] : [student.timetableClass]).some((value) => normalise(value) === normalise(homeroom)))
        && (!year || Number(student.yearLevel) === Number(year))
        && `${student.name} ${student.email} ${student.timetableClass || ""} ${student.homeroom || ""} ${student.formClass || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
}
function progressionHomeroomOptions() {
    const selected = pp("homeroom-filter").value;
    const homerooms = new Set(["JVE", "JPI", "JMM", "JSR", "JSD", "7S", "8S"]);
    progression.students.forEach((student) => {
        for (const value of student.timetableClass === undefined ? [student.homeroom, student.formClass] : [student.timetableClass]) {
            const homeroom = String(value || "").trim().toUpperCase();
            if (homeroom) homerooms.add(homeroom);
        }
    });
    pp("homeroom-filter").replaceChildren(new Option("All timetable classes", ""));
    [...homerooms].sort().forEach((homeroom) => pp("homeroom-filter").append(new Option(homeroom, homeroom)));
    pp("homeroom-filter").value = selected;
}
function progressionStudentOptions() {
    const selected = pp("student").value;
    const matching = progressionMatchingStudents(progression.students, pp("homeroom-filter").value,
        pp("year-filter").value, pp("search").value);
    pp("student").replaceChildren(new Option("Select a student", ""));
    pp("roster").replaceChildren();
    for (const student of matching) {
        const label = student.isStaff ? `${student.name} - Staff` : `${student.name} - Year ${student.yearLevel} - ${student.timetableClass === undefined ? student.formClass || student.homeroom : student.timetableClass || "No timetable class"}${student.archived ? " (saved history)" : ""}`;
        if (student.email) pp("student").append(new Option(label, student.email));
        const row = document.createElement("li");
        const header = document.createElement("div");
        header.className = "progression-roster-header";
        const name = document.createElement("span");
        name.textContent = label;
        header.append(name);
        row.append(header);
        if (student.email) {
            const button = document.createElement("button");
            button.type = "button"; button.className = "button button-secondary"; button.textContent = "Open Details";
            button.setAttribute("aria-label", `Open details for ${student.name}`);
            button.addEventListener("click", () => {
                if (!progressionDiscard()) return;
                pp("student").value = student.email;
                void progressionLoadStudent(student.email);
            });
            header.append(button);
        } else {
            const warning = document.createElement("span");
            warning.className = "is-error"; warning.textContent = "School email not linked";
            header.append(warning);
        }
        row.append(progressionSummary(student));
        pp("roster").append(row);
    }
    pp("student").value = matching.some((student) => student.email === selected) ? selected : "";
    const people = pp("year-filter").value === "staff" ? ["staff member", "staff members", "staff"] : ["student", "students", "students"];
    pp("filter-count").textContent = `${matching.length} matching ${people[matching.length === 1 ? 0 : 1]}${matching.length ? " - class list below." : ` - no ${people[2]} match these filters.`}`;
    pp("email-warning").hidden = !matching.some((student) => !student.email);
    pp("email-warning").textContent = "Students without a linked school email are listed, but their email must be added to the student directory before results can be saved.";
    if (selected && !pp("student").value) void progressionLoadStudent("");
}
function progressionNewRecord(student) {
    const month = new Date().getMonth();
    return { studentEmail: student.email, schoolYear: new Date().getFullYear(), term: Math.min(4, Math.floor(month / 3) + 1),
        yearLevel: student.isStaff ? 7 : student.yearLevel, formClass: student.formClass, homeroom: student.homeroom || student.formClass,
        timetableClass: student.timetableClass || "", revision: 0, strengths: "", learningNarrative: "", nextLearning: "",
        pathways: progressionPathways.map(([id]) => ({ id, coverage: "not-taught", descriptor: null, discipline: "dtech", addressed: "", evidence: "", notes: "" })) };
}
function progressionDialogSummary() {
    const record = progression.record;
    const saved = record && (record.revision > 0 || progression.dirty);
    const progress = saved ? { schoolYear: record.schoolYear, term: record.term,
        strandProgress: (record.strandProgress || []).map(({ strand, kind, descriptor }) => ({ strand, kind, descriptor })) } : null;
    const summary = progressionSummary({ progress });
    const caption = summary.querySelector(".progression-summary-caption");
    caption.textContent = progression.dirty ? "Progression summary - saving changes automatically..."
        : progress ? `Progression summary - ${progress.schoolYear} Term ${progress.term}` : "Progression summary - no results saved yet";
    pp("dialog-summary").replaceChildren(summary);
}
function progressionRender(record) {
    progression.record = JSON.parse(JSON.stringify(record));
    progression.dirty = false;
    pp("editor").hidden = false;
    pp("editor").disabled = false;
    for (const [control, key] of [["year", "schoolYear"], ["term", "term"], ["level", "yearLevel"], ["class", "formClass"], ["next", "nextLearning"]]) {
        pp(control).value = record[key];
    }
    clearTimeout(progression.autosaveTimer);
    progression.autosaveTimer = null;
    pp("narrative").value = record.learningNarrative || "";
    pp("homeroom").value = record.homeroom || record.formClass;
    pp("timetable-class").value = record.timetableClass || "";
    pp("year").disabled = record.revision > 0;
    pp("term").disabled = record.revision > 0;
    progressionSavedText(record.updatedAt ? `All changes saved - ${new Date(record.updatedAt).toLocaleString()} by ${record.updatedBy}` : "Not saved yet - changes save automatically.");
    const autoSet = progressionAutoSet();
    pp("rows").replaceChildren();
    for (const [id, title] of progressionPathways) {
        const result = progression.record.pathways.find((row) => row.id === id);
        const row = document.createElement("tr");
        const name = document.createElement("th");
        name.scope = "row";
        const statement = document.createElement("p");
        statement.className = "progression-statement"; statement.dataset.statement = id;
        statement.textContent = progressionStatement(id, record.yearLevel);
        name.append(title, statement); row.append(name);
        const coverage = document.createElement("span");
        coverage.dataset.pathwayCoverage = id;
        coverage.title = "Calculated from the linked curriculum statements below";
        const cell = document.createElement("td"); cell.append(coverage); row.append(cell);
        pp("rows").append(row);
    }
    progressionRenderCurriculum();
    progressionDialogSummary();
    progressionCommentReset();
    if (progressionRefreshPathways() || autoSet.length) { progressionQueueSave(); progressionDialogSummary(); }
}
function progressionAnnualRecord(records, student, schoolYear) {
    return records.find((record) => record.schoolYear === schoolYear) || (student.archived ? records[0] : null);
}
async function progressionLoadStudent(email) {
    const request = ++progression.loading;
    progression.record = null;
    progression.records = [];
    progression.completed = [];
    progression.dirty = false;
    progressionHideEditor();
    if (!email) { progressionStatus("Find and select a Year 7-10 student."); return; }
    progressionStatus("Loading student results...");
    pp("retry").hidden = true;
    try {
        const data = await progressionApi(`records?studentEmail=${encodeURIComponent(email)}`);
        if (request !== progression.loading) return;
        if (!Array.isArray(data.records)) throw new Error("Saved term response is invalid.");
        progression.records = data.records;
        progression.completed = Array.isArray(data.completedActivities) ? data.completedActivities : [];
        const student = progression.students.find((student) => student.email === email);
        const record = progressionAnnualRecord(data.records, student, new Date().getFullYear());
        progressionRender(record || progressionNewRecord(student));
        progressionOpenDialog(student);
        progressionStatus("Record coverage and progress for each pathway. Changes save automatically.");
    } catch (error) {
        if (request !== progression.loading) return;
        console.error("Could not load progression term results", error);
        progressionStatus(error.message, true);
        pp("retry").hidden = false;
    }
}
async function progressionInit() {
    const request = ++progression.loading;
    const email = hubAuthState.profile?.email || "";
    if (progression.teacherEmail !== email) {
        progression.teacherEmail = email;
        progression.record = null; progression.records = []; progression.students = []; progression.dirty = false;
        progressionHideEditor();
        pp("student").replaceChildren(new Option("Select a student", ""));
        pp("roster").replaceChildren();
        pp("email-warning").hidden = true;
    }
    pp("controls").disabled = true;
    pp("editor").disabled = true;
    if (!hasAllowedSignedInHubAccount()) {
        progression.record = null; progression.dirty = false;
        pp("filter-count").textContent = "";
        pp("retry").hidden = true;
        progressionHideEditor(); pp("student").replaceChildren(new Option("Select a student", ""));
        pp("roster").replaceChildren();
        pp("email-warning").hidden = true;
        progressionStatus("Sign in with a Teacher/Admin account to access student results.");
        return;
    }
    if (progression.saving) return;
    if (!hubAccessState.resolved) { progressionStatus("Checking Teacher View access..."); return; }
    if (!hubAccessState.canTeacherView && !hubAccessState.canAdmin) {
        progressionHideEditor();
        pp("roster").replaceChildren();
        pp("student").replaceChildren(new Option("Select a student", ""));
        pp("filter-count").textContent = "";
        pp("email-warning").hidden = true;
        pp("retry").hidden = true;
        progressionStatus("Teacher/Admin access is required. Student results are not available in Student View.", true);
        return;
    }
    if (progression.dirty && progression.record) {
        pp("controls").disabled = false; pp("editor").disabled = false; return;
    }
    progressionStatus("Loading student directory...");
    try {
        const [data, mapping] = await Promise.all([progressionApi("students"), progressionApi("mapping").catch((error) => {
            console.warn("Using the default curriculum mapping", error);
            return null;
        }), progressionApi("comment-bank").then((bank) => { progression.commentBank = bank?.bank || null; }).catch((error) => {
            console.warn("Using the starter comment bank", error);
        })]);
        if (request !== progression.loading) return;
        if (!Array.isArray(data.students)) throw new Error("Student directory response is invalid.");
        progression.mapping = mapping?.mapping || null;
        progression.students = data.students.sort((a, b) => a.name.localeCompare(b.name));
        progressionHomeroomOptions();
        progressionStudentOptions();
        pp("controls").disabled = false;
        pp("retry").hidden = true;
        if (pp("student").value) await progressionLoadStudent(pp("student").value);
        else progressionStatus("Find and select a Year 7-10 student.");
    } catch (error) {
        if (request !== progression.loading) return;
        console.error("Could not initialise progression page", error);
        progressionStatus(error.message, true); pp("retry").hidden = false;
    }
}
// Narrative builder: the teacher picks bank comments; the composed text is copied into the narrative and saved
// as plain text, so later Comment Bank edits never change saved reports.
function progressionCommentBank() {
    if (!window.commentBank) return null;
    return progression.commentBank ||= window.commentBank.defaultBank();
}
function progressionCommentFill(select, options, value) {
    select.replaceChildren(...options.map(([id, text]) => new Option(text, id)));
    select.value = options.some(([id]) => id === value) ? value : options[0]?.[0] || "";
}
function progressionCommentReset() {
    const cb = window.commentBank;
    if (!cb) { pp("comment-builder").hidden = true; return; }
    const student = progression.students.find((item) => item.email === progression.record?.studentEmail);
    progression.commentPicks = {};
    pp("cb-name").value = cb.firstName(student?.name || "");
    progressionCommentRender();
}
function progressionCommentOptions() {
    return { name: pp("cb-name").value, pronoun: pp("cb-pronoun").value };
}
function progressionCommentRender() {
    const cb = window.commentBank;
    const bank = progressionCommentBank();
    if (!cb || !bank) return;
    const active = bank.comments.filter((comment) => comment.active !== false);
    progressionCommentFill(pp("cb-pronoun"), cb.pronouns, pp("cb-pronoun").value || "name");
    const disciplines = cb.disciplines.filter(([id]) => active.some((comment) => comment.discipline === id));
    progressionCommentFill(pp("cb-discipline"), disciplines.length ? disciplines : cb.disciplines.slice(0, 1), pp("cb-discipline").value || "dtech");
    const discipline = pp("cb-discipline").value;
    const options = progressionCommentOptions();
    pp("cb-rows").replaceChildren();
    for (const [category, title, hint] of cb.categories) {
        const pick = progression.commentPicks[category] ||= { subcategory: "", level: "", id: "" };
        const comments = active.filter((comment) => comment.discipline === discipline && comment.category === category);
        const row = document.createElement("div");
        row.className = `progression-cb-row cb-${category}`;
        const heading = document.createElement("p");
        heading.className = "progression-cb-title";
        const strong = document.createElement("strong");
        strong.textContent = title;
        const note = document.createElement("span");
        note.textContent = hint || "";
        heading.append(strong, note);
        const control = (text, select) => {
            const label = document.createElement("label");
            label.append(text, select);
            return label;
        };
        const subSelect = document.createElement("select");
        const subs = (bank.subcategories[category] || []).filter((name) => comments.some((comment) => comment.subcategory === name));
        progressionCommentFill(subSelect, [["", "All subcategories"], ...subs.map((name) => [name, name])], pick.subcategory);
        const levelSelect = document.createElement("select");
        const levels = cb.levels.filter(([id]) => id !== "any" && comments.some((comment) => comment.level === id));
        progressionCommentFill(levelSelect, [["", "All levels"], ...levels], pick.level);
        const commentSelect = document.createElement("select");
        commentSelect.className = "progression-cb-comment";
        commentSelect.setAttribute("aria-label", `${title} comment`);
        commentSelect.append(new Option("None selected (skip)", ""));
        const shown = cb.sortComments(bank, comments.filter((comment) => (!subSelect.value || comment.subcategory === subSelect.value)
            && (!levelSelect.value || comment.level === levelSelect.value || comment.level === "any")));
        let group = null, groupKey = "";
        for (const comment of shown) {
            const key = `${comment.subcategory}|${comment.level}`;
            if (key !== groupKey) {
                group = document.createElement("optgroup");
                group.label = comment.level === "any" ? comment.subcategory : `${comment.subcategory} · ${cb.label(cb.levels, comment.level)}`;
                commentSelect.append(group);
                groupKey = key;
            }
            group.append(new Option(cb.compose([comment.text], { ...options, pronoun: "name" }), comment.id));
        }
        commentSelect.value = shown.some((comment) => comment.id === pick.id) ? pick.id : "";
        pick.id = commentSelect.value;
        subSelect.addEventListener("change", () => { pick.subcategory = subSelect.value; progressionCommentRender(); });
        levelSelect.addEventListener("change", () => { pick.level = levelSelect.value; progressionCommentRender(); });
        commentSelect.addEventListener("change", () => { pick.id = commentSelect.value; progressionCommentPreview(); });
        const controls = document.createElement("div");
        controls.className = "progression-cb-controls";
        controls.append(control("Subcategory", subSelect));
        if (levels.length) controls.append(control("Level", levelSelect));
        controls.append(control("Comment", commentSelect));
        row.append(heading, controls);
        pp("cb-rows").append(row);
    }
    progressionCommentPreview();
}
function progressionCommentText(next = false) {
    const cb = window.commentBank;
    const bank = progressionCommentBank();
    if (!cb || !bank) return "";
    const texts = cb.categories.filter(([category]) => (category === "next") === next)
        .map(([category]) => bank.comments.find((comment) => comment.id === progression.commentPicks[category]?.id)?.text);
    return cb.compose(texts.filter(Boolean), progressionCommentOptions());
}
function progressionCommentPreview() {
    const text = progressionCommentText();
    const next = progressionCommentText(true);
    pp("cb-preview").textContent = text || "Select Learning Context, Strengths or Behaviours comments to build the narrative.";
    pp("cb-preview").classList.toggle("is-empty", !text);
    pp("cb-next-preview").textContent = next || "Select a Next Learning Steps comment.";
    pp("cb-next-preview").classList.toggle("is-empty", !next);
    pp("cb-use").disabled = !text && !next;
    pp("cb-append").disabled = !text && !next;
}
function progressionCommentApply(append) {
    if (!progression.record) return;
    const parts = [["narrative", progressionCommentText()], ["next", progressionCommentText(true)]].filter(([, text]) => text);
    if (!parts.length) return;
    const replacing = parts.filter(([field, text]) => { const current = pp(field).value.trim(); return current && current !== text; });
    if (!append && replacing.length) {
        const names = replacing.map(([field]) => field === "next" ? "Next learning steps" : "Learning narrative").join(" and ");
        if (!window.confirm(`Replace the current ${names} with the built text?`)) return;
    }
    for (const [field, text] of parts) {
        const current = pp(field).value.trim();
        pp(field).value = append && current ? `${current} ${text}` : text;
        pp(field).dispatchEvent(new Event("input", { bubbles: true }));
    }
    pp(parts[0][0]).focus();
}
const progressionFilters = { search: "", "homeroom-filter": "", "year-filter": "" };
async function progressionFilterChanged(name) {
    const matching = progressionMatchingStudents(progression.students, pp("homeroom-filter").value, pp("year-filter").value, pp("search").value);
    if (progression.record && !matching.some((student) => student.email === progression.record.studentEmail) && !await progressionLeave()) {
        pp(name).value = progressionFilters[name];
        return;
    }
    progressionFilters[name] = pp(name).value;
    progressionStudentOptions();
}
for (const [name, event] of [["search", "input"], ["homeroom-filter", "change"], ["year-filter", "change"]]) {
    pp(name).addEventListener(event, () => progressionFilterChanged(name));
}
pp("student").addEventListener("change", async () => {
    const email = pp("student").value;
    if (!await progressionLeave()) { pp("student").value = progression.record?.studentEmail || ""; return; }
    pp("student").value = email;
    void progressionLoadStudent(pp("student").value);
});
pp("form").addEventListener("input", (event) => {
    if (event.target.closest?.("[data-comment-builder]")) return;
    if (progression.record) progressionQueueSave();
});
pp("cb-name").addEventListener("input", progressionCommentRender);
pp("cb-name").addEventListener("keydown", (event) => { if (event.key === "Enter") event.preventDefault(); });
pp("cb-pronoun").addEventListener("change", progressionCommentPreview);
pp("cb-discipline").addEventListener("change", progressionCommentRender);
pp("cb-use").addEventListener("click", () => progressionCommentApply(false));
pp("cb-append").addEventListener("click", () => progressionCommentApply(true));
pp("cb-clear").addEventListener("click", () => { progression.commentPicks = {}; progressionCommentRender(); });
pp("level").addEventListener("change", progressionUpdateStatements);
pp("form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!progression.record) return;
    progression.dirty = true;
    void progressionSave();
});
pp("dialog-close").addEventListener("click", () => { progressionCloseDialog(); });
document.querySelectorAll("[data-hint-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
        const hint = document.getElementById(button.getAttribute("data-hint-toggle"));
        if (!hint) return;
        const expanded = button.getAttribute("aria-expanded") !== "true";
        button.setAttribute("aria-expanded", String(expanded));
        hint.hidden = !expanded;
    });
});
pp("dialog").addEventListener("cancel", (event) => { event.preventDefault(); progressionCloseDialog(); });
pp("retry").addEventListener("click", () => {
    if (!progressionDiscard()) return;
    progression.dirty = false;
    if (pp("student").value && progression.students.length) void progressionLoadStudent(pp("student").value);
    else void progressionInit();
});
window.addEventListener("beforeunload", (event) => {
    if (progression.dirty || progression.saving) { void progressionSave(); event.preventDefault(); event.returnValue = ""; }
});
window.addEventListener("hub-auth-state-changed", () => { void progressionInit(); });
document.addEventListener("DOMContentLoaded", () => { void progressionInit(); });
