import * as database from "./database/connect.js"
import * as libs from "./libs/libs.js"

const nodeMajor = Number(process.versions.node.split(".")[0] || 0)

if (nodeMajor < 20) {
  throw new Error(`[System] ZETA necesita Node.js >= 20. Versión actual: ${process.versions.node}`)
}

await database.connect()
await libs.Command.load()
libs.Command.watch()

libs.loadSessions()
