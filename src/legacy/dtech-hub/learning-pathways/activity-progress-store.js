"use strict";

const BIT_PATTERN = /^[01]{5}$/;
const TECHNOLOGY = "TECHNOLOGY";
const letterValue = (letter) => letter.charCodeAt(0) - 64;
const toBinary = (value) => value.toString(2).padStart(5, "0");
const bits = (value) => (typeof value === "string" && BIT_PATTERN.test(value) ? value : "");

// T (index 0) is the worked example, so students encode the nine letters after it.
const encodingLetters = [...TECHNOLOGY].map((letter, index) => ({ index, letter, value: letterValue(letter) })).slice(1);

const trackedActivities = {
    "activity-encoding-binary": {
        title: "Encoding Binary",
        shortTitle: "Encoding",
        strand: "digital-systems",
        unit: "binary-and-data",
        lesson: "lesson-encoding-binary",
        context: "Binary & Data \u2022 Lesson 2",
        unitTitle: "Binary & Data",
        lessonLabel: "Lesson 2",
        required: true,
        href: "/learning-pathways/activity-encoding-binary.html",
        sanitize(input) {
            const source = input && typeof input === "object" ? input : {};
            const letters = {};
            for (const { index } of encodingLetters) {
                const value = bits(source.letters?.[index]);
                if (value) letters[index] = value;
            }
            const word = typeof source.challenge?.word === "string"
                ? source.challenge.word.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10) : "";
            const challengeBits = Array.isArray(source.challenge?.bits)
                ? source.challenge.bits.slice(0, word.length).map((value) => bits(value) || "00000") : [];
            return { practice: bits(source.practice), letters, challenge: { word, bits: challengeBits } };
        },
        missing(responses) {
            const missing = [];
            for (const { index, letter, value } of encodingLetters) {
                if (responses.letters[index] !== toBinary(value)) missing.push(`${letter} = ${value}`);
            }
            return missing;
        },
        summary(responses) {
            const missing = this.missing(responses);
            const correct = encodingLetters.length - missing.length;
            const word = responses.challenge?.word || "";
            const wordDone = Boolean(word) && [...word].every((letter, position) => responses.challenge.bits[position] === toBinary(letterValue(letter)));
            return [
                `Part D letters correct: ${correct} of ${encodingLetters.length}`,
                ...(missing.length ? [`Still to finish: ${missing.join(", ")}`] : []),
                word ? `Optional word: ${word} (${wordDone ? "encoded correctly" : "not finished yet"})` : "Optional word: not attempted"
            ];
        }
    }
};

const trackedUnits = {
    "binary-and-data": { title: "Binary & Data", strand: "digital-systems", strandTitle: "Digital Systems" }
};

