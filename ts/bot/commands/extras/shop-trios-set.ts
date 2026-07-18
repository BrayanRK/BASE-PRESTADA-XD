import { createShopSetCommand, getShopItemByCommand } from "../../../libs/shop.js"

const item = getShopItemByCommand("settrios")!
export default createShopSetCommand(item)
