import { getConnection } from "../database/connect.js"

export type MarriageStatus = "active" | "divorced"
export type MarriageProposalStatus = "pending" | "accepted" | "rejected" | "expired" | "cancelled"

export interface MarriageRecord {
  id: number
  group_jid: string
  user_a_jid: string
  user_b_jid: string
  married_at: number
  divorced_at?: number | null
  status: MarriageStatus
  created_at?: string
  updated_at?: string
}

export interface MarriageProposalRecord {
  id: number
  group_jid: string
  proposer_jid: string
  target_jid: string
  status: MarriageProposalStatus
  created_at_ms: number
  expires_at_ms: number
  responded_at_ms?: number | null
  created_at?: string
  updated_at?: string
}

const now = (): number => Date.now()

export const MARRIAGE_PROPOSAL_TTL = 10 * 60 * 1000

const normalizePair = (userA: string, userB: string): [string, string] => {
  return [userA, userB].sort((a, b) => a.localeCompare(b)) as [string, string]
}

const getOne = <T>(sql: string, params: unknown[] = []): Promise<T | null> => {
  return new Promise((resolve) => {
    try {
      getConnection().get(sql, params, (error, row) => {
        if (error) {
          console.error("[Marriage.getOne]", error)
          resolve(null)
          return
        }

        resolve((row as T) || null)
      })
    } catch (error) {
      console.error("[Marriage.getOne]", error)
      resolve(null)
    }
  })
}

const getAll = <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
  return new Promise((resolve) => {
    try {
      getConnection().all(sql, params, (error, rows) => {
        if (error) {
          console.error("[Marriage.getAll]", error)
          resolve([])
          return
        }

        resolve((rows as T[]) || [])
      })
    } catch (error) {
      console.error("[Marriage.getAll]", error)
      resolve([])
    }
  })
}

const run = (sql: string, params: unknown[] = []): Promise<number> => {
  return new Promise((resolve, reject) => {
    try {
      getConnection().run(sql, params, function (error) {
        if (error) {
          console.error("[Marriage.run]", error)
          reject(error)
          return
        }

        resolve(Number(this.lastID || 0))
      })
    } catch (error) {
      console.error("[Marriage.run]", error)
      reject(error)
    }
  })
}

export const getPartnerJid = (marriage: MarriageRecord, userJid: string): string => {
  return marriage.user_a_jid === userJid ? marriage.user_b_jid : marriage.user_a_jid
}

