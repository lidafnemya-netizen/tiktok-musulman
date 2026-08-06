-- AlterTable
ALTER TABLE "Follow" ADD COLUMN     "notify_live" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_post" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "profile_view_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "profile_views_checked_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProfileView" (
    "id" TEXT NOT NULL,
    "viewer_id" TEXT NOT NULL,
    "viewed_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileView_viewed_id_created_at_idx" ON "ProfileView"("viewed_id", "created_at");

-- CreateIndex
CREATE INDEX "ProfileView_viewer_id_idx" ON "ProfileView"("viewer_id");

-- AddForeignKey
ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_viewed_id_fkey" FOREIGN KEY ("viewed_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
