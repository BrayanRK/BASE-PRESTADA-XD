import { createShopViewCommand, getShopItemByCommand } from "../../../libs/shop.js";
const item = getShopItemByCommand("combos");
export default createShopViewCommand(item);
