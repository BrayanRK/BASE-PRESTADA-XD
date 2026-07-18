import * as database from "../../../database/database.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
const done = (text) => `「◈」 *${text}*`;
export default {
    name: "setwelcomemsg",
    alias: ["setwelcome"],
    description: "Modifica el mensaje de bienvenida del grupo",
    category: "group",
    hidden: false,
    flags: ["only.groups"],
    requires: ["administrator.user"],
    execute: async (_wss, { mctx, usedPrefix, args, bot }) => {
        const rawText = mctx.message.text;
        const newWelcomeMessage = rawText.replace(usedPrefix, "").replace(/setwelcome|setwelcomemsg/, "").trim();
        if (!newWelcomeMessage) {
            await mctx.reply([
                done("Uso correcto"),
                `Uso: ${usedPrefix}setwelcome <mensaje>`,
                "Variables: %participant_jid% %participant_name% %group_subject% %group_size% %group_desc%",
            ].join("\n"));
            return;
        }
        await database.Groups.update(getScopedGroupJid(bot, mctx.chat.jid), {
            $set: {
                welcome_message: newWelcomeMessage,
            },
        });
        await mctx.reply(done("Welcome actualizado para este grupo"));
    },
};
