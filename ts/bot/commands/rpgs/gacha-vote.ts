import type * as types from "../../../types/types.js"
import { formatNumber, getRuntimeGacha, gachaTitle, sendText, usageBlock } from "../../../libs/gacha.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"

const cooldowns = new Map<string, number>()
const characterCooldowns = new Map<string, number>()

export default {
  name: "vote",
  alias: ["votar"],
  description: "Vota por un personaje para subir su valor",
  category: "games",
  using: "<nombre>",
  flags: ["only.groups"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, args, bot, group, usedPrefix }) => {
    const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid)
    const name = args.join(" ").trim()
    if (!name) {
      await mctx.react("⚠️")
      await mctx.reply(usageBlock("Votar", [`*${usedPrefix}vote* _Goku_`, `*${usedPrefix}votar* _Rem_`]))
      return
    }

    const userKey = `${scopedGroupJid}:${mctx.sender.jid}`
    const userLeft = (cooldowns.get(userKey) || 0) - Date.now()
    if (userLeft > 0) {
      await mctx.react("⏳")
      await mctx.reply(`「❀」 Espera *${Math.ceil(userLeft / 60000)} min* para votar de nuevo.`)
      return
    }

    try {
      await mctx.react("⭐")
      const db = getRuntimeGacha(bot, group)
      const char = db.findCharacter(name)
      if (!char) {
        await mctx.reply(`「❀」 No encontré *${name}*.`)
        return
      }

      const charLeft = (characterCooldowns.get(char.id) || 0) - Date.now()
      if (charLeft > 0) {
        await mctx.reply(`「❀」 *${char.name}* ya recibió voto reciente. Espera *${Math.ceil(charLeft / 60000)} min*.`)
        return
      }

      const result = db.voteCharacter(char.id)
      if (!result.ok) {
        await mctx.reply(`「❀」 No pude votar por ese personaje.`)
        return
      }

      cooldowns.set(userKey, Date.now() + 60 * 60 * 1000)
      characterCooldowns.set(char.id, Date.now() + 60 * 60 * 1000)

      await sendText(wss, mctx, `${gachaTitle("Voto registrado", char.name)}\n> ✧ Subió › *+${formatNumber(result.increment || 0)}*\n> ✦ Valor actual › *${formatNumber(result.newValue || 0)}* ${bot.currency}\n> ✩ Votos › *${formatNumber(result.votes || 0)}*`)
      await mctx.react("✅")
    } catch (error) {
      console.error("[Gacha vote]", error)
      await mctx.react("❌")
      await mctx.reply(`「❀」 No pude registrar el voto.`)
    }
  },
} as types.Command
