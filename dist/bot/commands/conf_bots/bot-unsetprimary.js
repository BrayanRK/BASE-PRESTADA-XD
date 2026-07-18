import * as database from "../../../database/database.js";
import { getConnection } from "../../../database/connect.js";
import { Bot } from "../../bot.js";
import { BotPersistence } from "../../../libs/socket-manager.js";
import { getBotType } from "../../../libs/libs.js";
import { resolveUserLid } from "../../../libs/lid-resolver.js";
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const stripJidDevice = (jid) => clean(jid).split(":")[0].toLowerCase();
const jidNumber = (jid) => stripJidDevice(jid).split("@")[0].replace(/[^0-9]/g, "");
const socketCard = (title, lines) => [`「✧」 ${title}`, ...lines.map((l) => `◇ ${l}`)].join("\n");
const promptForNumber = (usedPrefix) => socketCard("Ingresa el socket a revertir a su tipo original.", [
    `Uso › ${usedPrefix}unsetprimary 595981902212`,
    `Uso › ${usedPrefix}unsetprimary @bot`,
    "También sirve respondiendo un mensaje del socket.",
]);
const findActiveRuntimeSocket = (identities) => {
    for (const identity of identities) {
        const targetJid = stripJidDevice(identity);
        const targetNumber = jidNumber(identity);
        if (!targetJid && !targetNumber)
            continue;
        for (const [runtimeJidRaw, runtimeBot] of Bot.bots) {
            const runtimeJid = stripJidDevice(runtimeJidRaw);
            const botJid = stripJidDevice(runtimeBot.bot_jid || runtimeJid);
            const phoneNumber = jidNumber(runtimeBot.wss?.user?.id) || jidNumber(botJid) || jidNumber(runtimeJid);
            const numberMatch = Boolean(targetNumber && (jidNumber(botJid) === targetNumber || phoneNumber === targetNumber));
            const jidMatch = Boolean(targetJid && (runtimeJid === targetJid || botJid === targetJid));
            if (!numberMatch && !jidMatch)
                continue;
            return { active: runtimeBot, runtimeJid, jid: botJid || runtimeJid, number: phoneNumber || targetNumber };
        }
    }
    return null;
};
const getTargetIdentity = (mctx, args) => {
    const mentioned = mctx.message.mentioned?.[0] || mctx.message.mentionedJid?.[0] || "";
    if (mentioned)
        return mentioned;
    const quotedSender = mctx.quoted?.sender?.jid || "";
    if (quotedSender)
        return quotedSender;
    return clean(args.join(" "));
};
const revertRuntimeType = (number, targetJid, restoredType, parentBotJid) => {
    for (const [runtimeJid, runtimeBot] of Bot.bots) {
        const match = stripJidDevice(runtimeJid) === targetJid ||
            jidNumber(runtimeJid) === number ||
            jidNumber(runtimeBot.bot_jid) === number;
        if (!match)
            continue;
        Bot.bots.set(runtimeJid, {
            ...runtimeBot,
            bot_type: restoredType,
            parent_bot_jid: parentBotJid,
            connected_at: runtimeBot.connected_at,
            original_type: undefined,
        });
    }
};
const command = {
    name: "unsetprimary",
    alias: ["unprimary", "unsetmain", "removeprimary", "quitarprimary"],
    description: "Revierte un socket de oficial/main a su tipo original (free o premium).",
    category: "bot",
    hidden: false,
    requires: ["owner.user"],
    flags: ["all.chats"],
    using: "<número|@tag>",
    execute: async (wss, { mctx, args, group, usedPrefix, groupMetadata }) => {
        const identity = getTargetIdentity(mctx, args);
        const number = jidNumber(identity);
        if (!identity || (!number && !/@(lid|s\.whatsapp\.net)$/i.test(stripJidDevice(identity)))) {
            await mctx.reply(promptForNumber(usedPrefix));
            return;
        }
        await mctx.react("⏳").catch(() => null);
        // Resolver identidad en runtime
        let activeTarget = findActiveRuntimeSocket([identity]);
        if (!activeTarget) {
            const resolved = await resolveUserLid(wss, identity, { mctx, groupMetadata }).catch(() => null);
            const candidates = [resolved?.lidJid, resolved?.phoneJid, resolved?.phoneNumber, resolved?.bestJid].filter((v) => Boolean(v));
            if (candidates.length)
                activeTarget = findActiveRuntimeSocket(candidates);
        }
        if (!activeTarget) {
            await mctx.reply(socketCard("Ese socket no está activo.", [
                `Buscado › ${number ? `@${number}` : stripJidDevice(identity)}`,
                "Estado › no conectado en memoria.",
                "Solución › vincula/enciende ese bot primero.",
            ]));
            return;
        }
        const currentType = (activeTarget.active.bot_type || "free");
        if (currentType !== "main") {
            await mctx.reply(socketCard("Ese socket ya no es oficial.", [
                `Bot › @${activeTarget.number || number}`,
                `Tipo actual › ${getBotType(currentType)}`,
                "Estado › no se cambió nada.",
            ]), "s.whatsapp.net");
            return;
        }
        // Determinar el tipo al que hay que volver
        // Prioridad: original_type en runtime → original_type en DB → "free" como fallback seguro
        const runtimeOriginalType = activeTarget.active.original_type;
        const savedBot = await database.Bots.find(activeTarget.jid).catch(() => null);
        // Buscar original_type en bot_sessions también
        const sessionRow = await new Promise((resolve) => {
            getConnection().get(`SELECT original_type FROM bot_sessions WHERE bot_number = ? OR bot_jid = ? LIMIT 1`, [activeTarget.number || number, activeTarget.jid], (err, row) => resolve(err ? null : (row ?? null)));
        });
        const restoredType = runtimeOriginalType && runtimeOriginalType !== "main"
            ? runtimeOriginalType
            : sessionRow?.original_type && sessionRow.original_type !== "main"
                ? sessionRow.original_type
                : (savedBot?.bot_type !== "main" ? savedBot?.bot_type : undefined) ?? "free";
        // Restaurar parent_bot_jid: si es premium volver al parent original si lo había
        const parentBotJid = restoredType === "premium" ? (savedBot?.parent_bot_jid || "") : "";
        // Actualizar DB bots
        const updated = await database.Bots.update(activeTarget.jid, {
            $set: {
                bot_type: restoredType,
                parent_bot_jid: parentBotJid,
            },
        });
        if (!updated) {
            await mctx.reply(socketCard("No pude actualizar el socket.", [
                `Bot › @${activeTarget.number || number}`,
                "Motivo › error al guardar en la base de datos.",
            ]));
            return;
        }
        // Actualizar bot_sessions
        await new Promise((resolve) => {
            getConnection().run(`UPDATE bot_sessions SET bot_type = ?, parent_bot_jid = ?, original_type = '', last_seen = CURRENT_TIMESTAMP WHERE bot_number = ? OR bot_jid = ?`, [restoredType, parentBotJid, activeTarget.number || number, activeTarget.jid], () => resolve());
        });
        await BotPersistence.syncToJSON().catch(() => { });
        // Revertir en runtime
        revertRuntimeType(activeTarget.number || number, activeTarget.jid, restoredType, parentBotJid);
        // Si se ejecuta en grupo y ese grupo tenía a este bot como primary_bot, resetear al principal oficial
        if (mctx.is_group && group?.group_jid && group.primary_bot) {
            const groupPrimaryNumber = jidNumber(group.primary_bot);
            if (groupPrimaryNumber === (activeTarget.number || number)) {
                const mainBotNumber = process.env.MAIN_BOT_NUMBER || "";
                const newPrimary = mainBotNumber ? `${mainBotNumber}@s.whatsapp.net` : "";
                await database.Groups.update(group.group_jid, { $set: { primary_bot: newPrimary } }).catch(() => null);
            }
        }
        const botName = clean(updated.name) || (await wss.getName(updated.bot_jid).catch(() => "Bot"));
        await mctx.reply(socketCard("Socket revertido a tipo original.", [
            `Bot › @${activeTarget.number || number}`,
            `Nombre › ${botName}`,
            `Antes › ${getBotType("main")}`,
            `Ahora › ${getBotType(restoredType)}`,
            "Efecto › se silenciará en grupos donde esté el principal.",
            "Reinicio › no requerido.",
        ]), "s.whatsapp.net");
    },
};
export default command;
