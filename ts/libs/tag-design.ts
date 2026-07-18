import * as database from "../database/database.js"

export type TagDesign = {
  template: string
  userLine: string
}

export const TAG_DESIGN_KEY = "tag_design:main"

const cleanText = (value: unknown, fallback = "") => {
  const text = String(value ?? "").trim()
  return text || fallback
}

const ensureTrailingNewline = (value: string): string => {
  const text = String(value || "")
  if (!text) return ""
  return text.endsWith("\n") ? text : `${text}\n`
}

const defaultDesign = (): TagDesign => ({
  template:
    "╭─〔 ✦ INVOCACIÓN GENERAL ✦ 〕\n" +
    "│ ✦ Bot › {bot}\n" +
    "│ ✦ Grupo › {group}\n" +
    "│ ✦ Integrantes › {count}\n" +
    "╰────────────\n" +
    "{messageBlock}" +
    "╭─〔 👥 USUARIOS 〕\n" +
    "{users}" +
    "╰────────────",
  userLine: "│ ◦ {user}\n",
})

const safeJsonParse = (value: string): Partial<TagDesign> | null => {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

const normalizeDesign = (value?: Partial<TagDesign> | null): TagDesign => {
  const base = defaultDesign()
  return {
    template: cleanText(value?.template, base.template),
    userLine: ensureTrailingNewline(cleanText(value?.userLine, base.userLine)),
  }
}

export const materializeEscapes = (value: string): string => {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
}

export const loadTagDesign = async (botJid: string): Promise<TagDesign> => {
  const raw = await database.BotSettings.get(botJid, TAG_DESIGN_KEY)
  if (!raw) return defaultDesign()
  return normalizeDesign(safeJsonParse(raw))
}

export const saveTagDesign = async (botJid: string, design: Partial<TagDesign>): Promise<boolean> => {
  const clean = normalizeDesign(design)
  return database.BotSettings.set(botJid, TAG_DESIGN_KEY, JSON.stringify(clean))
}

export const resetTagDesign = async (botJid: string): Promise<boolean> => {
  return saveTagDesign(botJid, defaultDesign())
}

const applyTemplate = (template: string, vars: Record<string, string>): string => {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => vars[key] ?? "")
}

export const renderTagDesign = (
  design: TagDesign,
  data: {
    users: string[]
    botName: string
    groupName: string
    message?: string
  },
): string => {
  const userLineTemplate = ensureTrailingNewline(materializeEscapes(design.userLine))
  const userLines = data.users
    .map((user, index) =>
      applyTemplate(userLineTemplate, {
        user,
        index: String(index + 1),
        number: user.replace(/\D/g, ""),
      }),
    )
    .join("")

  const rawMessage = cleanText(data.message)
  const messageBlock = rawMessage ? `│ ✦ Mensaje › ${rawMessage}\n╰────────────\n` : ""

  return applyTemplate(materializeEscapes(design.template), {
    users: userLines,
    count: String(data.users.length),
    bot: data.botName,
    group: data.groupName,
    message: rawMessage,
    messageBlock,
  })
}

export const inferTagDesignFromText = (rawTemplate: string): Pick<TagDesign, "template" | "userLine"> | null => {
  const template = materializeEscapes(rawTemplate).trim()
  if (!template) return null

  if (template.includes("{users}")) {
    return {
      template,
      userLine: "│ ◦ {user}\n",
    }
  }

  const lines = template.split("\n")
  const userLineIndex = lines.findIndex((line) => /\buser\d*\b|\busuario\d*\b|@user\d*|@usuario\d*/i.test(line))
  if (userLineIndex === -1) return null

  const userLine = ensureTrailingNewline(lines[userLineIndex].replace(/@?user\d*|@?usuario\d*/gi, "{user}"))
  const rebuilt: string[] = []
  let insertedUsers = false

  for (const line of lines) {
    if (/\buser\d*\b|\busuario\d*\b|@user\d*|@usuario\d*/i.test(line)) {
      if (!insertedUsers) {
        rebuilt.push("{users}")
        insertedUsers = true
      }
      continue
    }
    rebuilt.push(line)
  }

  return {
    template: rebuilt.join("\n"),
    userLine,
  }
}

export const buildTagDesignHelp = (prefix: string): string => {
  return [
    "╭─〔 ✦ SETTAG ✦ 〕",
    "│ Cambia el diseño de .hidetag, .llamado y .todos.",
    "│ Los usuarios siempre saldrán uno debajo del otro.",
    "╰────────────",
    "",
    `│ Uso › ${prefix}settag diseño <pega tu diseño>`,
    `│ Uso › ${prefix}settag plantilla texto {users}`,
    `│ Uso › ${prefix}settag linea │ ◦ {user}`,
    `│ Uso › ${prefix}settag preview`,
    `│ Uso › ${prefix}settag reset`,
    "",
    "│ Variables plantilla › {users}, {count}, {bot}, {group}, {message}, {messageBlock}",
    "│ Variables línea › {user}, {index}, {number}",
  ].join("\n")
}
