"use strict";

const progressionCurriculum = require("./progression-curriculum");
const progressionMapping = require("./progression-mapping");
const { trackedActivities } = require("./activity-progress-store");

const pathwayIds = ["digital-systems", "data", "digital-citizenship", "programming-and-algorithms", "systems-and-control"];
const coverageValues = ["not-taught", "partly-taught", "taught"];
const descriptorValues = ["emerging", "developing", "consolidating", "proficient", "exceeding"];
const disciplineValues = ["dtech", "textiles", "food", "wood", "dvc"];
const statementIds = new Set(Object.values(progressionCurriculum.statements).flat().map((statement) => statement.id));

function validateStatements(rows) {
    if (!Array.isArray(rows) || rows.length > statementIds.size) throw new Error("Invalid curriculum statements.");
    const seen = new Set();
    return rows.map((row) => {
        if (!row || !statementIds.has(row.id) || seen.has(row.id)) throw new Error("Curriculum statement IDs must be unique and recognised.");
        seen.add(row.id);
        if (!coverageValues.includes(row.coverage)) throw new Error("Invalid curriculum statement coverage.");
        const discipline = row.discipline === undefined ? "dtech" : row.discipline;
        if (!disciplineValues.includes(discipline)) throw new Error("Invalid discipline.");
        const descriptor = row.descriptor === undefined ? null : row.descriptor;
        if (descriptor !== null && !descriptorValues.includes(descriptor)) throw new Error("Invalid curriculum statement progress.");
        if (row.coverage === "not-taught" && descriptor !== null) throw new Error("Not taught curriculum statements must be Not determined.");
        if (row.autoFrom !== undefined && !Object.hasOwn(trackedActivities, row.autoFrom)) throw new Error("Invalid curriculum statement activity source.");
        return { id: row.id, coverage: row.coverage, discipline, descriptor, ...(row.autoFrom === undefined ? {} : { autoFrom: row.autoFrom }) };
    });
}

const strandKeys = ["digital-technology", "systems-and-control"].flatMap((strand) => ["knowledge", "practices"].map((kind) => `${strand}:${kind}`));
function validateStrandProgress(rows) {
    if (!Array.isArray(rows) || rows.length > strandKeys.length) throw new Error("Invalid strand progress.");
    const seen = new Set();
    return rows.map((row) => {
        const key = `${row?.strand}:${row?.kind}`;
        if (!strandKeys.includes(key) || seen.has(key)) throw new Error("Strand progress must be unique Knowledge or Practices entries.");
        seen.add(key);
        const descriptor = row.descriptor === undefined ? null : row.descriptor;
        if (descriptor !== null && !descriptorValues.includes(descriptor)) throw new Error("Invalid strand progress descriptor.");
        return { strand: row.strand, kind: row.kind, descriptor };
    });
}

