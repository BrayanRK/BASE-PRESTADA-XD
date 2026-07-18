import type * as types from "../../../types/types.js"
import * as database from "../../../database/database.js"

const pptCooldown = 30_000
const pptCooldowns = new Map<string, number>()
const pptChallenges = new Map<string, { challenger: string; chat: string; timeout: NodeJS.Timeout }>()
const pptDuels = new Map<string, { players: [string, string]; choices: Record<string, string>; timeout: NodeJS.Timeout }>()
const pptChoices = ["piedra", "papel", "tijera"] as const

type PPTChoice = (typeof pptChoices)[number]

type TTTSala = {
  name: string
  chat: string
  players: string[]
  board: string[]
  turn: string
}

const tttRooms = new Map<string, TTTSala>()
const tttSymbols = ["❌", "⭕"]
const tttNumbers = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"]

const mention = (jid: string): string => `@${jid.split("@")[0]}`
const normalizeMentionArg = (text: string): string => text.replace(/[^0-9]/g, "")
const randomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min
const pickRandom = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)]
const percent = (): string => `${randomInt(0, 100)}%`

const msToTime = (ms: number): string => {
  const seconds = Math.floor(ms / 1000) % 60
  const minutes = Math.floor(ms / 60000) % 60
  return `${minutes ? `${minutes}m ` : ""}${seconds}s`
}

const getMentioned = (mctx: types.MessageContext): string[] => {
  return Array.from(new Set([...(mctx.message.mentionedJid || []), ...(mctx.message.mentioned || [])].filter(Boolean)))
}

const sendText = async (wss: types.WASocket, mctx: types.MessageContext, text: string, mentions: string[] = []) => {
  await wss.sendMessage(mctx.chat.jid, { text, mentions }, { quoted: mctx.message.original })
}

const groupParticipants = (groupMetadata: types.CommandExecuteContext["groupMetadata"]): string[] => {
  const raw = Array.isArray(groupMetadata?.participants) ? groupMetadata.participants : []
  return raw.map((p: any) => p?.id || p?.jid).filter(Boolean)
}

const randomParticipant = (participants: string[], fallback: string): string => {
  return participants.length ? pickRandom(participants) : fallback
}

const updateExperience = async (jid: string, delta: number): Promise<number> => {
  const user = (await database.Users.get(jid)) || (await database.Users.set(jid, { user_jid: jid }))
  const current = Number(user?.experience || 0)
  const next = Math.max(0, current + delta)
  await database.Users.update(jid, { $set: { experience: next } })
  return next
}

const evaluatePPT = (a: PPTChoice, b: PPTChoice): "gana" | "pierde" | "empate" => {
  if (a === b) return "empate"
  if ((a === "piedra" && b === "tijera") || (a === "tijera" && b === "papel") || (a === "papel" && b === "piedra")) return "gana"
  return "pierde"
}

