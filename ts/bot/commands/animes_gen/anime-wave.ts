import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "wave",
  alias: ["saludar"],
  description: "Saluda con la mano.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["all.chats"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "wave",
      selfCaption: (actor) => `\`${actor}\` saluda con la mano 👋`,
    })
  },
} as types.Command
