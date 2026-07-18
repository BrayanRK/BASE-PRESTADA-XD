import { getConnection } from "../../../database/connect.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
const command = {
    name: "pokeupgrade",
    alias: ["pupgrade"],
    description: "Mejora una estadística de uno de tus pokémon usando potenciadores",
    category: "pokegame",
    using: "<pokemon> <stat>",
    flags: ["only.groups"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, group, args, bot }) => {
        const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid);
        const groupUser = group.users.find((u) => u.user_jid === mctx.sender.jid);
        if (!groupUser) {
            await mctx.reply(`「⚡」 No se pudo obtener tus datos en este grupo, vuelve a intentarlo.`);
            return;
        }
        if (!args.length || args.length < 2) {
            await mctx.reply(`「⚡」 Ingresa el nombre del pokémon seguido del stat que quieras mejorar.`);
            return;
        }
        const allowedStats = ["hp", "attack", "defense", "speed"];
        if (!allowedStats.includes(args[1])) {
            await mctx.reply(`「⚡」 El stat *${args[1]}* no es válido, solo se permiten *${allowedStats.join(", ")}*.`);
            return;
        }
        return new Promise((resolve) => {
            try {
                const conn = getConnection();
                conn.get(`SELECT * FROM user_pokemon WHERE user_jid = ? AND group_jid = ? AND pokemon_name = ?`, [mctx.sender.jid, scopedGroupJid, args[0]], (err, pokemonRow) => {
                    if (err) {
                        console.error("[PokeUpgrade] Error:", err);
                        mctx.reply(`「⚡」 Error al procesar la mejora.`);
                        resolve();
                        return;
                    }
                    if (!pokemonRow) {
                        mctx.reply(`「⚡」 No tienes un pokémon llamado *${args[0]}*.`);
                        resolve();
                        return;
                    }
                    const pokemon = pokemonRow;
                    const baseStats = JSON.parse(pokemon.base_stats);
                    const currentValue = baseStats[args[1]];
                    const enhancersRequired = Math.floor(currentValue / 10) + 1;
                    if (groupUser.enhancers < enhancersRequired) {
                        mctx.reply(`*｢✧｣* Necesitas *${enhancersRequired}* potenciadores para mejorar el *${args[1]}* de *${pokemon.pokemon_name}*.`);
                        resolve();
                        return;
                    }
                    baseStats[args[1]] = currentValue + 1;
                    conn.serialize(() => {
                        conn.run(`UPDATE user_pokemon SET base_stats = ? WHERE id = ?`, [JSON.stringify(baseStats), pokemon.id]);
                        conn.run(`UPDATE group_users SET enhancers = enhancers - ? WHERE group_jid = ? AND user_jid = ?`, [enhancersRequired, scopedGroupJid, mctx.sender.jid], async (err) => {
                            if (err) {
                                console.error("[PokeUpgrade] Error:", err);
                                await mctx.reply(`「⚡」 Error al procesar la mejora.`);
                            }
                            else {
                                await mctx.reply(`*｢❀｣* Mejoraste el *${args[1]}* de *${pokemon.pokemon_name}* a *${currentValue + 1}* y gastaste *${enhancersRequired}* potenciadores.`);
                            }
                            resolve();
                        });
                    });
                });
            }
            catch (error) {
                console.error("[PokeUpgrade] Error:", error);
                mctx.reply(`「⚡」 Error al procesar la mejora.`);
                resolve();
            }
        });
    },
};
export default command;