function validateRecord(body) {
    if (!body || typeof body !== "object") throw new Error("A rotation record is required.");
    const studentEmail = String(body.studentEmail || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentEmail)) throw new Error("Select a student.");
    for (const [key, min, max] of [["schoolYear", 2000, 2100], ["term", 1, 4], ["yearLevel", 7, 10], ["revision", 0, Number.MAX_SAFE_INTEGER]]) {
        if (!Number.isSafeInteger(body[key]) || body[key] < min || body[key] > max) throw new Error(`Invalid ${key}.`);
    }
    const text = (value, name, limit = 5000) => {
        if (typeof value !== "string" || value.length > limit) throw new Error(`Invalid ${name} (maximum ${limit} characters).`);
        return value.trim();
    };
    if (!Array.isArray(body.pathways) || body.pathways.length !== pathwayIds.length) throw new Error("All five pathway results are required.");
    const pathways = pathwayIds.map((id) => {
        const matches = body.pathways.filter((row) => row?.id === id);
        if (matches.length !== 1) throw new Error("Pathway IDs must be unique and recognised.");
        const row = matches[0];
        if (!coverageValues.includes(row.coverage)) throw new Error("Invalid curriculum coverage.");
        if (row.descriptor !== null && !descriptorValues.includes(row.descriptor)) throw new Error("Invalid progress descriptor.");
        if (row.coverage === "not-taught" && row.descriptor !== null) throw new Error("Not taught pathways must be Not determined.");
        const discipline = row.discipline === undefined ? "dtech" : row.discipline;
        if (!disciplineValues.includes(discipline)) throw new Error("Invalid discipline.");
        return { id, coverage: row.coverage, descriptor: row.descriptor, discipline,
            addressed: text(row.addressed, "knowledge and practices"),
            evidence: text(row.evidence, "evidence"), notes: text(row.notes, "teacher notes") };
    });
    return { studentEmail, schoolYear: body.schoolYear, term: body.term, yearLevel: body.yearLevel,
        revision: body.revision, formClass: text(body.formClass, "class", 100), pathways,
        ...(body.statements === undefined ? {} : { statements: validateStatements(body.statements) }),
        ...(body.strandProgress === undefined ? {} : { strandProgress: validateStrandProgress(body.strandProgress) }),
        ...(body.timetableClass === undefined ? {} : { timetableClass: text(body.timetableClass, "timetable class", 100) }),
        homeroom: body.homeroom === undefined ? text(body.formClass, "class", 100) : text(body.homeroom, "homeroom", 100),
        ...(body.learningNarrative === undefined ? {} : { learningNarrative: text(body.learningNarrative, "learning narrative") }),
        strengths: text(body.strengths, "strengths"), nextLearning: text(body.nextLearning, "next learning steps") };
}

