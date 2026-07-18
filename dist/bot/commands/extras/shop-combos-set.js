import { createShopSetCommand, getShopItemByCommand } from "../../../libs/shop.js";
const item = getShopItemByCommand("setcombos");
export default createShopSetCommand(item);
