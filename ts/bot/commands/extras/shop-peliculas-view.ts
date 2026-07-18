import { createShopViewCommand, getShopItemByCommand } from "../../../libs/shop.js"

const item = getShopItemByCommand("peliculas")!
export default createShopViewCommand(item)
