import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "kiss",
  alias: ["besar"],
  description: "Besa a alguien.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["only.groups"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "kiss",
      selfCaption: (actor) => `\`${actor}\` se besa 💋`,
      targetCaption: (actor, target) => `\`${actor}\` besa a \`${target}\` 💋`,
    })
  },
} as types.Command
