import { getConnection } from "../../../database/connect.js";
import * as libs from "../../../libs/libs.js";
import * as cache from "../../../cache/cache.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
const ADVANTAGES = {
    water: ["fire", "ground", "rock"],
    fire: ["grass", "ice", "bug", "steel"],
    grass: ["water", "ground", "rock"],
    electric: ["water", "flying"],
    ice: ["grass", "ground", "flying", "dragon"],
    fighting: ["normal", "ice", "rock", "dark", "steel"],
    poison: ["grass", "fairy"],
    ground: ["fire", "electric", "poison", "rock", "steel"],
    flying: ["grass", "fighting", "bug"],
    psychic: ["fighting", "poison"],
    bug: ["grass", "psychic", "dark"],
    rock: ["fire", "ice", "flying", "bug"],
    ghost: ["psychic", "ghost"],
    dragon: ["dragon"],
    dark: ["psychic", "ghost"],
    steel: ["ice", "rock", "fairy"],
    fairy: ["fighting", "dragon", "dark"],
};
const WEAKNESSES = {
    water: ["grass", "electric"],
    fire: ["water", "ground", "rock"],
    grass: ["fire", "ice", "poison", "flying", "bug"],
    electric: ["ground"],
    ice: ["fire", "fighting", "rock", "steel"],
    fighting: ["flying", "psychic", "fairy"],
    poison: ["ground", "psychic"],
    ground: ["water", "grass", "ice"],
    flying: ["electric", "ice", "rock"],
    psychic: ["bug", "ghost", "dark"],
    bug: ["fire", "flying", "rock"],
    rock: ["water", "grass", "fighting", "ground", "steel"],
    ghost: ["ghost", "dark"],
    dragon: ["ice", "dragon", "fairy"],
    dark: ["fighting", "bug", "fairy"],
    steel: ["fire", "fighting", "ground"],
    fairy: ["poison", "steel"],
};
const calculateDamage = (attacker, defender) => {
    let dmg = attacker.base_stat.attack - defender.base_stat.defense * 0.5;
    if (dmg < 1)
        dmg = 1;
    const adv = attacker.types.some((t) => ADVANTAGES[t]?.includes(defender.types[0])) ? 1.5 : 1;
    const weak = attacker.types.some((t) => WEAKNESSES[t]?.includes(defender.types[0])) ? 0.5 : 1;
    return Math.round(dmg * adv * weak);
};
const command = {
    name: "pokechallenge",
    alias: ["pchallenge"],
    description: "Reta a otro participante a una batalla pokémon",
    using: "<pokemon> <@participant>",
    category: "pokegame",
    flags: ["only.groups"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, group, args, bot }) => {
        const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid);
        const challenger = group.users.find((v) => v.user_jid === mctx.sender.jid);
        if (!challenger) {
            await mctx.reply(`「⚡」 No se pudo obtener tus datos en este grupo, vuelve a intentarlo.`);
            return;
        }
        if (!args.length) {
            await mctx.reply(`「⚡」 Asegurate de ingresar el nombre de tu pokemon y luego etiquetar al otro participante.`);
            return;
        }
        const mentioned = mctx.message.mentioned[0];
        if (!mentioned) {
            await mctx.reply(`「⚡」 Etiqueta al participante que quieras retar a una batalla.`);
            return;
        }
        const opponent = group.users.find((v) => v.user_jid === mentioned);
        if (!opponent) {
            await mctx.reply(`「⚡」 El participante @${mentioned.split("@")[0]} no está registrado en este grupo.`);
            return;
        }
        if (mentioned === mctx.sender.jid) {
            await mctx.reply(`「⚡」 No puedes retarte a ti mismo.`);
            return;
        }
        const challengerPokemon = [
            { id: 1, name: "Pikachu", types: ["electric"], base_stat: { hp: 100, attack: 55, defense: 40, speed: 90 } },
        ];
        const opponentPokemon = [
            { id: 2, name: "Charmander", types: ["fire"], base_stat: { hp: 100, attack: 52, defense: 43, speed: 65 } },
        ];
        const pokeA = challengerPokemon.find((v) => v.name.toLowerCase() === args[0].toLowerCase());
        if (!pokeA) {
            await mctx.reply(`「⚡」 No tienes un pokémon llamado *${args[0]}*.`);
            return;
        }
        if (!opponentPokemon.length) {
            await mctx.reply(`「⚡」 El oponente no tiene pokémon para la batalla.`);
            return;
        }
        let message = `*｢❀｣* @${mentioned.split("@")[0]}, @${mctx.sender.jid.split("@")[0]} te ha retado a una batalla pokémon.\n\n`;
        message += "> *✦* Responde con › *aceptar <pokemon>* para aceptar\n";
        message += "> *✦* Responde con › *rechazar* para cancelar\n\n";
        message += "> Este mensaje expira en 5 minutos.";
        const response = await mctx.reply(message);
        let key = null;
        if (response && typeof response === "object" && "key" in response) {
            key = response.key;
        }
        if (key) {
            cache.callback.set(key.id, {
                for: mentioned,
                execute: async (wss, mcx) => {
                    try {
                        const args = mcx.message.text.split(/\s+/);
                        if (/aceptar/i.test(args[0])) {
                            const pokeB = opponentPokemon.find((v) => v.name.toLowerCase() === args[1]?.toLowerCase());
                            if (!pokeB) {
                                await mcx.reply(`*｢✧｣* No tienes un pokémon llamado *${args[1] || ""}*.`);
                                return;
                            }
                            await mcx.reply(`*｢❀｣* Empezando la batalla entre @${mctx.sender.jid.split("@")[0]} *[${pokeA.name}]* y @${mentioned.split("@")[0]} *[${pokeB.name}]*.`);
                            let hpA = pokeA.base_stat.hp;
                            let hpB = pokeB.base_stat.hp;
                            const speedA = pokeA.base_stat.speed;
                            const speedB = pokeB.base_stat.speed;
                            let resume = "*｢❀｣* Batalla Pokémon\n\n";
                            resume += `> *✦* ${pokeA.name} vs ${pokeB.name}\n\n`;
                            let attacker = speedA >= speedB ? "A" : "B";
                            let round = 1;
                            while (hpA > 0 && hpB > 0) {
                                if (attacker === "A") {
                                    const dmg = calculateDamage(pokeA, pokeB);
                                    hpB -= dmg;
                                    resume += `> *•* Ronda › *${round}*:\n`;
                                    resume += `> *${pokeA.name}* ataca y causa *${dmg}* de daño a *${pokeB.name}* y le queda *${Math.max(hpB, 0)}* de vida.\n`;
                                    attacker = "B";
                                }
                                else {
                                    const dmg = calculateDamage(pokeB, pokeA);
                                    hpA -= dmg;
                                    resume += `> *•* Ronda › *${round}:*\n`;
                                    resume += `> *${pokeB.name}* ataca y causa *${dmg}* de daño a *${pokeA.name}* y le queda *${Math.max(hpA, 0)}* de vida.\n`;
                                    attacker = "A";
                                }
                                round++;
                            }
                            const winner = hpA > 0 ? mctx.sender.jid : mentioned;
                            const loser = hpA > 0 ? mentioned : mctx.sender.jid;
                            const reward = Math.floor(Math.random() * 3) + 1;
                            resume += "\n";
                            resume += "> *✦* Batalla terminada.\n";
                            resume += `> *•* Ganador › ${winner === mctx.sender.jid ? mctx.sender.name : "Oponente"}\n`;
                            resume += `> *•* Perdedor › ${loser === mctx.sender.jid ? mctx.sender.name : "Oponente"}\n\n`;
                            resume += `> *✦* Recompensa › *${reward.toLocaleString()}* potenciadores`;
                            return new Promise((resolve) => {
                                try {
                                    const conn = getConnection();
                                    conn.run(`UPDATE group_users SET enhancers = enhancers + ? WHERE group_jid = ? AND user_jid = ?`, [reward, scopedGroupJid, winner], async (err) => {
                                        if (err) {
                                            console.error("[PokeChallenge] Error updating enhancers:", err);
                                        }
                                        await mctx.reply(resume);
                                        resolve();
                                    });
                                }
                                catch (error) {
                                    console.error("[PokeChallenge] Error updating enhancers:", error);
                                    mctx.reply(resume);
                                    resolve();
                                }
                            });
                        }
                        else if (/rechazar/i.test(args[0])) {
                            await mctx.reply(`「⚡」 @${mentioned.split("@")[0]} rechazó la batalla.`);
                            cache.callback.delete(key.id);
                        }
                        else {
                            await mcx.reply("*｢✧｣* Responde con *aceptar <pokémon>* para iniciar la batalla o *rechazar* para cancelarla.");
                            return;
                        }
                    }
                    catch (error) {
                        await mcx.reply(libs.formatError(String(error)));
                        console.error({
                            date: new Date().toISOString(),
                            error,
                        });
                    }
                },
            });
        }
    },
};
export default command;
