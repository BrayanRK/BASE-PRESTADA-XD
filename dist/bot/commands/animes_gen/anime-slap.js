import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "slap",
    alias: ["cachetar", "cachetada"],
    description: "Abofetea a alguien.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["only.groups"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "slap",
            selfCaption: (actor) => `\`${actor}\` se abofetea ✋`,
            targetCaption: (actor, target) => `\`${actor}\` abofetea a \`${target}\` ✋`,
        });
    },
};
