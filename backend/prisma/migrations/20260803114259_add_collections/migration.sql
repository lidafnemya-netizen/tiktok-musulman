-- AlterTable
ALTER TABLE "LiveSession" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'general',
ADD COLUMN     "chat_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "peak_viewers" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "thumbnail_url" TEXT;

-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "linked_post_id" TEXT;

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cover_url" TEXT,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionItem" (
    "id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveMessage" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "cover_url" TEXT,
    "summary" TEXT NOT NULL,
    "content_url" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "save_count" INTEGER NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookLike" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repost" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Repost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotInterested" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotInterested_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Collection_user_id_idx" ON "Collection"("user_id");

-- CreateIndex
CREATE INDEX "CollectionItem_collection_id_idx" ON "CollectionItem"("collection_id");

-- CreateIndex
CREATE INDEX "CollectionItem_post_id_idx" ON "CollectionItem"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionItem_collection_id_post_id_key" ON "CollectionItem"("collection_id", "post_id");

-- CreateIndex
CREATE INDEX "LiveMessage_session_id_created_at_idx" ON "LiveMessage"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "Book_user_id_idx" ON "Book"("user_id");

-- CreateIndex
CREATE INDEX "Book_created_at_idx" ON "Book"("created_at");

-- CreateIndex
CREATE INDEX "BookLike_user_id_idx" ON "BookLike"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "BookLike_user_id_book_id_key" ON "BookLike"("user_id", "book_id");

-- CreateIndex
CREATE INDEX "Repost_user_id_idx" ON "Repost"("user_id");

-- CreateIndex
CREATE INDEX "Repost_post_id_idx" ON "Repost"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "Repost_user_id_post_id_key" ON "Repost"("user_id", "post_id");

-- CreateIndex
CREATE INDEX "NotInterested_user_id_idx" ON "NotInterested"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "NotInterested_user_id_post_id_key" ON "NotInterested"("user_id", "post_id");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_linked_post_id_fkey" FOREIGN KEY ("linked_post_id") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveMessage" ADD CONSTRAINT "LiveMessage_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveMessage" ADD CONSTRAINT "LiveMessage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookLike" ADD CONSTRAINT "BookLike_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookLike" ADD CONSTRAINT "BookLike_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repost" ADD CONSTRAINT "Repost_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repost" ADD CONSTRAINT "Repost_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotInterested" ADD CONSTRAINT "NotInterested_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotInterested" ADD CONSTRAINT "NotInterested_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
