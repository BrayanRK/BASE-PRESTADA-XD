import { createShopViewCommand, getShopItemByCommand } from "../../../libs/shop.js"

const item = getShopItemByCommand("diamantes2")!
export default createShopViewCommand(item)
