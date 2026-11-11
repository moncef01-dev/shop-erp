export {
  deductStockForSaleItem,
  restoreStockForCancelledSale,
  receiveStockForPurchaseItem,
  reverseStockForCancelledPurchase,
} from "@/server/services/inventory";
export type { TxClient as PrismaTransactionClient } from "@/server/db";
