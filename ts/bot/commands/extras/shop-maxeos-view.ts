import { createShopViewCommand, getShopItemByCommand } from "../../../libs/shop.js"

const item = getShopItemByCommand("maxeos")!
export default createShopViewCommand(item)
