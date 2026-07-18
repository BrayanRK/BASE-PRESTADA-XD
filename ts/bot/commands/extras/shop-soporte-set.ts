import { createShopSetCommand, getShopItemByCommand } from "../../../libs/shop.js"

const item = getShopItemByCommand("setsoporte")!
export default createShopSetCommand(item)
