import { createShopSetCommand, getShopItemByCommand } from "../../../libs/shop.js"

const item = getShopItemByCommand("fragmentos")!
export default createShopSetCommand(item)
