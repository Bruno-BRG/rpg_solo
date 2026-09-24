-- CreateTable
CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "sceneId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Setup',
    "round" INTEGER NOT NULL DEFAULT 1,
    "width" INTEGER NOT NULL DEFAULT 12,
    "height" INTEGER NOT NULL DEFAULT 12,
    "terrain" JSONB NOT NULL DEFAULT '[]',
    "deck" JSONB NOT NULL DEFAULT '[]',
    "rounds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Combatant" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'Extra',
    "characterId" TEXT,
    "storyCharacterId" TEXT,
    "x" INTEGER NOT NULL DEFAULT 0,
    "y" INTEGER NOT NULL DEFAULT 0,
    "size" INTEGER NOT NULL DEFAULT 1,
    "pace" INTEGER NOT NULL DEFAULT 6,
    "parry" INTEGER NOT NULL DEFAULT 2,
    "toughness" INTEGER NOT NULL DEFAULT 4,
    "wounds" INTEGER NOT NULL DEFAULT 0,
    "maxWounds" INTEGER NOT NULL DEFAULT 3,
    "shaken" BOOLEAN NOT NULL DEFAULT false,
    "bennies" INTEGER NOT NULL DEFAULT 0,
    "isExtra" BOOLEAN NOT NULL DEFAULT false,
    "card" JSONB,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Combatant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterLog" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncounterLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Encounter_campaignId_status_idx" ON "Encounter"("campaignId", "status");

-- CreateIndex
CREATE INDEX "Combatant_encounterId_idx" ON "Combatant"("encounterId");

-- CreateIndex
CREATE INDEX "EncounterLog_encounterId_createdAt_idx" ON "EncounterLog"("encounterId", "createdAt");

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Combatant" ADD CONSTRAINT "Combatant_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Combatant" ADD CONSTRAINT "Combatant_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Combatant" ADD CONSTRAINT "Combatant_storyCharacterId_fkey" FOREIGN KEY ("storyCharacterId") REFERENCES "StoryCharacter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterLog" ADD CONSTRAINT "EncounterLog_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