function registerProgressionPathway(app, { pool, hasDatabase, requireTeacherAccess, requireAdminAccess, getStudents, getStaff }) {
    // Staff appear (Year level filter = Staff) so teachers can check their own test records.
    async function staffMembers(students) {
        if (typeof getStaff !== "function") return [];
        const known = new Set(students.map((student) => student.email).filter(Boolean));
        try {
            return (await getStaff()).map((member) => ({ email: String(member.email || "").trim().toLowerCase(),
                name: String(member.name || member.email || ""), yearLevel: "", formClass: "", homeroom: "", timetableClass: "", isStaff: true }))
                .filter((member) => member.email && !known.has(member.email) && known.add(member.email));
        } catch (error) {
            console.error("Could not load staff for progression", error);
            return [];
        }
    }
    async function currentPeople() {
        const students = await getStudents();
        return [...students, ...await staffMembers(students)];
    }
    const available = (_req, res, next) => {
        if (!hasDatabase) return res.status(503).json({ error: "Progression results require the database. No results have been saved." });
        next();
    };
    async function schema() {
        await pool.query(`CREATE TABLE IF NOT EXISTS progression_pathway_results (
            student_email TEXT NOT NULL, school_year INTEGER NOT NULL, term INTEGER NOT NULL,
            record JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
            updated_by TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (student_email, school_year, term)
        )`);
    }
    async function studentsWithHistory() {
        const current = await currentPeople();
        if (!hasDatabase) return current;
        await schema();
        const saved = await pool.query(`SELECT DISTINCT ON (student_email) student_email, record
            FROM progression_pathway_results ORDER BY student_email, school_year DESC, term DESC`);
        const students = new Map(current.filter((student) => student.email).map((student) => [student.email, { ...student }]));
        const summary = (record) => ({ schoolYear: record.schoolYear, term: record.term,
            pathways: (Array.isArray(record.pathways) ? record.pathways : [])
                .map((pathway) => ({ id: pathway.id, coverage: pathway.coverage, descriptor: pathway.descriptor ?? null })),
            strandProgress: (Array.isArray(record.strandProgress) ? record.strandProgress : [])
                .map((row) => ({ strand: row.strand, kind: row.kind, descriptor: row.descriptor ?? null })) });
        for (const row of saved.rows) {
            if (students.has(row.student_email)) {
                students.get(row.student_email).progress = summary(row.record);
            } else {
                students.set(row.student_email, { email: row.student_email,
                    name: row.record.studentName || row.student_email,
                    yearLevel: row.record.yearLevel, formClass: row.record.formClass,
                    homeroom: row.record.homeroom || row.record.formClass,
                    ...(row.record.timetableClass === undefined ? {} : { timetableClass: row.record.timetableClass }),
                    progress: summary(row.record), archived: true });
            }
        }
        return [...current.filter((student) => !student.email), ...students.values()];
    }
    async function completedActivities(email) {
        try {
            const rows = (await pool.query(`SELECT activity_id, completed_at FROM learning_pathways_activity_progress
                WHERE student_email = $1 AND completed`, [email])).rows;
            return rows.filter((row) => Object.hasOwn(trackedActivities, row.activity_id))
                .map((row) => ({ id: row.activity_id, title: trackedActivities[row.activity_id].title, completedAt: row.completed_at }));
        } catch (error) {
            if (error?.code !== "42P01") console.error("Could not load completed activities for progression", error);
            return [];
        }
    }

    // Curriculum mapping (Admin > Curriculum Mapping). Until an admin publishes, the seeded default is used.
    const activityList = () => Object.entries(trackedActivities).map(([id, activity]) => ({ id, title: activity.title,
        context: activity.context || "" }));
    let memoryMapping = null;
    async function mappingSchema() {
        await pool.query(`CREATE TABLE IF NOT EXISTS progression_curriculum_mapping (
            id TEXT PRIMARY KEY, mapping JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
            updated_by TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    }
    async function readMapping() {
        const saved = hasDatabase ? (await mappingSchema(), (await pool.query(`SELECT mapping, revision, updated_by, updated_at
            FROM progression_curriculum_mapping WHERE id = 'default'`)).rows[0]) : memoryMapping;
        if (!saved) return { mapping: progressionMapping.defaultMapping(), revision: 0, updatedAt: null, updatedBy: null };
        let mapping;
        try { mapping = progressionMapping.validateMapping(saved.mapping, Object.keys(trackedActivities)); }
        catch (error) {
            // Drop links to activities or statements that no longer exist rather than failing the page.
            const source = saved.mapping || {};
            mapping = progressionMapping.validateMapping({ ...source,
                links: Object.fromEntries(Object.entries(source.links || {}).filter(([id]) => statementIds.has(id))),
                activities: (source.activities || []).filter((row) => Object.hasOwn(trackedActivities, row?.activity) && statementIds.has(row?.statement)) },
                Object.keys(trackedActivities));
            console.error("Curriculum mapping contained outdated links; they were ignored.", error.message);
        }
        return { mapping, revision: saved.revision, updatedAt: saved.updated_at, updatedBy: saved.updated_by };
    }
    const sendMapping = async (_req, res) => {
        try {
            res.set("Cache-Control", "no-store");
            res.json({ ...await readMapping(), activities: activityList() });
        } catch (error) {
            console.error("Could not load curriculum mapping", error);
            res.status(500).json({ error: "Could not load the curriculum mapping. Please retry." });
        }
    };
    app.get("/api/teacher/progression/mapping", requireTeacherAccess, sendMapping);
    if (typeof requireAdminAccess === "function") {
        app.get("/api/admin/progression/mapping", requireAdminAccess, sendMapping);
        app.put("/api/admin/progression/mapping", requireAdminAccess, async (req, res) => {
            let mapping;
            const revision = req.body?.revision;
            try {
                if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid revision.");
                mapping = progressionMapping.validateMapping(req.body?.mapping, Object.keys(trackedActivities));
            } catch (error) { return res.status(400).json({ error: error.message }); }
            const conflict = () => res.status(409).json({ error: "The mapping was changed by another admin. Reload it before editing again." });
            try {
                if (!hasDatabase) {
                    if ((memoryMapping?.revision || 0) !== revision) return conflict();
                    memoryMapping = { mapping, revision: revision + 1, updated_by: req.user_email || "admin", updated_at: new Date().toISOString() };
                } else {
                    await mappingSchema();
                    const values = [JSON.stringify(mapping), req.user_email || "admin"];
                    const result = revision === 0
                        ? await pool.query(`INSERT INTO progression_curriculum_mapping (id, mapping, updated_by)
                            VALUES ('default', $1::jsonb, $2) ON CONFLICT DO NOTHING RETURNING revision`, values)
                        : await pool.query(`UPDATE progression_curriculum_mapping SET mapping = $1::jsonb, updated_by = $2,
                            updated_at = NOW(), revision = revision + 1 WHERE id = 'default' AND revision = $3 RETURNING revision`, [...values, revision]);
                    if (!result.rows.length) return conflict();
                }
                res.json({ ...await readMapping(), activities: activityList() });
            } catch (error) {
                console.error("Could not save curriculum mapping", error);
                res.status(500).json({ error: "Could not save the curriculum mapping. Your changes have not been saved." });
            }
        });
    }

    app.get("/api/teacher/progression/students", requireTeacherAccess, async (_req, res) => {
        try {
            res.set("Cache-Control", "no-store");
            res.json({ students: await studentsWithHistory() });
        } catch (error) {
            console.error("Could not load progression students", error);
            res.status(500).json({ error: "Could not load students. Please retry." });
        }
    });
    app.get("/api/teacher/progression/records", requireTeacherAccess, available, async (req, res) => {
        const email = String(req.query.studentEmail || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Select a student." });
        try {
            await schema();
            const result = await pool.query(`SELECT record, revision, updated_at, updated_by
                FROM progression_pathway_results WHERE student_email = $1 ORDER BY school_year DESC, term DESC`, [email]);
            res.set("Cache-Control", "no-store");
            res.json({ records: result.rows.map((row) => ({ ...row.record, revision: row.revision,
                updatedAt: row.updated_at, updatedBy: row.updated_by })), completedActivities: await completedActivities(email) });
        } catch (error) {
            console.error("Could not load progression records", error);
            res.status(500).json({ error: "Could not load saved results. Please retry." });
        }
    });
    app.put("/api/teacher/progression/records", requireTeacherAccess, available, async (req, res) => {
        let record;
        try { record = validateRecord(req.body); }
        catch (error) { return res.status(400).json({ error: error.message }); }
        try {
            const students = await currentPeople();
            const student = students.find((student) => student.email === record.studentEmail);
            if (!student && record.revision === 0) return res.status(400).json({ error: "Select a Year 7-10 student or staff member from the school directory." });
            const historicalStudent = student || (await studentsWithHistory()).find((item) => item.email === record.studentEmail);
            if (historicalStudent) record.studentName = historicalStudent.name;
            await schema();
            const values = [record.studentEmail, record.schoolYear, record.term, JSON.stringify(record), req.user_email];
            const result = record.revision === 0
                ? await pool.query(`INSERT INTO progression_pathway_results (student_email, school_year, term, record, updated_by)
                    VALUES ($1, $2, $3, $4::jsonb, $5) ON CONFLICT DO NOTHING
                    RETURNING record, revision, updated_at, updated_by`, values)
                : await pool.query(`UPDATE progression_pathway_results SET record = $4::jsonb,
                    updated_by = $5, updated_at = NOW(), revision = revision + 1
                    WHERE student_email = $1 AND school_year = $2 AND term = $3 AND revision = $6
                    RETURNING record, revision, updated_at, updated_by`, [...values, record.revision]);
            if (!result.rows.length) return res.status(409).json({ error: "This rotation was changed by another teacher. Reload saved results before editing again." });
            const row = result.rows[0];
            res.json({ record: { ...row.record, revision: row.revision, updatedAt: row.updated_at, updatedBy: row.updated_by } });
        } catch (error) {
            console.error("Could not save progression results", error);
            res.status(500).json({ error: "Could not save results. Your changes have not been saved." });
        }
    });
}

module.exports = { disciplineValues, registerProgressionPathway, validateRecord };
