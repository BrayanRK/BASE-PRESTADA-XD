import * as database from "../database/database.js"

export type MenuDesignPreset = "clasico" | "iphone" | "compacto" | "simple" | "custom"

export type MenuDesign = {
  preset: MenuDesignPreset
  titles: Record<string, string>
  icons: Record<string, string>
  descriptions: Record<string, string>
  headerTemplate?: string
  sectionTemplate?: string
  commandTemplate?: string
  footerTemplate?: string
}

export type MenuSectionMeta = {
  title: string
  icon: string
  description: string
}

export const MENU_DESIGN_KEY = "menu_design:main"

const PRESET_NAMES: MenuDesignPreset[] = ["clasico", "iphone", "compacto", "simple", "custom"]

const cleanText = (value: unknown, fallback = ""): string => {
  const text = String(value ?? "").trim()
  return text || fallback
}

const normalizeKey = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "")
    .trim()

export const normalizeMenuCategory = (value: unknown): string => {
  const key = normalizeKey(value)
  const aliases: Record<string, string> = {
    principal: "main",
    main: "main",
    inicio: "main",
    extras: "extras",
    juegos: "games",
    juego: "games",
    game: "games",
    games: "games",
    gacha: "games",
    gachas: "games",
    economia: "economy",
    economic: "economy",
    economy: "economy",
    rpg: "economy",
    grupo: "group",
    grupos: "group",
    admin: "group",
    admins: "group",
    administracion: "group",
    group: "group",
    descargas: "downloaders",
    descarga: "downloaders",
    busquedas: "downloaders",
    busqueda: "downloaders",
    downloaders: "downloaders",
    herramientas: "utilities",
    herramienta: "utilities",
    utilities: "utilities",
    utilidad: "utilities",
    owner: "owner",
    owners: "owner",
    dueno: "owner",
    dueño: "owner",
    sockets: "sockets",
    socket: "sockets",
    bots: "sockets",
    bot: "sockets",
    anime: "anime",
    animes: "anime",
    pokegame: "pokegame",
    pokemon: "pokegame",
  }

  return aliases[key] || key
}

export const isMenuPreset = (value: unknown): value is MenuDesignPreset => {
  return PRESET_NAMES.includes(String(value || "").toLowerCase() as MenuDesignPreset)
}

export const menuPresetNames = (): MenuDesignPreset[] => [...PRESET_NAMES]

const defaultDesign = (): MenuDesign => ({
  preset: "clasico",
  titles: {},
  icons: {},
  descriptions: {},
})

const safeJsonParse = (value: string): Partial<MenuDesign> | null => {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

const normalizeStringRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object") return {}

  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = normalizeMenuCategory(key)
    const text = cleanText(raw)
    if (normalizedKey && text) out[normalizedKey] = text
  }
  return out
}

const normalizeDesign = (input?: Partial<MenuDesign> | null): MenuDesign => {
  const base = defaultDesign()
  const preset = isMenuPreset(input?.preset) ? input!.preset : base.preset

  return {
    preset,
    titles: normalizeStringRecord(input?.titles),
    icons: normalizeStringRecord(input?.icons),
    descriptions: normalizeStringRecord(input?.descriptions),
    headerTemplate: cleanText(input?.headerTemplate),
    sectionTemplate: cleanText(input?.sectionTemplate),
    commandTemplate: cleanText(input?.commandTemplate),
    footerTemplate: cleanText(input?.footerTemplate),
  }
}

export const loadMenuDesign = async (botJid: string): Promise<MenuDesign> => {
  const raw = await database.BotSettings.get(botJid, MENU_DESIGN_KEY)
  if (!raw) return defaultDesign()
  return normalizeDesign(safeJsonParse(raw))
}

export const saveMenuDesign = async (botJid: string, design: Partial<MenuDesign>): Promise<boolean> => {
  const clean = normalizeDesign(design)
  return database.BotSettings.set(botJid, MENU_DESIGN_KEY, JSON.stringify(clean))
}

