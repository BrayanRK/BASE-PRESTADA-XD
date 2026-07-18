import * as types from "../../../types/types.js"
import * as database from "../../../database/database.js"

const cleanName = (value: unknown, fallback = "Usuario"): string => {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()

  return text && text !== "~" ? text : fallback
}

const percent = (current: number, total: number): string => {
  if (!total || total <= 0) return "0%"
  return `${Math.min(100, Math.floor((current / total) * 100))}%`
}

const getTargetJid = (mctx: types.MessageContext): string => {
  return mctx.message.mentioned?.[0] || mctx.message.mentionedJid?.[0] || mctx.quoted?.sender?.jid || mctx.sender.jid
}

export default <types.Command>{
  name: "level",
  alias: ["lvl"],
  description: "Ver tu nivel y experiencia actual.",
  category: "main",
  using: "<@mencion>",
  hidden: false,
  requires: [],
  flags: ["only.groups"],
  execute: async (wss, { mctx }) => {
    const targetJid = getTargetJid(mctx)
    let user = await database.Users.get(targetJid)

    if (!user) {
      user = await database.Users.set(targetJid, { user_jid: targetJid, name: "~", range: "User", level: 1, experience: 0 })
    }

    if (!user) {
      await mctx.reply(`「♛」 No se pudo obtener el perfil del usuario.`)
      return
    }

    const targetName =
      targetJid === mctx.sender.jid
        ? cleanName(mctx.sender.name, user.name)
        : cleanName(await wss.getName(targetJid).catch(() => ""), user.name || `@${targetJid.split("@")[0]}`)

    const nextLevelExp = 50 * Math.pow(Number(user.level || 1) + 1, 2)
    const levelUsers = await database.Users.values()
    const levelRank =
      [...levelUsers]
        .sort((a, b) => Number(b.level || 0) - Number(a.level || 0) || Number(b.experience || 0) - Number(a.experience || 0))
        .findIndex((item) => item.user_jid === targetJid) + 1

    let message = `「◈」 Nivel
`
    message += `◈ Usuario 》 *${targetName}*
`
    message += `◈ Nivel   》 *${Number(user.level || 1).toLocaleString("en-US")}*
`
    message += `◈ Exp     》 *${Number(user.experience || 0).toLocaleString("en-US")} / ${nextLevelExp.toLocaleString("en-US")}*
`
    message += `◈ Progreso》 *${percent(Number(user.experience || 0), nextLevelExp)}*
`
    message += `◈ Puesto  》 *#${levelRank || "?"}*`

    await wss.sendMessage(
      mctx.chat.jid,
      {
        text: message,
        mentions: [targetJid],
      },
      {
        quoted: mctx.message.original,
      },
    )
  },
}
