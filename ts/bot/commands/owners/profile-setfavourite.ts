import * as types from "../../../types/types.js"
import * as database from "../../../database/database.js"
import { getRuntimeGacha } from "../../../libs/gacha.js"

export default <types.Command>{
  name: "setfavourite",
  alias: ["setfav"],
  description: "Establecer tu claim favorito.",
  category: "main",
  using: "[Personaje]",
  hidden: false,
  requires: [],
  flags: ["only.groups"],
  execute: async (_, { mctx, args, bot, group, usedPrefix }) => {
    const query = args.join(" ").replace(/\s+/g, " ").trim()

    if (!query) {
      await mctx.reply(`「♛」 Favorito\n│ Escribe el nombre de un personaje de tu harem.\n╰ Uso › *${usedPrefix}setfav Gojo*`)
      return
    }

    const gacha = getRuntimeGacha(bot, group)
    const character = gacha.findCharacter(query)

    if (!character) {
      await mctx.reply("「⚠」 No encontré ese personaje en el gacha.")
      return
    }

    const owner = gacha.getCharacterOwner(character.id)
    if (owner !== mctx.sender.jid) {
      await mctx.reply(`「⚠」 *${character.name}* no está en tu harem.`)
      return
    }

    await database.Users.update(mctx.sender.jid, {
      $set: {
        favorite_character_id: character.id,
        favorite_character_name: character.name,
      },
    })

    await mctx.reply(`「♛」 Favorito\n│ Claim favorito actualizado.\n╰ Personaje › *${character.name}*`)
  },
}
