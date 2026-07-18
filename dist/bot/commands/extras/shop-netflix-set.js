import { createShopSetCommand, getShopItemByCommand } from "../../../libs/shop.js";
const item = getShopItemByCommand("setnetflix");
export default createShopSetCommand(item);
