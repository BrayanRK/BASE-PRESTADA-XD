import { createShopViewCommand, getShopItemByCommand } from "../../../libs/shop.js"

const item = getShopItemByCommand("lotes")!
export default createShopViewCommand(item)
