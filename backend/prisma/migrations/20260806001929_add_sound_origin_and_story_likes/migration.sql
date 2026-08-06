-- AlterTable
ALTER TABLE "Sound" ADD COLUMN     "origin_user_id" TEXT;

-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "like_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "StoryLike" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoryLike_story_id_idx" ON "StoryLike"("story_id");

-- CreateIndex
CREATE UNIQUE INDEX "StoryLike_story_id_user_id_key" ON "StoryLike"("story_id", "user_id");

-- AddForeignKey
ALTER TABLE "Sound" ADD CONSTRAINT "Sound_origin_user_id_fkey" FOREIGN KEY ("origin_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryLike" ADD CONSTRAINT "StoryLike_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryLike" ADD CONSTRAINT "StoryLike_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
