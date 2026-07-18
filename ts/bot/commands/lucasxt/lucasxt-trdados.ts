import type * as types from "../../../types/types.js"
import { Command } from "../../../libs/libs.js"
import { downloadMediaBuffer } from "../../../libs/media.js"
import {
  DICE_SLOTS,
  addDiceEntry,
  getRandomDiceEntry,
  listDiceEntries,
  nextEmptySlot,
  readDiceBuffer,
  type DiceKind,
} from "../../../libs/dice-stickers.js"

const card = (title: string, lines: string[] = []): string => [`「◈」 *${title}*`, ...lines].join("\n")

const kindFromType = (type?: string): DiceKind | null => {
  if (type === "stickerMessage") return "sticker"
  if (type === "videoMessage") return "video"
  if (type === "imageMessage") return "image"
  return null
}

const sendDiceEntry = async (
  wss: types.WASocket,
  mctx: types.MessageContext,
  entry: { kind: DiceKind; mimetype: string },
  buffer: Buffer,
): Promise<void> => {
  if (entry.kind === "sticker") {
    await wss.sendMessage(mctx.chat.jid, { sticker: buffer }, { quoted: mctx.message.original })
    return
  }

  if (entry.kind === "video") {
    await wss.sendMessage(
      mctx.chat.jid,
      { video: buffer, gifPlayback: true, mimetype: entry.mimetype || "video/mp4" },
      { quoted: mctx.message.original },
    )
    return
  }

  await wss.sendMessage(mctx.chat.jid, { image: buffer }, { quoted: mctx.message.original })
}

const tirarCommand: types.Command = {
  name: "tirar",
  alias: ["st"],
  description: "Tira el dado y manda uno de los stickers/gifs guardados al azar.",
  category: "games",
  hidden: false,
  flags: ["all.chats"],
  requires: [],
  execute: async (wss, { mctx }) => {
    const entry = getRandomDiceEntry()

    if (!entry) {
      await mctx.reply(card("Sin dados guardados", [`Pídele al owner que use *.stadd* respondiendo un sticker o gif.`]))
      return
    }

    const buffer = readDiceBuffer(entry)
    if (!buffer) {
      await mctx.reply(card("Error", [`El slot *${entry.slot}* está dañado o falta el archivo, avisa al owner.`]))
      return
    }

    await sendDiceEntry(wss, mctx, entry, buffer)
  },
}

const stAddCommand: types.Command = {
  name: "stadd",
  alias: [],
  description: "Guarda un sticker/gif de dado (hasta 6 slots), persiste tras reinicios.",
  using: "responde un sticker o gif [slot 1-6]",
  category: "lucasxt",
  hidden: true,
  flags: ["all.chats"],
  requires: ["bot.owner"],
  execute: async (_wss, { mctx, args }) => {
    const kind = kindFromType(mctx.quoted?.message?.type)

    if (!mctx.quoted || !kind) {
      await mctx.reply(card("stadd", [`Responde a un sticker, gif o imagen con *.stadd [slot 1-6]*.`]))
      return
    }

    const requestedSlot = Number.parseInt(args[0] || "", 10)
    const slot = Number.isInteger(requestedSlot) && requestedSlot >= 1 && requestedSlot <= DICE_SLOTS ? requestedSlot : nextEmptySlot()

    if (!slot) {
      await mctx.reply(
        card("stadd", [`Los ${DICE_SLOTS} slots están llenos.`, `Usa *.stadd <slot 1-${DICE_SLOTS}>* para reemplazar uno.`]),
      )
      return
    }

    let buffer: Buffer
    try {
      buffer = await downloadMediaBuffer(mctx.quoted, "sticker")
    } catch (error) {
      await mctx.reply(card("stadd", [`No pude descargar el archivo, reenvíalo y prueba de nuevo.`]))
      return
    }

    addDiceEntry(buffer, kind, mctx.quoted.message.mimetype || "", slot, mctx.sender.jid)

    const filled = listDiceEntries().length
    await mctx.reply(card("Dado guardado", [`Slot 》 ${slot}/${DICE_SLOTS}`, `Tipo 》 ${kind}`, `Guardados 》 ${filled}/${DICE_SLOTS}`]))
  },
}

Command.loaded.set(stAddCommand.name, stAddCommand)

export default tirarCommand
