-- AlterTable
ALTER TABLE "Character" ADD COLUMN "shaken" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChatTurn" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'complete';
