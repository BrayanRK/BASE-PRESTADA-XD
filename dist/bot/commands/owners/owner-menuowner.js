import * as libs from "../../../libs/libs.js";
import { getBotType } from "../../../libs/libs.js";
const cleanText = (value, fallback = "") => {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    return text || fallback;
};
const getUniqueCommands = () => {
    const map = new Map();
    for (const command of libs.Command.loaded.values()) {
        if (!command?.name)
            continue;
        if (!map.has(command.name))
            map.set(command.name, command);
    }
    return Array.from(map.values());
};
const commandNames = (prefix, command) => {
    const alias = Array.isArray(command.alias) ? command.alias : [];
    const names = Array.from(new Set([command.name, ...alias].filter(Boolean)));
    return names.map((name) => `\`${prefix}${name}\``).join(" ");
};
const formatFlags = (command) => {
    const requires = Array.isArray(command.requires) ? command.requires : [];
    const flags = Array.isArray(command.flags) ? command.flags : [];
    const bits = [];
    if (requires.includes("bot.owner"))
        bits.push("owner bot");
    if (requires.includes("owner.user"))
        bits.push("owner sistema");
    if (requires.includes("moderator.user"))
        bits.push("mod");
    if (flags.includes("only.groups"))
        bits.push("grupo");
    if (flags.includes("only.private"))
        bits.push("privado");
    if (command.hidden)
        bits.push("oculto");
    return bits.length ? ` _(${bits.join(" · ")})_` : "";
};
const sectionMeta = {
    control: { title: "CONTROL DEL BOT", icon: "👑", desc: "Ajustes directos del bot y sus menús." },
    sockets: { title: "SOCKETS Y CONFIG", icon: "🔌", desc: "Vinculación, identidad y control de sockets." },
    premium: { title: "PREMIUM", icon: "💎", desc: "Gestión de premium, rangos y comprobaciones." },
    sistema: { title: "SISTEMA", icon: "🖥️", desc: "Recarga, update, system y herramientas internas." },
    moderacion: { title: "MODERACIÓN", icon: "🛡️", desc: "Silencio, automods y control del grupo." },
    rangos: { title: "RANGOS", icon: "🏷️", desc: "Owners, rangos y permisos del sistema." },
    otros: { title: "OTROS", icon: "⚙️", desc: "Comandos owner que no entran en otra sección." },
};
const ownerOnly = (command) => {
    const requires = Array.isArray(command.requires) ? command.requires : [];
    return requires.includes("bot.owner") || requires.includes("owner.user");
};
const getSection = (command) => {
    if (["getprem", "sumprem", "delprem", "checkprem", "myprem"].includes(command.name) || command.category === "premb")
        return "premium";
    if (command.category === "bot")
        return "sockets";
    if (["system", "update", "updatedb", "eval", "reload", "logout"].includes(command.name))
        return "sistema";
    if (command.category === "moderation" || ["mute", "muteall", "autoadmin", "allchats"].includes(command.name))
        return "moderacion";
    if (["setrange", "delrange", "addowner", "delowner"].includes(command.name))
        return "rangos";
    if (command.category === "owner")
        return "control";
    return "otros";
};
const sectionBlock = (section, commands, prefix) => {
    const meta = sectionMeta[section];
    let text = `╭─〔 ${meta.icon} ${meta.title} 〕\n`;
    text += `│ ✦ ${meta.desc}\n`;
    text += `│\n`;
    for (const command of commands.sort((a, b) => a.name.localeCompare(b.name))) {
        const using = cleanText(command.using);
        text += `│ ◦ ${commandNames(prefix, command)}${using ? ` _${using}_` : ""}${formatFlags(command)}\n`;
        text += `│ │ ${cleanText(command.description, "Sin descripción.")}\n`;
    }
    text += `╰────────────\n`;
    return text;
};
export default {
    name: "menuowner",
    alias: ["ownermenu", "menudueño", "menubotowner"],
    description: "Muestra el menú privado de comandos owner por secciones.",
    category: "owner",
    flags: ["all.chats"],
    requires: ["bot.owner"],
    hidden: false,
    execute: async (wss, { mctx, usedPrefix, bot, userIsPrimaryBotOwner }) => {
        const sections = {};
        const commands = getUniqueCommands().filter(ownerOnly).filter((command) => !["codemain", "qrmain"].includes(command.name));
        for (const command of commands) {
            const section = getSection(command);
            if (!sections[section])
                sections[section] = [];
            sections[section].push(command);
        }
        const ordered = ["control", "sockets", "premium", "sistema", "moderacion", "rangos", "otros"];
        const botName = cleanText(bot.name, "Bot");
        let text = "╭─〔 👑 MENÚ OWNER 〕\n";
        text += `│ ✦ Bot › ${botName}\n`;
        text += `│ ✦ Tipo › ${getBotType(bot.bot_type)}\n`;
        text += `│ ✦ Acceso › ${userIsPrimaryBotOwner ? "owner principal" : "subowner"}\n`;
        text += `│ ✦ Comandos › ${commands.length}\n`;
        text += "╰────────────\n\n";
        for (const section of ordered) {
            const list = sections[section];
            if (!list?.length)
                continue;
            text += sectionBlock(section, list, usedPrefix);
            text += "\n";
        }
        await wss.sendMessage(mctx.chat.jid, { text }, { quoted: mctx.message.original });
    },
};
