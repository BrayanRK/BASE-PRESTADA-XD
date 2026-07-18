import type * as types from "../../../types/types.js"
import { getEffectiveBotJid } from "../../../libs/bot-scope.js"
import {
  buildTagDesignHelp,
  inferTagDesignFromText,
  loadTagDesign,
  materializeEscapes,
  renderTagDesign,
  resetTagDesign,
  saveTagDesign,
} from "../../../libs/tag-design.js"

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

const okBox = (lines: string[]): string => ["╭─〔 ✦ SETTAG ✦ 〕", ...lines.map((line) => `│ ${line}`), "╰────────────"].join("\n")

const previewText = (design: Awaited<ReturnType<typeof loadTagDesign>>) => {
  return renderTagDesign(design, {
    botName: "BOT DEMO",
    groupName: "Grupo Demo",
    message: "Mensaje opcional",
    users: ["@111111111", "@222222222", "@333333333"],
  })
}

const command: types.Command = {
  name: "settag",
  alias: ["tagset", "tagdesign", "setllamado"],
  description: "Modifica el diseño de hidetag, llamado y todos.",
  category: "owner",
  using: "diseño/plantilla/linea/preview/reset",
  flags: ["all.chats"],
  requires: ["bot.owner"],
  hidden: false,
  execute: async (wss, { mctx, args, bot, usedPrefix, commandName }) => {
    const botJid = getEffectiveBotJid(bot) || mctx.me.jids.lid || mctx.me.jids.pn
    const body = getRawBody(mctx, usedPrefix, commandName, args)
    const [actionRaw, restRaw] = splitFirst(body)
    const action = actionRaw === "diseno" ? "diseño" : actionRaw

    if (!action || ["help", "ayuda", "uso"].includes(action)) {
      await mctx.reply(buildTagDesignHelp(usedPrefix))
      return
    }

    if (["preview", "ver", "vista"].includes(action)) {
      const design = await loadTagDesign(botJid)
      await wss.sendMessage(mctx.chat.jid, { text: previewText(design) }, { quoted: mctx.message.original })
      return
    }

    if (["reset", "default", "reiniciar"].includes(action)) {
      const ok = await resetTagDesign(botJid)
      await mctx.reply(ok ? okBox(["Estado › diseño reiniciado.", `Tip › usa ${usedPrefix}settag preview.`]) : okBox(["Estado › no pude reiniciar el diseño."]))
      return
    }

    const design = await loadTagDesign(botJid)

    if (["diseño", "design", "personalizado", "custom"].includes(action)) {
      const inferred = inferTagDesignFromText(restRaw)
      if (!inferred) {
        await mctx.reply(okBox(["Estado › diseño inválido.", "Requisito › pega una línea con user o usa {users}. "]))
        return
      }

      design.template = inferred.template
      design.userLine = inferred.userLine
      const ok = await saveTagDesign(botJid, design)
      await mctx.reply(ok ? okBox(["Estado › diseño guardado.", `Preview › ${usedPrefix}settag preview`]) : okBox(["Estado › no pude guardar el diseño."]))
      return
    }

    if (["plantilla", "template"].includes(action)) {
      const template = materializeEscapes(restRaw)
      if (!template || !template.includes("{users}")) {
        await mctx.reply(okBox(["Estado › plantilla inválida.", "Requisito › debe incluir {users}. "]))
        return
      }

      design.template = template
      const ok = await saveTagDesign(botJid, design)
      await mctx.reply(ok ? okBox(["Estado › plantilla guardada."]) : okBox(["Estado › no pude guardar la plantilla."]))
      return
    }

    if (["linea", "línea", "user", "usuario"].includes(action)) {
      const line = materializeEscapes(restRaw)
      if (!line || !line.includes("{user}")) {
        await mctx.reply(okBox(["Estado › línea inválida.", "Requisito › debe incluir {user}. "]))
        return
      }

      design.userLine = line
      const ok = await saveTagDesign(botJid, design)
      await mctx.reply(ok ? okBox(["Estado › línea de usuario guardada.", "Detalle › cada usuario saldrá en su propia línea."]) : okBox(["Estado › no pude guardar la línea."]))
      return
    }

    await mctx.reply(buildTagDesignHelp(usedPrefix))
  },
}

export default command
