import { createShopSetCommand, getShopItemByCommand } from "../../../libs/shop.js"

const item = getShopItemByCommand("settramites")!
export default createShopSetCommand(item)