const handlePPT = async (
  wss: types.WASocket,
  mctx: types.MessageContext,
  args: string[],
  usedPrefix: string,
  commandName: string,
): Promise<void> => {
  const sender = mctx.sender.jid
  const input = args[0]?.toLowerCase() || ""
  const mentioned = getMentioned(mctx)[0]

  if (input === "aceptar" || input === "rechazar") {
    const challenge = pptChallenges.get(sender)
    if (!challenge) {
      await mctx.reply("⚠️ No tienes ningún reto pendiente.")
      return
    }

    clearTimeout(challenge.timeout)
    pptChallenges.delete(sender)

    if (input === "rechazar") {
      await wss.sendMessage(challenge.chat, { text: `「◈」 PPT
Estado › reto rechazado
Usuario › ${mention(sender)}
Rival › ${mention(challenge.challenger)}`, mentions: [sender, challenge.challenger] })
      return
    }

    const choiceText = `「◈」 PPT
⟡ Elige › ${usedPrefix}ppt piedra
⟡ Elige › ${usedPrefix}ppt papel
⟡ Elige › ${usedPrefix}ppt tijera`
    await wss.sendMessage(challenge.challenger, { text: choiceText })
    await wss.sendMessage(sender, { text: choiceText })
    await wss.sendMessage(challenge.chat, { text: `「◈」 PPT
Estado › reto aceptado
Privado › opciones enviadas
Jugadores › ${mention(challenge.challenger)} vs ${mention(sender)}`, mentions: [challenge.challenger, sender] })
    return
  }

  const activeDuel = Array.from(pptDuels.entries()).find(([, duel]) => duel.players.includes(sender))
  if (activeDuel && pptChoices.includes(input as PPTChoice)) {
    const [duelKey, duel] = activeDuel
    duel.choices[sender] = input
    await mctx.reply("✅ Elección recibida. Espera el resultado.")

    if (Object.keys(duel.choices).length < 2) return

    clearTimeout(duel.timeout)
    pptDuels.delete(duelKey)

    const [p1, p2] = duel.players
    const c1 = duel.choices[p1] as PPTChoice
    const c2 = duel.choices[p2] as PPTChoice
    const result = evaluatePPT(c1, c2)
    const xp = randomInt(500, 2500)

    let text = `✊🖐✌️ *Piedra, Papel o Tijera*\n\n${mention(p1)} eligió: *${c1}*\n${mention(p2)} eligió: *${c2}*\n\n`

    if (result === "empate") {
      text += "🤝 ¡Empate! Nadie gana ni pierde XP."
    } else {
      const winner = result === "gana" ? p1 : p2
      const loser = winner === p1 ? p2 : p1
      await updateExperience(winner, xp * 2)
      await updateExperience(loser, -xp)
      text += `🎉 ${mention(winner)} gana *${(xp * 2).toLocaleString("en-US")} XP*\n💀 ${mention(loser)} pierde *${xp.toLocaleString("en-US")} XP*`
    }

    await wss.sendMessage(duelKey.split(":")[0], { text, mentions: [p1, p2] })
    return
  }

  if (!mentioned && pptChoices.includes(input as PPTChoice)) {
    const now = Date.now()
    const cooldownLeft = (pptCooldowns.get(sender) || 0) + pptCooldown - now
    if (cooldownLeft > 0) {
      await mctx.reply(`*🕓 Hey, espera ${msToTime(cooldownLeft)} antes de usar otra jugada.*`)
      return
    }

    pptCooldowns.set(sender, now)
    const botChoice = pickRandom([...pptChoices])
    const result = evaluatePPT(input as PPTChoice, botChoice)
    const xp = randomInt(500, 2500)

    let text = ""
    let title = ""

    if (result === "gana") {
      await updateExperience(sender, xp)
      title = "𝙃𝘼𝙎 𝙂𝘼𝙉𝘼𝘿𝙊! 🎉"
      text = `✅ *Ganaste* y obtuviste *${xp.toLocaleString("en-US")} XP*`
    } else if (result === "pierde") {
      await updateExperience(sender, -xp)
      title = "𝙃𝘼𝙎 𝙋𝙀𝙍𝘿𝙄𝘿𝙊! 🤡"
      text = `❌ *Perdiste*. Te quitaron *${xp.toLocaleString("en-US")} XP*`
    } else {
      title = "𝙀𝙈𝙋𝘼𝙏𝙀 🤝"
      text = "🤝 *Empate*. No ganaste ni perdiste XP."
    }

    await mctx.reply(`\`「 ${title} 」\`\n\n👉 El Bot: ${botChoice}\n👉 Tú: ${input}\n${text}`)
    return
  }

  if (mentioned) {
    if (mentioned === sender) {
      await mctx.reply("⚠️ No puedes retarte a ti mismo.")
      return
    }

    if (pptChallenges.has(mentioned)) {
      await mctx.reply("⚠️ Ese usuario ya tiene un reto pendiente.")
      return
    }

    const timeout = setTimeout(() => {
      pptChallenges.delete(mentioned)
      wss.sendMessage(mctx.chat.jid, { text: `⏳ El reto PVP se canceló por falta de respuesta de ${mention(mentioned)}.`, mentions: [mentioned] }).catch(() => null)
    }, 60_000)

    pptChallenges.set(mentioned, { challenger: sender, chat: mctx.chat.jid, timeout })

    await sendText(
      wss,
      mctx,
      `「◈」 PPT\n\n${mention(sender)} desafía a ${mention(mentioned)}.\n\n> Escribe *${usedPrefix}ppt aceptar* para aceptar\n> Escribe *${usedPrefix}ppt rechazar* para rechazar`,
      [sender, mentioned],
    )
    return
  }

  await mctx.reply(`「◈」 PPT\n\nJuega con el bot:\n• ${usedPrefix + commandName} piedra\n• ${usedPrefix + commandName} papel\n• ${usedPrefix + commandName} tijera\n\nJuega con un usuario:\n${usedPrefix + commandName} @usuario`)
}

