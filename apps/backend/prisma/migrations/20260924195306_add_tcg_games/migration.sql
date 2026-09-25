-- CreateEnum
CREATE TYPE "TcgGameStatus" AS ENUM ('ACTIVE', 'COMING_SOON');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activeTcgGameCode" TEXT;

-- CreateTable
CREATE TABLE "TcgGame" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "status" "TcgGameStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TcgGame_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TcgGame_code_key" ON "TcgGame"("code");
