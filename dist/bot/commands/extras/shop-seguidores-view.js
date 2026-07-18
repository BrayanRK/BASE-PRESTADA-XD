import { createShopViewCommand, getShopItemByCommand } from "../../../libs/shop.js";
const item = getShopItemByCommand("seguidores");
export default createShopViewCommand(item);
