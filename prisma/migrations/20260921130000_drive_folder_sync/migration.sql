-- AlterTable
ALTER TABLE "ExpenseCategory" ADD COLUMN "driveFolderId" TEXT;

-- AlterTable
ALTER TABLE "Expense"
    ALTER COLUMN "amount" DROP NOT NULL,
    ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_driveFolderId_key" ON "ExpenseCategory"("driveFolderId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_receiptPath_key" ON "Expense"("receiptPath");
