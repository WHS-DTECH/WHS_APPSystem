"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const seedFile = path.join(__dirname, "library.json");
const statuses = ["active", "planning", "archive"];
const cardTypes = ["strand", "unit", "lesson", "activity", "job"];

function validLink(value, allowEmpty = false) {
    if (!value) return allowEmpty;
    if (value.startsWith("/") && !value.startsWith("//") && !/[\\\s]/.test(value)) return true;
    try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol);
    } catch {
        return false;
    }
}

function normalizeCards(cards) {
    if (!Array.isArray(cards)) throw new Error("A cards array is required.");
    const ids = new Set();
    return cards.map((card, index) => {
        const text = (value, limit) => {
            if (value != null && typeof value !== "string") throw new Error(`Card ${index + 1} fields must be text.`);
            const result = (value || "").trim();
            if (result.length > limit) throw new Error(`Card ${index + 1} has a field that is too long.`);
            return result;
        };
        const title = text(card?.title, 120);
        const summary = text(card?.summary, 600);
        const id = text(card?.id, 120) || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        const href = text(card?.href, 300);
        const imageUrl = text(card?.imageUrl, 300);
        const status = text(card?.status, 20) || "active";
        const cardType = text(card?.cardType, 20) || "strand";
        if (!title || !summary || !id) throw new Error(`Card ${index + 1} requires a title and summary.`);
        if (ids.has(id)) throw new Error(`Duplicate card ID: ${id}`);
        if (!statuses.includes(status)) throw new Error(`Card ${index + 1} has an invalid status.`);
        if (!cardTypes.includes(cardType)) throw new Error(`Card ${index + 1} has an invalid card type.`);
        if (!validLink(href, true) || !validLink(imageUrl, true)) throw new Error(`Card ${index + 1} links must be site paths or HTTP(S) URLs.`);
        ids.add(id);
        const normalized = {
            id, title, summary, href, imageUrl, status, cardType,
            yearLevel: text(card?.yearLevel, 60) || "All Years",
            area: text(card?.area, 60) || "Learning Pathways",
            visual: { icon: text(card?.visual?.icon, 12) || "LP" }
        };
        if (cardType === "job") {
            const clientEnabled = card?.client?.enabled === true;
            const clientName = clientEnabled ? text(card?.client?.name, 120) : "";
            const clientEmail = clientEnabled ? text(card?.client?.email, 254).toLowerCase() : "";
            if (clientEnabled && (!clientName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clientEmail))) {
                throw new Error(`Card ${index + 1} needs a client name and valid email address.`);
            }
            normalized.client = {
                enabled: clientEnabled,
                name: clientName,
                email: clientEmail,
                onsite: clientEnabled ? card?.client?.onsite !== false : true
            };
        }
        const strand = text(card?.strand, 120);
        if (cardType === "unit" && strand) normalized.strand = strand;
        if (cardType === "lesson") {
            const unit = text(card?.unit, 120);
            if (unit) normalized.unit = unit;
            const sequence = Number(card?.sequence);
            if (Number.isInteger(sequence) && sequence > 0 && sequence < 1000) normalized.sequence = sequence;
        }
        if (cardType === "activity") {
            const lesson = text(card?.lesson, 120);
            if (lesson) normalized.lesson = lesson;
            const sequence = Number(card?.sequence);
            if (Number.isInteger(sequence) && sequence > 0 && sequence < 1000) normalized.sequence = sequence;
        }
        return normalized;
    });
}

