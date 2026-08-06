-- CreateEnum
CREATE TYPE "PostVisibility" AS ENUM ('PUBLIC', 'FOLLOWERS', 'FRIENDS');

-- AlterEnum
ALTER TYPE "PostStatus" ADD VALUE 'DRAFT';

-- AlterTable
ALTER TABLE "Follow" ADD COLUMN     "notify_story" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "visibility" "PostVisibility" NOT NULL DEFAULT 'PUBLIC';

-- CreateTable
CREATE TABLE "SoundFavorite" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sound_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoundFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoundRecent" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sound_id" TEXT NOT NULL,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoundRecent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SoundFavorite_user_id_idx" ON "SoundFavorite"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "SoundFavorite_user_id_sound_id_key" ON "SoundFavorite"("user_id", "sound_id");

-- CreateIndex
CREATE INDEX "SoundRecent_user_id_idx" ON "SoundRecent"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "SoundRecent_user_id_sound_id_key" ON "SoundRecent"("user_id", "sound_id");

-- AddForeignKey
ALTER TABLE "SoundFavorite" ADD CONSTRAINT "SoundFavorite_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoundFavorite" ADD CONSTRAINT "SoundFavorite_sound_id_fkey" FOREIGN KEY ("sound_id") REFERENCES "Sound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoundRecent" ADD CONSTRAINT "SoundRecent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoundRecent" ADD CONSTRAINT "SoundRecent_sound_id_fkey" FOREIGN KEY ("sound_id") REFERENCES "Sound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
