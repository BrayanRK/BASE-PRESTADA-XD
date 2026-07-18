import { createShopSetCommand, getShopItemByCommand } from "../../../libs/shop.js"

const item = getShopItemByCommand("setdiamantes")!
export default createShopSetCommand(item)
