import fs from "node:fs"
import path from "node:path"
import { getConnection } from "../database/connect.js"
import * as database from "../database/database.js"

type SqlCharacter = {
  user_id?: string | null
  [key: string]: unknown
}

type SqlHaremEntry = {
  user_id?: string | null
  [key: string]: unknown
}

const runSql = (sql: string, params: unknown[] = []): Promise<number> => {
  return new Promise((resolve) => {
    try {
      getConnection().run(sql, params, function (this: any, err: Error | null) {
        if (err) {
          console.error("[UserWipe.runSql]", err)
          resolve(0)
          return
        }
        resolve(Number(this?.changes || 0))
      })
    } catch (error) {
      console.error("[UserWipe.runSql]", error)
      resolve(0)
    }
  })
}

const dataDir = (): string => path.join(process.cwd(), "database")

const readJsonFile = <T>(file: string, fallback: T): T => {
  try {
    if (!fs.existsSync(file)) return fallback
    const raw = fs.readFileSync(file, "utf8")
    if (!raw.trim()) return fallback
    return JSON.parse(raw) as T
  } catch (error) {
    console.error("[UserWipe.readJsonFile]", file, error)
    return fallback
  }
}

const writeJsonFile = <T>(file: string, data: T): void => {
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

const wipeSharedCharacters = (identities: Set<string>): number => {
  const file = path.join(dataDir(), "characters_shared.json")
  const characters = readJsonFile<SqlCharacter[]>(file, [])
  if (!characters.length) return 0

  let touched = 0
  const next = characters.map((character) => {
    if (character.user_id && identities.has(String(character.user_id))) {
      touched++
      return { ...character, user_id: null, status: "Libre" }
    }
    return character
  })

  if (touched) writeJsonFile(file, next)
  return touched
}

const listHaremFiles = (): string[] => {
  try {
    return fs
      .readdirSync(dataDir())
      .filter((file) => /^harem_.*\.json$/i.test(file))
      .map((file) => path.join(dataDir(), file))
  } catch (error) {
    console.error("[UserWipe.listHaremFiles]", error)
    return []
  }
}

const wipeHaremFiles = (identities: Set<string>): { removed: number; files: number } => {
  let removed = 0
  let files = 0

  for (const file of listHaremFiles()) {
    const harem = readJsonFile<SqlHaremEntry[]>(file, [])
    if (!harem.length) continue

    const next = harem.filter((entry) => !identities.has(String(entry?.user_id)))
    if (next.length !== harem.length) {
      removed += harem.length - next.length
      files++
      writeJsonFile(file, next)
    }
  }

  return { removed, files }
}

export type UserWipeSummary = {
  identities: string[]
  usersDeleted: number
  groupUsersDeleted: number
  pokemonDeleted: number
  marriagesDeleted: number
  proposalsDeleted: number
  gachaCharactersReleased: number
  gachaHaremRemoved: number
  haremFilesTouched: number
}

export const wipeUserData = async (identities: string[]): Promise<UserWipeSummary> => {
  const unique = Array.from(new Set(identities.map((jid) => String(jid || "").trim().toLowerCase()).filter(Boolean)))

  const empty: UserWipeSummary = {
    identities: unique,
    usersDeleted: 0,
    groupUsersDeleted: 0,
    pokemonDeleted: 0,
    marriagesDeleted: 0,
    proposalsDeleted: 0,
    gachaCharactersReleased: 0,
    gachaHaremRemoved: 0,
    haremFilesTouched: 0,
  }

  if (!unique.length) return empty

  let usersDeleted = 0
  for (const jid of unique) {
    const ok = await database.Users.delete(jid)
    if (ok) usersDeleted++
  }

  const placeholders = unique.map(() => "?").join(",")

  const groupUsersDeleted = await runSql(`DELETE FROM group_users WHERE user_jid IN (${placeholders})`, unique)
  const pokemonDeleted = await runSql(`DELETE FROM user_pokemon WHERE user_jid IN (${placeholders})`, unique)

  const marriagesDeleted = await runSql(
    `DELETE FROM group_marriages WHERE user_a_jid IN (${placeholders}) OR user_b_jid IN (${placeholders})`,
    [...unique, ...unique],
  )

  const proposalsDeleted = await runSql(
    `DELETE FROM group_marriage_proposals WHERE proposer_jid IN (${placeholders}) OR target_jid IN (${placeholders})`,
    [...unique, ...unique],
  )

  await runSql(`DELETE FROM gacha_harem WHERE user_id IN (${placeholders})`, unique)
  await runSql(`UPDATE gacha_characters SET user_id = NULL, status = 'Libre' WHERE user_id IN (${placeholders})`, unique)
  await runSql(
    `DELETE FROM gacha_marketplace WHERE seller_id IN (${placeholders}) OR buyer_id IN (${placeholders})`,
    [...unique, ...unique],
  )

  const identitySet = new Set(unique)
  const gachaCharactersReleased = wipeSharedCharacters(identitySet)
  const { removed: gachaHaremRemoved, files: haremFilesTouched } = wipeHaremFiles(identitySet)

  return {
    identities: unique,
    usersDeleted,
    groupUsersDeleted,
    pokemonDeleted,
    marriagesDeleted,
    proposalsDeleted,
    gachaCharactersReleased,
    gachaHaremRemoved,
    haremFilesTouched,
  }
}
