import type * as types from "../../../types/types.js"
import { getConnection } from "../../../database/connect.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"

const command: types.Command = {
  name: "pokeinventory",
  alias: ["pinventory", "pinv"],
  description: "Muestra tu inventario de pokémon o el de otro usuario",
  category: "pokegame",
  using: "<@participant>",
  hidden: false,
  flags: ["only.groups"],
  requires: [],
  execute: async (wss, { mctx, group, args, bot }) => {
    const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid)
    const mentioned = mctx.message.mentioned[0] || mctx.sender.jid
    const groupUser = group.users.find((v) => v.user_jid === mentioned)

    if (!groupUser) {
      await mctx.reply(`「⚡」 El participante @${mentioned.split("@")[0]} no está registrado en este grupo.`)
      return
    }

    return new Promise<void>((resolve) => {
      try {
        const conn = getConnection()

        conn.all(
          `SELECT * FROM user_pokemon WHERE user_jid = ? AND group_jid = ? ORDER BY pokemon_name ASC`,
          [mentioned, scopedGroupJid],
          async (err, rows: any[]) => {
            if (err) {
              console.error("[PokeInventory] Error:", err)
              await mctx.reply(`「⚡」 Error al obtener el inventario de pokémon.`)
              resolve()
              return
            }

            if (!rows || rows.length === 0) {
              const message =
                mentioned === mctx.sender.jid
                  ? "No tienes ningún pokémon en tu inventario."
                  : `El participante @${mentioned.split("@")[0]} no tiene ningún pokémon en su inventario.`
              await mctx.reply(`「⚡」 ${message}`)
              resolve()
              return
            }

            const page = Math.max(1, Number.parseInt(args[0]) || 1)
            const limit = 5
            const skip = (page - 1) * limit
            const totalPages = Math.ceil(rows.length / limit)
            const paginatedPokemon = rows.slice(skip, skip + limit)

            const userName = await wss.getName(mentioned)
            let message = `*｢❀｣* Entrenador › *${userName}*\n`
            message += `*｢❀｣* Pokémon › *${rows.length}*\n\n`

            for (let i = 0; i < paginatedPokemon.length; i++) {
              const pokemon = paginatedPokemon[i]
              const baseStats = JSON.parse(pokemon.base_stats)
              const types = JSON.parse(pokemon.pokemon_types)
              const index = skip + i + 1

              message += `*✦* ${index} › *${pokemon.pokemon_name}*\n`
              message += `> *•* Tipo › *${types.join(", ")}*\n`
              message += `> *•* Vida › *${baseStats.hp}*\n`
              message += `> *•* Ataque › *${baseStats.attack}*\n`
              message += `> *•* Defensa › *${baseStats.defense}*\n`
              message += `> *•* Velocidad › *${baseStats.speed}*\n\n`
            }

            if (totalPages > 1) {
              message += `→ Página › *${page}* de *${totalPages}*\n`
              message += `→ Usa › */pinv ${page + 1}* para la siguiente página`
            }

            await mctx.reply(message)
            resolve()
          },
        )
      } catch (error) {
        console.error("[PokeInventory] Error:", error)
        mctx.reply(`「⚡」 Error al procesar el inventario.`)
        resolve()
      }
    })
  },
}

export default command