const renderTTTBoard = (board: string[]): string => `
     ${board.slice(0, 3).join("")}
     ${board.slice(3, 6).join("")}
     ${board.slice(6).join("")}`

const verifyTTTWinner = (board: string[]): string | null => {
  const wins = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ]

  for (const [a, b, c] of wins) {
    if (board[a] === board[b] && board[b] === board[c]) return board[a]
  }

  return board.every((x) => x === "❌" || x === "⭕") ? "empate" : null
}

const sendTTTState = async (wss: types.WASocket, room: TTTSala, extra = "") => {
  const [p1, p2] = room.players
  const message = `「◈」 TTT\nJugadores:\n❌ = ${mention(p1)}\n⭕ = ${p2 ? mention(p2) : "esperando"}\n\n${renderTTTBoard(room.board)}\n\n${extra || `Turno de: ${mention(room.turn)}\n\nUsa *.ttt 1-9* para jugar.`}`

  await wss.sendMessage(room.chat, { text: message, mentions: room.players })
}

const findTTTRoomByPlayer = (jid: string): [string, TTTSala] | null => {
  return Array.from(tttRooms.entries()).find(([, room]) => room.players.includes(jid)) || null
}

const handleTTT = async (
  wss: types.WASocket,
  mctx: types.MessageContext,
  args: string[],
  usedPrefix: string,
  commandName: string,
): Promise<void> => {
  const sender = mctx.sender.jid
  const arg = args[0]?.toLowerCase().trim() || ""

  if (commandName === "tttlist") {
    if (!tttRooms.size) {
      await mctx.reply("⚠️ No hay salas activas actualmente.")
      return
    }

    let text = "「◈」 Salas activas:"
    let count = 1
    for (const [name, room] of tttRooms) {
      text += `\n\n${count++}- *${name}*\nJugadores: *${room.players.length}/2*\nIngresa con: *${usedPrefix}ttt ${name}*`
    }
    await mctx.reply(text)
    return
  }

  if (["delttt", "deltt", "deltictactoe"].includes(commandName)) {
    const active = findTTTRoomByPlayer(sender)
    if (!active) {
      await mctx.reply("⚠️ No estás en ninguna sala activa.")
      return
    }

    const [name, room] = active
    tttRooms.delete(name)
    await wss.sendMessage(room.chat, { text: `❌ La sala fue eliminada por ${mention(sender)}.`, mentions: [sender] })
    return
  }

  const active = findTTTRoomByPlayer(sender)
  const move = Number(arg)
  if (active && Number.isInteger(move) && move >= 1 && move <= 9) {
    const [name, room] = active
    if (room.turn !== sender) {
      await mctx.reply("⚠️ Aún no es tu turno.")
      return
    }

    const index = move - 1
    if (room.board[index] === "❌" || room.board[index] === "⭕") {
      await mctx.reply("❌ Esa casilla ya está ocupada.")
      return
    }

    room.board[index] = room.players.indexOf(sender) === 0 ? "❌" : "⭕"
    const winner = verifyTTTWinner(room.board)

    if (winner) {
      let extra = ""
      if (winner === "empate") {
        extra = "🤝 ¡Empate! Buen juego."
      } else {
        const winnerId = room.players[winner === "❌" ? 0 : 1]
        const loserId = room.players.find((jid) => jid !== winnerId)
        const xp = randomInt(1000, 3000)
        await updateExperience(winnerId, xp)
        if (loserId) await updateExperience(loserId, -Math.floor(xp / 2))
        extra = `🎉 ${mention(winnerId)} ganó y recibe *${xp.toLocaleString("en-US")} XP*!`
      }

      await sendTTTState(wss, room, extra)
      tttRooms.delete(name)
      return
    }

    room.turn = room.players.find((jid) => jid !== sender) || sender
    tttRooms.set(name, room)
    await sendTTTState(wss, room)
    return
  }

  if (active && !arg) {
    await sendTTTState(wss, active[1])
    return
  }

  const roomName = arg || Array.from(tttRooms.values()).find((room) => room.chat === mctx.chat.jid && room.players.length === 1)?.name || `p${Date.now()}`
  let room = tttRooms.get(roomName)

  if (!room) {
    room = {
      name: roomName,
      chat: mctx.chat.jid,
      players: [sender],
      board: [...tttNumbers],
      turn: sender,
    }
    tttRooms.set(roomName, room)
    await mctx.reply(`「◈」 TTT\nEsperando oponente para *${roomName}*.\nUsa: *${usedPrefix}ttt ${roomName}*`)
    return
  }

  if (room.players.includes(sender)) {
    await mctx.reply("⚠️ Ya estás en esta sala.")
    return
  }

  if (room.players.length >= 2) {
    await mctx.reply("⚠️ Esta sala ya tiene 2 jugadores.")
    return
  }

  room.players.push(sender)
  tttRooms.set(roomName, room)
  await sendTTTState(wss, room)
}

