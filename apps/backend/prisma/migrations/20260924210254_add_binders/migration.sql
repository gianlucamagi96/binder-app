-- CreateEnum
CREATE TYPE "BinderType" AS ENUM ('GAME', 'EXPANSION', 'FREE');

-- CreateTable
CREATE TABLE "Binder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BinderType" NOT NULL,
    "tcgGameCode" TEXT,
    "rows" INTEGER NOT NULL,
    "cols" INTEGER NOT NULL,
    "coverStyle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Binder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BinderExpansion" (
    "id" TEXT NOT NULL,
    "binderId" TEXT NOT NULL,
    "tcgdexExpansionId" TEXT NOT NULL,

    CONSTRAINT "BinderExpansion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BinderPage" (
    "id" TEXT NOT NULL,
    "binderId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,

    CONSTRAINT "BinderPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BinderSlot" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "tcgdexCardId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "condition" TEXT,

    CONSTRAINT "BinderSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BinderExpansion_binderId_tcgdexExpansionId_key" ON "BinderExpansion"("binderId", "tcgdexExpansionId");

-- CreateIndex
CREATE UNIQUE INDEX "BinderPage_binderId_pageNumber_key" ON "BinderPage"("binderId", "pageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BinderSlot_pageId_position_key" ON "BinderSlot"("pageId", "position");

-- AddForeignKey
ALTER TABLE "Binder" ADD CONSTRAINT "Binder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BinderExpansion" ADD CONSTRAINT "BinderExpansion_binderId_fkey" FOREIGN KEY ("binderId") REFERENCES "Binder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BinderPage" ADD CONSTRAINT "BinderPage_binderId_fkey" FOREIGN KEY ("binderId") REFERENCES "Binder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BinderSlot" ADD CONSTRAINT "BinderSlot_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "BinderPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
