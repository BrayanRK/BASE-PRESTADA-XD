import type * as types from "../../../types/types.js"
import { getRuntimeGacha, gachaTitle, sendText, usageBlock } from "../../../libs/gacha.js"

export default {
  name: "setclaimmsg",
  alias: ["setclaim"],
  description: "Personaliza el mensaje al reclamar personaje",
  category: "games",
  using: "<mensaje>",
  flags: ["only.groups"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, args, bot, group, usedPrefix }) => {

    const _raw = mctx.message.text || ""
    const _cmd = `${usedPrefix}setclaimmsg`
    const _alt = `${usedPrefix}setclaim`
    const _idx = _raw.toLowerCase().indexOf(_cmd.toLowerCase()) >= 0
      ? _raw.toLowerCase().indexOf(_cmd.toLowerCase()) + _cmd.length
      : _raw.toLowerCase().indexOf(_alt.toLowerCase()) >= 0
        ? _raw.toLowerCase().indexOf(_alt.toLowerCase()) + _alt.length
        : -1
    const message = (_idx >= 0 ? _raw.slice(_idx).replace(/^[ \t]/, "").trimEnd() : args.join(" ").trim())
    if (!message) {
      await mctx.react("⚠️")
      await mctx.reply(usageBlock("Mensaje de claim", [
        `*${usedPrefix}setclaimmsg* _{user} reclamó a {character}_`,
        "Variables: *{user}* *{nick}* *{character}* *{value}* *{source}* *{currency}*",
      ]))
      return
    }

    try {
      await mctx.react("✏️")
      const db = getRuntimeGacha(bot, group)
      db.setClaimMessage(mctx.sender.jid, message)
      await sendText(wss, mctx, `${gachaTitle("Mensaje guardado", "Se usará cuando reclames personajes.")}\n> Variables disponibles: *{user}* *{nick}* *{character}* *{value}* *{source}* *{currency}*`)
      await mctx.react("✅")
    } catch (error) {
      console.error("[Gacha setclaim]", error)
      await mctx.react("❌")
      await mctx.reply(`「❀」 No pude guardar el mensaje.`)
    }
  },
} as types.Command
