import type * as types from "../../../types/types.js"
import { getConnection } from "../../../database/connect.js"
import * as libs from "../../../libs/libs.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"

const pokemon = [
  {
    id: 1,
    name: "Bulbasaur",
    types: ["Grass", "Poison"],
    base_stat: { hp: 45, attack: 49, defense: 49, speed: 45 },
    sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png",
  },
  {
    id: 4,
    name: "Charmander",
    types: ["Fire"],
    base_stat: { hp: 39, attack: 52, defense: 43, speed: 65 },
    sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png",
  },
  {
    id: 7,
    name: "Squirtle",
    types: ["Water"],
    base_stat: { hp: 44, attack: 48, defense: 65, speed: 43 },
    sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/7.png",
  },
  {
    id: 25,
    name: "Pikachu",
    types: ["Electric"],
    base_stat: { hp: 35, attack: 55, defense: 40, speed: 90 },
    sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png",
  },
  {
    id: 39,
    name: "Jigglypuff",
    types: ["Normal", "Fairy"],
    base_stat: { hp: 115, attack: 45, defense: 20, speed: 20 },
    sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/39.png",
  },
]

const command: types.Command = {
  name: "pokehunt",
  alias: ["phunt"],
  description: "Caza un pokémon salvaje y añádelo a tu colección",
  category: "pokegame",
  flags: ["only.groups"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, group, bot }) => {
    const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid)
    const groupUser = group.users.find((v) => v.user_jid === mctx.sender.jid)
    if (!groupUser) {
      await mctx.reply(`「⚡」 No se pudo obtener tus datos en este grupo, vuelve a intentarlo.`)
      return
    }

    const now = Date.now()
    const miningInterval = 600_000
    const timeDifference = now - groupUser.last_hunt_ago

    if (timeDifference < miningInterval) {
      const remainingTime = miningInterval - timeDifference
      await mctx.reply(
        `*｢✧｣* Debes esperar *${libs.formatDuration(remainingTime)}* para volver a cazar pokémon en este grupo.`,
      )
      return
    }

    const selectedPokemon = libs.pickRandom(pokemon)
    const successRate = Math.random() > 0.5

    try {
      const conn = getConnection()

      if (successRate) {
        let message = "*｢❀｣* Capturaste un nuevo pokémon\n\n"
        message += `> *✦* Nombre › *${selectedPokemon.name}*\n`
        message += `> *✦* Tipo › *${selectedPokemon.types.join(", ")}*\n`
        message += `> *✦* Vida › *${selectedPokemon.base_stat.hp}*\n`
        message += `> *✦* Ataque › *${selectedPokemon.base_stat.attack}*\n`
        message += `> *✦* Defensa › *${selectedPokemon.base_stat.defense}*\n`
        message += `> *✦* Velocidad › *${selectedPokemon.base_stat.speed}*`

        const stmt1 = conn.prepare(`
          UPDATE group_users SET last_hunt_ago = ?
          WHERE group_jid = ? AND user_jid = ?
        `)
        stmt1.run(now, scopedGroupJid, mctx.sender.jid)

        const stmt2 = conn.prepare(`
          INSERT INTO user_pokemon (user_jid, group_jid, pokemon_id, pokemon_name, pokemon_types, base_stats, sprite_url)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        stmt2.run(
          mctx.sender.jid,
          scopedGroupJid,
          selectedPokemon.id,
          selectedPokemon.name,
          JSON.stringify(selectedPokemon.types),
          JSON.stringify(selectedPokemon.base_stat),
          selectedPokemon.sprite,
        )

        await wss.sendMessage(
          mctx.chat.jid,
          {
            image: {
              url: selectedPokemon.sprite,
            },
            caption: message,
          },
          {
            quoted: mctx.message.original,
          },
        )
      } else {
        const itemLabels = {
          berries: "bayas",
          enhancers: "potenciadores",
          cookies: "galletas",
          potions: "pociones",
        }
        const items = ["berries", "enhancers", "cookies", "potions"]
        const item = libs.pickRandom(items)
        let amount = 0

        if (item === "berries") {
          amount = Math.floor(Math.random() * 4) + 1
        } else if (item === "enhancers") {
          amount = Math.floor(Math.random() * 3) + 1
        } else if (item === "cookies") {
          amount = Math.floor(Math.random() * 2) + 1
        } else {
          amount = 1
        }

        const stmt = conn.prepare(`
          UPDATE group_users SET last_hunt_ago = ?, ${item} = ${item} + ?
          WHERE group_jid = ? AND user_jid = ?
        `)
        stmt.run(now, amount, scopedGroupJid, mctx.sender.jid)

        await mctx.reply(`「⚡」 No capturaste ningún pokémon, pero encontraste *${amount}* ${itemLabels[item]}.`)
      }
    } catch (error) {
      console.error("[PokeHunt] Error:", error)
      await mctx.reply(`「⚡」 Error al procesar la caza.`)
    }
  },
}

export default command
