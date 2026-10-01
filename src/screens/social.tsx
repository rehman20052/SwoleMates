import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useVideoPlayer, VideoView } from "expo-video";
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Dimensions, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import { appFrameSize } from "@/components/phone-frame";
import { AppText, Avatar, Card, Input, PrimaryButton, Screen, ScrollBody, SecondaryButton, TitleBar, Toggle } from "@/components/ui";
import { MAX_MEDIA_BYTES } from "@/lib/media-limits";
import { prepareVideo } from "@/lib/prepare-video";
import { blockPerson, reportPerson, reportReasons } from "@/lib/safety";
import {
  addComment,
  authorAccess,
  COMMENT_LIMIT,
  Comment,
  createPost,
  deleteComment,
  deletePost,
  editComment,
  editPost,
  Feed,
  FeedPage,
  fetchAuthorPosts,
  fetchComments,
  fetchFeed,
  loadSocialPublic,
  Post,
  POST_LIMIT,
  PostMedia,
  setCommentLike,
  setPostLike,
  setSocialPublic,
  subscribeFeed,
  takeSocialDraft,
  timeAgo,
} from "@/lib/social";
import { useNavigation } from "@/navigation";
import { useAppTheme } from "@/theme";

type Me = { name: string; photo?: string };
type VideoMeasure = (done: (box: { y: number; height: number } | null) => void) => void;

type Social = {
  feed: Feed;
  me: Me;
  run: (action: () => Promise<unknown>, reloadAfter?: boolean) => Promise<boolean>;
  updatePost: (postId: string, fn: (post: Post) => Post) => void;
  activeVideoId: string | null;
  registerVideo: (id: string, measure: VideoMeasure) => () => void;
  openMedia: (media: PostMedia) => void;
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

function mergeFeed(current: Feed | null, page: FeedPage, appended = false): Feed {
  if (!current || !appended) {
    const previous = new Map((current?.posts ?? []).map((post) => [post.id, post]));
    const oldest = page.posts[page.posts.length - 1]?.createdAt;
    const older = page.hasMore && oldest ? (current?.posts ?? []).filter((post) => post.createdAt < oldest) : [];
    return {
      ...page,
      people: { ...current?.people, ...page.people },
      publicIds: [...new Set([...(current?.publicIds ?? []), ...page.publicIds])],
      posts: [...page.posts.map((post) => keepThread(post, previous.get(post.id))), ...older],
    };
  }
  const previous = new Map(current.posts.map((post) => [post.id, post]));
  const fresh = page.posts.filter((post) => !previous.has(post.id));
  return {
    ...current,
    people: { ...current.people, ...page.people },
    publicIds: [...new Set([...(current.publicIds ?? []), ...page.publicIds])],
    posts: [...current.posts, ...fresh],
  };
}

function keepThread(post: Post, previous?: Post) {
  if (!previous?.commentsLoaded) return post;
  return { ...post, comments: previous.comments, commentsLoaded: true };
}

function useSocialBoard(loadPage: (before?: string) => Promise<FeedPage>) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<PostMedia | null>(null);
  const measures = useRef(new Map<string, VideoMeasure>());
  const loadingMore = useRef(false);
  const feedRef = useRef(feed);
  feedRef.current = feed;

  const reload = useCallback(async () => {
    const page = await loadPage();
    setHasMore(page.hasMore);
    setFeed((current) => mergeFeed(current, page));
    setLoadError(null);
  }, [loadPage]);

  useEffect(() => {
    let alive = true;
    void loadPage()
      .then((page) => {
        if (!alive) return;
        setHasMore(page.hasMore);
        setFeed(page);
      })
      .catch((err) => {
        if (alive) setLoadError(errorMessage(err, "Could not load your feed."));
      });
    const stop = subscribeFeed(() => {
      void reload().catch((err) => {
        if (alive) setLoadError(errorMessage(err, "Could not load your feed."));
      });
    });
    return () => {
      alive = false;
      stop();
    };
  }, [loadPage, reload]);

  const syncVideos = useCallback(() => {
    if (lightbox) {
      setActiveVideoId(null);
      return;
    }
    const entries = [...measures.current.entries()];
    if (!entries.length) {
      setActiveVideoId(null);
      return;
    }
    const windowHeight = Dimensions.get("window").height;
    let pending = entries.length;
    let bestId: string | null = null;
    let best = 0;
    for (const [id, measure] of entries) {
      measure((box) => {
        if (box) {
          const overlap = Math.min(box.y + box.height, windowHeight - 88) - Math.max(box.y, 0);
          if (overlap > best) {
            best = overlap;
            bestId = id;
          }
        }
        pending -= 1;
        if (pending === 0) setActiveVideoId(best > 48 ? bestId : null);
      });
    }
  }, [lightbox]);

  useEffect(() => {
    const timer = setTimeout(syncVideos, 250);
    return () => clearTimeout(timer);
  }, [feed?.posts.length, lightbox, syncVideos]);

  const registerVideo = useCallback((id: string, measure: VideoMeasure) => {
    measures.current.set(id, measure);
    return () => {
      measures.current.delete(id);
    };
  }, []);

  const run = useCallback(
    async (action: () => Promise<unknown>, reloadAfter = true) => {
      setError(null);
      try {
        await action();
        if (reloadAfter) await reload();
        return true;
      } catch (err) {
        setError(errorMessage(err, "Something went wrong. Try again."));
        return false;
      }
    },
    [reload],
  );

  const updatePost = useCallback((postId: string, fn: (post: Post) => Post) => {
    setFeed((current) => current && { ...current, posts: current.posts.map((post) => (post.id === postId ? fn(post) : post)) });
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      await reload();
    } catch (err) {
      setLoadError(errorMessage(err, "Could not load your feed."));
    } finally {
      setRefreshing(false);
    }
  }

  async function loadMore() {
    const current = feedRef.current;
    const cursor = current?.posts[current.posts.length - 1]?.createdAt;
    if (!current || !cursor || !hasMore || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const page = await loadPage(cursor);
      setHasMore(page.hasMore);
      setFeed((existing) => (existing ? mergeFeed(existing, page, true) : page));
    } catch (err) {
      setError(errorMessage(err, "Could not load older posts."));
    } finally {
      loadingMore.current = false;
    }
  }

  return {
    feed,
    hasMore,
    loadError,
    error,
    setError,
    setLoadError,
    refreshing,
    refresh,
    loadMore,
    reload,
    run,
    updatePost,
    activeVideoId: lightbox ? null : activeVideoId,
    registerVideo,
    syncVideos,
    lightbox,
    setLightbox,
  };
}

