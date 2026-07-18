import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "feed",
    alias: ["alimentar"],
    description: "Alimenta a alguien.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["only.groups"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "feed",
            selfCaption: (actor) => `\`${actor}\` se alimenta 🍔`,
            targetCaption: (actor, target) => `\`${actor}\` alimenta a \`${target}\` 🍔`,
        });
    },
};
