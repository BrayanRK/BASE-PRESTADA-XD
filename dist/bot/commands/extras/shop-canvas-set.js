import { createShopSetCommand, getShopItemByCommand } from "../../../libs/shop.js";
const item = getShopItemByCommand("setcanvas");
export default createShopSetCommand(item);