export const resetMenuDesign = async (botJid: string): Promise<boolean> => {
  return saveMenuDesign(botJid, defaultDesign())
}

const presetTemplates = (preset: MenuDesignPreset) => {
  switch (preset) {
    case "iphone":
      return {
        headerTemplate:
          "╭─「 {bot} 」\n" +
          "│ Hola {mention}\n" +
          "│ Versión: {version}\n" +
          "│ Tipo: {type}\n" +
          "│ Comandos: {total}\n" +
          "{channelLine}" +
          "╰──────────────{spacer}\n\n",
        sectionTemplate: "╭─「 {icon} {title} 」\n│ {description}\n{commands}╰──────────────\n",
        commandTemplate: "│ • {command}{using}\n│   {description}\n",
        footerTemplate: "",
      }
    case "compacto":
      return {
        headerTemplate: "*{bot}* › {mention}\nVersión: {version} | Tipo: {type} | Comandos: {total}\n{channelLine}{spacer}\n\n",
        sectionTemplate: "┌ {icon} *{title}*\n{commands}└────\n",
        commandTemplate: "│ {command}{using} — {description}\n",
        footerTemplate: "",
      }
    case "simple":
      return {
        headerTemplate: "*{bot}*\nHola {mention}\nComandos: {total}\n{channelLine}{spacer}\n\n",
        sectionTemplate: "*{icon} {title}*\n{commands}\n",
        commandTemplate: "• {command}{using}\n  {description}\n",
        footerTemplate: "",
      }
    case "custom":
      return {
        headerTemplate: "",
        sectionTemplate: "{title}\n{commands}\n",
        commandTemplate: "{command}{using}\n",
        footerTemplate: "",
      }
    case "clasico":
    default:
      return {
        headerTemplate:
          "⏜᷼ᩘ۪۪۪۪⏜۪۪۪۪۪᷼︵᷼       ❀      ⏜᷼ᩘ۪۪۪۪⏜۪۪۪۪۪᷼︵᷼\n" +
          "> Hola *{user}* soy *{bot}*, bienvenidx a mi menú.\n" +
          "╭┈┈↷\n" +
          "> *✦* Versión › *{version}*\n" +
          "> *✦* Tipo › *{type}*\n" +
          "> *✦* Comandos totales › *{total}*\n" +
          "> ­\n" +
          "{channelLine}" +
          "╰ ━ ─ ━ ─ ☞︎︎︎ ✰ ☜︎︎︎ ─ ━ ─ ━ ╯{spacer}\n\n",
        sectionTemplate:
          "╭┈ ࣪ {icon}⌒⏜ ׅ *{title}* ㅤ  ꒢∩᷼⌒\n ┆┆{description}\n{commands} ╰۫╼࣪╼࣪╾ ○ ···𖹭 ִֶ •┄┈┈┈┈┈┈┈┈• •┄ׅ꣸⃪ꠋ᰷\n",
        commandTemplate: " ┆╭┈ *○* • 🌾·ઈ {command}{using}\n ┆┆{description}\n",
        footerTemplate: "ㅤㅤㅤ⏜𖣣︶         {footer} ׂᅟᅟ︶𖣣⏜\n                      ͝  ͝ ⏝             ⃜          ⏝ ͝  ͝",
      }
  }
}

export const materializeEscapes = (value: string): string => {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
}

const applyTemplate = (template: string, vars: Record<string, string>): string => {
  const withAliases: Record<string, string> = {
    ...vars,
    emoji: vars.emoji || vars.icon || "",
    icon: vars.icon || vars.emoji || "",
  }

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => withAliases[key] ?? "")
}

