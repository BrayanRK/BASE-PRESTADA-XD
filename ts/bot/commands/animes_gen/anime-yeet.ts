import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "yeet",
  alias: ["lanzar"],
  description: "Lanza a alguien.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["only.groups"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "yeet",
      selfCaption: (actor) => `\`${actor}\` se lanza 🚀`,
      targetCaption: (actor, target) => `\`${actor}\` lanza a \`${target}\` 🚀`,
    })
  },
} as types.Command
