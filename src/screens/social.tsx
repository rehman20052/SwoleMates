import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useVideoPlayer, VideoView } from "expo-video";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";

import { AppText, Avatar, Card, Input, PrimaryButton, Screen, ScrollBody, TitleBar } from "@/components/ui";
import {
  addComment,
  COMMENT_LIMIT,
  Comment,
  createPost,
  deleteComment,
  deletePost,
  editComment,
  Feed,
  fetchFeed,
  subscribeFeed,
  Post,
  POST_LIMIT,
  PostMedia,
  setCommentLike,
  setPostLike,
  timeAgo,
} from "@/lib/social";
import { MAX_MEDIA_BYTES } from "@/lib/media-limits";
import { prepareVideo } from "@/lib/prepare-video";
import { useNavigation } from "@/navigation";
import { useAppTheme } from "@/theme";

type Me = { name: string; photo?: string };

type Social = {
  feed: Feed;
  me: Me;
  // Runs a change against Supabase, then reloads the feed. Resolves false if it failed.
  // Likes skip the reload on success: they're already shown.
  run: (action: () => Promise<void>, reloadAfter?: boolean) => Promise<boolean>;
  updatePost: (postId: string, fn: (post: Post) => Post) => void;
};

const SocialContext = createContext<Social | null>(null);

function useSocial() {
  const social = useContext(SocialContext);
  if (!social) throw new Error("useSocial must be used inside SocialScreen.");
  return social;
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

// Posts from you and the people you've matched with. Likes and comments are
// shared with everyone who can see the post.
export function SocialScreen({ me }: { me: Me }) {
  const theme = useAppTheme();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    try {
      setFeed(await fetchFeed());
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err, "Could not load your feed."));
    }
  }, []);

  useEffect(() => {
    void reload();
    return subscribeFeed(() => {
      void reload();
    });
  }, [reload]);

  async function refresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  const run = useCallback(
    async (action: () => Promise<void>, reloadAfter = true) => {
      setError(null);
      try {
        await action();
        if (reloadAfter) await reload();
        return true;
      } catch (err) {
        setError(errorMessage(err, "Something went wrong. Try again."));
        await reload();
        return false;
      }
    },
    [reload],
  );

  const updatePost = useCallback((postId: string, fn: (post: Post) => Post) => {
    setFeed((current) => current && { ...current, posts: current.posts.map((post) => (post.id === postId ? fn(post) : post)) });
  }, []);

  if (!feed) {
    return (
      <Screen>
        <TitleBar title="Social" />
        <View style={styles.status}>
          <AppText muted style={styles.emptyText}>
            {loadError ?? "Loading your feed..."}
          </AppText>
          {loadError ? (
            <PrimaryButton height={40} fontSize={13} onPress={() => void reload()} style={styles.smallButton}>
              Try again
            </PrimaryButton>
          ) : null}
        </View>
      </Screen>
    );
  }

  return (
    <SocialContext.Provider value={{ feed, me, run, updatePost }}>
      <Screen>
        <TitleBar title="Social" />
        <ScrollBody refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />}>
          <Composer />

          {error ?? loadError ? (
            <View style={[styles.banner, { backgroundColor: theme.colors.surfaceRaised }]}>
              <AppText size={13} color={theme.colors.danger} style={{ flex: 1 }}>
                {error ?? loadError}
              </AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={() => { setError(null); setLoadError(null); }} hitSlop={8}>
                <AppText size={13} weight="bold" muted>
                  ✕
                </AppText>
              </Pressable>
            </View>
          ) : null}

          <AppText weight="extrabold" upper>
            Feed
          </AppText>
          {feed.posts.length ? (
            feed.posts.map((post) => <PostCard key={post.id} post={post} />)
          ) : (
            <AppText muted style={styles.emptyText}>
              {feed.friendIds.length
                ? "No posts yet. Share a workout update to get things started."
                : "Match with people on Discover to see their posts here."}
            </AppText>
          )}
        </ScrollBody>
      </Screen>
    </SocialContext.Provider>
  );
}

