import { createShopSetCommand, getShopItemByCommand } from "../../../libs/shop.js"

const item = getShopItemByCommand("likes")!
export default createShopSetCommand(item)
