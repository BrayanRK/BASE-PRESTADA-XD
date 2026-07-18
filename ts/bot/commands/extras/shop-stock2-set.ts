import { createShopSetCommand, getShopItemByCommand } from "../../../libs/shop.js"

const item = getShopItemByCommand("setstock2")!
export default createShopSetCommand(item)
