import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "smug",
  alias: [],
  description: "Muestra una sonrisa 😏.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["all.chats"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "smug",
      selfCaption: (actor) => `\`${actor}\` sonríe con suficiencia 😏`,
    })
  },
} as types.Command
