import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "tickle",
    alias: ["cosquilla"],
    description: "Hace cosquillas a alguien.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["only.groups"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "tickle",
            selfCaption: (actor) => `\`${actor}\` se hace cosquillas 🤏`,
            targetCaption: (actor, target) => `\`${actor}\` le hace cosquillas a \`${target}\` 🤏`,
        });
    },
};
