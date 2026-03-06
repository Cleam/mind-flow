/*
  Warnings:

  - You are about to drop the `DocumentChunk` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "DocumentChunk";

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" BIGSERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);
