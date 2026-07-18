import { createShopViewCommand, getShopItemByCommand } from "../../../libs/shop.js"

const item = getShopItemByCommand("likes")!
export default createShopViewCommand(item)
