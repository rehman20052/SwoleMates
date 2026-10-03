import AsyncStorage from "@react-native-async-storage/async-storage";

import { readMediaBytes } from "@/lib/media-bytes";
import { listConnections } from "@/lib/matches";
import { blockedUserIds } from "@/lib/safety";
import { supabase } from "@/lib/supabase";
import { markAccountRead, readAccountMarkers } from "@/lib/account-markers";

const MEDIA_BUCKET = "post-media";
const PHOTO_BUCKET = "profile-photos";
const FEED_PAGE = 20;
// Signed links to post photos and clips last this long; the feed reloads well before then.
const MEDIA_LINK_SECONDS = 60 * 60;
export const POST_LIMIT = 1000;
export const COMMENT_LIMIT = 500;

export type PostMedia = { type: "image" | "video"; uri: string; mimeType?: string };

// authorId is "me" for the signed-in user, so screens don't need to know their own ID.
export type Comment = {
  id: string;
  authorId: string;
  createdAt: string;
  text: string;
  // Set on replies: the top-level comment they belong to. Threads are one level deep.
  parentId?: string;
  likes: number;
  likedByMe: boolean;
  edited: boolean;
};

export type Post = {
  id: string;
  authorId: string;
  createdAt: string;
  text: string;
  edited: boolean;
  media?: PostMedia;
  mediaPath?: string;
  likes: number;
  likedByMe: boolean;
  // Everyone who liked it, other than you. Only friends are named on screen.
  likedBy: string[];
  // Comments stay empty until the thread is opened.
  commentCount: number;
  commentsLoaded: boolean;
  comments: Comment[];
};

export type SocialPerson = { id: string; name: string; photo: string | null };

export type SocialNotice = {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  actorPhoto?: string | null;
  media?: PostMedia;
  postId: string;
  commentId?: string;
  kind: "post" | "post_like" | "post_comment" | "reply" | "comment_like";
  action: string;
};

export type Feed = {
  posts: Post[];
  // Friends are the people you're matched with.
  friendIds: string[];
  // Public accounts in this feed that you are not matched with.
  publicIds: string[];
  // Public accounts you follow, keyed by their id, valued by when you followed them.
  // A follow is not a match. Only their posts from this time onward lead the Public tab.
  followedAt: Record<string, string>;
  people: Record<string, SocialPerson>;
};

type CommentRow = {
  id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  comment_like: { user_id: string }[] | null;
};

type PostRow = {
  id: string;
  author_id: string;
  body: string;
  media_path: string | null;
  media_type: "image" | "video" | null;
  created_at: string;
  edited_at: string | null;
  post_like: { user_id: string }[] | null;
  post_comment: { count: number }[] | null;
};

function socialError(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.toLowerCase().includes("bucket not found") ||
    message.includes("social_people")
  ) {
    return new Error("The Social tab isn't set up on this Supabase project yet. Run supabase/social.sql, then try again.");
  }
  if (message.includes("row-level security")) {
    return new Error("You can only do that on posts from you and your matches.");
  }
  return new Error(message || fallback);
}

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Sign in again to use Social.");
  return userId;
}