export function SocialScreen({ me }: { me: Me }) {
  const loadPage = useCallback((before?: string) => fetchFeed(before), []);
  const board = useSocialBoard(loadPage);
  const nav = useNavigation();

  return <SocialBoard me={me} board={board} composer onOpenFriend={(userId) => nav.push({ name: "social-profile", userId })} />;
}

export function SocialProfileScreen({ userId, me }: { userId: string; me: Me }) {
  const nav = useNavigation();
  const theme = useAppTheme();
  const [access, setAccess] = useState<"loading" | "self" | "open" | "private">("loading");
  const [isPublic, setIsPublic] = useState(false);
  const [savingPublic, setSavingPublic] = useState(false);
  const loadPage = useCallback(
    (before?: string) =>
      fetchAuthorPosts(userId, before).then((page) => ({
        posts: page.posts,
        hasMore: page.hasMore,
        friendIds: page.friendIds,
        publicIds: page.publicIds,
        people: page.people,
      })),
    [userId],
  );
  const board = useSocialBoard(loadPage);

  useEffect(() => {
    let alive = true;
    void authorAccess(userId)
      .then((result) => {
        if (alive) setAccess(result);
      })
      .catch(() => {
        if (alive) setAccess("private");
      });
    if (userId === "me") {
      void loadSocialPublic()
        .then((value) => {
          if (alive) setIsPublic(value);
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [userId]);

  const person = userId === "me" ? null : board.feed?.people[userId];
  const title = userId === "me" ? "Your posts" : person?.name ?? "Posts";

  async function togglePublic(next: boolean) {
    setSavingPublic(true);
    const saved = await board.run(() => setSocialPublic(next), false);
    setSavingPublic(false);
    if (saved) setIsPublic(next);
  }

  if (access !== "self" && access !== "open") {
    return (
      <Screen>
        <TitleBar title="Posts" onBack={nav.back} />
        <AppText muted style={styles.emptyText}>
          {access === "private" ? "This account is private. Only their matches can see these posts." : "Loading posts..."}
        </AppText>
      </Screen>
    );
  }

  return (
    <SocialBoard
      me={me}
      board={board}
      title={title}
      onBack={nav.back}
      header={
        access === "self" ? (
          <Card padding={14} radius={18} gap={8}>
            <View style={styles.visibilityRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <AppText weight="extrabold">{isPublic ? "Public" : "Private"}</AppText>
                <AppText size={12} muted>
                  {isPublic ? "Any signed-in user can see your posts." : "Only your matches can see your posts."}
                </AppText>
              </View>
              <Toggle accessibilityLabel="Make posts public" value={isPublic} onChange={(next) => void togglePublic(next)} />
            </View>
            {savingPublic ? <AppText size={12} muted>Saving...</AppText> : null}
          </Card>
        ) : null
      }
    />
  );
}

function SocialBoard({
  me,
  board,
  header,
  composer,
  title = "Social",
  onBack,
  onOpenFriend,
}: {
  me: Me;
  board: ReturnType<typeof useSocialBoard>;
  header?: ReactNode;
  composer?: boolean;
  title?: string;
  onBack?: () => void;
  onOpenFriend?: (userId: string) => void;
}) {
  const theme = useAppTheme();
  const { feed, loadError, error, setError, setLoadError } = board;

  if (!feed) {
    return (
      <Screen>
        <TitleBar title={title} onBack={onBack} />
        <View style={styles.status}>
          <AppText muted style={styles.emptyText}>
            {loadError ?? "Loading your feed..."}
          </AppText>
          {loadError ? (
            <PrimaryButton height={40} fontSize={13} onPress={() => void board.reload()} style={styles.smallButton}>
              Try again
            </PrimaryButton>
          ) : null}
        </View>
      </Screen>
    );
  }

  return (
    <SocialContext.Provider
      value={{
        feed,
        me,
        run: board.run,
        updatePost: board.updatePost,
        activeVideoId: board.activeVideoId,
        registerVideo: board.registerVideo,
        openMedia: board.setLightbox,
      }}
    >
      <Screen>
        <TitleBar title={title} onBack={onBack} />
        <ScrollBody
          refreshControl={<RefreshControl refreshing={board.refreshing} onRefresh={() => void board.refresh()} tintColor={theme.colors.primary} />}
          onScroll={board.syncVideos}
          scrollEventThrottle={64}
        >
          {onOpenFriend ? <FriendRow onOpen={onOpenFriend} /> : null}
          {header}
          {composer ? <Composer /> : null}
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
          {feed.posts.length ? (
            feed.posts.map((post) => <PostCard key={post.id} post={post} />)
          ) : (
            <AppText muted style={styles.emptyText}>
              {composer
                ? feed.friendIds.length
                  ? "No posts yet. Share a workout update to get things started."
                  : "Match with people on Discover, or turn your posts public, to see a feed here."
                : "No posts yet."}
            </AppText>
          )}
          {board.hasMore ? (
            <SecondaryButton height={40} fontSize={13} onPress={() => void board.loadMore()}>
              Load older posts
            </SecondaryButton>
          ) : null}
        </ScrollBody>
        <MediaLightbox media={board.lightbox} onClose={() => board.setLightbox(null)} />
      </Screen>
    </SocialContext.Provider>
  );
}

function FriendRow({ onOpen }: { onOpen: (userId: string) => void }) {
  const { feed, me } = useSocial();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendRow}>
      <FriendCircle name={me.name || "You"} photo={me.photo} label="You" onPress={() => onOpen("me")} />
      {feed.friendIds.map((id) => {
        const person = feed.people[id];
        if (!person) return null;
        return (
          <FriendCircle
            key={id}
            name={person.name}
            photo={person.photo}
            label={firstName(person.name)}
            onPress={() => onOpen(id)}
          />
        );
      })}
    </ScrollView>
  );
}

function FriendCircle({ name, photo, label, onPress }: { name: string; photo?: string | null; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} posts`} onPress={onPress} style={styles.friendCircle}>
      <PersonAvatar name={name} photo={photo} size={64} />
      <AppText size={11} weight="semibold" numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

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

function usePerson(authorId: string) {
  const { feed, me } = useSocial();
  if (authorId === "me") return { name: me.name || "You", photo: me.photo ?? null, isMe: true, isFriend: false, isPublic: false };
  const person = feed.people[authorId];
  return {
    name: person?.name ?? "SwoleMate",
    photo: person?.photo ?? null,
    isMe: false,
    isFriend: feed.friendIds.includes(authorId),
    isPublic: (feed.publicIds ?? []).includes(authorId),
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

  useEffect(() => {
    const queued = takeSocialDraft();
    if (queued) setText(queued);
    return () => {
      preparation.current?.abort();
      releaseMedia.current?.();
    };
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
    } catch (err) {
      if (!controller.signal.aborted) setPickError(errorMessage(err, "Couldn't prepare this attachment. Please try again."));
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
      <AppText size={11} muted>
        {POST_LIMIT - text.length} characters left
      </AppText>
      {media ? (
        <View>
          <FeedMedia media={media} postId="composer-preview" />
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
        <Pressable accessibilityRole="button" onPress={() => void addMedia()} disabled={posting || preparing} hitSlop={8}>
          <AppText weight="bold" primary>
            + Photo / Clip
          </AppText>
        </Pressable>
        <PrimaryButton height={36} fontSize={13} disabled={!canPost} onPress={() => void post()} style={[styles.smallButton, !canPost && { opacity: 0.5 }]}>
          {posting ? "Posting..." : "Post"}
        </PrimaryButton>
      </View>
    </Card>
  );
}

function FeedMedia({ media, postId }: { media: PostMedia; postId: string }) {
  const { openMedia } = useSocial();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Open attachment" onPress={() => openMedia(media)}>
      {media.type === "video" ? <PostVideo postId={postId} uri={media.uri} /> : <Image source={{ uri: media.uri }} style={styles.postMedia} contentFit="cover" />}
    </Pressable>
  );
}

function PostVideo({ postId, uri }: { postId: string; uri: string }) {
  const ref = useRef<View>(null);
  const { activeVideoId, registerVideo } = useSocial();
  const source = useRef(uri);
  const player = useVideoPlayer(source.current, (clip) => {
    clip.loop = true;
    clip.muted = true;
  });
  const play = activeVideoId === postId;

  useEffect(() => {
    return registerVideo(postId, (done) => {
      const node = ref.current;
      if (!node) {
        done(null);
        return;
      }
      node.measureInWindow((_x, y, _width, height) => done({ y, height }));
    });
  }, [postId, registerVideo]);

  useEffect(() => {
    if (play) player.play();
    else player.pause();
  }, [play, player]);

  return (
    <View ref={ref} collapsable={false}>
      <VideoView player={player} style={styles.postMedia} contentFit="cover" nativeControls={false} />
    </View>
  );
}

function MediaLightbox({ media, onClose }: { media: PostMedia | null; onClose: () => void }) {
  const theme = useAppTheme();
  const window = useWindowDimensions();
  const frame = appFrameSize(window);
  // Stay inside the phone screen. A camera photo is thousands of pixels wide, and
  // letting it use that size zooms into a corner on both desktop and a real phone.
  const fitted = {
    width: Math.max(frame.width - 32, 1),
    height: Math.max(frame.height - 88, 1),
  };
  useEffect(() => {
    if (!media || typeof document === "undefined") return;
    const onKey = (event: Event) => {
      if ("key" in event && event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [media, onClose]);
  return (
    <Modal visible={!!media} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.lightbox}>
        <View style={[styles.lightboxFrame, { width: frame.width, height: frame.height }]}>
          <View style={styles.lightboxBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={[styles.lightboxClose, { backgroundColor: theme.colors.primary }]}
            >
              <AppText weight="extrabold" color={theme.colors.primaryText}>
                Close
              </AppText>
            </Pressable>
          </View>
          <View style={[styles.lightboxStage, fitted]}>
            {media?.type === "image" ? (
              <Image source={{ uri: media.uri }} style={[StyleSheet.absoluteFill, fitted]} contentFit="contain" />
            ) : null}
            {media?.type === "video" ? <LightboxVideo uri={media.uri} style={fitted} /> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function LightboxVideo({ uri, style }: { uri: string; style: { top: number; left: number; right: number; bottom: number } | { width: number; height: number } }) {
  const player = useVideoPlayer(uri, (clip) => {
    clip.loop = true;
    clip.muted = false;
  });
  useEffect(() => {
    player.play();
    return () => {
      player.pause();
    };
  }, [player]);
  return <VideoView player={player} style={style} contentFit="contain" nativeControls allowsFullscreen={false} />;
}

function PostCard({ post }: { post: Post }) {
  const theme = useAppTheme();
  const nav = useNavigation();
  const { run, updatePost } = useSocial();
  const [showComments, setShowComments] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.text);
  const [menu, setMenu] = useState<null | "menu" | "report" | "block">(null);
  const author = usePerson(post.authorId);
  const count = post.commentsLoaded ? post.comments.length : post.commentCount;

  function toggleLike() {
    const liked = !post.likedByMe;
    updatePost(post.id, (current) => ({ ...current, likedByMe: liked, likes: Math.max(0, current.likes + (liked ? 1 : -1)) }));
    void run(() => setPostLike(post.id, liked), false);
  }

  async function openComments() {
    const next = !showComments;
    setShowComments(next);
    if (!next || post.commentsLoaded) return;
    await run(async () => {
      const loaded = await fetchComments(post.id);
      updatePost(post.id, (current) => ({ ...current, comments: loaded, commentsLoaded: true, commentCount: loaded.length }));
    }, false);
  }

  async function saveEdit() {
    const text = draft.trim();
    if (!text && !post.media) return;
    if (text === post.text) {
      setEditing(false);
      return;
    }
    if (await run(() => editPost(post.id, text), false)) {
      updatePost(post.id, (current) => ({ ...current, text, edited: text !== post.text || current.edited }));
      setEditing(false);
    }
  }

  return (
    <Card padding={14} radius={18} gap={12}>
      <View style={styles.postHeader}>
        <Pressable
          accessibilityRole="button"
          disabled={!author.isFriend && !author.isPublic}
          onPress={() => nav.push({ name: "request-profile", userId: post.authorId })}
          style={[styles.postHeader, { flex: 1 }]}
        >
          <PersonAvatar name={author.name} photo={author.photo} size={40} />
          <View style={{ flex: 1 }}>
            <AppText weight="extrabold">{author.name}</AppText>
            <AppText size={12} muted>
              {timeAgo(post.createdAt)}
              {post.edited ? " · Edited" : ""}
            </AppText>
          </View>
        </Pressable>
        {author.isMe && !confirmingDelete && !editing ? (
          <View style={styles.commentMeta}>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit post" onPress={() => { setDraft(post.text); setEditing(true); }} hitSlop={8}>
              <AppText size={13} weight="bold" muted>Edit</AppText>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Delete post" onPress={() => setConfirmingDelete(true)} hitSlop={8}>
              <AppText size={13} weight="bold" muted>Delete</AppText>
            </Pressable>
          </View>
        ) : null}
        {!author.isMe && !menu ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Post actions" onPress={() => setMenu("menu")} hitSlop={8}>
            <AppText size={13} weight="bold" muted>More</AppText>
          </Pressable>
        ) : null}
      </View>

      {confirmingDelete ? (
        <View style={[styles.confirm, { backgroundColor: theme.colors.surfaceRaised }]}>
          <AppText size={13} weight="semibold" style={{ flex: 1 }}>Delete this post?</AppText>
          <Pressable accessibilityRole="button" onPress={() => setConfirmingDelete(false)} hitSlop={8}>
            <AppText size={13} weight="bold" muted>Cancel</AppText>
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
            <AppText size={13} weight="extrabold" color={theme.colors.danger}>Delete</AppText>
          </Pressable>
        </View>
      ) : null}

      <PostSafety post={post} menu={menu} onMenu={setMenu} />

      {editing ? (
        <View style={{ gap: 8 }}>
          <Input multiline value={draft} onChangeText={setDraft} maxLength={POST_LIMIT} style={styles.composerInput} />
          <AppText size={11} muted>{POST_LIMIT - draft.length} characters left</AppText>
          <View style={styles.commentMeta}>
            <TextAction label="Save" onPress={() => void saveEdit()} color={theme.colors.primary} />
            <TextAction label="Cancel" onPress={() => { setDraft(post.text); setEditing(false); }} />
          </View>
        </View>
      ) : post.text ? (
        <AppText style={{ lineHeight: 20 }}>{post.text}</AppText>
      ) : null}
      {post.media ? <FeedMedia media={post.media} postId={post.id} /> : null}

      <LikedBy post={post} />

      {!author.isMe && !author.isFriend && author.isPublic ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View profile"
          onPress={() => nav.push({ name: "request-profile", userId: post.authorId })}
          style={[styles.viewProfile, { borderColor: theme.colors.primary }]}
        >
          <AppText size={13} weight="extrabold" primary>
            View profile
          </AppText>
        </Pressable>
      ) : null}

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
          onPress={() => void openComments()}
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

function PostSafety({
  post,
  menu,
  onMenu,
}: {
  post: Post;
  menu: null | "menu" | "report" | "block";
  onMenu: (menu: null | "menu" | "report" | "block") => void;
}) {
  const theme = useAppTheme();
  const { run } = useSocial();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const author = usePerson(post.authorId);
  if (!menu) return null;

  return (
    <View style={[styles.confirm, { backgroundColor: theme.colors.surfaceRaised, flexWrap: "wrap" }]}>
      {menu === "menu" ? (
        <>
          <AppText size={13} weight="semibold" style={{ flex: 1 }}>What do you want to do?</AppText>
          <TextAction label="Report" onPress={() => onMenu("report")} />
          <TextAction label="Block" onPress={() => onMenu("block")} color={theme.colors.danger} />
          <TextAction label="Cancel" onPress={() => onMenu(null)} />
        </>
      ) : null}
      {menu === "block" ? (
        <>
          <AppText size={13} weight="semibold" style={{ flex: 1 }}>Block {firstName(author.name)}? Their posts will disappear.</AppText>
          <TextAction label="Cancel" onPress={() => onMenu(null)} />
          <TextAction
            label="Block"
            color={theme.colors.danger}
            onPress={() => {
              onMenu(null);
              void run(() => blockPerson(post.authorId));
            }}
          />
        </>
      ) : null}
      {menu === "report" ? (
        <View style={{ gap: 8, width: "100%" }}>
          <AppText size={13} weight="semibold">Report {firstName(author.name)}. They won't be told.</AppText>
          <View style={styles.reasonRow}>
            {reportReasons.map((item) => (
              <Pressable key={item} accessibilityRole="button" onPress={() => setReason(item)}>
                <AppText size={12} weight={reason === item ? "bold" : "medium"} primary={reason === item}>
                  {item}
                </AppText>
              </Pressable>
            ))}
          </View>
          <Input
            placeholder="What happened"
            value={details}
            onChangeText={setDetails}
            maxLength={420}
          />
          <View style={styles.commentMeta}>
            <TextAction label="Cancel" onPress={() => onMenu(null)} />
            <TextAction
              label="Send report"
              color={theme.colors.primary}
              onPress={() => {
                if (!reason) return;
                const note = `Post ${post.id}. ${details.trim()}`.trim().slice(0, 500);
                onMenu(null);
                void run(() => reportPerson(post.authorId, reason, note), false);
              }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

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
  const { run, updatePost } = useSocial();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [sending, setSending] = useState(false);
  const theme = useAppTheme();
  const threads = post.comments.filter((comment) => !comment.parentId);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const tempId = `local-${Date.now()}`;
    const optimistic: Comment = {
      id: tempId,
      authorId: "me",
      createdAt: new Date().toISOString(),
      text,
      parentId: replyTo?.parentId,
      likes: 0,
      likedByMe: false,
      edited: false,
    };
    updatePost(post.id, (current) => ({
      ...current,
      commentsLoaded: true,
      commentCount: current.commentCount + 1,
      comments: [...current.comments, optimistic],
    }));
    setDraft("");
    setReplyTo(null);
    const sent = await run(() => addComment(post.id, text, replyTo?.parentId), false);
    setSending(false);
    if (!sent) {
      updatePost(post.id, (current) => ({
        ...current,
        commentCount: Math.max(0, current.commentCount - 1),
        comments: current.comments.filter((comment) => comment.id !== tempId),
      }));
      setDraft(text);
      return;
    }
    const loaded = await fetchComments(post.id).catch(() => null);
    if (!loaded) return;
    updatePost(post.id, (current) => ({ ...current, comments: loaded, commentsLoaded: true, commentCount: loaded.length }));
  }

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
            .filter((comment) => comment.parentId === thread.id)
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
            <AppText size={12} weight="bold" primary>Cancel</AppText>
          </Pressable>
        </View>
      ) : null}
      <AppText size={11} muted>{COMMENT_LIMIT - draft.length} characters left</AppText>
      <View style={styles.commentInputRow}>
        <Input
          placeholder={replyTo ? "Write a reply..." : "Write a comment..."}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => void send()}
          returnKeyType="send"
          maxLength={COMMENT_LIMIT}
          style={{ flex: 1, height: 40 }}
        />
        <PrimaryButton
          height={40}
          fontSize={13}
          disabled={!draft.trim() || sending}
          onPress={() => void send()}
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
    if (await run(() => editComment(comment.id, draft), false)) {
      updatePost(post.id, (current) => ({
        ...current,
        comments: current.comments.map((item) => (item.id === comment.id ? { ...item, text: draft.trim(), edited: true } : item)),
      }));
      setEditing(false);
    }
  }

  function toggleLike() {
    const liked = !comment.likedByMe;
    updatePost(post.id, (current) => ({
      ...current,
      comments: current.comments.map((item) => (item.id === comment.id ? { ...item, likedByMe: liked, likes: Math.max(0, item.likes + (liked ? 1 : -1)) } : item)),
    }));
    void run(() => setCommentLike(comment.id, liked), false);
  }

  return (
    <View style={styles.comment}>
      <PersonAvatar name={commenter.name} photo={commenter.photo} size={isReply ? 24 : 28} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={[styles.commentBubble, { backgroundColor: theme.colors.surfaceRaised }]}>
          <AppText size={13} weight="extrabold">{commenter.name}</AppText>
          {editing ? (
            <View style={{ gap: 8, marginTop: 4 }}>
              <Input value={draft} onChangeText={setDraft} autoFocus onSubmitEditing={() => void save()} maxLength={COMMENT_LIMIT} style={{ height: 36 }} />
              <AppText size={11} muted>{COMMENT_LIMIT - draft.length} characters left</AppText>
              <View style={styles.commentMeta}>
                <TextAction label="Save" onPress={() => void save()} color={theme.colors.primary} />
                <TextAction label="Cancel" onPress={() => { setDraft(comment.text); setEditing(false); }} />
              </View>
            </View>
          ) : (
            <AppText size={13} style={{ lineHeight: 18 }}>{comment.text}</AppText>
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
          <TextAction label="Reply" accessibilityLabel={`Reply to ${commenter.name}`} onPress={() => onReply(commenter.isMe ? "you" : firstName(commenter.name))} />
          {commenter.isMe && !editing ? (
            <TextAction label="Edit" accessibilityLabel={`Edit comment: ${comment.text}`} onPress={() => setEditing(true)} />
          ) : null}
          {canDelete && !confirmingDelete ? (
            <TextAction label="Delete" accessibilityLabel={`Delete comment: ${comment.text}`} onPress={() => setConfirmingDelete(true)} color={theme.colors.danger} />
          ) : null}
        </View>
        {confirmingDelete ? (
          <View style={styles.commentMeta}>
            <AppText size={11} muted>Delete this comment?</AppText>
            <TextAction label="Cancel" onPress={() => setConfirmingDelete(false)} />
            <TextAction
              label="Delete"
              color={theme.colors.danger}
              onPress={() => {
                setConfirmingDelete(false);
                void run(async () => {
                  await deleteComment(comment.id);
                  updatePost(post.id, (current) => ({
                    ...current,
                    commentCount: Math.max(0, current.commentCount - 1),
                    comments: current.comments.filter((item) => item.id !== comment.id && item.parentId !== comment.id),
                  }));
                }, false);
              }}
            />
          </View>
        ) : null}
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
  friendRow: {
    gap: 14,
    paddingVertical: 4,
  },
  friendCircle: {
    alignItems: "center",
    gap: 6,
    width: 72,
  },
  visibilityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
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
  lightbox: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.92)",
    flex: 1,
    justifyContent: "center",
  },
  lightboxFrame: {
    maxHeight: "100%",
    maxWidth: "100%",
    padding: 16,
  },
  lightboxBar: {
    alignItems: "flex-end",
    paddingBottom: 12,
    zIndex: 2,
  },
  lightboxClose: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  lightboxStage: {
    overflow: "hidden",
  },
  confirm: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reasonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
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
  viewProfile: {
    alignSelf: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  postFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