const handleRandomFun = async (
  wss: types.WASocket,
  mctx: types.MessageContext,
  args: string[],
  commandName: string,
  usedPrefix: string,
  groupMetadata: types.CommandExecuteContext["groupMetadata"],
): Promise<void> => {
  const participants = groupParticipants(groupMetadata)
  const a = randomParticipant(participants, mctx.sender.jid)
  const b = randomParticipant(participants.filter((jid) => jid !== a), mctx.sender.jid)
  const c = randomParticipant(participants, mctx.sender.jid)
  const d = randomParticipant(participants.filter((jid) => jid !== c), mctx.sender.jid)
  const e = randomParticipant(participants, mctx.sender.jid)
  const f = randomParticipant(participants.filter((jid) => jid !== e), mctx.sender.jid)
  const g = randomParticipant(participants, mctx.sender.jid)
  const h = randomParticipant(participants.filter((jid) => jid !== g), mctx.sender.jid)
  const i = randomParticipant(participants, mctx.sender.jid)
  const j = randomParticipant(participants.filter((jid) => jid !== i), mctx.sender.jid)
  const text = args.join(" ").trim()

  if (commandName === "multijuegos" || commandName === "juegos") {
    await mctx.reply(`「◈」 MULTIJUEGOS\n\n• ${usedPrefix}ppt piedra/papel/tijera\n• ${usedPrefix}ttt tateti\n• ${usedPrefix}amistad amistad random\n• ${usedPrefix}formarpareja pareja random\n• ${usedPrefix}ship nombre1 nombre2\n• ${usedPrefix}personalidad nombre\n• ${usedPrefix}top texto\n• ${usedPrefix}topotakus\n• ${usedPrefix}topintegrantes\n• ${usedPrefix}topparejas\n• ${usedPrefix}love nombre`)
    return
  }

  if (commandName === "amistad" || commandName === "amigorandom") {
    await sendText(wss, mctx, `「◈」 AMISTAD\n\nOye ${mention(a)} háblale al privado a ${mention(b)} para que jueguen y se haga una amistad.\n\nLas mejores amistades empiezan con un juego.`, [a, b])
    return
  }

  if (commandName === "formarpareja" || commandName === "formarparejas") {
    await sendText(wss, mctx, `「◈」 PAREJA\n\n${mention(a)}, ya es hora de que te 💍 cases con ${mention(b)}, linda pareja.`, [a, b])
    return
  }

  if (commandName === "ship" || commandName === "shippear") {
    if (!text) {
      await mctx.reply(`⚠️ Escriba el nombre de dos personas para calcular su amor.\nEjemplo: *${usedPrefix + commandName}* Lucas Ana`)
      return
    }

    const [name1, ...rest] = text.split(/\s+/)
    const name2 = rest.join(" ")
    if (!name2) {
      await mctx.reply("⚠️ Falta el nombre de la segunda persona.")
      return
    }

    await mctx.reply(`_❤️ *${name1}* tiene *${randomInt(0, 100)}%* de oportunidad de enamorarse de *${name2}* 👩🏻‍❤️‍👨🏻_`)
    return
  }

  if (commandName === "personalidad") {
    if (!text) {
      await mctx.reply(`Ingrese un nombre.\nEjemplo: *${usedPrefix + commandName}* Lucas`)
      return
    }

    await mctx.reply(`「◈」 PERSONALIDAD\n\n• Nombre: ${text}\n• Buena moral: ${percent()}\n• Mala moral: ${percent()}\n• Tipo de persona: ${pickRandom(["De buen corazón", "Arrogante", "Tacaño", "Generoso", "Humilde", "Tímido", "Valiente", "Chismoso", "Cristal", "Pendejo"])}\n• Siempre: ${pickRandom(["De malas", "Distraído", "Molestoso", "De compras", "Viendo anime", "En el celular", "Durmiendo", "Trabajando"])}\n• Inteligencia: ${percent()}\n• Coraje: ${percent()}\n• Miedo: ${percent()}\n• Fama: ${percent()}`)
    return
  }

  if (commandName === "love") {
    if (!text) {
      await mctx.reply(`🤔 Etiqueta o escribe el nombre de la persona.\nEjemplo: *${usedPrefix + commandName}* Ana`)
      return
    }

    await mctx.reply(`*❤️❤️ MEDIDOR DE AMOR ❤️❤️*\n\n*El amor de ${text} por ti es de* *${randomInt(0, 100)}%* *de un 100%*\n*¿Deberías pedirle que sea tu novia/o?*`)
    return
  }

  if (commandName === "top") {
    if (!text) {
      await mctx.reply(`Y el texto? 🤔\n📍 Ejemplo: *${usedPrefix}top pros*`)
      return
    }

    const selected = [a, b, c, d, e, f, g, h, i, j]
    const icon = pickRandom(["🤓", "😅", "😂", "😳", "😎", "🥵", "😱", "🤑", "🙄", "💩", "🍑", "🤨", "🥴", "🔥", "👀", "🌚"])
    let top = `*${icon} Top 10 ${text} ${icon}*\n`
    selected.forEach((jid, index) => {
      top += `\n*${index + 1}. ${mention(jid)}*`
    })
    await sendText(wss, mctx, top, selected)
    return
  }

  if (commandName === "topotakus") {
    const selected = [a, b, c, d, e, f, g, h, i, j]
    let top = "*🌸 TOP 10 OTAKUS DEL GRUPO 🌸*\n"
    selected.forEach((jid, index) => {
      top += `\n*_${index + 1}.- 💮 ${mention(jid)}_* 💮`
    })
    await sendText(wss, mctx, top, selected)
    return
  }

  if (commandName === "topintegrantes" || commandName === "topintegrante") {
    const selected = [a, b, c, d, e, f, g, h, i, j]
    let top = "*_💎TOP 10 L@S MEJORES INTEGRANTES👑_*\n"
    selected.forEach((jid, index) => {
      top += `\n*_${index + 1}.- 💎 ${mention(jid)}_* 💎`
    })
    await sendText(wss, mctx, top, selected)
    return
  }

  if (commandName === "topparejas" || commandName === "top5parejas") {
    const pairs = [[a, b], [c, d], [e, f], [g, h], [i, j]]
    let top = "*_😍 Las 5 maravillosas parejas del grupo 😍_*\n"
    pairs.forEach(([x, y], index) => {
      top += `\n*_${index + 1}.- ${mention(x)} 💘 ${mention(y)}_*\n${pickRandom(["Que hermosa pareja 💖", "Se merecen lo mejor 💞", "Decreto pareja del año 💗", "Para cuando la boda 🛐", "Full química ✨"])}\n`
    })
    await sendText(wss, mctx, top, pairs.flat())
    return
  }

  await mctx.reply(`「◈」 Usa *${usedPrefix}multijuegos* para ver los juegos disponibles.`)
}