function profilePhotoUrl(path: string | null | undefined) {
  if (!path || /\.(mp4|mov|m4v|webm)(\?|$)/i.test(path)) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// A new signed link is a new video address, so the player restarts and buffers.
// Reuse a link until it is close to expiring.
const signedMediaCache = new Map<string, { url: string; expiresAt: number }>();
const REFRESH_MEDIA_BEFORE_MS = 5 * 60 * 1000;

function isHeicPath(path: string) {
  return /\.(heic|heif)$/i.test(path);
}

async function signedMediaUrls(paths: string[]) {
  const urls = new Map<string, string>();
  const now = Date.now();
  const missing: string[] = [];
  for (const path of [...new Set(paths)]) {
    const cached = signedMediaCache.get(path);
    if (cached && cached.expiresAt - REFRESH_MEDIA_BEFORE_MS > now) urls.set(path, cached.url);
    else missing.push(path);
  }
  if (missing.length === 0) return urls;
  const plain = missing.filter((path) => !isHeicPath(path));
  const heic = missing.filter(isHeicPath);
  const expiresAt = Date.now() + MEDIA_LINK_SECONDS * 1000;
  if (plain.length) {
    const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(plain, MEDIA_LINK_SECONDS);
    for (const item of data ?? []) {
      if (!item.path || !item.signedUrl) continue;
      signedMediaCache.set(item.path, { url: item.signedUrl, expiresAt });
      urls.set(item.path, item.signedUrl);
    }
  }
  // Desktop browsers cannot paint HEIC. A transformed signed link is a JPEG.
  await Promise.all(
    heic.map(async (path) => {
      const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, MEDIA_LINK_SECONDS, {
        transform: { quality: 85 },
      });
      if (!data?.signedUrl) return;
      signedMediaCache.set(path, { url: data.signedUrl, expiresAt });
      urls.set(path, data.signedUrl);
    }),
  );
  return urls;
}

// Commenters who aren't your matches come from social_people(), which only
// returns people whose posts or comments you're allowed to see.
async function lookupPeople(ids: string[]) {
  const people = new Map<string, SocialPerson>();
  if (ids.length === 0) return people;
  const { data, error } = await supabase.rpc("social_people", { people: ids });
  if (error) return people;
  for (const row of (data ?? []) as { id?: string; full_name?: string | null; photo_path?: string | null }[]) {
    if (!row.id) continue;
    people.set(row.id, { id: row.id, name: row.full_name?.trim() || "SwoleMate", photo: profilePhotoUrl(row.photo_path) });
  }
  return people;
}

export async function loadSocialPeople(ids: string[]) {
  return lookupPeople(ids);
}

// Blocked people's comments are hidden, along with the replies under them.
function toComments(rows: CommentRow[], me: string, blocked: Set<string>): Comment[] {
  const visible = rows.filter((row) => !blocked.has(row.author_id));
  const topLevel = new Set(visible.filter((row) => !row.parent_id).map((row) => row.id));
  return visible
    .filter((row) => !row.parent_id || topLevel.has(row.parent_id))
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .map((row) => {
      const likers = (row.comment_like ?? []).map((like) => like.user_id);
      return {
        id: row.id,
        authorId: row.author_id === me ? "me" : row.author_id,
        createdAt: row.created_at,
        text: row.body,
        parentId: row.parent_id ?? undefined,
        likes: likers.length,
        likedByMe: likers.includes(me),
        edited: !!row.edited_at,
      };
    });
}

const POST_COLUMNS =
  "id, author_id, body, media_path, media_type, created_at, edited_at, post_like(user_id), post_comment(count)";

function commentCount(row: PostRow) {
  const counted = row.post_comment?.[0]?.count;
  return typeof counted === "number" ? counted : 0;
}

async function toPosts(rows: PostRow[], me: string) {
  const mediaUrls = await signedMediaUrls(rows.map((row) => row.media_path).filter((path): path is string => !!path));
  return rows.map((row) => {
    const likers = (row.post_like ?? []).map((like) => like.user_id);
    const mediaUrl = row.media_path ? mediaUrls.get(row.media_path) : undefined;
    return {
      id: row.id,
      authorId: row.author_id === me ? "me" : row.author_id,
      createdAt: row.created_at,
      text: row.body,
      edited: !!row.edited_at,
      media: mediaUrl && row.media_type ? { type: row.media_type, uri: mediaUrl } : undefined,
      mediaPath: row.media_path ?? undefined,
      likes: likers.length,
      likedByMe: likers.includes(me),
      likedBy: likers.filter((id) => id !== me),
      commentCount: commentCount(row),
      commentsLoaded: false,
      comments: [],
    } satisfies Post;
  });
}

