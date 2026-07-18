import type * as types from "../../../types/types.js"
import { getEffectiveBotJid } from "../../../libs/bot-scope.js"
import {
  buildMenuDesignHelp,
  isMenuPreset,
  loadMenuDesign,
  materializeEscapes,
  normalizeMenuCategory,
  parseCustomMenuDesign,
  renderMenuCommand,
  renderMenuFooter,
  renderMenuHeader,
  renderMenuSection,
  resetMenuDesign,
  saveMenuDesign,
} from "../../../libs/menu-design.js"

const okBox = (lines: string[]): string => ["╭─〔 ✦ SETMENU ✦ 〕", ...lines.map((line) => `│ ${line}`), "╰────────────"].join("\n")

const getRawBody = (
  mctx: types.MessageContext,
  usedPrefix: string,
  commandName: string,
  args: string[],
): string => {
  const rawText = String(mctx.message.text || "")
  const leftTrimmed = rawText.trimStart()
  const fallback = args.join(" ")

  if (!usedPrefix || !leftTrimmed.startsWith(usedPrefix)) return fallback

  const body = leftTrimmed.slice(usedPrefix.length)
  const commandMatch = body.match(/^\S+/)
  if (!commandMatch) return fallback

  return body.slice(commandMatch[0].length).replace(/^[ \t\r\n]/, "")
}

const splitFirst = (value: string): [string, string] => {
  const text = String(value || "").trimStart()
  const match = text.match(/^\S+/)
  if (!match) return ["", ""]
  return [match[0].toLowerCase(), text.slice(match[0].length).trimStart()]
}

const parsePair = (value: string): { key: string; value: string } | null => {
  const text = String(value || "").trim()
  const pipeIndex = text.indexOf("|")

  if (pipeIndex !== -1) {
    const key = text.slice(0, pipeIndex).trim()
    const rest = text.slice(pipeIndex + 1).trim()
    if (!key || !rest) return null
    return { key: normalizeMenuCategory(key), value: rest }
  }

  const [key, rest] = splitFirst(text)
  if (!key || !rest) return null
  return { key: normalizeMenuCategory(key), value: rest }
}

const previewText = (design: Awaited<ReturnType<typeof loadMenuDesign>>): string => {
  const commands = [
    renderMenuCommand(design, {
      icon: "🌙",
      emoji: "🌙",
      command: ".menu",
      using: "",
      description: "Muestra el menú principal.",
    }),
    renderMenuCommand(design, {
      icon: "🌙",
      emoji: "🌙",
      command: ".todos",
      using: " [mensaje]",
      description: "Menciona a todos sin romper el estilo.",
    }),
  ].join("")

  const header = renderMenuHeader(design, {
    user: "Lucas",
    mention: "@123456789",
    bot: "BOT",
    version: "v1.0.0",
    type: "Ⓟremium",
    total: "99",
    channel: "https://whatsapp.com/channel/demo",
    channelLine: "> *✦* Canal › *https://whatsapp.com/channel/demo*\n",
    spacer: "",
    footer: "© créditos skyultraplus",
  })

  const section = renderMenuSection(design, {
    icon: "🌙",
    emoji: "🌙",
    title: "VISTA PREVIA",
    description: "Así se verá una sección del menú.",
    commands,
  })

  const footer = renderMenuFooter(design, { footer: "© créditos skyultraplus" })
  return `${header}${section}${footer}`.trimEnd()
}

const saveAndReply = async (
  mctx: types.MessageContext,
  botJid: string,
  design: Awaited<ReturnType<typeof loadMenuDesign>>,
  okText: string,
) => {
  const ok = await saveMenuDesign(botJid, design)
  await mctx.reply(ok ? okText : okBox(["Estado › no pude guardar el diseño del menú."]))
}