// Your matches and commenters on posts you can see. Falls back to an initial when there's no photo.
function PersonAvatar({ name, photo, size }: { name: string; photo?: string | null; size: number }) {
  const theme = useAppTheme();

  if (photo) return <Avatar source={{ uri: photo }} size={size} />;

  return (
    <View style={[styles.initial, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.primary }]}>
      <AppText size={size * 0.4} weight="black" color={theme.colors.primaryText}>
        {(name.trim()[0] ?? "?").toUpperCase()}
      </AppText>
    </View>
  );
}

// "me" is the signed-in user; anyone the database didn't return a name for is "SwoleMate".
function usePerson(authorId: string) {
  const { feed, me } = useSocial();
  if (authorId === "me") return { name: me.name || "You", photo: me.photo ?? null, isMe: true, isFriend: false };
  const person = feed.people[authorId];
  return {
    name: person?.name ?? "SwoleMate",
    photo: person?.photo ?? null,
    isMe: false,
    isFriend: feed.friendIds.includes(authorId),
  };
}

function Composer() {
  const theme = useAppTheme();
  const { me, run } = useSocial();
  const [text, setText] = useState("");
  const [media, setMedia] = useState<PostMedia | undefined>();
  const [pickError, setPickError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState(0);
  const preparation = useRef<AbortController | null>(null);
  const releaseMedia = useRef<(() => void) | undefined>(undefined);

  useEffect(() => () => {
    preparation.current?.abort();
    releaseMedia.current?.();
  }, []);

  function clearMedia() {
    setMedia(undefined);
    releaseMedia.current?.();
    releaseMedia.current = undefined;
  }

  async function addMedia() {
    if (preparation.current || posting) return;
    const controller = new AbortController();
    preparation.current = controller;
    setPickError(null);
    setPreparing(true);
    setProgress(0);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.7,
      });
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset || controller.signal.aborted) return;
      const isVideo = asset.type === "video";
      if (!isVideo && asset.fileSize && asset.fileSize > MAX_MEDIA_BYTES) {
        throw new Error("This photo is over 50MB. Choose a smaller photo.");
      }
      const source = { uri: asset.uri, mimeType: asset.mimeType ?? undefined };
      const prepared = isVideo
        ? await prepareVideo(source, (value) => {
            if (!controller.signal.aborted) setProgress(Math.round(value * 100));
          }, controller.signal)
        : { ...source, release() {} };
      if (controller.signal.aborted) {
        prepared.release();
        return;
      }
      releaseMedia.current?.();
      releaseMedia.current = prepared.release;
      setMedia({ type: isVideo ? "video" : "image", uri: prepared.uri, mimeType: prepared.mimeType });
    } catch (error) {
      if (!controller.signal.aborted) setPickError(errorMessage(error, "Couldn't prepare this attachment. Please try again."));
    } finally {
      if (!controller.signal.aborted) setPreparing(false);
      if (preparation.current === controller) preparation.current = null;
    }
  }

  async function post() {
    if (posting || preparation.current) return;
    setPosting(true);
    const posted = await run(() => createPost(text, media));
    setPosting(false);
    if (!posted) return;
    setText("");
    clearMedia();
  }

  const canPost = (!!text.trim() || !!media) && !posting && !preparing;

  return (
    <Card padding={14} radius={18} gap={12}>
      <View style={styles.composerRow}>
        <PersonAvatar name={me.name} photo={me.photo} size={36} />
        <Input
          multiline
          placeholder="Share a workout update..."
          value={text}
          onChangeText={setText}
          maxLength={POST_LIMIT}
          style={styles.composerInput}
        />
      </View>
      {media ? (
        <View>
          <MediaView key={media.uri} media={media} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove attachment"
            disabled={posting || preparing}
            onPress={clearMedia}
            style={[styles.removeMedia, { backgroundColor: theme.colors.scrim }]}
          >
            <AppText weight="bold">✕</AppText>
          </Pressable>
        </View>
      ) : null}
      {preparing ? (
        <AppText size={12} color={theme.colors.muted}>
          {progress > 0 ? `Preparing video… ${progress}%` : "Preparing attachment…"} Keep the app open.
        </AppText>
      ) : null}
      <AppText size={12} color={theme.colors.muted}>
        Videos over 50MB are compressed before uploading.
      </AppText>
      {pickError ? (
        <AppText size={12} color={theme.colors.danger}>
          {pickError}
        </AppText>
      ) : null}
      <View style={styles.composerActions}>
        <Pressable accessibilityRole="button" onPress={addMedia} disabled={posting || preparing} hitSlop={8}>
          <AppText weight="bold" primary>
            + Photo / Clip
          </AppText>
        </Pressable>
        <PrimaryButton height={36} fontSize={13} disabled={!canPost} onPress={post} style={[styles.smallButton, !canPost && { opacity: 0.5 }]}>
          {posting ? "Posting..." : "Post"}
        </PrimaryButton>
      </View>
    </Card>
  );
}