async function loadPostPage(me: string, before?: string, authorId?: string) {
  let query = supabase.from("post").select(POST_COLUMNS).order("created_at", { ascending: false }).limit(FEED_PAGE);
  if (before) query = query.lt("created_at", before);
  if (authorId) query = query.eq("author_id", authorId);
  const { data, error } = await query;
  if (error) throw socialError(error, "Could not load your feed.");
  const rows = (data ?? []) as PostRow[];
  return { posts: await toPosts(rows, me), hasMore: rows.length === FEED_PAGE };
}

async function withPeople(posts: Post[], friends: { userId: string; name: string; photo: string | null }[]) {
  const people: Record<string, SocialPerson> = {};
  for (const friend of friends) {
    people[friend.userId] = { id: friend.userId, name: friend.name, photo: friend.photo };
  }
  const unknown = new Set<string>();
  for (const post of posts) {
    for (const id of [post.authorId, ...post.comments.map((comment) => comment.authorId), ...post.likedBy]) {
      if (id !== "me" && !people[id]) unknown.add(id);
    }
  }
  for (const [id, person] of await lookupPeople([...unknown])) people[id] = person;
  return people;
}

export type FeedPage = Feed & { hasMore: boolean };

// `before` is the oldest post already on screen. The database only returns
// posts this person is allowed to see.
export async function listFollows() {
  const { data, error } = await supabase.from("follow").select("following_id, created_at");
  if (error) throw socialError(error, "Could not load who you follow.");
  const followedAt: Record<string, string> = {};
  for (const row of (data ?? []) as { following_id?: string; created_at?: string }[]) {
    if (row.following_id && row.created_at) followedAt[row.following_id] = row.created_at;
  }
  return followedAt;
}

export async function followAccount(userId: string) {
  const me = await currentUserId();
  if (me === userId) throw new Error("You can't follow yourself.");
  if ((await blockedUserIds()).has(userId)) throw new Error("Unblock this person before following them.");
  const { data, error } = await supabase.from("follow").insert({ follower_id: me, following_id: userId }).select("created_at").single();
  if (error) {
    if (`${error.message ?? ""}`.includes("row-level security")) throw new Error("You can only follow a public account.");
    throw socialError(error, "Could not follow that account.");
  }
  return data.created_at as string;
}

export async function unfollowAccount(userId: string) {
  const me = await currentUserId();
  const { error } = await supabase.from("follow").delete().eq("follower_id", me).eq("following_id", userId);
  if (error) throw socialError(error, "Could not unfollow that account.");
}

export async function fetchFeed(before?: string): Promise<FeedPage> {
  const me = await currentUserId();
  const [connections, blocked, followedAt] = await Promise.all([listConnections().catch(() => []), blockedUserIds(), listFollows()]);
  const friends = connections.filter((person) => person.status === "accepted" && !blocked.has(person.userId));
  const friendIds = friends.map((friend) => friend.userId);
  const page = await loadPostPage(me, before);
  const people = await withPeople(page.posts, friends);
  const publicIds = await publicAuthorIds(page.posts.map((post) => post.authorId).filter((id) => id !== "me" && !friendIds.includes(id)));
  return { posts: page.posts, hasMore: page.hasMore, friendIds, publicIds, followedAt, people };
}

export async function fetchAuthorPosts(authorId: string, before?: string) {
  const me = await currentUserId();
  const [connections, blocked, followedAt] = await Promise.all([listConnections().catch(() => []), blockedUserIds(), listFollows()]);
  const friends = connections.filter((person) => person.status === "accepted" && !blocked.has(person.userId));
  const friendIds = friends.map((friend) => friend.userId);
  const page = await loadPostPage(me, before, authorId === "me" ? me : authorId);
  const people = await withPeople(page.posts, friends);
  if (authorId !== "me" && authorId !== me && !people[authorId]) {
    for (const [id, person] of await lookupPeople([authorId])) people[id] = person;
  }
  const publicIds = await publicAuthorIds(page.posts.map((post) => post.authorId).filter((id) => id !== "me" && !friendIds.includes(id)));
  return { ...page, people, friendIds, publicIds, followedAt };
}

