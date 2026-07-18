import { createShopViewCommand, getShopItemByCommand } from "../../../libs/shop.js"

const item = getShopItemByCommand("stock3")!
export default createShopViewCommand(item)