export default {
  name: "setmenu",
  alias: ["menuset", "menudesign", "setmenudiseño", "setmenudiseno"],
  description: "Modifica el diseño completo del menú principal.",
  category: "owner",
  using: "diseño/titulo/emoji/descripcion/plantilla/comando/footer/reset",
  flags: ["all.chats"],
  requires: ["bot.owner"],
  hidden: false,
  execute: async (wss, { mctx, args, bot, usedPrefix, commandName }) => {
    const botJid = getEffectiveBotJid(bot) || mctx.me.jids.lid || mctx.me.jids.pn
    const body = getRawBody(mctx, usedPrefix, commandName, args)
    const [actionRaw, restRaw] = splitFirst(body)
    const action = actionRaw === "diseno" ? "diseño" : actionRaw

    if (!action || ["help", "ayuda", "uso"].includes(action)) {
      await mctx.reply(buildMenuDesignHelp(usedPrefix))
      return
    }

    if (["preview", "ver", "vista"].includes(action)) {
      const design = await loadMenuDesign(botJid)
      await wss.sendMessage(mctx.chat.jid, { text: previewText(design) }, { quoted: mctx.message.original })
      return
    }

    if (["reset", "default", "reiniciar"].includes(action)) {
      const ok = await resetMenuDesign(botJid)
      await mctx.reply(ok ? okBox(["Estado › diseño del menú reiniciado.", `Preview › ${usedPrefix}setmenu preview`]) : okBox(["Estado › no pude reiniciar el diseño del menú."]))
      return
    }

    const design = await loadMenuDesign(botJid)

    if (["diseño", "design"].includes(action)) {
      const template = materializeEscapes(restRaw)

      if (isMenuPreset(template.toLowerCase()) && template.toLowerCase() !== "custom") {
        design.preset = template.toLowerCase() as any
        design.headerTemplate = ""
        design.sectionTemplate = ""
        design.commandTemplate = ""
        design.footerTemplate = ""
        await saveAndReply(mctx, botJid, design, okBox([`Diseño › ${design.preset}`, "Estado › guardado.", `Vista › ${usedPrefix}menu`]))
        return
      }

      const parsed = parseCustomMenuDesign(template)
      if (!parsed) {
        await mctx.reply(okBox(["Estado › diseño inválido.", "Requisito › debe contener {title} y {commands}. "]))
        return
      }

      Object.assign(design, parsed)
      await saveAndReply(mctx, botJid, design, okBox(["Estado › diseño personalizado guardado.", `Preview › ${usedPrefix}setmenu preview`]))
      return
    }

    if (isMenuPreset(action) && action !== "custom") {
      design.preset = action as any
      design.headerTemplate = ""
      design.sectionTemplate = ""
      design.commandTemplate = ""
      design.footerTemplate = ""
      await saveAndReply(mctx, botJid, design, okBox([`Diseño › ${action}`, "Estado › guardado.", `Vista › ${usedPrefix}menu`]))
      return
    }

    if (["titulo", "title"].includes(action)) {
      const pair = parsePair(restRaw)
      if (!pair) {
        await mctx.reply(okBox([`Uso › ${usedPrefix}setmenu titulo group | ADMIN DEL GRUPO`]))
        return
      }
      design.titles[pair.key] = pair.value
      await saveAndReply(mctx, botJid, design, okBox([`Sección › ${pair.key}`, `Título › ${pair.value}`, "Estado › guardado."]))
      return
    }

    if (["icono", "icon", "emoji"].includes(action)) {
      const pair = parsePair(restRaw)
      if (!pair) {
        await mctx.reply(okBox([`Uso › ${usedPrefix}setmenu emoji group | 🌙`]))
        return
      }
      design.icons[pair.key] = pair.value
      await saveAndReply(mctx, botJid, design, okBox([`Sección › ${pair.key}`, `Emoji › ${pair.value}`, "Estado › guardado."]))
      return
    }

    if (["descripcion", "description", "desc"].includes(action)) {
      const pair = parsePair(restRaw)
      if (!pair) {
        await mctx.reply(okBox([`Uso › ${usedPrefix}setmenu descripcion group | comandos para admins`]))
        return
      }
      design.descriptions[pair.key] = pair.value
      await saveAndReply(mctx, botJid, design, okBox([`Sección › ${pair.key}`, "Estado › descripción guardada."]))
      return
    }

    if (["inicio", "header", "cabecera"].includes(action)) {
      const template = materializeEscapes(restRaw)
      if (!template) {
        await mctx.reply(okBox([`Uso › ${usedPrefix}setmenu inicio ╭─〔 ✦ {bot} ✦ 〕`]))
        return
      }
      design.headerTemplate = template.endsWith("\n") ? template : `${template}\n`
      await saveAndReply(mctx, botJid, design, okBox(["Estado › cabecera guardada."]))
      return
    }

    if (["plantilla", "section", "seccion", "sección", "bloque"].includes(action)) {
      const template = materializeEscapes(restRaw)
      if (!template || !/\{commands\}/i.test(template)) {
        await mctx.reply(okBox(["Estado › plantilla inválida.", "Requisito › debe incluir {commands}. "]))
        return
      }
      design.sectionTemplate = template.endsWith("\n") ? template : `${template}\n`
      await saveAndReply(mctx, botJid, design, okBox(["Estado › plantilla de sección guardada."]))
      return
    }

    if (["comando", "cmd", "linea", "línea"].includes(action)) {
      const template = materializeEscapes(restRaw)
      if (!template || !/\{command\}/i.test(template)) {
        await mctx.reply(okBox(["Estado › línea inválida.", `Ejemplo › ${usedPrefix}setmenu comando │ ◦ {command}{using}`]))
        return
      }
      design.commandTemplate = template.endsWith("\n") ? template : `${template}\n`
      await saveAndReply(mctx, botJid, design, okBox(["Estado › línea de comando guardada."]))
      return
    }

    if (["footer", "pie"].includes(action)) {
      const template = materializeEscapes(restRaw)
      design.footerTemplate = template ? (template.endsWith("\n") ? template : `${template}\n`) : ""
      await saveAndReply(mctx, botJid, design, okBox(["Estado › footer guardado."]))
      return
    }

    await mctx.reply(buildMenuDesignHelp(usedPrefix))
  },
} as types.Command
