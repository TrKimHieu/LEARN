-- AlterEnum
ALTER TYPE "AIJobType" ADD VALUE 'GENERATE_FLASHCARDS';

-- CreateTable
CREATE TABLE "FlashcardDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "aiJobId" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlashcardDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlashcardDraft_userId_createdAt_idx" ON "FlashcardDraft"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FlashcardDraft_aiJobId_idx" ON "FlashcardDraft"("aiJobId");

-- AddForeignKey
ALTER TABLE "FlashcardDraft" ADD CONSTRAINT "FlashcardDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardDraft" ADD CONSTRAINT "FlashcardDraft_aiJobId_fkey" FOREIGN KEY ("aiJobId") REFERENCES "AIJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