function MediaView({ media }: { media: PostMedia }) {
  return media.type === "video" ? (
    <PostVideo uri={media.uri} />
  ) : (
    <Image source={{ uri: media.uri }} style={styles.postMedia} contentFit="cover" />
  );
}

function PostVideo({ uri }: { uri: string }) {
  // The feed reloads while this stays on screen. A new link would rebuild the player and buffer again.
  const source = useRef(uri);
  const player = useVideoPlayer(source.current, (p) => {
    p.loop = true;
  });
  return <VideoView player={player} style={styles.postMedia} contentFit="cover" nativeControls />;
}

function PostCard({ post }: { post: Post }) {
  const theme = useAppTheme();
  const nav = useNavigation();
  const { run, updatePost } = useSocial();
  const [showComments, setShowComments] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const author = usePerson(post.authorId);
  const count = post.comments.length;

  // Shows the new like count right away; the reload afterwards corrects it if saving failed.
  function toggleLike() {
    const liked = !post.likedByMe;
    updatePost(post.id, (current) => ({ ...current, likedByMe: liked, likes: current.likes + (liked ? 1 : -1) }));
    void run(() => setPostLike(post.id, liked), false);
  }

  return (
    <Card padding={14} radius={18} gap={12}>
      <View style={styles.postHeader}>
        <Pressable
          accessibilityRole="button"
          disabled={!author.isFriend}
          onPress={() => nav.push({ name: "request-profile", userId: post.authorId })}
          style={[styles.postHeader, { flex: 1 }]}
        >
          <PersonAvatar name={author.name} photo={author.photo} size={40} />
          <View style={{ flex: 1 }}>
            <AppText weight="extrabold">{author.name}</AppText>
            <AppText size={12} muted>
              {timeAgo(post.createdAt)}
            </AppText>
          </View>
        </Pressable>
        {author.isMe && !confirmingDelete ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Delete post" onPress={() => setConfirmingDelete(true)} hitSlop={8}>
            <AppText size={13} weight="bold" muted>
              Delete
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {confirmingDelete ? (
        <View style={[styles.confirm, { backgroundColor: theme.colors.surfaceRaised }]}>
          <AppText size={13} weight="semibold" style={{ flex: 1 }}>
            Delete this post?
          </AppText>
          <Pressable accessibilityRole="button" onPress={() => setConfirmingDelete(false)} hitSlop={8}>
            <AppText size={13} weight="bold" muted>
              Cancel
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Confirm delete post"
            onPress={() => {
              setConfirmingDelete(false);
              void run(() => deletePost(post));
            }}
            hitSlop={8}
          >
            <AppText size={13} weight="extrabold" color={theme.colors.danger}>
              Delete
            </AppText>
          </Pressable>
        </View>
      ) : null}

      {post.text ? <AppText style={{ lineHeight: 20 }}>{post.text}</AppText> : null}
      {post.media ? <MediaView media={post.media} /> : null}

      <LikedBy post={post} />

      <View style={styles.postFooter}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={post.likedByMe ? "Unlike" : "Like"}
          accessibilityState={{ selected: post.likedByMe }}
          onPress={toggleLike}
          hitSlop={8}
        >
          <AppText weight="bold" color={post.likedByMe ? theme.colors.primary : theme.colors.muted}>
            {post.likedByMe ? "♥" : "♡"} {post.likes}
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showComments ? "Hide comments" : "Show comments"}
          onPress={() => setShowComments((open) => !open)}
          hitSlop={8}
        >
          <AppText size={13} weight={showComments ? "bold" : "regular"} color={showComments ? theme.colors.text : theme.colors.muted}>
            {count ? `${count} ${count === 1 ? "comment" : "comments"}` : "Comment"}
          </AppText>
        </Pressable>
      </View>

      {showComments ? <Comments post={post} /> : null}
    </Card>
  );
}

