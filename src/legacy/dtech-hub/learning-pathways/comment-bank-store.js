"use strict";

const commentBank = require("./comment-bank");

// Admin > Reporting Comment Bank. The starter bank is written to the database the first time it is read,
// so the stored bank (not the code) is what teachers see. Saved narratives are plain text copies, so
// editing or deleting a bank comment never changes a student's saved report.
function registerCommentBank(app, { pool, hasDatabase, requireTeacherAccess, requireAdminAccess }) {
    let memoryBank = null;
    async function schema() {
        await pool.query(`CREATE TABLE IF NOT EXISTS reporting_comment_bank (
            id TEXT PRIMARY KEY, bank JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
            updated_by TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    }
    async function readBank() {
        let saved = memoryBank;
        if (hasDatabase) {
            await schema();
            const select = () => pool.query(`SELECT bank, revision, updated_by, updated_at FROM reporting_comment_bank WHERE id = 'default'`);
            saved = (await select()).rows[0];
            if (!saved) {
                await pool.query(`INSERT INTO reporting_comment_bank (id, bank, updated_by) VALUES ('default', $1::jsonb, 'starter bank')
                    ON CONFLICT (id) DO NOTHING`, [JSON.stringify(commentBank.defaultBank())]);
                saved = (await select()).rows[0];
            }
        }
        if (!saved) return { bank: commentBank.defaultBank(), revision: 0, updatedAt: null, updatedBy: null };
        let bank;
        try { bank = commentBank.validateBank(saved.bank); } catch (error) {
            console.error("Stored comment bank is invalid; showing the starter bank.", error.message);
            bank = commentBank.defaultBank();
        }
        return { bank, revision: saved.revision, updatedAt: saved.updated_at, updatedBy: saved.updated_by };
    }
    const failed = (res, error, message) => {
        console.error(message, error);
        res.status(500).json({ error: `${message}. Please retry.` });
    };
    app.get("/api/teacher/progression/comment-bank", requireTeacherAccess, async (_req, res) => {
        try {
            const data = await readBank();
            res.json({ ...data, bank: { ...data.bank, comments: data.bank.comments.filter((comment) => comment.active) } });
        } catch (error) { failed(res, error, "Could not load the comment bank"); }
    });
    if (typeof requireAdminAccess !== "function") return;
    app.get("/api/admin/progression/comment-bank", requireAdminAccess, async (_req, res) => {
        try { res.json(await readBank()); } catch (error) { failed(res, error, "Could not load the comment bank"); }
    });
    app.put("/api/admin/progression/comment-bank", requireAdminAccess, async (req, res) => {
        let bank;
        const revision = req.body?.revision;
        try {
            if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid revision.");
            bank = commentBank.validateBank(req.body?.bank);
        } catch (error) { return res.status(400).json({ error: error.message }); }
        const conflict = () => res.status(409).json({ error: "The comment bank was changed by another admin. Reload it before editing again." });
        try {
            const by = req.user_email || "admin";
            if (!hasDatabase) {
                if ((memoryBank?.revision || 0) !== revision) return conflict();
                memoryBank = { bank, revision: revision + 1, updated_by: by, updated_at: new Date().toISOString() };
            } else {
                await schema();
                const result = revision === 0
                    ? await pool.query(`INSERT INTO reporting_comment_bank (id, bank, updated_by) VALUES ('default', $1::jsonb, $2)
                        ON CONFLICT (id) DO NOTHING RETURNING revision`, [JSON.stringify(bank), by])
                    : await pool.query(`UPDATE reporting_comment_bank SET bank = $1::jsonb, updated_by = $2, revision = revision + 1,
                        updated_at = NOW() WHERE id = 'default' AND revision = $3 RETURNING revision`, [JSON.stringify(bank), by, revision]);
                if (!result.rows.length) return conflict();
            }
            res.json(await readBank());
        } catch (error) { failed(res, error, "Could not save the comment bank"); }
    });
}

module.exports = { registerCommentBank };
