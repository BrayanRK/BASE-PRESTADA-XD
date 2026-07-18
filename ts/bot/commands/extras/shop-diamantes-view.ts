import { createShopViewCommand, getShopItemByCommand } from "../../../libs/shop.js"

const item = getShopItemByCommand("diamantes")!
export default createShopViewCommand(item)