const NOTICE_LIMIT = 20;
const NOTICE_DAYS = 7;
const NOTICE_PARENTS = 80;

function noticeCutoff() {
  return new Date(Date.now() - NOTICE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function noticeAction(kind: SocialNotice["kind"]) {
  if (kind === "post") return "posted";
  if (kind === "post_like") return "liked your post";
  if (kind === "reply") return "replied to your comment";
  if (kind === "comment_like") return "liked your comment";
  if (kind === "post_comment") return "commented on your post";
  return "commented on a post you commented on";
}

export async function loadSocialNotices(): Promise<{ notices: SocialNotice[]; seenAt: string | null }> {
  const me = await currentUserId();
  const [connections, blocked, seen] = await Promise.all([
    listConnections().catch(() => []),
    blockedUserIds(),
    supabase.from("user_account").select("social_notified_at").eq("id", me).maybeSingle(),
  ]);
  const friendIds = connections.filter((person) => person.status === "accepted" && !blocked.has(person.userId)).map((person) => person.userId);
  const seenAt = (seen.data as { social_notified_at?: string | null } | null)?.social_notified_at ?? null;
  const cutoff = noticeCutoff();

  const [myPosts, myComments, friendPosts] = await Promise.all([
    supabase.from("post").select("id").eq("author_id", me).order("created_at", { ascending: false }).limit(NOTICE_PARENTS),
    supabase.from("post_comment").select("id, post_id").eq("author_id", me).order("created_at", { ascending: false }).limit(NOTICE_PARENTS),
    friendIds.length
      ? supabase.from("post").select("id, author_id, created_at").in("author_id", friendIds).neq("author_id", me).gte("created_at", cutoff).order("created_at", { ascending: false }).limit(NOTICE_LIMIT)
      : Promise.resolve({ data: [] as { id: string; author_id: string; created_at: string }[] }),
  ]);

  const myPostIds = new Set(((myPosts.data ?? []) as { id: string }[]).map((row) => row.id));
  const myCommentRows = (myComments.data ?? []) as { id: string; post_id: string }[];
  const myCommentIds = new Set(myCommentRows.map((row) => row.id));
  const engagedPostIds = [...new Set(myCommentRows.map((row) => row.post_id).filter((id) => !myPostIds.has(id)))];
  const likePostIds = [...myPostIds];

  const [postLikes, commentsOnMine, commentsOnEngaged, commentLikes] = await Promise.all([
    likePostIds.length
      ? supabase.from("post_like").select("post_id, user_id, created_at").in("post_id", likePostIds).neq("user_id", me).gte("created_at", cutoff).order("created_at", { ascending: false }).limit(NOTICE_LIMIT)
      : Promise.resolve({ data: [] as { post_id: string; user_id: string; created_at: string }[] }),
    likePostIds.length
      ? supabase.from("post_comment").select("id, post_id, author_id, parent_id, created_at").in("post_id", likePostIds).neq("author_id", me).gte("created_at", cutoff).order("created_at", { ascending: false }).limit(NOTICE_LIMIT)
      : Promise.resolve({ data: [] as { id: string; post_id: string; author_id: string; parent_id: string | null; created_at: string }[] }),
    engagedPostIds.length
      ? supabase.from("post_comment").select("id, post_id, author_id, parent_id, created_at").in("post_id", engagedPostIds).neq("author_id", me).gte("created_at", cutoff).order("created_at", { ascending: false }).limit(NOTICE_LIMIT)
      : Promise.resolve({ data: [] as { id: string; post_id: string; author_id: string; parent_id: string | null; created_at: string }[] }),
    myCommentIds.size
      ? supabase.from("comment_like").select("comment_id, user_id, created_at").in("comment_id", [...myCommentIds]).neq("user_id", me).gte("created_at", cutoff).order("created_at", { ascending: false }).limit(NOTICE_LIMIT)
      : Promise.resolve({ data: [] as { comment_id: string; user_id: string; created_at: string }[] }),
  ]);

  const commentPost = new Map<string, string>();
  for (const row of myCommentRows) commentPost.set(row.id, row.post_id);

  const drafts: SocialNotice[] = [];
  for (const row of (friendPosts.data ?? []) as { id: string; author_id: string; created_at: string }[]) {
    if (!row.id || !row.author_id || blocked.has(row.author_id)) continue;
    drafts.push({ id: `post:${row.id}`, at: row.created_at, actorId: row.author_id, actorName: "", postId: row.id, kind: "post", action: noticeAction("post") });
  }
  for (const row of (postLikes.data ?? []) as { post_id: string; user_id: string; created_at: string }[]) {
    if (!row.post_id || !row.user_id || blocked.has(row.user_id)) continue;
    drafts.push({ id: `post-like:${row.post_id}:${row.user_id}`, at: row.created_at, actorId: row.user_id, actorName: "", postId: row.post_id, kind: "post_like", action: noticeAction("post_like") });
  }
  const seenComments = new Set<string>();
  for (const row of [...((commentsOnMine.data ?? []) as { id: string; post_id: string; author_id: string; parent_id: string | null; created_at: string }[]), ...((commentsOnEngaged.data ?? []) as { id: string; post_id: string; author_id: string; parent_id: string | null; created_at: string }[])]) {
    if (!row.id || !row.author_id || !row.post_id || blocked.has(row.author_id) || seenComments.has(row.id)) continue;
    seenComments.add(row.id);
    const reply = !!row.parent_id && myCommentIds.has(row.parent_id);
    const onMine = myPostIds.has(row.post_id);
    drafts.push({
      id: `comment:${row.id}`,
      at: row.created_at,
      actorId: row.author_id,
      actorName: "",
      postId: row.post_id,
      commentId: row.id,
      kind: reply ? "reply" : "post_comment",
      action: reply ? noticeAction("reply") : onMine ? noticeAction("post_comment") : "commented on a post you commented on",
    });
  }
  for (const row of (commentLikes.data ?? []) as { comment_id: string; user_id: string; created_at: string }[]) {
    const postId = commentPost.get(row.comment_id);
    if (!postId || !row.user_id || blocked.has(row.user_id)) continue;
    drafts.push({
      id: `comment-like:${row.comment_id}:${row.user_id}`,
      at: row.created_at,
      actorId: row.user_id,
      actorName: "",
      postId,
      commentId: row.comment_id,
      kind: "comment_like",
      action: noticeAction("comment_like"),
    });
  }

  const cutoffMs = Date.now() - NOTICE_DAYS * 24 * 60 * 60 * 1000;
  const recent = drafts.filter((notice) => Date.parse(notice.at) >= cutoffMs);
  recent.sort((left, right) => right.at.localeCompare(left.at));
  const trimmed = recent.slice(0, NOTICE_LIMIT);
  const [people, attachments] = await Promise.all([
    lookupPeople(trimmed.map((notice) => notice.actorId)),
    trimmed.length
      ? supabase.from("post").select("id, media_path, media_type").in("id", [...new Set(trimmed.map((notice) => notice.postId))])
      : Promise.resolve({ data: [] }),
  ]);
  const mediaRows = (attachments.data ?? []) as { id: string; media_path: string | null; media_type: "image" | "video" | null }[];
  const mediaUrls = await signedMediaUrls(mediaRows.flatMap((row) => row.media_path ? [row.media_path] : []));
  const postMedia = new Map<string, PostMedia>();
  for (const row of mediaRows) {
    const uri = row.media_path ? mediaUrls.get(row.media_path) : undefined;
    if (uri && row.media_type) postMedia.set(row.id, { uri, type: row.media_type });
  }
  return {
    seenAt,
    notices: trimmed.map((notice) => {
      const person = people.get(notice.actorId);
      return { ...notice, actorName: person?.name || "Someone", actorPhoto: person?.photo ?? null, media: postMedia.get(notice.postId) };
    }),
  };
}

export async function markSocialNoticesSeen() {
  const me = await currentUserId();
  const seenAt = new Date().toISOString();
  const { error } = await supabase.from("user_account").update({ social_notified_at: seenAt }).eq("id", me);
  if (error) throw socialError(error, "Could not update notifications.");
  emitSocialNotices();
  return seenAt;
}

export async function socialAlertCount() {
  const { notices, seenAt } = await loadSocialNotices();
  if (!seenAt) return notices.length;
  return notices.filter((notice) => notice.at > seenAt).length;
}

const socialNoticeListeners = new Set<() => void>();
let socialNoticeListenerId = 0;

export function subscribeSocialNotices(onChange: () => void) {
  socialNoticeListeners.add(onChange);
  const stopFeed = subscribeFeed(onChange, `social-tab-notices-${++socialNoticeListenerId}`);
  return () => {
    socialNoticeListeners.delete(onChange);
    stopFeed();
  };
}

function emitSocialNotices() {
  for (const listener of socialNoticeListeners) listener();
}

export async function fetchPost(postId: string) {
  const me = await currentUserId();
  const { data, error } = await supabase.from("post").select(POST_COLUMNS).eq("id", postId).maybeSingle();
  if (error) throw socialError(error, "Could not open that post.");
  if (!data) return null;
  const posts = await toPosts([data as PostRow], me);
  const post = posts[0];
  if (!post) return null;
  const connections = await listConnections().catch(() => []);
  const friends = connections.filter((person) => person.status === "accepted");
  return { post, people: await withPeople([post], friends) };
}

export async function fetchComments(postId: string) {
  const me = await currentUserId();
  const blocked = await blockedUserIds();
  const { data, error } = await supabase
    .from("post_comment")
    .select("id, author_id, parent_id, body, created_at, edited_at, comment_like(user_id)")
    .eq("post_id", postId);
  if (error) throw socialError(error, "Could not load comments.");
  return toComments((data ?? []) as CommentRow[], me, blocked);
}

let postsPublic: boolean | null = null;
const postsPublicListeners = new Set<(value: boolean) => void>();

function publishPostsPublic(value: boolean) {
  postsPublic = value;
  postsPublicListeners.forEach((listener) => listener(value));
}

export function subscribePostsPublic(listener: (value: boolean) => void) {
  postsPublicListeners.add(listener);
  if (postsPublic !== null) listener(postsPublic);
  return () => {
    postsPublicListeners.delete(listener);
  };
}

export async function loadSocialPublic() {
  const me = await currentUserId();
  const { data, error } = await supabase.from("user_account").select("social_public").eq("id", me).maybeSingle();
  if (error) throw socialError(error, "Could not load who can see your posts.");
  const value = Boolean((data as { social_public?: boolean } | null)?.social_public);
  publishPostsPublic(value);
  return value;
}

export async function setSocialPublic(isPublic: boolean) {
  const me = await currentUserId();
  const { error } = await supabase.from("user_account").update({ social_public: isPublic }).eq("id", me);
  if (error) throw socialError(error, "Could not update who can see your posts.");
  publishPostsPublic(isPublic);
}

export async function authorIsPublic(userId: string) {
  const { data, error } = await supabase.rpc("social_is_public", { person: userId });
  if (error) return false;
  return Boolean(data);
}

async function publicAuthorIds(ids: string[]) {
  const unique = [...new Set(ids)];
  const flags = await Promise.all(unique.map(async (id) => ((await authorIsPublic(id)) ? id : null)));
  return flags.filter((id): id is string => id != null);
}

export async function authorAccess(userId: string): Promise<"self" | "open" | "private"> {
  const me = await currentUserId();
  if (userId === "me" || userId === me) return "self";
  const [connections, blocked, isPublic] = await Promise.all([
    listConnections().catch(() => []),
    blockedUserIds(),
    authorIsPublic(userId),
  ]);
  if (blocked.has(userId)) return "private";
  const friend = connections.some((person) => person.userId === userId && person.status === "accepted");
  return friend || isPublic ? "open" : "private";
}

const liveTables = ["post", "post_like", "post_comment", "comment_like"] as const;
const SLOW_POLL_MS = 30_000;

// Reloads the feed when someone posts, likes, or comments.
// A slow poll runs only while the live channel is down.
export function subscribeFeed(onChange: () => void, channelName = "social-feed") {
  let pending: ReturnType<typeof setTimeout> | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;
  const pull = () => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      onChange();
    }, 300);
  };
  const stopPoll = () => {
    if (!poll) return;
    clearInterval(poll);
    poll = null;
  };
  const startPoll = () => {
    if (poll) return;
    poll = setInterval(pull, SLOW_POLL_MS);
  };
  const channel = supabase.channel(channelName);
  for (const table of liveTables) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, pull);
  }
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") stopPoll();
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") startPoll();
  });
  return () => {
    if (pending) clearTimeout(pending);
    stopPoll();
    void supabase.removeChannel(channel);
  };
}