function registerActivityProgress(app, { pool, hasDatabase, getRequestUserEmail, normalizeEmail, schoolDomain, requireTeacherAccess, getStudents, getStaff }) {
    const memory = new Map();
    let schemaReady = null;
    const ensureSchema = () => {
        schemaReady ||= pool.query(`CREATE TABLE IF NOT EXISTS learning_pathways_activity_progress (
            student_email TEXT NOT NULL, activity_id TEXT NOT NULL,
            responses JSONB NOT NULL DEFAULT '{}'::jsonb, completed BOOLEAN NOT NULL DEFAULT FALSE,
            completed_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (student_email, activity_id)
        )`).catch((error) => { schemaReady = null; throw error; });
        return schemaReady;
    };
    const shape = (row) => ({ responses: row.responses || {}, completed: Boolean(row.completed),
        completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null });

    async function readAll(email) {
        if (!hasDatabase) return [...memory.entries()].filter(([key]) => key.startsWith(`${email}\n`))
            .map(([key, row]) => ({ activity_id: key.split("\n")[1], ...row }));
        await ensureSchema();
        return (await pool.query(`SELECT activity_id, responses, completed, completed_at
            FROM learning_pathways_activity_progress WHERE student_email = $1`, [email])).rows;
    }
    async function readOne(email, activityId) {
        if (!hasDatabase) return memory.get(`${email}\n${activityId}`) || null;
        await ensureSchema();
        return (await pool.query(`SELECT responses, completed, completed_at FROM learning_pathways_activity_progress
            WHERE student_email = $1 AND activity_id = $2`, [email, activityId])).rows[0] || null;
    }
    async function readActivities(activityIds) {
        if (!hasDatabase) return [...memory.entries()].map(([key, row]) => ({ student_email: key.split("\n")[0], activity_id: key.split("\n")[1], ...row }))
            .filter((row) => activityIds.includes(row.activity_id));
        await ensureSchema();
        return (await pool.query(`SELECT student_email, activity_id, responses, completed, completed_at
            FROM learning_pathways_activity_progress WHERE activity_id = ANY($1)`, [activityIds])).rows;
    }
    async function write(email, activityId, row) {
        if (!hasDatabase) {
            memory.set(`${email}\n${activityId}`, row);
            return row;
        }
        await ensureSchema();
        return (await pool.query(`INSERT INTO learning_pathways_activity_progress
            (student_email, activity_id, responses, completed, completed_at, updated_at)
            VALUES ($1, $2, $3::jsonb, $4, $5, NOW())
            ON CONFLICT (student_email, activity_id) DO UPDATE SET responses = EXCLUDED.responses,
                completed = EXCLUDED.completed, completed_at = EXCLUDED.completed_at, updated_at = NOW()
            RETURNING responses, completed, completed_at`,
        [email, activityId, JSON.stringify(row.responses), row.completed, row.completed_at])).rows[0];
    }

    const requireStudent = (req, res, next) => {
        const email = normalizeEmail(getRequestUserEmail(req));
        if (!email || !email.endsWith(`@${schoolDomain}`)) {
            res.status(401).json({ error: "School sign-in required." });
            return;
        }
        req.activityProgressEmail = email;
        res.set("Cache-Control", "no-store");
        next();
    };
    const requireActivity = (req, res, next) => {
        if (!Object.hasOwn(trackedActivities, req.params.activityId)) {
            res.status(404).json({ error: "This activity does not save progress." });
            return;
        }
        next();
    };

    app.get("/api/learning-pathways/activity-progress", requireStudent, async (req, res) => {
        try {
            const rows = await readAll(req.activityProgressEmail);
            const progress = {};
            for (const row of rows) if (Object.hasOwn(trackedActivities, row.activity_id)) progress[row.activity_id] = shape(row);
            const tracked = Object.entries(trackedActivities).map(([id, activity]) => ({ id, title: activity.title,
                strand: activity.strand, unit: activity.unit, lesson: activity.lesson, context: activity.context,
                unitTitle: activity.unitTitle, lessonLabel: activity.lessonLabel, required: activity.required === true, href: activity.href }));
            res.json({ tracked, progress });
        } catch (error) {
            console.error("Could not load activity progress", error);
            res.status(500).json({ error: "Could not load your activity progress. Please retry." });
        }
    });
    app.get("/api/learning-pathways/activity-progress/:activityId", requireStudent, requireActivity, async (req, res) => {
        try {
            const row = await readOne(req.activityProgressEmail, req.params.activityId);
            res.json(row ? shape(row) : { responses: {}, completed: false, completedAt: null });
        } catch (error) {
            console.error("Could not load activity progress", error);
            res.status(500).json({ error: "Could not load your saved answers. Please retry." });
        }
    });
    app.put("/api/learning-pathways/activity-progress/:activityId", requireStudent, requireActivity, async (req, res) => {
        const activity = trackedActivities[req.params.activityId];
        try {
            const responses = activity.sanitize(req.body?.responses);
            const missing = activity.missing(responses);
            const previous = await readOne(req.activityProgressEmail, req.params.activityId);
            // Completes automatically once every required answer is correct; a wrong answer later reopens it.
            const completed = missing.length === 0;
            const completedAt = completed ? (previous?.completed && previous.completed_at) || new Date().toISOString() : null;
            const saved = await write(req.activityProgressEmail, req.params.activityId,
                { responses, completed, completed_at: completedAt });
            if (req.body?.completed === true && !completed) {
                res.status(409).json({ error: "Some answers still need to be finished.", missing, ...shape(saved) });
                return;
            }
            res.json({ ...shape(saved), missing });
        } catch (error) {
            console.error("Could not save activity progress", error);
            res.status(500).json({ error: "Could not save your answers. Please retry." });
        }
    });
    if (typeof requireTeacherAccess !== "function" || typeof getStudents !== "function") return;
    const loadStaff = async () => {
        if (typeof getStaff !== "function") return [];
        try {
            return (await getStaff()).map((member) => ({ email: normalizeEmail(member.email || ""), name: String(member.name || member.email || ""),
                yearLevel: "", homeroom: "", formClass: "", timetableClass: "", isStaff: true })).filter((member) => member.email);
        } catch (error) {
            console.error("Could not load staff for unit progression", error);
            return [];
        }
    };
    app.get("/api/teacher/unit-progression", requireTeacherAccess, async (req, res) => {
        res.set("Cache-Control", "no-store");
        const unitIds = Object.keys(trackedUnits);
        const unitId = unitIds.includes(String(req.query.unit || "")) ? String(req.query.unit) : unitIds[0];
        try {
            const activities = Object.entries(trackedActivities).filter(([, activity]) => activity.unit === unitId);
            const students = (await getStudents()).map((student) => ({ email: normalizeEmail(student.email || ""),
                name: String(student.name || ""), yearLevel: student.yearLevel, homeroom: student.homeroom || "",
                formClass: student.formClass || "", timetableClass: student.timetableClass || "" }));
            const known = new Set(students.map((student) => student.email).filter(Boolean));
            for (const member of await loadStaff()) {
                if (known.has(member.email)) continue;
                known.add(member.email);
                students.push(member);
            }
            const progress = {};
            for (const row of await readActivities(activities.map(([id]) => id))) {
                const email = normalizeEmail(row.student_email);
                if (!known.has(email)) continue;
                const activity = trackedActivities[row.activity_id];
                const responses = activity.sanitize(row.responses);
                (progress[email] ||= {})[row.activity_id] = { status: row.completed ? "completed" : "in-progress",
                    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
                    summary: activity.summary(responses) };
            }
            res.json({
                units: unitIds.map((id) => ({ id, title: trackedUnits[id].title })),
                unit: { id: unitId, ...trackedUnits[unitId] },
                activities: activities.map(([id, activity]) => ({ id, title: activity.title,
                    shortTitle: activity.shortTitle || activity.title, lessonLabel: activity.lessonLabel, href: activity.href })),
                students, progress
            });
        } catch (error) {
            console.error("Could not load unit progression", error);
            res.status(500).json({ error: "Could not load unit progression. Please retry." });
        }
    });
}

module.exports = { registerActivityProgress, trackedActivities, trackedUnits, encodingLetters, toBinary };