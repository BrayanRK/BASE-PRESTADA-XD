import * as database from "../../../database/database.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
const card = (text, lines = []) => [`「◈」 *${text}*`, ...lines].join("\n");
const RESET_OPTIONS = {
    welcome: { field: "welcome_message", label: "Mensaje de bienvenida" },
    bienvenida: { field: "welcome_message", label: "Mensaje de bienvenida" },
    setwelcome: { field: "welcome_message", label: "Mensaje de bienvenida" },
    welcomeimg: { field: "welcome_image_url", label: "Imagen de bienvenida" },
    wellimg: { field: "welcome_image_url", label: "Imagen de bienvenida" },
    imgwelcome: { field: "welcome_image_url", label: "Imagen de bienvenida" },
    farewell: { field: "farewell_message", label: "Mensaje de despedida" },
    bye: { field: "farewell_message", label: "Mensaje de despedida" },
    despedida: { field: "farewell_message", label: "Mensaje de despedida" },
    setfarewell: { field: "farewell_message", label: "Mensaje de despedida" },
    farewellimg: { field: "farewell_image_url", label: "Imagen de despedida" },
    byeimg: { field: "farewell_image_url", label: "Imagen de despedida" },
    imgdespedida: { field: "farewell_image_url", label: "Imagen de despedida" },
};
const resetList = (usedPrefix) => card("Lista de configuraciones", [
    "",
    `• ${usedPrefix}reset welcome`,
    `• ${usedPrefix}reset welcomeimg`,
    `• ${usedPrefix}reset farewell`,
    `• ${usedPrefix}reset farewellimg`,
    "",
    "También puedes usar: bienvenida, despedida, wellimg o byeimg.",
]);
export default {
    name: "reset",
    alias: ["rlist", "resetlist"],
    description: "Restablece configuraciones personalizadas del grupo",
    category: "group",
    hidden: false,
    flags: ["only.groups"],
    requires: ["administrator.user"],
    execute: async (_wss, { mctx, usedPrefix, args, commandName, bot }) => {
        if (["rlist", "resetlist"].includes(String(commandName).toLowerCase())) {
            await mctx.reply(resetList(usedPrefix));
            return;
        }
        const option = args[0]?.toLowerCase();
        if (!option) {
            await mctx.reply(card("Coloca la configuración...", [
                "",
                `Usa ${usedPrefix}rlist o ${usedPrefix}resetlist para ver la lista de configuraciones.`,
            ]));
            return;
        }
        const config = RESET_OPTIONS[option];
        if (!config) {
            await mctx.reply(card("Configuración no encontrada", [
                "",
                `Usa ${usedPrefix}rlist o ${usedPrefix}resetlist para ver las opciones disponibles.`,
            ]));
            return;
        }
        await database.Groups.update(getScopedGroupJid(bot, mctx.chat.jid), {
            $set: {
                [config.field]: "",
            },
        });
        await mctx.reply(card(`${config.label} restablecida`));
    },
};
