import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "highfive",
  alias: ["chocalas", "5"],
  description: "Da un choca 5 a alguien.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["only.groups"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "highfive",
      selfCaption: (actor) => `\`${actor}\` se da un choca esos 5 🙌`,
      targetCaption: (actor, target) => `\`${actor}\` le da un choca los 5 a \`${target}\` 🙌`,
    })
  },
} as types.Command
