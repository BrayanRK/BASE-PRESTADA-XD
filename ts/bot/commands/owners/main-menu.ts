import * as types from "../../../types/types.js"
import * as libs from "../../../libs/libs.js"
import { getRuntimeChannelUrl } from "../../../libs/zeta_cf.js"
import { mergeCaptionWithMenuMedia } from "../../../libs/zeta_assets.js"
import { getEffectiveBotJid } from "../../../libs/bot-scope.js"
import {
  loadMenuDesign,
  renderMenuCommand,
  renderMenuFooter,
  renderMenuHeader,
  renderMenuSection,
  resolveMenuSectionMeta,
  type MenuDesign,
} from "../../../libs/menu-design.js"

type DisplayCategory = types.CommandCategories | "sockets"

type CategoryMetadata = {
  title: string
  icon: string
  description: string
}

const VERSION = "v1.0.0"
const FOOTER = "© créditos skyultraplus"

const cleanText = (value: unknown, fallback = ""): string => {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()

  return text || fallback
}

const jidDigits = (jid: unknown): string => String(jid ?? "").split("@")[0].replace(/\D/g, "")

const spacer = (): string => {
  return "‎".repeat(900) + "ㅤㅤㅤㅤ"
}

const getUniqueCommands = (): types.Command[] => {
  const map = new Map<string, types.Command>()

  for (const command of libs.Command.loaded.values()) {
    if (!map.has(command.name)) map.set(command.name, command)
  }

  return Array.from(map.values())
}

const commandNames = (prefix: string, command: types.Command): string => {
  const names = Array.from(new Set([command.name, ...(command.alias || [])].filter(Boolean)))
  return names.map((name) => `\`${prefix}${name}\``).join(" ")
}

const commandNameCute = (prefix: string, command: types.Command): string => `${prefix}${command.name}`

const formatUsing = (using?: string): string => {
  const text = cleanText(using)
  return text ? ` _${text}_` : ""
}

const formatUsingCute = (using?: string): string => {
  const text = cleanText(using)
  return text ? ` ${text}` : ""
}

const formatDescription = (description: string | undefined, currency: string): string => {
  return cleanText(description, "Sin descripción.").replace(/\{currency\}/g, currency)
}

const categoryMeta: Partial<Record<DisplayCategory, CategoryMetadata>> = {
  main: {
    title: "PRINCIPAL",
    icon: "💗",
    description: "Comandos principales, perfiles y datos del grupo.",
  },
  extras: {
    title: "EXTRAS Y MULTIJUEGOS",
    icon: "🎮",
    description: "Free Fire, juegos rápidos y dinámicas para grupo.",
  },
  economy: {
    title: "ECONOMÍA",
    icon: "💰",
    description: "Comandos para ganar dinero y divertirte con tus amigos.",
  },
  games: {
    title: "GACHA Y JUEGOS",
    icon: "🎴",
    description: "Reclama personajes, vende, compra e intercambia.",
  },
  group: {
    title: "ADMINISTRACIÓN",
    icon: "🛡️",
    description: "Comandos para administradores de grupos.",
  },
  owner: {
    title: "OWNER",
    icon: "👑",
    description: "Comandos del dueño y herramientas avanzadas.",
  },
  sockets: {
    title: "SOCKETS",
    icon: "🔌",
    description: "Conexiones, QR, códigos premium y configuración de bots.",
  },
  downloaders: {
    title: "DESCARGAS Y BÚSQUEDAS",
    icon: "📥",
    description: "Descarga música, video, redes sociales y busca contenido.",
  },
  utilities: {
    title: "HERRAMIENTAS",
    icon: "🧰",
    description: "Stickers, convertidores y utilidades.",
  },
  pokegame: {
    title: "POKEGAME",
    icon: "👾",
    description: "Captura, entrena y compite.",
  },
  anime: {
    title: "REACCIONES ANIME",
    icon: "🌸",
    description: "GIFs y acciones para interactuar.",
  },
}

const visibleForUser = (
  command: types.Command,
  ctx: {
    userIsAdmin: boolean
    userIsMod: boolean
    userIsOwner: boolean
    userIsBotOwner: boolean
  },
): boolean => {
  if (command.hidden) return false

  if (command.category === "owner") return ctx.userIsOwner || ctx.userIsBotOwner
  if (command.category === "moderation") return ctx.userIsOwner || ctx.userIsBotOwner
  if (command.category === "bot") return ctx.userIsOwner || ctx.userIsBotOwner
  if (command.category === "premb") return ctx.userIsMod || ctx.userIsOwner || ctx.userIsBotOwner

  return true
}

const getDisplayCategory = (command: types.Command): DisplayCategory => {
  if (command.category === "moderation") return "owner"
  if (command.category === "bot" || command.category === "premb") return "sockets"
  return command.category
}

