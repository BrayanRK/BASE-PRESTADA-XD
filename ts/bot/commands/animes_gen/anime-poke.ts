import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "poke",
  alias: ["toque", "tocar"],
  description: "Da un toque a alguien.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["only.groups"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "poke",
      selfCaption: (actor) => `\`${actor}\` se da un toque 👆`,
      targetCaption: (actor, target) => `\`${actor}\` le da un toque a \`${target}\` 👆`,
    })
  },
} as types.Command
