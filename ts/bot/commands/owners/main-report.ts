import type * as types from "../../../types/types.js"

const REPORT_JID = "573161325891@s.whatsapp.net"

const cleanText = (value: unknown, fallback = ""): string => {
  const text = String(value ?? "").replace(/\r/g, "").trim()
  return text || fallback
}

const numberFromJid = (jid?: string | null): string =>
  String(jid || "")
    .split(":")[0]
    .split("@")[0]
    .replace(/\D/g, "")

const command: types.Command = {
  name: "report",
  alias: ["reporte", "bug", "sugerencia", "sugerencias", "suggest", "suggestion"],
  description: "Reportar errores o enviar sugerencias al owner.",
  using: "[mensaje]",
  category: "main",
  hidden: false,
  flags: ["all.chats"],
  requires: [],
  execute: async (wss, ctx) => {
    const body = cleanText(ctx.args.join(" "))
    const quoted = cleanText(ctx.mctx.quoted?.message?.text || "")

    if (!body && !quoted) {
      await ctx.mctx.reply(
        `「♛」 Reportes\n│ Uso › *${ctx.usedPrefix}report <error o sugerencia>*\n│ Ejemplo › *${ctx.usedPrefix}report el menú no carga imagen*\n╰ También puedes responder un mensaje y usar *${ctx.usedPrefix}report*.`,
      )
      return
    }

    const type = ["sugerencia", "sugerencias", "suggest", "suggestion"].includes(ctx.commandName)
      ? "SUGERENCIA"
      : "REPORTE"
    const senderNumber = numberFromJid(ctx.mctx.sender.jid)
    const chatNumber = numberFromJid(ctx.mctx.chat.jid)

    let text = `「♛」 ${type} ZETA\n`
    text += `│ Bot › ${ctx.bot.name || ctx.mctx.me.name || "Bot"}\n`
    text += `│ Usuario › ${ctx.mctx.sender.name || "User"} (+${senderNumber || "sin número"})\n`
    text += `│ Chat › ${ctx.mctx.is_group ? ctx.mctx.chat.name || "grupo" : "privado"}\n`
    if (ctx.mctx.is_group) text += `│ ID Grupo › ${ctx.mctx.chat.jid}\n`
    else text += `│ DM › +${chatNumber || senderNumber || "sin número"}\n`
    text += `│ Comando › ${ctx.usedPrefix}${ctx.commandName}\n`
    text += `╰────────────\n\n`
    text += `⟡ Mensaje\n${body || quoted}\n`
    if (quoted && body) text += `\n⟡ Mensaje citado\n${quoted}\n`

    try {
      await wss.sendMessage(REPORT_JID, { text })
      await ctx.mctx.reply(
        `「♛」 Reportes\n│ Estado › enviado\n╰ Gracias, el owner lo revisará.`,
      )
    } catch (error: any) {
      await ctx.mctx.reply(`「✘」 No pude enviar el reporte: ${error?.message || error}`)
    }
  },
}

export default command