const categoryBlock = (
  category: DisplayCategory,
  commands: types.Command[],
  prefix: string,
  currency: string,
  design: MenuDesign,
): string => {
  const fallbackMeta = categoryMeta[category] || {
    title: String(category).toUpperCase(),
    icon: "💗",
    description: "Comandos disponibles.",
  }
  const meta = resolveMenuSectionMeta(design, category, fallbackMeta)
  const renderedCommands = commands
    .map((command) =>
      renderMenuCommand(design, {
        icon: meta.icon,
        emoji: meta.icon,
        command: design.preset === "custom" ? commandNameCute(prefix, command) : commandNames(prefix, command),
        using: design.preset === "custom" ? formatUsingCute(command.using) : formatUsing(command.using),
        description: formatDescription(command.description, currency),
      }),
    )
    .join("")

  return renderMenuSection(design, {
    icon: meta.icon,
    emoji: meta.icon,
    title: meta.title,
    description: meta.description,
    commands: renderedCommands,
  })
}

export default <types.Command>{
  name: "menu",
  alias: ["help"],
  description: "Muestra todos los comandos disponibles del bot.",
  category: "main",
  flags: ["only.groups"],
  hidden: false,
  requires: [],
  execute: async (
    wss,
    {
      mctx,
      usedPrefix,
      bot,
      userIsAdmin,
      userIsMod,
      userIsOwner,
      userIsBotOwner,
    },
  ) => {
    const senderName = cleanText(mctx.sender.name, "user")
    const botName = cleanText(bot.name, "bot")
    const currency = cleanText(bot.currency, "Coins")
    const botJidForMenu = getEffectiveBotJid(bot) || mctx.me.jids.lid || mctx.me.jids.pn
    const menuDesign = await loadMenuDesign(botJidForMenu)
    const senderNumber = jidDigits(mctx.sender.jid)
    const mention = senderNumber ? `@${senderNumber}` : senderName

    const uniqueCommands = getUniqueCommands()
    const availableCommands = uniqueCommands.filter((cmd) => {
      return visibleForUser(cmd, {
        userIsAdmin,
        userIsMod,
        userIsOwner,
        userIsBotOwner,
      })
    })

    const groupedCommands = availableCommands.reduce((acc, command) => {
      const category = getDisplayCategory(command)
      if (!(category in acc)) acc[category] = []
      acc[category]!.push(command)
      return acc
    }, {} as Partial<Record<DisplayCategory, types.Command[]>>)

    const orderedCategories: DisplayCategory[] = [
      "main",
      "extras",
      "economy",
      "games",
      "pokegame",
      "anime",
      "downloaders",
      "utilities",
      "group",
      "sockets",
      "owner",
    ]

    const channelUrl = getRuntimeChannelUrl()
    const channelLine = channelUrl ? `> *✦* Canal › *${channelUrl}*\n` : ""
    const commonVars = {
      user: senderName,
      mention,
      bot: botName.toUpperCase(),
      version: VERSION,
      type: libs.getBotType(bot.bot_type),
      total: availableCommands.length.toLocaleString("en-US"),
      channel: channelUrl,
      channelLine,
      spacer: spacer(),
      footer: FOOTER,
    }

    let sections = ""

    orderedCategories.forEach((category) => {
      const commands = groupedCommands[category]
      if (!commands?.length) return

      commands.sort((a, b) => a.name.localeCompare(b.name))
      sections += categoryBlock(category, commands, usedPrefix, currency, menuDesign)
      sections += `\n`
    })

    Object.entries(groupedCommands).forEach(([category, rawCommands]) => {
      if (orderedCategories.includes(category as DisplayCategory)) return

      const commands = rawCommands as types.Command[] | undefined
      if (!commands?.length) return

      commands.sort((a, b) => a.name.localeCompare(b.name))
      sections += categoryBlock(category as DisplayCategory, commands, usedPrefix, currency, menuDesign)
      sections += `\n`
    })

    let message = renderMenuHeader(menuDesign, commonVars)
    message += sections
    const footer = renderMenuFooter(menuDesign, commonVars)
    if (footer) message += footer.endsWith("\n") ? footer : `${footer}\n`

    const content = (await mergeCaptionWithMenuMedia("main", message, bot)) as Record<string, any>
    const mentionedJid = senderNumber ? [mctx.sender.jid] : []

    delete content.mentions

    if (mentionedJid.length) {
      content.contextInfo = {
        ...(content.contextInfo || {}),
        mentionedJid,
      }
    }

    await (wss.sendMessage as any)(
      mctx.chat.jid,
      content,
      {
        quoted: mctx.message.original,
      },
    )
  },
}
