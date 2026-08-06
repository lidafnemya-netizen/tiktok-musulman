import { prisma } from '../config/database';

/** Users among `userIds` who currently have an active story the viewer hasn't seen yet. */
export async function getUnseenStorySet(viewerId: string, userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Set();
  const stories = await prisma.story.findMany({
    where: {
      user_id: { in: ids },
      expires_at: { gt: new Date() },
      views: { none: { viewer_id: viewerId } },
    },
    select: { user_id: true },
    distinct: ['user_id'],
  });
  return new Set(stories.map((s) => s.user_id));
}
