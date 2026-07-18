import type * as types from "../../../types/types.js"
import { getConnection } from "../../../database/connect.js"
import { BET_EXAMPLE_AMOUNT, MIN_BET_AMOUNT, formatMoney, getCurrency, getGroupUser, minBetMessage, parseBetAmount, randomInt } from "../../../libs/economy.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"

const SUITS = ["♠", "♥", "♦", "♣"]
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]

type Card = { rank: string; suit: string }
type BlackjackGame = {
  amount: number
  scopedGroupJid: string
  userJid: string
  player: Card[]
  dealer: Card[]
  resolved: boolean
  timeout: NodeJS.Timeout
}

const activeGames = new Map<string, BlackjackGame>()
const sessionKey = (chatJid: string, userJid: string): string => `${chatJid}:${userJid}`

const drawCard = (): Card => ({ rank: RANKS[randomInt(0, RANKS.length - 1)], suit: SUITS[randomInt(0, SUITS.length - 1)] })

const cardLabel = (card: Card): string => `${card.rank}${card.suit}`

const handValue = (cards: Card[]): number => {
  let total = 0
  let aces = 0

  for (const card of cards) {
    if (card.rank === "A") {
      aces++
      total += 11
    } else if (["J", "Q", "K"].includes(card.rank)) {
      total += 10
    } else {
      total += Number(card.rank)
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10
    aces--
  }

  return total
}

const handLabel = (cards: Card[]): string => cards.map(cardLabel).join(" ")
const isBlackjack = (cards: Card[]): boolean => cards.length === 2 && handValue(cards) === 21

const settleGame = async (
  wss: types.WASocket,
  mctx: types.MessageContext,
  key: string,
  game: BlackjackGame,
  currency: string,
  reason: "stand" | "bust" | "timeout",
): Promise<void> => {
  clearTimeout(game.timeout)
  activeGames.delete(key)
  game.resolved = true

  const playerTotal = handValue(game.player)
  let dealerTotal = handValue(game.dealer)

  if (reason !== "bust") {
    while (dealerTotal < 17) {
      game.dealer.push(drawCard())
      dealerTotal = handValue(game.dealer)
    }
  }

  let outcome: "win" | "lose" | "push" | "blackjack" = "lose"

  if (reason === "bust") {
    outcome = "lose"
  } else if (isBlackjack(game.player) && !isBlackjack(game.dealer)) {
    outcome = "blackjack"
  } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
    outcome = "win"
  } else if (playerTotal === dealerTotal) {
    outcome = "push"
  } else {
    outcome = "lose"
  }

  let delta = -game.amount
  let resultLabel = "*Perdiste*"

  if (outcome === "blackjack") {
    delta = Math.floor(game.amount * 1.5)
    resultLabel = "*¡Blackjack!* 🎉"
  } else if (outcome === "win") {
    delta = game.amount
    resultLabel = "*Ganaste*"
  } else if (outcome === "push") {
    delta = 0
    resultLabel = "*Empate*, recuperas tu apuesta"
  }

  try {
    const conn = getConnection()
    conn.run(
      `UPDATE group_users SET money = money + ? WHERE group_jid = ? AND user_jid = ?`,
      [delta, game.scopedGroupJid, game.userJid],
    )

    const timeoutNote = reason === "timeout" ? "\n⟡ _Se plantó automáticamente por inactividad._" : ""
    const message = `「◈」 Blackjack\n` +
      `⟡ Tu mano » ${handLabel(game.player)} (*${playerTotal}*)\n` +
      `⟡ Mano del bot » ${handLabel(game.dealer)} (*${dealerTotal}*)\n` +
      `⟡ Apuesta » *${formatMoney(game.amount, currency)}*\n` +
      `⟡ Premio » ${delta > 0 ? `+*${formatMoney(delta, currency)}*` : delta < 0 ? `-*${formatMoney(Math.abs(delta), currency)}*` : `*${formatMoney(0, currency)}*`}\n` +
      `⟡ Resultado » ${resultLabel}${timeoutNote}`

    await wss.sendMessage(mctx.chat.jid, { text: message }, { quoted: mctx.message.original })
  } catch (error) {
    console.error("[Blackjack] Error al liquidar:", error)
  }
}

