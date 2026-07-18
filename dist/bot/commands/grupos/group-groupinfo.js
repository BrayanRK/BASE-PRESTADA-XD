export default {
    name: 'gp',
    alias: ['group', 'groupinfo'],
    description: 'Informacion del grupo.',
    flags: ['only.groups'],
    requires: [],
    hidden: false,
    category: 'main',
    execute: async (wss, { mctx, group, groupMetadata }) => {
        const groupProfileUrl = await wss.profilePictureUrl(mctx.chat.jid);
        let message = `「❖」 Grupo › *${mctx.chat.name.trim()}*\n\n`;
        message += `> *✦* Participantes › *${groupMetadata.size.toLocaleString()}*\n`;
        message += `> *✦* Registrados › *${group.users.length.toLocaleString()}*\n`;
        message += `> *✦* Bot principal › @${group.primary_bot.split('@')[0]}\n\n`;
        message += `> *✦* Solo Administradores › *${group.admins_only_enabled ? '✓ activado' : '✗ desactivado'}*\n`;
        message += `> *✦* Alertas › *${group.alerts_enabled ? '✓ activado' : '✗ desactivado'}*\n`;
        message += `> *✦* Anti Spam › *${group.antispam_enabled ? '✓ activado' : '✗ desactivado'}*\n`;
        message += `> *✦* Anti Enlaces › *${group.antilinks_enabled ? '✓ activado' : '✗ desactivado'}*\n`;
        message += `> *✦* Despedidas › *${group.farewells_enabled ? '✓ activado' : '✗ desactivado'}*\n`;
        message += `> *✦* Bienvenidas › *${group.welcomes_enabled ? '✓ activado' : '✗ desactivado'}*`;
        await wss.sendMessage(mctx.chat.jid, {
            image: {
                url: groupProfileUrl,
            },
            caption: message,
            mentions: wss.parseMentions(message, 'lid'),
        }, {
            quoted: mctx.message.original,
        });
    },
};
