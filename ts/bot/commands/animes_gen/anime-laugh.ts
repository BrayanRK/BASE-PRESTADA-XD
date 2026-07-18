import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "laugh",
  alias: ["reir"],
  description: "Ríe.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["all.chats"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "laugh",
      selfCaption: (actor) => `\`${actor}\` se ríe 😂`,
    })
  },
} as types.Command
