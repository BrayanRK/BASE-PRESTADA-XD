import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "hug",
  alias: ["abrazar"],
  description: "Abraza a alguien.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["only.groups"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "hug",
      selfCaption: (actor) => `\`${actor}\` se abraza 🤗`,
      targetCaption: (actor, target) => `\`${actor}\` abraza a \`${target}\` 🤗`,
    })
  },
} as types.Command
