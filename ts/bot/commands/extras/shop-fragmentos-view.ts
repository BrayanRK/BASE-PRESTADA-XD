import { createShopViewCommand, getShopItemByCommand } from "../../../libs/shop.js"

const item = getShopItemByCommand("fragmentos")!
export default createShopViewCommand(item)
