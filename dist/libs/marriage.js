import { getConnection } from "../database/connect.js";
const now = () => Date.now();
export const MARRIAGE_PROPOSAL_TTL = 10 * 60 * 1000;
const normalizePair = (userA, userB) => {
    return [userA, userB].sort((a, b) => a.localeCompare(b));
};
const getOne = (sql, params = []) => {
    return new Promise((resolve) => {
        try {
            getConnection().get(sql, params, (error, row) => {
                if (error) {
                    console.error("[Marriage.getOne]", error);
                    resolve(null);
                    return;
                }
                resolve(row || null);
            });
        }
        catch (error) {
            console.error("[Marriage.getOne]", error);
            resolve(null);
        }
    });
};
const getAll = (sql, params = []) => {
    return new Promise((resolve) => {
        try {
            getConnection().all(sql, params, (error, rows) => {
                if (error) {
                    console.error("[Marriage.getAll]", error);
                    resolve([]);
                    return;
                }
                resolve(rows || []);
            });
        }
        catch (error) {
            console.error("[Marriage.getAll]", error);
            resolve([]);
        }
    });
};
const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        try {
            getConnection().run(sql, params, function (error) {
                if (error) {
                    console.error("[Marriage.run]", error);
                    reject(error);
                    return;
                }
                resolve(Number(this.lastID || 0));
            });
        }
        catch (error) {
            console.error("[Marriage.run]", error);
            reject(error);
        }
    });
};
export const getPartnerJid = (marriage, userJid) => {
    return marriage.user_a_jid === userJid ? marriage.user_b_jid : marriage.user_a_jid;
};
export const formatMarriageDate = (timestamp) => {
    return new Date(Number(timestamp || 0)).toLocaleString("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};
const plural = (value, singular, pluralValue) => {
    return `${value} ${value === 1 ? singular : pluralValue}`;
};
export const formatMarriageDuration = (from, to = now()) => {
    const diff = Math.max(0, Number(to || now()) - Number(from || now()));
    const totalMinutes = Math.floor(diff / 60000);
    const totalHours = Math.floor(totalMinutes / 60);
    const totalDays = Math.floor(totalHours / 24);
    if (totalDays >= 365) {
        const years = Math.floor(totalDays / 365);
        const days = totalDays % 365;
        return days ? `${plural(years, "año", "años")} y ${plural(days, "día", "días")}` : plural(years, "año", "años");
    }
    if (totalDays >= 30) {
        const months = Math.floor(totalDays / 30);
        const days = totalDays % 30;
        return days ? `${plural(months, "mes", "meses")} y ${plural(days, "día", "días")}` : plural(months, "mes", "meses");
    }
    if (totalDays >= 1) {
        const hours = totalHours % 24;
        return hours ? `${plural(totalDays, "día", "días")} y ${plural(hours, "hora", "horas")}` : plural(totalDays, "día", "días");
    }
    if (totalHours >= 1) {
        const minutes = totalMinutes % 60;
        return minutes ? `${plural(totalHours, "hora", "horas")} y ${plural(minutes, "minuto", "minutos")}` : plural(totalHours, "hora", "horas");
    }
    return totalMinutes > 0 ? plural(totalMinutes, "minuto", "minutos") : "menos de 1 minuto";
};
export const formatProposalTimeLeft = (expiresAt) => {
    return formatMarriageDuration(now(), expiresAt);
};
export const expireOldMarriageProposals = async (groupJid) => {
    const params = [now()];
    let sql = `UPDATE group_marriage_proposals
             SET status = 'expired', updated_at = CURRENT_TIMESTAMP
             WHERE status = 'pending' AND expires_at_ms <= ?`;
    if (groupJid) {
        sql += ` AND group_jid = ?`;
        params.push(groupJid);
    }
    await run(sql, params).catch(() => 0);
};
export const getActiveMarriageByUser = async (groupJid, userJid) => {
    return getOne(`SELECT * FROM group_marriages
     WHERE group_jid = ? AND status = 'active' AND (user_a_jid = ? OR user_b_jid = ?)
     ORDER BY married_at DESC LIMIT 1`, [groupJid, userJid, userJid]);
};
export const getMarriageBetween = async (groupJid, userA, userB) => {
    const [first, second] = normalizePair(userA, userB);
    return getOne(`SELECT * FROM group_marriages
     WHERE group_jid = ? AND user_a_jid = ? AND user_b_jid = ? AND status = 'active'
     ORDER BY married_at DESC LIMIT 1`, [groupJid, first, second]);
};
export const getActiveGroupMarriages = async (groupJid, limit = 50) => {
    return getAll(`SELECT * FROM group_marriages
     WHERE group_jid = ? AND status = 'active'
     ORDER BY married_at ASC LIMIT ?`, [groupJid, limit]);
};
export const getGroupMarriageStats = async (groupJid) => {
    const active = await getOne(`SELECT COUNT(*) as count FROM group_marriages WHERE group_jid = ? AND status = 'active'`, [groupJid]);
    const total = await getOne(`SELECT COUNT(*) as count FROM group_marriages WHERE group_jid = ?`, [
        groupJid,
    ]);
    return {
        active: Number(active?.count || 0),
        total: Number(total?.count || 0),
    };
};
export const getMarriageRank = async (groupJid, marriageId) => {
    const marriages = await getActiveGroupMarriages(groupJid, 1000);
    return marriages.findIndex((marriage) => Number(marriage.id) === Number(marriageId)) + 1;
};
export const createMarriage = async (groupJid, userA, userB) => {
    const [first, second] = normalizePair(userA, userB);
    const marriedAt = now();
    const id = await run(`INSERT INTO group_marriages (group_jid, user_a_jid, user_b_jid, married_at, status)
     VALUES (?, ?, ?, ?, 'active')`, [groupJid, first, second, marriedAt]);
    return getOne(`SELECT * FROM group_marriages WHERE id = ?`, [id]);
};
export const divorceMarriage = async (marriageId) => {
    await run(`UPDATE group_marriages
     SET status = 'divorced', divorced_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'active'`, [now(), marriageId]);
};
export const createMarriageProposal = async (groupJid, proposerJid, targetJid) => {
    await expireOldMarriageProposals(groupJid);
    await run(`UPDATE group_marriage_proposals
     SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE group_jid = ? AND status = 'pending' AND proposer_jid = ?`, [groupJid, proposerJid]).catch(() => 0);
    const createdAt = now();
    const expiresAt = createdAt + MARRIAGE_PROPOSAL_TTL;
    const id = await run(`INSERT INTO group_marriage_proposals (group_jid, proposer_jid, target_jid, status, created_at_ms, expires_at_ms)
     VALUES (?, ?, ?, 'pending', ?, ?)`, [groupJid, proposerJid, targetJid, createdAt, expiresAt]);
    return getOne(`SELECT * FROM group_marriage_proposals WHERE id = ?`, [id]);
};
export const getPendingMarriageProposal = async (groupJid, targetJid, proposerJid) => {
    await expireOldMarriageProposals(groupJid);
    const params = [groupJid, targetJid, now()];
    let sql = `SELECT * FROM group_marriage_proposals
             WHERE group_jid = ? AND target_jid = ? AND status = 'pending' AND expires_at_ms > ?`;
    if (proposerJid) {
        sql += ` AND proposer_jid = ?`;
        params.push(proposerJid);
    }
    sql += ` ORDER BY created_at_ms DESC LIMIT 1`;
    return getOne(sql, params);
};
export const getPendingMarriageProposalBetween = async (groupJid, userA, userB) => {
    await expireOldMarriageProposals(groupJid);
    return getOne(`SELECT * FROM group_marriage_proposals
     WHERE group_jid = ? AND status = 'pending' AND expires_at_ms > ?
     AND ((proposer_jid = ? AND target_jid = ?) OR (proposer_jid = ? AND target_jid = ?))
     ORDER BY created_at_ms DESC LIMIT 1`, [groupJid, now(), userA, userB, userB, userA]);
};
export const updateMarriageProposalStatus = async (proposalId, status) => {
    await run(`UPDATE group_marriage_proposals
     SET status = ?, responded_at_ms = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'pending'`, [status, now(), proposalId]);
};