let pendingDraft: string | null = null;

export function queueSocialDraft(text: string) {
  pendingDraft = text.trim().slice(0, POST_LIMIT);
}

export function takeSocialDraft() {
  const text = pendingDraft;
  pendingDraft = null;
  return text;
}

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

function mediaFileName() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function uploadMedia(me: string, media: PostMedia) {
  const contentType = media.mimeType && extensions[media.mimeType] ? media.mimeType : media.type === "video" ? "video/mp4" : "image/jpeg";
  const bytes = await readMediaBytes(media.uri, media.type === "video");

  const path = `${me}/${mediaFileName()}.${extensions[contentType]}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) throw socialError(error, "Could not upload that photo or clip.");
  return path;
}

export async function createPost(text: string, media?: PostMedia) {
  const me = await currentUserId();
  const body = text.trim().slice(0, POST_LIMIT);
  if (!body && !media) return;

  const mediaPath = media ? await uploadMedia(me, media) : null;
  const { error } = await supabase.from("post").insert({
    author_id: me,
    body,
    media_path: mediaPath,
    media_type: media ? media.type : null,
  });
  if (error) {
    if (mediaPath) await supabase.storage.from(MEDIA_BUCKET).remove([mediaPath]);
    throw socialError(error, "Could not share that post.");
  }
}

export async function editPost(postId: string, text: string) {
  const body = text.trim().slice(0, POST_LIMIT);
  const { error } = await supabase.from("post").update({ body }).eq("id", postId);
  if (error) throw socialError(error, "Could not edit that post.");
}

// Comments and likes go with the post.
export async function deletePost(post: Pick<Post, "id" | "mediaPath">) {
  const { error } = await supabase.from("post").delete().eq("id", post.id);
  if (error) throw socialError(error, "Could not delete that post.");
  if (post.mediaPath) await supabase.storage.from(MEDIA_BUCKET).remove([post.mediaPath]);
}

export async function setPostLike(postId: string, liked: boolean) {
  const me = await currentUserId();
  const { error } = liked
    ? await supabase.from("post_like").insert({ post_id: postId, user_id: me })
    : await supabase.from("post_like").delete().eq("post_id", postId).eq("user_id", me);
  // 23505: already liked.
  if (error && error.code !== "23505") throw socialError(error, "Could not update that like.");
}

export async function addComment(postId: string, text: string, parentId?: string) {
  const me = await currentUserId();
  const body = text.trim().slice(0, COMMENT_LIMIT);
  if (!body) return;
  const { data, error } = await supabase
    .from("post_comment")
    .insert({
      post_id: postId,
      author_id: me,
      parent_id: parentId ?? null,
      body,
    })
    .select("id, created_at")
    .single();
  if (error) throw socialError(error, "Could not post that comment.");
  return data as { id: string; created_at: string };
}

// The database marks the comment as edited.
export async function editComment(commentId: string, text: string) {
  const body = text.trim().slice(0, COMMENT_LIMIT);
  if (!body) throw new Error("Comment can't be empty.");
  const { error } = await supabase.from("post_comment").update({ body }).eq("id", commentId);
  if (error) throw socialError(error, "Could not edit that comment.");
}

// Replies go with the comment.
export async function deleteComment(commentId: string) {
  const { error } = await supabase.from("post_comment").delete().eq("id", commentId);
  if (error) throw socialError(error, "Could not delete that comment.");
}

export async function setCommentLike(commentId: string, liked: boolean) {
  const me = await currentUserId();
  const { error } = liked
    ? await supabase.from("comment_like").insert({ comment_id: commentId, user_id: me })
    : await supabase.from("comment_like").delete().eq("comment_id", commentId).eq("user_id", me);
  if (error && error.code !== "23505") throw socialError(error, "Could not update that like.");
}

const RING_MS = 24 * 60 * 60 * 1000;
const ringListeners = new Set<() => void>();

function ringKey(userId: string) {
  return `social-rings:${userId}`;
}

export function subscribeFriendRings(onChange: () => void) {
  ringListeners.add(onChange);
  return () => {
    ringListeners.delete(onChange);
  };
}

export async function recentFriendActivity(friendIds: string[]) {
  const ids = [...new Set(friendIds)].filter((id) => id && id !== "me");
  if (!ids.length) return {} as Record<string, string>;
  const since = new Date(Date.now() - RING_MS).toISOString();
  const { data, error } = await supabase
    .from("post")
    .select("author_id, created_at")
    .in("author_id", ids)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return {} as Record<string, string>;
  const latest: Record<string, string> = {};
  for (const row of data as { author_id: string; created_at: string }[]) {
    if (!latest[row.author_id]) latest[row.author_id] = row.created_at;
  }
  return latest;
}

export async function readFriendRings() {
  const me = await currentUserId().catch(() => null);
  if (!me) return {} as Record<string, string>;
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(ringKey(me))) ?? "{}") as unknown;
    if (!saved || typeof saved !== "object") return {} as Record<string, string>;
    const rings: Record<string, string> = {};
    for (const [id, at] of Object.entries(saved)) {
      if (typeof at === "string") rings[id] = at;
    }
    try {
      return await readAccountMarkers(me, "friend_reads", rings);
    } catch { return rings; }
  } catch {
    return {} as Record<string, string>;
  }
}

export async function markFriendPostsSeen(friendId: string) {
  const me = await currentUserId().catch(() => null);
  if (!me || !friendId || friendId === "me") return;
  const current = await readFriendRings();
  const stamp = new Date().toISOString();
  try {
    const synced = await markAccountRead(me, "friend_reads", friendId, stamp, current);
    Object.assign(current, synced);
  } catch { /* Retain the device's read marker when temporarily offline. */ }
  if (!current[friendId] || Date.parse(current[friendId]) < Date.parse(stamp)) current[friendId] = stamp;
  await AsyncStorage.setItem(ringKey(me), JSON.stringify(current));
  ringListeners.forEach((listener) => listener());
}

export function friendHasFreshPost(latest: string | undefined, seenAt: string | undefined, now = Date.now()) {
  if (!latest) return false;
  const posted = Date.parse(latest);
  if (!Number.isFinite(posted) || now - posted > RING_MS) return false;
  if (!seenAt) return true;
  const seen = Date.parse(seenAt);
  return !Number.isFinite(seen) || posted > seen;
}

// "Just now", "5m", "3h", "2d", then "Sep 12".
export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
