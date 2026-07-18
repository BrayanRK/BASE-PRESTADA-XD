import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "stare",
  alias: ["mirar"],
  description: "Mira fijamente.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["all.chats"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "stare",
      selfCaption: (actor) => `\`${actor}\` mira fijamente ಠ_ಠ`,
    })
  },
} as types.Command
