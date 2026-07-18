import { createShopViewCommand, getShopItemByCommand } from "../../../libs/shop.js";
const item = getShopItemByCommand("canvas");
export default createShopViewCommand(item);
