import type * as types from "../../../types/types.js"
import { getRuntimeChannelUrl } from "../../../libs/zeta_cf.js"
import { mergeCaptionWithMenuMedia } from "../../../libs/zeta_assets.js"

const FOOTER = "© créditos skyultraplus"

type GachaItem = {
  names: string[]
  using?: string
  description: string
}

type GachaSection = {
  title: string
  icon: string
  description: string
  commands: GachaItem[]
}

const cleanText = (value: unknown, fallback = ""): string => {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()

  return text || fallback
}

const formatNames = (prefix: string, names: string[]): string => {
  return names.map((name) => `\`${prefix}${name}\``).join(" ")
}

const sectionBlock = (prefix: string, section: GachaSection): string => {
  let text = `╭─〔 ${section.icon} ${section.title} 〕
`
  text += `│ ✦ ${section.description}
`
  text += `│
`

  section.commands.forEach((command) => {
    text += `│ ◦ ${formatNames(prefix, command.names)}${command.using ? ` _${command.using}_` : ""}
`
    text += `│ │ ${command.description}
`
  })

  text += `╰────────────
`

  return text
}

const sections: GachaSection[] = [
  {
    title: "RECLAMOS",
    icon: "🎴",
    description: "Rueda personajes y reclámalos antes que otros.",
    commands: [
      {
        names: ["rollwaifu", "rw", "roll"],
        description: "Lanza una waifu o husbando aleatorio.",
      },
      {
        names: ["claim", "c", "reclamar"],
        using: "{citar personaje}",
        description: "Reclama el personaje activo del grupo.",
      },
      {
        names: ["gachainfo", "ginfo", "infogacha"],
        using: "<@usuario>",
        description: "Muestra tu perfil gacha o el de un usuario.",
      },
      {
        names: ["harem", "waifus", "claims"],
        using: "<@usuario>",
        description: "Muestra personajes reclamados.",
      },
    ],
  },
  {
    title: "PERSONAJES",
    icon: "🌸",
    description: "Consulta datos, imágenes y videos de personajes.",
    commands: [
      {
        names: ["charinfo", "winfo", "waifuinfo"],
        using: "[nombre]",
        description: "Muestra información del personaje.",
      },
      {
        names: ["charimage", "waifuimage", "cimage", "wimage"],
        using: "[nombre]",
        description: "Envía una imagen aleatoria del personaje.",
      },
      {
        names: ["charvideo", "waifuvideo", "cvideo", "wvideo"],
        using: "[nombre]",
        description: "Envía un video del personaje si existe.",
      },
      {
        names: ["serieinfo", "ainfo", "animeinfo"],
        using: "[anime]",
        description: "Muestra información del anime o serie.",
      },
    ],
  },
  {
    title: "MERCADO",
    icon: "💰",
    description: "Compra, vende y mueve personajes usando tu moneda.",
    commands: [
      {
        names: ["haremshop", "tiendawaifus", "wshop"],
        using: "<página>",
        description: "Muestra personajes en venta.",
      },
      {
        names: ["buycharacter", "buychar", "buyc"],
        using: "[nombre]",
        description: "Compra un personaje publicado en venta.",
      },
      {
        names: ["sell", "vender"],
        using: "[precio] [nombre]",
        description: "Pone un personaje tuyo en venta.",
      },
      {
        names: ["removesale", "removerventa"],
        using: "[nombre]",
        description: "Quita tu personaje de la venta.",
      },
    ],
  },
  {
    title: "INTERCAMBIO",
    icon: "🤝",
    description: "Regala, elimina o intercambia personajes.",
    commands: [
      {
        names: ["givechar", "givewaifu", "regalar"],
        using: "[@usuario] [nombre]",
        description: "Regala un personaje a otro usuario.",
      },
      {
        names: ["giveallharem"],
        using: "[@usuario]",
        description: "Regala todos tus personajes a otro usuario.",
      },
      {
        names: ["deletewaifu", "delwaifu", "delchar"],
        using: "[nombre]",
        description: "Elimina un personaje reclamado.",
      },
      {
        names: ["trade", "intercambiar"],
        using: "[tu personaje] / [personaje 2]",
        description: "Intercambia personajes entre usuarios.",
      },
    ],
  },
  {
    title: "TOPS Y VOTOS",
    icon: "🏆",
    description: "Sube valor y mira rankings.",
    commands: [
      {
        names: ["vote", "votar"],
        using: "[nombre]",
        description: "Vota por un personaje para subir su valor.",
      },
      {
        names: ["waifusboard", "waifustop", "topwaifus", "wtop"],
        using: "<número>",
        description: "Top de personajes con mayor valor.",
      },
      {
        names: ["favoritetop", "favtop"],
        description: "Top de personajes más votados.",
      },
    ],
  },
  {
    title: "CONFIGURACIÓN",
    icon: "🧩",
    description: "Personaliza mensajes del sistema Gacha.",
    commands: [
      {
        names: ["setclaimmsg", "setclaim"],
        using: "[mensaje]",
        description: "Modifica el mensaje al reclamar personaje.",
      },
      {
        names: ["delclaimmsg"],
        description: "Restablece el mensaje de reclamo.",
      },
    ],
  },
]

export default {
  name: "gacha",
  alias: ["menugacha", "gachamenu"],
  description: "Muestra el menú de comandos gacha.",
  category: "games",
  using: "",
  flags: ["only.groups"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, usedPrefix, bot }) => {
    const botName = cleanText(bot.name, "bot")
    const senderName = cleanText(mctx.sender.name, "user")
    const totalFunctions = sections.reduce((total, section) => total + section.commands.length, 0)

    let message = `╭─〔 🎴 MENÚ GACHA 〕\n`
    message += `│ ✦ Hola › ${senderName}\n`
    message += `│ ✦ Bot › ${botName}\n`
    message += `│ ✦ Funciones › ${totalFunctions.toLocaleString("en-US")}\n`
    message += `│ ✦ Moneda › ${cleanText(bot.currency, "Coins")}\n`
    const channelUrl = getRuntimeChannelUrl()
    if (channelUrl) message += `│ ✦ Canal › ${channelUrl}\n`
    message += `╰────────────` + "‎".repeat(650) + "ㅤㅤㅤㅤ\n\n"

    sections.forEach((section) => {
      message += sectionBlock(usedPrefix, section)
      message += "\n"
    })

    message += `╭─〔 ✦ CRÉDITOS 〕\n│ ${FOOTER}\n╰────────────`

    await wss.sendMessage(
      mctx.chat.jid,
      await mergeCaptionWithMenuMedia("rpg", message, bot),
      {
        quoted: mctx.message.original,
      },
    )
  },
} as types.Command
