import { createShopViewCommand, getShopItemByCommand } from "../../../libs/shop.js";
const item = getShopItemByCommand("duos");
export default createShopViewCommand(item);
