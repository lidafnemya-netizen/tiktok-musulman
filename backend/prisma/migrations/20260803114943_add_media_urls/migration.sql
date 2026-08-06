-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "media_urls" TEXT[] DEFAULT ARRAY[]::TEXT[];
