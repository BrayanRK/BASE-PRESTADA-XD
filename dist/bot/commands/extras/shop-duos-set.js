import { createShopSetCommand, getShopItemByCommand } from "../../../libs/shop.js";
const item = getShopItemByCommand("setduos");
export default createShopSetCommand(item);