const command: types.Command = {
  name: "blackjack",
  alias: ["bj"],
  description: "Jugar blackjack contra el bot apostando {currency}. Gana x2, blackjack natural paga x2.5.",
  category: "economy",
  using: "[cantidad] | luego usa hit (pedir) o stand (plantarse)",
  hidden: false,
  flags: ["only.groups"],
  requires: [],
  execute: async (wss, { mctx, args, group, bot, usedPrefix }) => {
    const currency = getCurrency(bot)
    const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid)
    const groupUser = getGroupUser(group, mctx.sender.jid)
    const key = sessionKey(mctx.chat.jid, mctx.sender.jid)

    if (!groupUser) {
      await mctx.reply(`「◈」 No se pudo obtener tus datos en este grupo, vuelve a intentarlo.`)
      return
    }

    const action = String(args[0] ?? "").trim().toLowerCase()
    const existingGame = activeGames.get(key)

    if (existingGame && ["hit", "pedir", "h"].includes(action)) {
      existingGame.player.push(drawCard())
      const total = handValue(existingGame.player)

      if (total > 21) {
        await settleGame(wss, mctx, key, existingGame, currency, "bust")
        return
      }

      await mctx.reply(
        `「◈」 Blackjack\n⟡ Tu mano » ${handLabel(existingGame.player)} (*${total}*)\n⟡ Usa *${usedPrefix}bj hit* para pedir otra o *${usedPrefix}bj stand* para plantarte.`,
      )
      return
    }

    if (existingGame && ["stand", "plantarse", "s"].includes(action)) {
      await settleGame(wss, mctx, key, existingGame, currency, "stand")
      return
    }

    if (existingGame) {
      await mctx.reply(`「◈」 Blackjack\n⟡ Ya tienes una partida en curso. Usa *${usedPrefix}bj hit* o *${usedPrefix}bj stand*.`)
      return
    }

    const amount = parseBetAmount(args[0], groupUser.money)

    if (!amount) {
      const help = `「◈」 Blackjack\n` +
        `⟡ Uso » *${usedPrefix}blackjack 1000*\n` +
        `⟡ Alias » *${usedPrefix}bj 1000*\n` +
        `⟡ Mínimo » *${formatMoney(MIN_BET_AMOUNT, currency)}*\n` +
        `⟡ Premio » x2 normal, x2.5 con blackjack natural, apuesta de *${formatMoney(BET_EXAMPLE_AMOUNT, currency)}*`
      await mctx.reply(help)
      return
    }

    if (amount < MIN_BET_AMOUNT) {
      await mctx.reply(minBetMessage(currency))
      return
    }

    if (amount > groupUser.money) {
      await mctx.reply(`「◈」 No tienes suficiente *${currency}*. Tienes *${formatMoney(groupUser.money, currency)}*.`)
      return
    }

    try {
      const conn = getConnection()
      conn.run(
        `UPDATE group_users SET money = money - ? WHERE group_jid = ? AND user_jid = ? AND money >= ?`,
        [amount, scopedGroupJid, mctx.sender.jid, amount],
      )
    } catch (error) {
      console.error("[Blackjack] Error al reservar apuesta:", error)
      await mctx.reply(`「◈」 Error al procesar la apuesta.`)
      return
    }

    const player = [drawCard(), drawCard()]
    const dealer = [drawCard(), drawCard()]

    const game: BlackjackGame = {
      amount,
      scopedGroupJid,
      userJid: mctx.sender.jid,
      player,
      dealer,
      resolved: false,
      timeout: setTimeout(() => {
        const current = activeGames.get(key)
        if (current && !current.resolved) {
          settleGame(wss, mctx, key, current, currency, "timeout").catch(() => null)
        }
      }, 60_000),
    }

    activeGames.set(key, game)

    if (isBlackjack(player)) {
      await settleGame(wss, mctx, key, game, currency, "stand")
      return
    }

    await mctx.reply(
      `「◈」 Blackjack\n` +
        `⟡ Apuesta » *${formatMoney(amount, currency)}*\n` +
        `⟡ Tu mano » ${handLabel(player)} (*${handValue(player)}*)\n` +
        `⟡ Mano del bot » ${cardLabel(dealer[0])} 🂠\n` +
        `⟡ Usa *${usedPrefix}bj hit* para pedir otra o *${usedPrefix}bj stand* para plantarte.\n` +
        `⟡ Tienes *60 segundos* o se plantará automáticamente.`,
    )
  },
}

export default command