function registerLearningPathways(app, { pool, hasDatabase, requireAdminAccess, requireActivityWriteAccess = requireAdminAccess }) {
    async function ensureSchema() {
        await pool.query(`CREATE TABLE IF NOT EXISTS learning_pathways_library_store (
            id TEXT PRIMARY KEY, cards JSONB NOT NULL DEFAULT '[]'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
        await pool.query(`ALTER TABLE learning_pathways_library_store
            ADD COLUMN IF NOT EXISTS seed_version INTEGER NOT NULL DEFAULT 0`);
    }

    async function readCards() {
        if (!hasDatabase) return normalizeCards(JSON.parse(await fs.readFile(seedFile, "utf8")));
        await ensureSchema();
        const seed = normalizeCards(JSON.parse(await fs.readFile(seedFile, "utf8")));
        await pool.query(`INSERT INTO learning_pathways_library_store (id, cards, seed_version) VALUES ('default', $1::jsonb, 13)
            ON CONFLICT (id) DO NOTHING`, [JSON.stringify(seed)]);
        // Add the curriculum starter cards once without replacing existing cards or restoring later deletions.
        await pool.query(`UPDATE learning_pathways_library_store AS library
            SET cards = library.cards || COALESCE((
                SELECT jsonb_agg(starter.card)
                FROM jsonb_array_elements($1::jsonb) AS starter(card)
                WHERE NOT EXISTS (
                    SELECT 1 FROM jsonb_array_elements(library.cards) AS existing(card)
                    WHERE existing.card ->> 'id' = starter.card ->> 'id'
                )
            ), '[]'::jsonb), seed_version = 1, updated_at = NOW()
            WHERE id = 'default' AND seed_version < 1`, [JSON.stringify(seed)]);
        const combined = seed.find((card) => card.id === "programming-and-algorithms");
        await pool.query(`UPDATE learning_pathways_library_store AS library
            SET cards = COALESCE((
                SELECT jsonb_agg(existing.card ORDER BY existing.position)
                FROM jsonb_array_elements(library.cards) WITH ORDINALITY AS existing(card, position)
                WHERE existing.card ->> 'id' NOT IN ('programming', 'algorithms')
            ), '[]'::jsonb) || CASE
                WHEN EXISTS (
                    SELECT 1 FROM jsonb_array_elements(library.cards) AS existing(card)
                    WHERE existing.card ->> 'id' IN ('programming', 'algorithms')
                ) AND NOT EXISTS (
                    SELECT 1 FROM jsonb_array_elements(library.cards) AS existing(card)
                    WHERE existing.card ->> 'id' = 'programming-and-algorithms'
                ) THEN $1::jsonb ELSE '[]'::jsonb END,
                seed_version = 2, updated_at = NOW()
            WHERE id = 'default' AND seed_version < 2`, [JSON.stringify([combined])]);
        await pool.query(`UPDATE learning_pathways_library_store AS library
            SET cards = COALESCE((
                SELECT jsonb_agg(CASE WHEN existing.card ->> 'id' = 'data'
                    THEN existing.card || '{"title":"Data and Information","area":"Data and Information"}'::jsonb
                    ELSE existing.card END ORDER BY existing.position)
                FROM jsonb_array_elements(library.cards) WITH ORDINALITY AS existing(card, position)
            ), '[]'::jsonb), seed_version = 3, updated_at = NOW()
            WHERE id = 'default' AND seed_version < 3`);
        await pool.query(`UPDATE learning_pathways_library_store AS library
            SET cards = COALESCE((
                SELECT jsonb_agg(existing.card ORDER BY existing.position)
                FROM jsonb_array_elements(library.cards) WITH ORDINALITY AS existing(card, position)
                WHERE existing.card ->> 'id' <> 'design-and-innovation'
            ), '[]'::jsonb), seed_version = 4, updated_at = NOW()
            WHERE id = 'default' AND seed_version < 4`);
        await pool.query(`UPDATE learning_pathways_library_store AS library
            SET cards = COALESCE((
                SELECT jsonb_agg(CASE WHEN existing.card ->> 'id' = 'digital-systems'
                    AND COALESCE(existing.card ->> 'href', '') = ''
                    THEN existing.card || '{"href":"/learning-pathways/digital-systems.html"}'::jsonb
                    ELSE existing.card END ORDER BY existing.position)
                FROM jsonb_array_elements(library.cards) WITH ORDINALITY AS existing(card, position)
            ), '[]'::jsonb), seed_version = 5, updated_at = NOW()
            WHERE id = 'default' AND seed_version < 5`);
        const curriculumLinks = {
            "programming-and-algorithms": "/learning-pathways/programming-and-algorithms.html",
            "data": "/learning-pathways/data-and-information.html",
            "digital-citizenship": "/learning-pathways/digital-citizenship.html",
            "systems-and-control": "/learning-pathways/systems-and-control.html"
        };
        await pool.query(`UPDATE learning_pathways_library_store AS library
            SET cards = COALESCE((
                SELECT jsonb_agg(CASE WHEN $1::jsonb ? (existing.card ->> 'id')
                    AND COALESCE(existing.card ->> 'href', '') = ''
                    THEN existing.card || jsonb_build_object('href', $1::jsonb ->> (existing.card ->> 'id'))
                    ELSE existing.card END ORDER BY existing.position)
                FROM jsonb_array_elements(library.cards) WITH ORDINALITY AS existing(card, position)
            ), '[]'::jsonb), seed_version = 6, updated_at = NOW()
            WHERE id = 'default' AND seed_version < 6`, [JSON.stringify(curriculumLinks)]);
        // Add the Digital Systems unit cards once; later admin deletions are not restored.
        const units = seed.filter((card) => card.cardType === "unit");
        await pool.query(`UPDATE learning_pathways_library_store AS library
            SET cards = library.cards || COALESCE((
                SELECT jsonb_agg(unit.card)
                FROM jsonb_array_elements($1::jsonb) AS unit(card)
                WHERE NOT EXISTS (
                    SELECT 1 FROM jsonb_array_elements(library.cards) AS existing(card)
                    WHERE existing.card ->> 'id' = unit.card ->> 'id'
                )
            ), '[]'::jsonb), seed_version = 7, updated_at = NOW()
            WHERE id = 'default' AND seed_version < 7`, [JSON.stringify(units)]);
        // Link a still-blank Binary & Data unit card to its Unit Plan page once.
        await pool.query(`UPDATE learning_pathways_library_store AS library
            SET cards = COALESCE((
                SELECT jsonb_agg(CASE WHEN existing.card ->> 'id' = 'binary-and-data'
                    AND COALESCE(existing.card ->> 'href', '') = ''
                    THEN existing.card || '{"href":"/learning-pathways/binary-and-data.html"}'::jsonb
                    ELSE existing.card END ORDER BY existing.position)
                FROM jsonb_array_elements(library.cards) WITH ORDINALITY AS existing(card, position)
            ), '[]'::jsonb), seed_version = 8, updated_at = NOW()
            WHERE id = 'default' AND seed_version < 8`);
        // Add the Binary & Data lesson cards once; later admin deletions are not restored.
        const lessons = seed.filter((card) => card.cardType === "lesson");
        await pool.query(`UPDATE learning_pathways_library_store AS library
            SET cards = library.cards || COALESCE((
                SELECT jsonb_agg(lesson.card)
                FROM jsonb_array_elements($1::jsonb) AS lesson(card)
                WHERE NOT EXISTS (
                    SELECT 1 FROM jsonb_array_elements(library.cards) AS existing(card)
                    WHERE existing.card ->> 'id' = lesson.card ->> 'id'
                )
            ), '[]'::jsonb), seed_version = 9, updated_at = NOW()
            WHERE id = 'default' AND seed_version < 9`, [JSON.stringify(lessons)]);
        // Link a still-blank Binary Piano lesson card to its Lesson page once.
        await pool.query(`UPDATE learning_pathways_library_store AS library
            SET cards = COALESCE((
                SELECT jsonb_agg(CASE WHEN existing.card ->> 'id' = 'lesson-binary-piano'
                    AND COALESCE(existing.card ->> 'href', '') = ''
                    THEN existing.card || '{"href":"/learning-pathways/lesson-binary-piano.html"}'::jsonb
                    ELSE existing.card END ORDER BY existing.position)
                FROM jsonb_array_elements(library.cards) WITH ORDINALITY AS existing(card, position)
            ), '[]'::jsonb), seed_version = 10, updated_at = NOW()
            WHERE id = 'default' AND seed_version < 10`);
        // Add the Lesson Activity cards once; later admin deletions are not restored.
        const activities = seed.filter((card) => card.cardType === "activity");
        await pool.query(`UPDATE learning_pathways_library_store AS library
            SET cards = library.cards || COALESCE((
                SELECT jsonb_agg(activity.card)
                FROM jsonb_array_elements($1::jsonb) AS activity(card)
                WHERE NOT EXISTS (
                    SELECT 1 FROM jsonb_array_elements(library.cards) AS existing(card)
                    WHERE existing.card ->> 'id' = activity.card ->> 'id'
                )
            ), '[]'::jsonb), seed_version = 11, updated_at = NOW()
            WHERE id = 'default' AND seed_version < 11`, [JSON.stringify(activities)]);
        // Link a still-blank Encoding Binary lesson card to its Lesson page once.
        await pool.query(`UPDATE learning_pathways_library_store AS library
            SET cards = COALESCE((
                SELECT jsonb_agg(CASE WHEN existing.card ->> 'id' = 'lesson-encoding-binary'
                    AND COALESCE(existing.card ->> 'href', '') = ''
                    THEN existing.card || '{"href":"/learning-pathways/lesson-encoding-binary.html"}'::jsonb
                    ELSE existing.card END ORDER BY existing.position)
                FROM jsonb_array_elements(library.cards) WITH ORDINALITY AS existing(card, position)
            ), '[]'::jsonb), seed_version = 12, updated_at = NOW()
            WHERE id = 'default' AND seed_version < 12`);
        // Add the Encoding Binary activity card once; later admin deletions are not restored.
        const encodingActivity = activities.filter((card) => card.id === "activity-encoding-binary");
        await pool.query(`UPDATE learning_pathways_library_store AS library
            SET cards = library.cards || COALESCE((
                SELECT jsonb_agg(activity.card)
                FROM jsonb_array_elements($1::jsonb) AS activity(card)
                WHERE NOT EXISTS (
                    SELECT 1 FROM jsonb_array_elements(library.cards) AS existing(card)
                    WHERE existing.card ->> 'id' = activity.card ->> 'id'
                )
            ), '[]'::jsonb), seed_version = 13, updated_at = NOW()
            WHERE id = 'default' AND seed_version < 13`, [JSON.stringify(encodingActivity)]);
        const initialized = await pool.query("SELECT cards FROM learning_pathways_library_store WHERE id = 'default'");
        return normalizeCards(initialized.rows[0].cards);
    }

    async function writeCards(cards) {
        if (!hasDatabase) {
            await fs.writeFile(seedFile, `${JSON.stringify(cards, null, 2)}\n`, "utf8");
            return;
        }
        await readCards();
        await pool.query(`INSERT INTO learning_pathways_library_store (id, cards, seed_version) VALUES ('default', $1::jsonb, 13)
            ON CONFLICT (id) DO UPDATE SET cards = EXCLUDED.cards, seed_version = 13, updated_at = NOW()`, [JSON.stringify(cards)]);
    }

    const load = (admin) => async (_req, res) => {
        try {
            const cards = await readCards();
            res.set("Cache-Control", "no-store");
            res.json(admin ? { cards } : cards);
        } catch (error) {
            console.error("Could not load Learning Pathways library", error);
            res.status(500).json({ error: "Could not load Learning Pathways. Please try again." });
        }
    };
    app.get("/learning-pathways/library.json", load(false));
    app.get("/api/learning-pathways/library", load(false));
    app.get("/api/admin/learning-pathways/library", requireAdminAccess, load(true));
    app.post("/api/learning-pathways/jobs", requireActivityWriteAccess, async (req, res) => {
        const title = String(req.body?.title || "").trim();
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
        if (!title || !String(req.body?.summary || "").trim() || !slug) {
            res.status(400).json({ error: "A job title and summary are required." });
            return;
        }

        let card;
        try {
            card = normalizeCards([{
                id: `middle-job-${slug}`,
                title,
                summary: req.body.summary,
                href: req.body?.href || "",
                imageUrl: req.body?.imageUrl || "",
                status: req.body?.status || "active",
                cardType: "job",
                yearLevel: "MiddleDTECH",
                area: "Jobs",
                client: req.body?.client,
                visual: { icon: req.body?.icon || "JB" }
            }])[0];
        } catch (error) {
            res.status(400).json({ error: error.message || "The job card is invalid." });
            return;
        }

        try {
            const cards = await readCards();
            if (cards.some((existing) => existing.id === card.id)) {
                res.status(409).json({ error: "A Jobs card with that title already exists." });
                return;
            }
            await writeCards([...cards, card]);
            res.status(201).json({ ok: true, card });
        } catch (error) {
            console.error("Could not save MiddleDTECH Jobs card", error);
            res.status(500).json({ error: "Could not save the Jobs card." });
        }
    });
    app.put("/api/admin/learning-pathways/library", requireAdminAccess, async (req, res) => {
        let cards;
        try {
            cards = normalizeCards(req.body?.cards);
        } catch (error) {
            res.status(400).json({ error: error.message });
            return;
        }
        try {
            await writeCards(cards);
            res.json({ ok: true, cards, count: cards.length });
        } catch (error) {
            console.error("Could not publish Learning Pathways library", error);
            res.status(500).json({ error: "Could not publish Learning Pathways. Your changes have not been saved." });
        }
    });
}

module.exports = { registerLearningPathways, normalizeCards };
