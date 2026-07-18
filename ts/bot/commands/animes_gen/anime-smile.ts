import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "smile",
  alias: ["sonreir"],
  description: "Sonríe.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["all.chats"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "smile",
      selfCaption: (actor) => `\`${actor}\` sonríe 😊`,
    })
  },
} as types.Command
