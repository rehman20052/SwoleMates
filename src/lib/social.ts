import { readMediaBytes } from "@/lib/media-bytes";
import { listConnections } from "@/lib/matches";
import { blockedUserIds } from "@/lib/safety";
import { supabase } from "@/lib/supabase";

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

export type Feed = {
  posts: Post[];
  // Friends are the people you're matched with.
  friendIds: string[];
  // Public accounts in this feed that you are not matched with.
  publicIds: string[];
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
export async function fetchFeed(before?: string): Promise<FeedPage> {
  const me = await currentUserId();
  const [connections, blocked] = await Promise.all([listConnections().catch(() => []), blockedUserIds()]);
  const friends = connections.filter((person) => person.status === "accepted" && !blocked.has(person.userId));
  const friendIds = friends.map((friend) => friend.userId);
  const page = await loadPostPage(me, before);
  const people = await withPeople(page.posts, friends);
  const publicIds = await publicAuthorIds(page.posts.map((post) => post.authorId).filter((id) => id !== "me" && !friendIds.includes(id)));
  return { posts: page.posts, hasMore: page.hasMore, friendIds, publicIds, people };
}

export async function fetchAuthorPosts(authorId: string, before?: string) {
  const me = await currentUserId();
  const [connections, blocked] = await Promise.all([listConnections().catch(() => []), blockedUserIds()]);
  const friends = connections.filter((person) => person.status === "accepted" && !blocked.has(person.userId));
  const friendIds = friends.map((friend) => friend.userId);
  const page = await loadPostPage(me, before, authorId === "me" ? me : authorId);
  const people = await withPeople(page.posts, friends);
  if (authorId !== "me" && authorId !== me && !people[authorId]) {
    for (const [id, person] of await lookupPeople([authorId])) people[id] = person;
  }
  const publicIds = await publicAuthorIds(page.posts.map((post) => post.authorId).filter((id) => id !== "me" && !friendIds.includes(id)));
  return { ...page, people, friendIds, publicIds };
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

export async function loadSocialPublic() {
  const me = await currentUserId();
  const { data, error } = await supabase.from("user_account").select("social_public").eq("id", me).maybeSingle();
  if (error) throw socialError(error, "Could not load who can see your posts.");
  return Boolean((data as { social_public?: boolean } | null)?.social_public);
}

export async function setSocialPublic(isPublic: boolean) {
  const me = await currentUserId();
  const { error } = await supabase.from("user_account").update({ social_public: isPublic }).eq("id", me);
  if (error) throw socialError(error, "Could not update who can see your posts.");
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
export function subscribeFeed(onChange: () => void) {
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
  const channel = supabase.channel("social-feed");
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
