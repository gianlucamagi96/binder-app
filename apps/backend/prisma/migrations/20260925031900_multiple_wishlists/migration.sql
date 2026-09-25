-- CreateTable
CREATE TABLE "Wishlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wishlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Wishlist_userId_idx" ON "Wishlist"("userId");

-- AddForeignKey
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add wishlistId (nullable during backfill)
ALTER TABLE "WishlistItem" ADD COLUMN "wishlistId" TEXT;

-- Una wishlist di default per ogni utente che ha già voci
INSERT INTO "Wishlist" ("id", "userId", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."userId", 'Wishlist', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "userId" FROM "WishlistItem") AS u;

UPDATE "WishlistItem" AS wi
SET "wishlistId" = w."id"
FROM "Wishlist" AS w
WHERE w."userId" = wi."userId";

-- Se restassero righe orfane (non dovrebbe), eliminale
DELETE FROM "WishlistItem" WHERE "wishlistId" IS NULL;

ALTER TABLE "WishlistItem" ALTER COLUMN "wishlistId" SET NOT NULL;

-- Drop old unique + FK + userId
DROP INDEX IF EXISTS "WishlistItem_userId_tcgdexCardId_key";
ALTER TABLE "WishlistItem" DROP CONSTRAINT IF EXISTS "WishlistItem_userId_fkey";
ALTER TABLE "WishlistItem" DROP COLUMN "userId";

-- New unique + FK
CREATE UNIQUE INDEX "WishlistItem_wishlistId_tcgdexCardId_key" ON "WishlistItem"("wishlistId", "tcgdexCardId");

ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_wishlistId_fkey" FOREIGN KEY ("wishlistId") REFERENCES "Wishlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
