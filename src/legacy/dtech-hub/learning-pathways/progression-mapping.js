"use strict";
// Curriculum mapping shared by the browser, the admin mapping page and the server.
// Year 7 links and activity links are seeded from JuniorDTECH_Year7_Pathway_Curriculum_Mapping_VSC.xlsx;
// Years 8-10 are seeded from the pathway tags in progression-curriculum.js until an admin verifies them.
(function (root, factory) {
    const isNode = typeof module === "object" && module.exports;
    const api = factory(isNode ? require("./progression-curriculum") : root.progressionCurriculum);
    if (isNode) module.exports = api;
    else root.progressionMapping = api;
})(this, function (curriculum) {
    const pathwayIds = ["digital-systems", "data", "digital-citizenship", "programming-and-algorithms", "systems-and-control"];
    const roles = [["primary", "Primary"], ["supporting", "Supporting"], ["context", "Context dependent"]];
    const autoSetOptions = [["yes", "Yes - sets Some Evidence"], ["review", "Review - teacher approval needed"], ["no", "No - never auto-set"]];
    const years = [7, 8, 9, 10];
    const allStatements = Object.values(curriculum?.statements || {}).flat();
    const statementById = new Map(allStatements.map((statement) => [statement.id, statement]));

    const workbookYear7 = {
        "dt-7-k-1": [["programming-and-algorithms", "primary"]],
        "dt-7-k-2": [["programming-and-algorithms", "primary"]],
        "dt-7-k-3": [["digital-systems", "primary"], ["data", "supporting"]],
        "dt-7-k-4": [["data", "primary"], ["digital-citizenship", "supporting"]],
        "dt-7-k-5": [["data", "primary"], ["digital-citizenship", "supporting"]],
        "dt-7-p-1": [["digital-systems", "context"], ["data", "context"], ["digital-citizenship", "context"], ["programming-and-algorithms", "context"]],
        "dt-7-p-2": [["programming-and-algorithms", "primary"]],
        "dt-7-p-3": [["programming-and-algorithms", "primary"]],
        "dt-7-p-4": [["digital-systems", "primary"], ["data", "supporting"]],
        "dt-7-p-5": [["data", "primary"], ["digital-citizenship", "supporting"]],
        "dt-7-p-6": [["data", "primary"], ["digital-citizenship", "supporting"]]
    };
    const workbookActivities = [
        { activity: "activity-encoding-binary", statement: "dt-7-k-3", autoSet: "yes",
            note: "Partial connection only: binary representation supports data understanding." },
        { activity: "activity-encoding-binary", statement: "dt-7-p-4", autoSet: "review",
            note: "Only if the student examines inputs, processes, outputs and data together; encoding alone is insufficient." }
    ];

    // dt-7-k-3 -> DT-K03 (the workbook's Statement ID format).
    function statementCode(id) {
        const [strand, , kind, number] = String(id).split("-");
        return `${String(strand).toUpperCase()}-${String(kind).toUpperCase()}${String(number).padStart(2, "0")}`;
    }
    function statementsForYear(year) {
        return curriculum?.statements?.[String(Number(year))] || [];
    }
    function defaultMapping() {
        const links = {};
        for (const statement of allStatements) {
            links[statement.id] = (workbookYear7[statement.id] || statement.pathways.map((pathway) => [pathway, "primary"]))
                .map(([pathway, role]) => ({ pathway, role }));
        }
        return { links, activities: workbookActivities.map((link) => ({ ...link })), verifiedYears: [7] };
    }
    function validateMapping(input, activityIds) {
        if (!input || typeof input !== "object") throw new Error("A curriculum mapping is required.");
        const known = new Set(activityIds || []);
        const roleIds = roles.map(([id]) => id);
        if (!input.links || typeof input.links !== "object" || Array.isArray(input.links)) throw new Error("Pathway links are required.");
        const links = {};
        for (const [id, rows] of Object.entries(input.links)) {
            if (!statementById.has(id)) throw new Error(`Unknown curriculum statement ${id}.`);
            if (!Array.isArray(rows) || rows.length > pathwayIds.length) throw new Error(`Invalid pathway links for ${statementCode(id)}.`);
            const seen = new Set();
            links[id] = rows.map((row) => {
                if (!pathwayIds.includes(row?.pathway) || seen.has(row.pathway)) throw new Error(`Pathway links for ${statementCode(id)} must be unique and recognised.`);
                if (!roleIds.includes(row.role)) throw new Error(`Invalid link role for ${statementCode(id)}.`);
                seen.add(row.pathway);
                return { pathway: row.pathway, role: row.role };
            });
        }
        for (const statement of allStatements) links[statement.id] ||= [];
        if (!Array.isArray(input.activities) || input.activities.length > 500) throw new Error("Invalid activity links.");
        const pairs = new Set();
        const activities = input.activities.map((row) => {
            if (!known.has(row?.activity)) throw new Error("Activity links must use a tracked activity.");
            if (!statementById.has(row.statement)) throw new Error("Activity links must use a recognised curriculum statement.");
            const key = `${row.activity}\n${row.statement}`;
            if (pairs.has(key)) throw new Error(`${statementCode(row.statement)} is linked to the same activity twice.`);
            pairs.add(key);
            if (!autoSetOptions.some(([id]) => id === row.autoSet)) throw new Error("Invalid auto-set choice.");
            const note = row.note === undefined ? "" : row.note;
            if (typeof note !== "string" || note.length > 500) throw new Error("Activity link notes must be 500 characters or fewer.");
            return { activity: row.activity, statement: row.statement, autoSet: row.autoSet, note: note.trim() };
        });
        const verifiedYears = input.verifiedYears === undefined ? [] : input.verifiedYears;
        if (!Array.isArray(verifiedYears) || verifiedYears.some((year) => !years.includes(year))) throw new Error("Invalid verified years.");
        return { links, activities, verifiedYears: years.filter((year) => verifiedYears.includes(year)) };
    }
    function linksFor(mapping, statementId) {
        return mapping?.links?.[statementId] || [];
    }
    // Workbook rule: No Evidence if no linked statement is covered; Full Evidence only when every applicable
    // (Primary or Supporting) statement has Full Evidence. Context-dependent links count only once covered.
    function derivePathwayCoverage(mapping, year, pathwayId, coverageOf) {
        const linked = statementsForYear(year).map((statement) => ({ statement,
            link: linksFor(mapping, statement.id).find((row) => row.pathway === pathwayId) })).filter((item) => item.link);
        const values = linked.map(({ statement, link }) => ({ role: link.role, coverage: coverageOf(statement.id) || "not-taught" }));
        if (!values.some((item) => item.coverage !== "not-taught")) return "not-taught";
        const applicable = values.filter((item) => item.role !== "context" || item.coverage !== "not-taught");
        return applicable.every((item) => item.coverage === "taught") ? "taught" : "partly-taught";
    }
    // Statement Set Progress: 3 Consolidating when every statement has Full Evidence, 2 Developing when at
    // least 3 have Some or Full Evidence, 1 Emerging when any do. Teacher-chosen 4 Proficient / 5 Exceeding
    // are kept only while the set is Consolidating; otherwise the automatic level applies.
    function deriveSetProgress(coverages, current) {
        const values = (coverages || []).map((value) => value || "not-taught");
        const evidenced = values.filter((value) => value !== "not-taught").length;
        const auto = values.length && values.every((value) => value === "taught") ? "consolidating"
            : evidenced >= 3 ? "developing" : evidenced > 0 ? "emerging" : null;
        return auto === "consolidating" && (current === "proficient" || current === "exceeding") ? current : auto;
    }
    // Approved links for completed tracked activities set untouched statements to Some Evidence.
    // Never downgrades and never re-applies once a statement has been auto-set (the teacher may override it).
    function autoApply(mapping, year, rows, completedActivityIds) {
        const completed = new Set(completedActivityIds || []);
        const inYear = new Set(statementsForYear(year).map((statement) => statement.id));
        const changed = [];
        for (const link of mapping?.activities || []) {
            if (link.autoSet !== "yes" || !completed.has(link.activity) || !inYear.has(link.statement)) continue;
            let row = rows.find((item) => item.id === link.statement);
            if (row && (row.autoFrom || row.coverage !== "not-taught")) continue;
            if (!row) { row = { id: link.statement, coverage: "not-taught", discipline: "dtech", descriptor: null }; rows.push(row); }
            row.coverage = "partly-taught";
            row.autoFrom = link.activity;
            changed.push(link.statement);
        }
        return changed;
    }
    return { pathwayIds, roles, autoSetOptions, years, statementCode, statementsForYear, defaultMapping, validateMapping,
        linksFor, derivePathwayCoverage, deriveSetProgress, autoApply };
});