export default {
  name: "multijuegos",
  alias: [
    "juegos",
    "ppt", "suit", "pvp", "suitpvp",
    "ttt", "ttc", "tictactoe", "delttt", "tttlist", "deltt", "deltictactoe",
    "amistad", "amigorandom", "formarpareja", "formarparejas", "ship", "shippear", "personalidad", "love",
    "top", "topotakus", "topintegrantes", "topintegrante", "topparejas", "top5parejas",
  ],
  description: "Multijuegos: PPT, tateti, tops y dinámicas sanas para grupos.",
  category: "extras",
  flags: ["all.chats"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, args, usedPrefix, commandName, groupMetadata }) => {
    const privateAllowed = ["multijuegos", "juegos", "ppt", "suit", "pvp", "suitpvp", "ttt", "ttc", "tictactoe", "delttt", "tttlist", "deltt", "deltictactoe"].includes(commandName)
    if (!mctx.is_group && !privateAllowed) {
      await mctx.reply(`「◈」 MULTIJUEGOS\nComando › ${usedPrefix + commandName}\nEstado › úsalo en un grupo`)
      return
    }

    if (["ppt", "suit", "pvp", "suitpvp"].includes(commandName)) {
      await handlePPT(wss, mctx, args, usedPrefix, commandName)
      return
    }

    if (["ttt", "ttc", "tictactoe", "delttt", "tttlist", "deltt", "deltictactoe"].includes(commandName)) {
      await handleTTT(wss, mctx, args, usedPrefix, commandName)
      return
    }

    await handleRandomFun(wss, mctx, args, commandName, usedPrefix, groupMetadata)
  },
} as types.Command
