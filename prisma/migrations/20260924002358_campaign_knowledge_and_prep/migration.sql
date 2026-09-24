-- AlterTable
ALTER TABLE "StoryCharacter" ADD COLUMN     "agenda" TEXT,
ADD COLUMN     "plan" TEXT;

-- CreateTable
CREATE TABLE "CampaignFact" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "sourceKind" TEXT NOT NULL DEFAULT 'GM',
    "sceneId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryArc" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "premise" TEXT,
    "goal" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Planned',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryArc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryBeat" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "arcId" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Planned',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryBeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryClock" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "current" INTEGER NOT NULL DEFAULT 0,
    "max" INTEGER NOT NULL DEFAULT 6,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryClock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignFact_campaignId_status_importance_idx" ON "CampaignFact"("campaignId", "status", "importance");

-- CreateIndex
CREATE INDEX "StoryArc_campaignId_status_idx" ON "StoryArc"("campaignId", "status");

-- CreateIndex
CREATE INDEX "StoryBeat_campaignId_status_idx" ON "StoryBeat"("campaignId", "status");

-- CreateIndex
CREATE INDEX "StoryClock_campaignId_status_idx" ON "StoryClock"("campaignId", "status");

-- AddForeignKey
ALTER TABLE "CampaignFact" ADD CONSTRAINT "CampaignFact_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryArc" ADD CONSTRAINT "StoryArc_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryBeat" ADD CONSTRAINT "StoryBeat_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryBeat" ADD CONSTRAINT "StoryBeat_arcId_fkey" FOREIGN KEY ("arcId") REFERENCES "StoryArc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryClock" ADD CONSTRAINT "StoryClock_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
