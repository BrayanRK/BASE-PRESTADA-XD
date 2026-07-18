import { createShopSetCommand, getShopItemByCommand } from "../../../libs/shop.js";
const item = getShopItemByCommand("setlotes");
export default createShopSetCommand(item);
