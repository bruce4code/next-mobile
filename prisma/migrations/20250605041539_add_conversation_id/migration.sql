/*
  Warnings:

  - Added the required column `conversationId` to the `OpenRouterChat` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "OpenRouterChat" ADD COLUMN     "conversationId" TEXT NOT NULL;
