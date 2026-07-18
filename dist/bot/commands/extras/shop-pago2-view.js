import { createShopViewCommand, getShopItemByCommand } from "../../../libs/shop.js";
const item = getShopItemByCommand("pago2");
export default createShopViewCommand(item);
