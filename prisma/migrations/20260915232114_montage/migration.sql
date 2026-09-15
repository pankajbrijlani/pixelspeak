-- CreateEnum
CREATE TYPE "MontageStatus" AS ENUM ('DRAFT', 'ANALYZING', 'RENDERING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "MontageAssetType" AS ENUM ('VIDEO', 'PHOTO');

-- CreateEnum
CREATE TYPE "MontageAssetStatus" AS ENUM ('PENDING', 'ANALYZING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "MontageProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "MontageStatus" NOT NULL DEFAULT 'DRAFT',
    "targetDurationSec" INTEGER NOT NULL DEFAULT 45,
    "musicPath" TEXT,
    "outputPath" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MontageProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MontageAsset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "MontageAssetType" NOT NULL,
    "status" "MontageAssetStatus" NOT NULL DEFAULT 'PENDING',
    "originalName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "durationSec" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "captureOrder" INTEGER NOT NULL DEFAULT 0,
    "analysis" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MontageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MontageSegment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "MontageAssetType" NOT NULL,
    "inSec" DOUBLE PRECISION NOT NULL,
    "outSec" DOUBLE PRECISION NOT NULL,
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MontageSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MontageAsset_projectId_idx" ON "MontageAsset"("projectId");

-- CreateIndex
CREATE INDEX "MontageSegment_projectId_order_idx" ON "MontageSegment"("projectId", "order");

-- AddForeignKey
ALTER TABLE "MontageProject" ADD CONSTRAINT "MontageProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MontageAsset" ADD CONSTRAINT "MontageAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "MontageProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MontageSegment" ADD CONSTRAINT "MontageSegment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "MontageProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MontageSegment" ADD CONSTRAINT "MontageSegment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MontageAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