export const formatMarriageDate = (timestamp: number): string => {
  return new Date(Number(timestamp || 0)).toLocaleString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const plural = (value: number, singular: string, pluralValue: string): string => {
  return `${value} ${value === 1 ? singular : pluralValue}`
}

export const formatMarriageDuration = (from: number, to = now()): string => {
  const diff = Math.max(0, Number(to || now()) - Number(from || now()))
  const totalMinutes = Math.floor(diff / 60000)
  const totalHours = Math.floor(totalMinutes / 60)
  const totalDays = Math.floor(totalHours / 24)

  if (totalDays >= 365) {
    const years = Math.floor(totalDays / 365)
    const days = totalDays % 365
    return days ? `${plural(years, "año", "años")} y ${plural(days, "día", "días")}` : plural(years, "año", "años")
  }

  if (totalDays >= 30) {
    const months = Math.floor(totalDays / 30)
    const days = totalDays % 30
    return days ? `${plural(months, "mes", "meses")} y ${plural(days, "día", "días")}` : plural(months, "mes", "meses")
  }

  if (totalDays >= 1) {
    const hours = totalHours % 24
    return hours ? `${plural(totalDays, "día", "días")} y ${plural(hours, "hora", "horas")}` : plural(totalDays, "día", "días")
  }

  if (totalHours >= 1) {
    const minutes = totalMinutes % 60
    return minutes ? `${plural(totalHours, "hora", "horas")} y ${plural(minutes, "minuto", "minutos")}` : plural(totalHours, "hora", "horas")
  }

  return totalMinutes > 0 ? plural(totalMinutes, "minuto", "minutos") : "menos de 1 minuto"
}

export const formatProposalTimeLeft = (expiresAt: number): string => {
  return formatMarriageDuration(now(), expiresAt)
}

export const expireOldMarriageProposals = async (groupJid?: string): Promise<void> => {
  const params: unknown[] = [now()]
  let sql = `UPDATE group_marriage_proposals
             SET status = 'expired', updated_at = CURRENT_TIMESTAMP
             WHERE status = 'pending' AND expires_at_ms <= ?`

  if (groupJid) {
    sql += ` AND group_jid = ?`
    params.push(groupJid)
  }

  await run(sql, params).catch(() => 0)
}

export const getActiveMarriageByUser = async (groupJid: string, userJid: string): Promise<MarriageRecord | null> => {
  return getOne<MarriageRecord>(
    `SELECT * FROM group_marriages
     WHERE group_jid = ? AND status = 'active' AND (user_a_jid = ? OR user_b_jid = ?)
     ORDER BY married_at DESC LIMIT 1`,
    [groupJid, userJid, userJid],
  )
}

export const getMarriageBetween = async (
  groupJid: string,
  userA: string,
  userB: string,
): Promise<MarriageRecord | null> => {
  const [first, second] = normalizePair(userA, userB)

  return getOne<MarriageRecord>(
    `SELECT * FROM group_marriages
     WHERE group_jid = ? AND user_a_jid = ? AND user_b_jid = ? AND status = 'active'
     ORDER BY married_at DESC LIMIT 1`,
    [groupJid, first, second],
  )
}

export const getActiveGroupMarriages = async (groupJid: string, limit = 50): Promise<MarriageRecord[]> => {
  return getAll<MarriageRecord>(
    `SELECT * FROM group_marriages
     WHERE group_jid = ? AND status = 'active'
     ORDER BY married_at ASC LIMIT ?`,
    [groupJid, limit],
  )
}

export const getGroupMarriageStats = async (groupJid: string): Promise<{ active: number; total: number }> => {
  const active = await getOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM group_marriages WHERE group_jid = ? AND status = 'active'`,
    [groupJid],
  )
  const total = await getOne<{ count: number }>(`SELECT COUNT(*) as count FROM group_marriages WHERE group_jid = ?`, [
    groupJid,
  ])

  return {
    active: Number(active?.count || 0),
    total: Number(total?.count || 0),
  }
}

export const getMarriageRank = async (groupJid: string, marriageId: number): Promise<number> => {
  const marriages = await getActiveGroupMarriages(groupJid, 1000)
  return marriages.findIndex((marriage) => Number(marriage.id) === Number(marriageId)) + 1
}

export const createMarriage = async (
  groupJid: string,
  userA: string,
  userB: string,
): Promise<MarriageRecord | null> => {
  const [first, second] = normalizePair(userA, userB)
  const marriedAt = now()
  const id = await run(
    `INSERT INTO group_marriages (group_jid, user_a_jid, user_b_jid, married_at, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [groupJid, first, second, marriedAt],
  )

  return getOne<MarriageRecord>(`SELECT * FROM group_marriages WHERE id = ?`, [id])
}

export const divorceMarriage = async (marriageId: number): Promise<void> => {
  await run(
    `UPDATE group_marriages
     SET status = 'divorced', divorced_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'active'`,
    [now(), marriageId],
  )
}

export const createMarriageProposal = async (
  groupJid: string,
  proposerJid: string,
  targetJid: string,
): Promise<MarriageProposalRecord | null> => {
  await expireOldMarriageProposals(groupJid)

  await run(
    `UPDATE group_marriage_proposals
     SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE group_jid = ? AND status = 'pending' AND proposer_jid = ?`,
    [groupJid, proposerJid],
  ).catch(() => 0)

  const createdAt = now()
  const expiresAt = createdAt + MARRIAGE_PROPOSAL_TTL
  const id = await run(
    `INSERT INTO group_marriage_proposals (group_jid, proposer_jid, target_jid, status, created_at_ms, expires_at_ms)
     VALUES (?, ?, ?, 'pending', ?, ?)`,
    [groupJid, proposerJid, targetJid, createdAt, expiresAt],
  )

  return getOne<MarriageProposalRecord>(`SELECT * FROM group_marriage_proposals WHERE id = ?`, [id])
}

export const getPendingMarriageProposal = async (
  groupJid: string,
  targetJid: string,
  proposerJid?: string,
): Promise<MarriageProposalRecord | null> => {
  await expireOldMarriageProposals(groupJid)

  const params: unknown[] = [groupJid, targetJid, now()]
  let sql = `SELECT * FROM group_marriage_proposals
             WHERE group_jid = ? AND target_jid = ? AND status = 'pending' AND expires_at_ms > ?`

  if (proposerJid) {
    sql += ` AND proposer_jid = ?`
    params.push(proposerJid)
  }

  sql += ` ORDER BY created_at_ms DESC LIMIT 1`

  return getOne<MarriageProposalRecord>(sql, params)
}

export const getPendingMarriageProposalBetween = async (
  groupJid: string,
  userA: string,
  userB: string,
): Promise<MarriageProposalRecord | null> => {
  await expireOldMarriageProposals(groupJid)

  return getOne<MarriageProposalRecord>(
    `SELECT * FROM group_marriage_proposals
     WHERE group_jid = ? AND status = 'pending' AND expires_at_ms > ?
     AND ((proposer_jid = ? AND target_jid = ?) OR (proposer_jid = ? AND target_jid = ?))
     ORDER BY created_at_ms DESC LIMIT 1`,
    [groupJid, now(), userA, userB, userB, userA],
  )
}

export const updateMarriageProposalStatus = async (
  proposalId: number,
  status: Exclude<MarriageProposalStatus, "pending">,
): Promise<void> => {
  await run(
    `UPDATE group_marriage_proposals
     SET status = ?, responded_at_ms = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'pending'`,
    [status, now(), proposalId],
  )
}