export const parseCustomMenuDesign = (rawTemplate: string): Partial<MenuDesign> | null => {
  const template = materializeEscapes(rawTemplate).trim()
  if (!template) return null
  if (!/\{title\}/i.test(template) || !/\{commands\}/i.test(template)) return null

  const lines = template.split("\n")
  const titleIndex = lines.findIndex((line) => /\{title\}/i.test(line))
  const commandsIndex = lines.findIndex((line) => /\{commands\}/i.test(line))
  if (titleIndex === -1 || commandsIndex === -1) return null

  const anchorIndex = Math.min(titleIndex, commandsIndex)
  let sectionStart = anchorIndex

  while (sectionStart > 0 && lines[sectionStart - 1].trim() !== "") {
    sectionStart--
  }

  const headerLines = lines.slice(0, sectionStart)
  const sectionLines = lines.slice(sectionStart)
  const commandLineIndex = commandsIndex - sectionStart
  const commandLine = sectionLines[commandLineIndex] || "{commands}"

  sectionLines[commandLineIndex] = "{commands}"

  const headerTemplate = headerLines.join("\n").trimEnd()
  const sectionTemplate = `${sectionLines.join("\n").trimEnd()}\n`





  const commandLineTemplate = commandLine.replace(/\{commands\}/gi, "{command}{using}")
  const commandTemplate = `${commandLineTemplate}\n   {description}\n\n`

  return {
    preset: "custom",
    headerTemplate: headerTemplate ? `${headerTemplate}\n\n` : "",
    sectionTemplate,
    commandTemplate,
    footerTemplate: "",
  }
}

export const resolveMenuSectionMeta = (
  design: MenuDesign,
  category: string,
  fallback: MenuSectionMeta,
): MenuSectionMeta => {
  const key = normalizeMenuCategory(category)
  return {
    title: cleanText(design.titles[key], fallback.title),
    icon: cleanText(design.icons[key], fallback.icon),
    description: cleanText(design.descriptions[key], fallback.description),
  }
}

export const renderMenuHeader = (design: MenuDesign, vars: Record<string, string>): string => {
  const templates = presetTemplates(design.preset)
  const template = materializeEscapes(design.headerTemplate || templates.headerTemplate)
  return applyTemplate(template, vars)
}

export const renderMenuFooter = (design: MenuDesign, vars: Record<string, string>): string => {
  const templates = presetTemplates(design.preset)
  const template = materializeEscapes(design.footerTemplate || templates.footerTemplate)
  if (!template) return ""
  return applyTemplate(template, vars)
}

export const renderMenuCommand = (
  design: MenuDesign,
  vars: {
    icon?: string
    emoji?: string
    command: string
    using: string
    description: string
  },
): string => {
  const templates = presetTemplates(design.preset)
  const template = materializeEscapes(design.commandTemplate || templates.commandTemplate)
  const rendered = applyTemplate(template, {
    icon: vars.icon || vars.emoji || "💗",
    emoji: vars.emoji || vars.icon || "💗",
    command: vars.command,
    using: vars.using,
    description: vars.description,
  })

  if (design.preset !== "custom") return rendered

  return `${rendered.trimEnd()}\n\n`
}

export const renderMenuSection = (
  design: MenuDesign,
  vars: {
    icon: string
    emoji?: string
    title: string
    description: string
    commands: string
  },
): string => {
  const templates = presetTemplates(design.preset)
  const template = materializeEscapes(design.sectionTemplate || templates.sectionTemplate)
  return applyTemplate(template, {
    ...vars,
    emoji: vars.emoji || vars.icon,
  })
}

export const buildMenuDesignHelp = (prefix: string): string => {
  return [
    "╭─〔 ✦ SETMENU ✦ 〕",
    "│ Cambia emojis, títulos y líneas del menú.",
    "╰────────────",
    "",
    `│ Emoji › ${prefix}setmenu emoji main | 🌙`,
    `│ Título › ${prefix}setmenu titulo group | ADMIN`,
    `│ Desc › ${prefix}setmenu desc games | Gacha y juegos`,
    `│ Línea › ${prefix}setmenu comando │ ◦ {command}{using}`,
    `│ Ver › ${prefix}setmenu preview`,
    `│ Reset › ${prefix}setmenu reset`,
    "",
    "│ Secciones › main, group, owner, sockets, games, extras, shop, downloaders",
  ].join("\n")
}
