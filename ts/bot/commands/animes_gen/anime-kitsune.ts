import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "kitsune",
  alias: [],
  description: "Muestra una kitsune aleatoria.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["all.chats"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "kitsune",
      selfCaption: (actor) => `Aquí tienes una kitsune para ti, \`${actor}\`! 🦊`,
    })
  },
} as types.Command
