import * as database from "../../../database/database.js";
import { getConnection } from "../../../database/connect.js";
import { Bot } from "../../bot.js";
import { BotPersistence } from "../../../libs/socket-manager.js";
import { getBotType } from "../../../libs/libs.js";
import { resolveUserLid } from "../../../libs/lid-resolver.js";
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const stripJidDevice = (jid) => clean(jid).split(":")[0].toLowerCase();
const jidNumber = (jid) => stripJidDevice(jid).split("@")[0].replace(/[^0-9]/g, "");
const socketCard = (title, lines) => {
    return [`「✧」 ${title}`, ...lines.map((line) => `│ ${line}`)].join("\n");
};
const promptForNumber = (usedPrefix) => {
    return socketCard("Ingresa el socket activo a convertir a oficial.", [
        `Uso › ${usedPrefix}setprimary 595981902212`,
        `Uso › ${usedPrefix}setprimary @bot`,
        "También sirve respondiendo un mensaje del socket.",
    ]);
};
const runSql = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        getConnection().all(sql, params, (error, rows) => {
            if (error)
                reject(error);
            else
                resolve((rows || []));
        });
    });
};
const runUpdate = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        getConnection().run(sql, params, (error) => {
            if (error)
                reject(error);
            else
                resolve();
        });
    });
};
const runtimeSocketIds = (runtimeJidRaw, runtimeBot) => {
    const rawValues = [
        runtimeJidRaw,
        runtimeBot.bot_jid,
        runtimeBot.wss?.user?.id,
        runtimeBot.wss?.user?.lid,
    ];
    return Array.from(new Set(rawValues.map(stripJidDevice).filter(Boolean)));
};
const findActiveRuntimeSocket = (identities) => {
    for (const identity of identities) {
        const targetJid = stripJidDevice(identity);
        const targetNumber = jidNumber(identity);
        if (!targetJid && !targetNumber)
            continue;
        for (const [runtimeJidRaw, runtimeBot] of Bot.bots) {
            const ids = runtimeSocketIds(runtimeJidRaw, runtimeBot);
            const runtimeJid = stripJidDevice(runtimeJidRaw);
            const botJid = stripJidDevice(runtimeBot.bot_jid || runtimeJid);
            const phoneNumber = jidNumber(runtimeBot.wss?.user?.id) || jidNumber(botJid) || jidNumber(runtimeJid);
            const numberMatch = Boolean(targetNumber && ids.some((id) => jidNumber(id) === targetNumber));
            const jidMatch = Boolean(targetJid && ids.includes(targetJid));
            if (!numberMatch && !jidMatch)
                continue;
            return {
                active: runtimeBot,
                runtimeJid,
                jid: botJid || runtimeJid,
                number: phoneNumber || targetNumber,
            };
        }
    }
    return null;
};
const findSession = async (number, jid) => {
    const rows = await runSql(`SELECT bot_jid, bot_number, owner_jid, user_jid, bot_type, parent_bot_jid
     FROM bot_sessions
     WHERE bot_number = ? OR bot_jid = ?
     ORDER BY last_seen DESC
     LIMIT 1`, [number, jid]).catch(() => []);
    return rows[0] || null;
};
const findTargetSocket = async (wss, identity, mctx, groupMetadata) => {
    const rawIdentity = clean(identity);
    let activeTarget = findActiveRuntimeSocket([rawIdentity]);
    if (!activeTarget) {
        // El grupo puede trabajar con @lid: lo que llega como "identity" (mención, cita o texto)
        // no siempre calza directo contra el número real del socket activo, porque el lid es un
        // identificador distinto al número de teléfono. Resolvemos lid <-> número real usando los
        // participantes del grupo (y onWhatsApp como respaldo) y reintentamos con esos candidatos.
        const resolved = await resolveUserLid(wss, rawIdentity, { mctx, groupMetadata }).catch(() => null);
        const candidates = [resolved?.lidJid, resolved?.phoneJid, resolved?.phoneNumber, resolved?.bestJid].filter((value) => Boolean(value));
        if (candidates.length)
            activeTarget = findActiveRuntimeSocket(candidates);
    }
    if (!activeTarget)
        return null;
    const bot = await database.Bots.find(activeTarget.jid).catch(() => null);
    const session = await findSession(activeTarget.number || jidNumber(rawIdentity), activeTarget.jid);
    return {
        bot,
        session,
        active: activeTarget.active,
        runtimeJid: activeTarget.runtimeJid,
        jid: activeTarget.jid,
        number: activeTarget.number || jidNumber(rawIdentity),
    };
};
const setRuntimeAsMain = (number, targetJid) => {
    for (const [runtimeJid, runtimeBot] of Bot.bots) {
        const match = stripJidDevice(runtimeJid) === targetJid || jidNumber(runtimeJid) === number || jidNumber(runtimeBot.bot_jid) === number;
        if (!match)
            continue;
        Bot.bots.set(runtimeJid, {
            ...runtimeBot,
            bot_type: "main",
            parent_bot_jid: "",
            connected_at: runtimeBot.connected_at,
            // Preservar el tipo original para poder revertirlo con unsetprimary
            original_type: runtimeBot.original_type ?? runtimeBot.bot_type,
        });
    }
};
const updateSessionAsMain = async (number, targetJid) => {
    await runUpdate(`UPDATE bot_sessions
     SET bot_type = 'main', parent_bot_jid = '', expires_at = NULL, is_active = 1, last_seen = CURRENT_TIMESTAMP
     WHERE bot_number = ? OR bot_jid = ?`, [number, targetJid]);
    await BotPersistence.syncToJSON().catch(() => { });
};
const updateBotAsMain = async (target) => {
    const baseJid = target.bot?.bot_jid || target.jid || target.active.bot_jid;
    const oldBot = target.bot;
    if (oldBot) {
        return database.Bots.update(baseJid, {
            $set: {
                bot_type: "main",
                parent_bot_jid: "",
                setup_completed: 1,
            },
        });
    }
    return database.Bots.set(baseJid, {
        bot_jid: baseJid,
        owner_jid: clean(target.session?.owner_jid || target.session?.user_jid || target.active.owner_jid),
        owner_name: "",
        bot_type: "main",
        parent_bot_jid: "",
        setup_completed: 1,
    });
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
const command = {
    name: "setprimary",
    alias: ["primary", "setmain", "oficial", "principal"],
    description: "Convierte un socket activo en bot oficial/principal usando su número.",
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
        const target = await findTargetSocket(wss, identity, mctx, groupMetadata);
        if (!target) {
            await mctx.reply(socketCard("Ese socket no está activo.", [
                `Buscado › ${number ? `@${number}` : stripJidDevice(identity)}`,
                "Estado › no conectado en memoria.",
                "Solución › vincula/enciende ese bot primero.",
            ]));
            return;
        }
        const beforeType = (target.active.bot_type || target.bot?.bot_type || target.session?.bot_type || "free");
        if (beforeType === "main") {
            await mctx.reply(socketCard("Ese socket ya es oficial.", [
                `Bot › @${target.number || number}`,
                "Estado › no se cambió nada.",
            ]), "s.whatsapp.net");
            return;
        }
        const updated = await updateBotAsMain(target);
        if (!updated) {
            await mctx.reply(socketCard("No pude actualizar el socket.", [
                `Bot › @${target.number || number}`,
                "Motivo › error al guardar en la base de datos.",
            ]), "s.whatsapp.net");
            return;
        }
        await updateSessionAsMain(target.number || number, updated.bot_jid).catch(() => { });
        setRuntimeAsMain(target.number || number, updated.bot_jid);
        if (mctx.is_group && group?.group_jid) {
            await database.Groups.update(group.group_jid, { $set: { primary_bot: updated.bot_jid } }).catch(() => null);
        }
        const botName = clean(updated.name) || (await wss.getName(updated.bot_jid).catch(() => "Bot"));
        await mctx.reply(socketCard("Socket activo convertido a oficial.", [
            `Bot › @${target.number || number}`,
            `Nombre › ${botName}`,
            `Antes › ${getBotType(beforeType)}`,
            `Ahora › ${getBotType("main")}`,
            "Reinicio › no requerido.",
        ]), "s.whatsapp.net");
    },
};
export default command;
