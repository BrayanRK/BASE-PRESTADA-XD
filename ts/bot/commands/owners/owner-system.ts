import type * as types from "../../../types/types.js"
import os from "os"
import * as database from "../../../database/database.js"

const command: types.Command = {
  name: "system",
  alias: ["sys", "info"],
  description: "Muestra información del sistema",
  category: "owner",
  flags: ["all.chats"],
  requires: ["bot.owner"],
  hidden: false,
  execute: async (wss, { mctx }) => {
    try {
      const uptime = process.uptime()
      const memUsage = process.memoryUsage()
      const totalUsers = await database.Users.size()
      const totalGroups = await database.Groups.size()
      const totalBots = await database.Bots.size()

      const formatUptime = (seconds: number) => {
        const days = Math.floor(seconds / 86400)
        const hours = Math.floor((seconds % 86400) / 3600)
        const minutes = Math.floor((seconds % 3600) / 60)
        return `${days}d ${hours}h ${minutes}m`
      }

      const formatBytes = (bytes: number) => {
        return (bytes / 1024 / 1024).toFixed(2) + " MB"
      }

      let message = `「❖」 Información del Sistema\n\n`
      message += `> *✦* Tiempo activo › *${formatUptime(uptime)}*\n`
      message += `> *✦* Memoria usada › *${formatBytes(memUsage.heapUsed)}*\n`
      message += `> *✦* Memoria total › *${formatBytes(memUsage.heapTotal)}*\n`
      message += `> *✦* CPU › *${os.cpus()[0].model}*\n`
      message += `> *✦* Plataforma › *${os.platform()} ${os.arch()}*\n`
      message += `> *✦* Node.js › *${process.version}*\n\n`
      message += `「❖」 Estadísticas de Base de Datos\n\n`
      message += `> *✦* Usuarios › *${totalUsers}*\n`
      message += `> *✦* Grupos › *${totalGroups}*\n`
      message += `> *✦* Bots › *${totalBots}*`

      await mctx.reply(message)
    } catch (error) {
      await mctx.reply(`「✘」 Error obteniendo información del sistema: ${error}`)
    }
  },
}

export default command
