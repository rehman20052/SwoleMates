import { listConnections } from "@/lib/matches";
import { blockedUserIds } from "@/lib/safety";
import { supabase } from "@/lib/supabase";

const MEDIA_BUCKET = "post-media";
const PHOTO_BUCKET = "profile-photos";
const FEED_LIMIT = 50;
// Signed links to post photos and clips last this long; the feed reloads well before then.
const MEDIA_LINK_SECONDS = 60 * 60;
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
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
  media?: PostMedia;
  mediaPath?: string;
  likes: number;
  likedByMe: boolean;
  // Everyone who liked it, other than you. Only friends are named on screen.
  likedBy: string[];
  comments: Comment[];
};

export type SocialPerson = { id: string; name: string; photo: string | null };

export type Feed = {
  posts: Post[];
  // Friends are the people you're matched with.
  friendIds: string[];
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
  post_like: { user_id: string }[] | null;
  post_comment: CommentRow[] | null;
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
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function signedMediaUrls(paths: string[]) {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, MEDIA_LINK_SECONDS);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
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

export async function fetchFeed(): Promise<Feed> {
  const me = await currentUserId();
  const [connections, blocked] = await Promise.all([listConnections().catch(() => []), blockedUserIds()]);
  const friends = connections.filter((person) => person.status === "accepted" && !blocked.has(person.userId));

  // The database only returns your posts and your matches' posts.
  const { data, error } = await supabase
    .from("post")
    .select(
      "id, author_id, body, media_path, media_type, created_at, post_like(user_id), post_comment(id, author_id, parent_id, body, created_at, edited_at, comment_like(user_id))",
    )
    .order("created_at", { ascending: false })
    .limit(FEED_LIMIT);
  if (error) throw socialError(error, "Could not load your feed.");
  const rows = (data ?? []) as PostRow[];

  const mediaUrls = await signedMediaUrls(rows.map((row) => row.media_path).filter((path): path is string => !!path));

  const posts: Post[] = rows.map((row) => {
    const likers = (row.post_like ?? []).map((like) => like.user_id);
    const mediaUrl = row.media_path ? mediaUrls.get(row.media_path) : undefined;
    return {
      id: row.id,
      authorId: row.author_id === me ? "me" : row.author_id,
      createdAt: row.created_at,
      text: row.body,
      media: mediaUrl && row.media_type ? { type: row.media_type, uri: mediaUrl } : undefined,
      mediaPath: row.media_path ?? undefined,
      likes: likers.length,
      likedByMe: likers.includes(me),
      likedBy: likers.filter((id) => id !== me),
      comments: toComments(row.post_comment ?? [], me, blocked),
    };
  });

  const people: Record<string, SocialPerson> = {};
  for (const friend of friends) {
    people[friend.userId] = { id: friend.userId, name: friend.name, photo: friend.photo };
  }
  const unknown = new Set<string>();
  for (const post of posts) {
    for (const id of [post.authorId, ...post.comments.map((comment) => comment.authorId)]) {
      if (id !== "me" && !people[id]) unknown.add(id);
    }
  }
  for (const [id, person] of await lookupPeople([...unknown])) people[id] = person;

  return { posts, friendIds: friends.map((friend) => friend.userId), people };
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
  const response = await fetch(media.uri);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error("Photos and clips must be under 50MB.");

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
  const { error } = await supabase.from("post_comment").insert({
    post_id: postId,
    author_id: me,
    parent_id: parentId ?? null,
    body,
  });
  if (error) throw socialError(error, "Could not post that comment.");
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
