import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "waifu",
  alias: [],
  description: "Muestra una waifu aleatoria.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["all.chats"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "waifu",
      selfCaption: (actor) => `Aquí tienes una waifu para ti, \`${actor}\`! ❤️`,
    })
  },
} as types.Command