// "Liked by you, Marcus and 40 others". Only friends are named.
function LikedBy({ post }: { post: Post }) {
  const { feed } = useSocial();
  const friends = post.likedBy.filter((id) => feed.friendIds.includes(id) && feed.people[id]).map((id) => firstName(feed.people[id].name));

  const names = [...(post.likedByMe ? ["you"] : []), ...friends.slice(0, 2)];
  if (!names.length) return null;

  const others = post.likes - names.length;
  const list = others > 0 ? `${names.join(", ")} and ${others} ${others === 1 ? "other" : "others"}` : joinNames(names);

  return (
    <AppText size={12} muted numberOfLines={2}>
      Liked by <AppText size={12} weight="bold">{list}</AppText>
    </AppText>
  );
}

function joinNames(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
}

type ReplyTarget = { parentId: string; name: string };

function Comments({ post }: { post: Post }) {
  const { run } = useSocial();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [sending, setSending] = useState(false);
  const theme = useAppTheme();
  const threads = post.comments.filter((c) => !c.parentId);

  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true);
    const sent = await run(() => addComment(post.id, draft, replyTo?.parentId));
    setSending(false);
    if (!sent) return;
    setDraft("");
    setReplyTo(null);
  }

  // Replying to a reply stays in the same thread and tags the person.
  function startReply(parentId: string, name: string, tag: boolean) {
    setReplyTo({ parentId, name });
    setDraft(tag && name !== "you" ? `@${name} ` : "");
  }

  return (
    <View style={[styles.comments, { borderTopColor: theme.colors.border }]}>
      {threads.map((thread) => (
        <View key={thread.id} style={{ gap: 8 }}>
          <CommentItem post={post} comment={thread} onReply={(name) => startReply(thread.id, name, false)} />
          {post.comments
            .filter((c) => c.parentId === thread.id)
            .map((reply) => (
              <View key={reply.id} style={styles.reply}>
                <CommentItem post={post} comment={reply} onReply={(name) => startReply(thread.id, name, true)} />
              </View>
            ))}
        </View>
      ))}

      {replyTo ? (
        <View style={styles.replyingTo}>
          <AppText size={12} muted>
            Replying to <AppText size={12} weight="bold">{replyTo.name}</AppText>
          </AppText>
          <Pressable accessibilityRole="button" onPress={() => { setReplyTo(null); setDraft(""); }} hitSlop={8}>
            <AppText size={12} weight="bold" primary>
              Cancel
            </AppText>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.commentInputRow}>
        <Input
          placeholder={replyTo ? "Write a reply..." : "Write a comment..."}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={send}
          returnKeyType="send"
          maxLength={COMMENT_LIMIT}
          style={{ flex: 1, height: 40 }}
        />
        <PrimaryButton
          height={40}
          fontSize={13}
          disabled={!draft.trim() || sending}
          onPress={send}
          style={[styles.smallButton, (!draft.trim() || sending) && { opacity: 0.5 }]}
        >
          {replyTo ? "Reply" : "Send"}
        </PrimaryButton>
      </View>
    </View>
  );
}

