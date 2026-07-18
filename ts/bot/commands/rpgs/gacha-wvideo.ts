import type * as types from "../../../types/types.js"
import { formatNumber, getCharacterVideo, getRuntimeGacha, getDisplayName, gachaTitle, sendVideo, usageBlock } from "../../../libs/gacha.js"

export default {
  name: "charvideo",
  alias: ["waifuvideo", "cvideo", "wvideo"],
  description: "Muestra un video aleatorio de un personaje",
  category: "games",
  using: "<nombre>",
  flags: ["only.groups"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, args, bot, group, usedPrefix }) => {
    const query = args.join(" ").trim()
    if (!query) {
      await mctx.react("⚠️")
      await mctx.reply(usageBlock("Video de personaje", [`*${usedPrefix}charvideo* _Goku_`, `*${usedPrefix}wvideo* _Asuka_`]))
      return
    }

    try {
      await mctx.react("🎥")
      const db = getRuntimeGacha(bot, group)
      const char = db.findCharacter(query)
      if (!char) {
        await mctx.reply(`「❀」 No encontré *${query}*.`)
        return
      }

      const video = getCharacterVideo(char)
      if (!video) {
        await mctx.reply(`「❀」 *${char.name}* no tiene videos guardados.`)
        return
      }

      const owner = db.getCharacterOwner(char.id)
      const ownerName = owner ? await getDisplayName(wss, mctx, owner) : "Libre"
      const caption = `${gachaTitle(char.name, "Video aleatorio.")}\n> ✧ Valor › *${formatNumber(char.value)}* ${bot.currency}\n> ✦ Serie › *${char.source}*\n> ❖ Estado › *${owner ? `De ${ownerName}` : "Libre"}*`
      await sendVideo(wss, mctx, video, caption)
      await mctx.react("✅")
    } catch (error) {
      console.error("[Gacha video]", error)
      await mctx.react("❌")
      await mctx.reply(`「❀」 No pude enviar el video.`)
    }
  },
} as types.Command