function CommentItem({ post, comment, onReply }: { post: Post; comment: Comment; onReply: (name: string) => void }) {
  const theme = useAppTheme();
  const { run, updatePost } = useSocial();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.text);
  const commenter = usePerson(comment.authorId);
  const canDelete = post.authorId === "me" || commenter.isMe;
  const isReply = !!comment.parentId;

  async function save() {
    if (!draft.trim()) return;
    if (draft.trim() === comment.text) {
      setEditing(false);
      return;
    }
    if (await run(() => editComment(comment.id, draft))) setEditing(false);
  }

  function toggleLike() {
    const liked = !comment.likedByMe;
    updatePost(post.id, (current) => ({
      ...current,
      comments: current.comments.map((c) => (c.id === comment.id ? { ...c, likedByMe: liked, likes: c.likes + (liked ? 1 : -1) } : c)),
    }));
    void run(() => setCommentLike(comment.id, liked), false);
  }

  return (
    <View style={styles.comment}>
      <PersonAvatar name={commenter.name} photo={commenter.photo} size={isReply ? 24 : 28} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={[styles.commentBubble, { backgroundColor: theme.colors.surfaceRaised }]}>
          <AppText size={13} weight="extrabold">
            {commenter.name}
          </AppText>
          {editing ? (
            <View style={{ gap: 8, marginTop: 4 }}>
              <Input value={draft} onChangeText={setDraft} autoFocus onSubmitEditing={save} maxLength={COMMENT_LIMIT} style={{ height: 36 }} />
              <View style={styles.commentMeta}>
                <TextAction label="Save" onPress={save} color={theme.colors.primary} />
                <TextAction label="Cancel" onPress={() => { setDraft(comment.text); setEditing(false); }} />
              </View>
            </View>
          ) : (
            <AppText size={13} style={{ lineHeight: 18 }}>
              {comment.text}
            </AppText>
          )}
        </View>

        <View style={[styles.commentMeta, { paddingHorizontal: 4 }]}>
          <AppText size={11} muted>
            {timeAgo(comment.createdAt)}
            {comment.edited ? " · Edited" : ""}
          </AppText>
          <TextAction
            label={`${comment.likedByMe ? "♥" : "♡"}${comment.likes ? ` ${comment.likes}` : ""}`}
            accessibilityLabel={`${comment.likedByMe ? "Unlike" : "Like"} ${isReply ? "reply" : "comment"}: ${comment.text}`}
            onPress={toggleLike}
            color={comment.likedByMe ? theme.colors.primary : undefined}
          />
          <TextAction
            label="Reply"
            accessibilityLabel={`Reply to ${commenter.name}`}
            onPress={() => onReply(commenter.isMe ? "you" : firstName(commenter.name))}
          />
          {commenter.isMe && !editing ? (
            <TextAction label="Edit" accessibilityLabel={`Edit comment: ${comment.text}`} onPress={() => setEditing(true)} />
          ) : null}
          {canDelete ? (
            <TextAction
              label="Delete"
              accessibilityLabel={`Delete comment: ${comment.text}`}
              onPress={() => void run(() => deleteComment(comment.id))}
              color={theme.colors.danger}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function TextAction({
  label,
  onPress,
  color,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  accessibilityLabel?: string;
}) {
  const theme = useAppTheme();

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} hitSlop={8}>
      <AppText size={11} weight="bold" color={color ?? theme.colors.muted}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  status: {
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  emptyText: {
    lineHeight: 20,
    paddingVertical: 16,
    textAlign: "center",
  },
  banner: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  initial: {
    alignItems: "center",
    justifyContent: "center",
  },
  composerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  composerInput: {
    flex: 1,
    height: 64,
  },
  composerActions: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  smallButton: {
    borderRadius: 10,
    paddingHorizontal: 20,
  },
  removeMedia: {
    alignItems: "center",
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    position: "absolute",
    right: 8,
    top: 8,
    width: 28,
  },
  postHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  postMedia: {
    aspectRatio: 1,
    borderRadius: 14,
    width: "100%",
  },
  confirm: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  comments: {
    borderTopWidth: 1,
    gap: 10,
    paddingTop: 12,
  },
  comment: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
  },
  commentBubble: {
    borderRadius: 12,
    flex: 1,
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  commentMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
  },
  reply: {
    marginLeft: 36,
  },
  replyingTo: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  commentInputRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  postFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
