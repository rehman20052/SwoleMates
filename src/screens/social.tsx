import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Modal, PanResponder, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { appFrameSize } from "@/components/phone-frame";
import { NotificationMedia } from "@/components/notification-media";
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
  fetchPost,
  followAccount,
  friendHasFreshPost,
  loadSocialNotices,
  loadSocialPeople,
  loadSocialPublic,
  subscribePostsPublic,
  markFriendPostsSeen,
  markSocialNoticesSeen,
  Post,
  POST_LIMIT,
  PostMedia,
  recentFriendActivity,
  readFriendRings,
  setCommentLike,
  setPostLike,
  setSocialPublic,
  SocialNotice,
  subscribeFeed,
  subscribeFriendRings,
  takeSocialDraft,
  unfollowAccount,
  timeAgo,
} from "@/lib/social";
import { useNavigation } from "@/navigation";
import { useAppTheme } from "@/theme";

type Me = { name: string; photo?: string };
type VideoMeasure = (done: (box: { y: number; height: number } | null) => void) => void;

type NoticeFocus = { postId: string; commentId?: string; likes?: boolean; token: number };

type Social = {
  feed: Feed;
  me: Me;
  run: (action: () => Promise<unknown>, reloadAfter?: boolean) => Promise<boolean>;
  updatePost: (postId: string, fn: (post: Post) => Post) => void;
  activeVideoId: string | null;
  // The video just below the active one. It loads in the background so it starts right away.
  nextVideoId: string | null;
  registerVideo: (id: string, measure: VideoMeasure) => () => void;
  openMedia: (media: PostMedia) => void;
  focus: NoticeFocus | null;
  revealNotice: (notice: SocialNotice) => Promise<void>;
  toggleFollow: (authorId: string) => Promise<void>;
  postsPublic: boolean | null;
  openPostVisibility: () => void;
};

const SocialContext = createContext<Social | null>(null);

function useSocial() {
  const social = useContext(SocialContext);
  if (!social) throw new Error("useSocial must be used inside SocialScreen.");
  return social;
}

function dismissNativeFullscreen() {
  if (typeof document === "undefined") return;
  const doc = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
  if (document.fullscreenElement) void document.exitFullscreen();
  else if (doc.webkitFullscreenElement) void doc.webkitExitFullscreen?.();
  document.querySelectorAll("video").forEach((node) => {
    const clip = node as HTMLVideoElement & { webkitDisplayingFullscreen?: boolean; webkitExitFullScreen?: () => void };
    if (clip.webkitDisplayingFullscreen) clip.webkitExitFullScreen?.();
  });
}

function clipClock(seconds: number) {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function seekMountedClip(player: VideoPlayer, seconds: number) {
  const mounted = (player as VideoPlayer & { _mountedVideos?: Set<HTMLVideoElement> })._mountedVideos;
  if (mounted && mounted.size > 0) {
    mounted.forEach((video) => {
      if (typeof video.fastSeek === "function") video.fastSeek(seconds);
      else video.currentTime = seconds;
    });
    return;
  }
  player.currentTime = seconds;
}

// Loads a clip without starting it. On web, Expo's replace() calls play() right after
// load() and doesn't handle the promise, so an interrupted load logs an AbortError and the
// preloaded next clip briefly starts playing. Set the source on the mounted <video> instead.
function loadClip(player: VideoPlayer, uri: string) {
  const source = { uri, useCaching: true };
  if (Platform.OS === "web") {
    const web = player as VideoPlayer & { _mountedVideos?: Set<HTMLVideoElement>; src?: unknown };
    web.src = source;
    web._mountedVideos?.forEach((video) => {
      video.setAttribute("src", uri);
      video.load();
    });
    return Promise.resolve();
  }
  return player.replaceAsync(source);
}

function playMountedClip(player: VideoPlayer) {
  // Expo's web player calls HTMLVideoElement.play() without handling its
  // promise. Safari/Chrome reject it for autoplay restrictions, interrupted
  // loads and unsupported clips; those rejections otherwise open Expo LogBox.
  if (Platform.OS === "web") {
    const mounted = (player as VideoPlayer & { _mountedVideos?: Set<HTMLVideoElement> })._mountedVideos;
    mounted?.forEach(video => {
      void video.play().catch(() => {
        // A later user tap can retry. Source failures remain exposed through
        // the player's statusChange event instead of an unhandled exception.
      });
    });
    return;
  }
  player.play();
}

let feedAudioReady = false;
const feedAudioWaiters = new Set<() => void>();

function armFeedAudio() {
  if (typeof window === "undefined" || (armFeedAudio as { armed?: boolean }).armed) return;
  (armFeedAudio as { armed?: boolean }).armed = true;
  const unlock = () => {
    if (feedAudioReady) return;
    feedAudioReady = true;
    feedAudioWaiters.forEach((listener) => listener());
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("touchstart", unlock, { passive: true });
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
      followedAt: page.followedAt ?? current?.followedAt ?? {},
      posts: [...page.posts.map((post) => keepThread(post, previous.get(post.id))), ...older],
    };
  }
  const previous = new Map(current.posts.map((post) => [post.id, post]));
  const fresh = page.posts.filter((post) => !previous.has(post.id));
  return {
    ...current,
    people: { ...current.people, ...page.people },
    publicIds: [...new Set([...(current.publicIds ?? []), ...page.publicIds])],
    followedAt: page.followedAt ?? current.followedAt ?? {},
    posts: [...current.posts, ...fresh],
  };
}

function keepThread(post: Post, previous?: Post) {
  if (!previous?.commentsLoaded) return post;
  return { ...post, comments: previous.comments, commentsLoaded: true };
}

function useSocialBoard(loadPage: (before?: string) => Promise<FeedPage>, channelName = "social-feed") {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [nextVideoId, setNextVideoId] = useState<string | null>(null);
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
    }, channelName);
    return () => {
      alive = false;
      stop();
    };
  }, [channelName, loadPage, reload]);

  const syncVideos = useCallback(() => {
    if (lightbox) {
      setActiveVideoId(null);
      setNextVideoId(null);
      return;
    }
    const entries = [...measures.current.entries()];
    if (!entries.length) {
      setActiveVideoId(null);
      setNextVideoId(null);
      return;
    }
    const windowHeight = Dimensions.get("window").height;
    const visibleBottom = windowHeight - 88;
    let pending = entries.length;
    let bestId: string | null = null;
    let best = 0;
    const boxes: { id: string; y: number }[] = [];
    for (const [id, measure] of entries) {
      measure((box) => {
        if (box) {
          boxes.push({ id, y: box.y });
          const overlap = Math.min(box.y + box.height, visibleBottom) - Math.max(box.y, 0);
          if (overlap > best) {
            best = overlap;
            bestId = id;
          }
        }
        pending -= 1;
        if (pending > 0) return;
        const activeId = best > 48 ? bestId : null;
        // Only the playing video and the one after it download. Videos further down wait.
        const activeY = boxes.find((item) => item.id === activeId)?.y;
        const below = boxes
          .filter((item) => item.id !== activeId && (activeY != null ? item.y > activeY : item.y >= 0))
          .sort((left, right) => left.y - right.y);
        setActiveVideoId(activeId);
        setNextVideoId(below[0]?.id ?? null);
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

  const toggleFollow = useCallback(async (authorId: string) => {
    const existing = feedRef.current?.followedAt?.[authorId];
    setError(null);
    try {
      if (existing) {
        await unfollowAccount(authorId);
        setFeed((current) => {
          if (!current) return current;
          const followedAt = { ...current.followedAt };
          delete followedAt[authorId];
          return { ...current, followedAt };
        });
        return;
      }
      const followedAt = await followAccount(authorId);
      setFeed((current) => (current ? { ...current, followedAt: { ...current.followedAt, [authorId]: followedAt } } : current));
    } catch (err) {
      setError(errorMessage(err, "Could not update that follow."));
    }
  }, []);

  const ensurePost = useCallback(async (postId: string) => {
    const current = feedRef.current;
    if (current?.posts.some((post) => post.id === postId)) return true;
    const loaded = await fetchPost(postId);
    if (!loaded) return false;
    setFeed((existing) => {
      if (!existing) return { posts: [loaded.post], friendIds: [], publicIds: [], followedAt: {}, people: loaded.people };
      if (existing.posts.some((post) => post.id === postId)) {
        return { ...existing, people: { ...existing.people, ...loaded.people } };
      }
      const posts = [...existing.posts, loaded.post].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      return { ...existing, posts, people: { ...existing.people, ...loaded.people } };
    });
    return true;
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
    toggleFollow,
    ensurePost,
    activeVideoId: lightbox ? null : activeVideoId,
    nextVideoId: lightbox ? null : nextVideoId,
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

  return <SocialBoard me={me} board={board} composer onOpenFriend={(userId) => {
    if (userId !== "me") void markFriendPostsSeen(userId);
    nav.push({ name: "social-profile", userId });
  }} onOpenPostsSettings={() => nav.push({ name: "social-profile", userId: "me" })} />;
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
        followedAt: page.followedAt,
        people: page.people,
      })),
    [userId],
  );
  const board = useSocialBoard(loadPage, `social-posts-${userId}`);

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
  onOpenPostsSettings,
}: {
  me: Me;
  board: ReturnType<typeof useSocialBoard>;
  header?: ReactNode;
  composer?: boolean;
  title?: string;
  onBack?: () => void;
  onOpenFriend?: (userId: string) => void;
  onOpenPostsSettings?: () => void;
}) {
  const theme = useAppTheme();
  const { feed, loadError, error, setError, setLoadError } = board;
  const [focus, setFocus] = useState<NoticeFocus | null>(null);
  const [audience, setAudience] = useState<"friends" | "public">("friends");
  const scrollRef = useRef<ScrollView>(null);
  const [postsPublic, setPostsPublic] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const stop = subscribePostsPublic((value) => {
      if (alive) setPostsPublic(value);
    });
    void loadSocialPublic().catch(() => undefined);
    return () => {
      alive = false;
      stop();
    };
  }, []);

  const openPostVisibility = useCallback(() => {
    if (onOpenPostsSettings) {
      onOpenPostsSettings();
      return;
    }
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [onOpenPostsSettings]);
  const postOffsets = useRef<Record<string, number>>({});
  const friendIdsRef = useRef<string[]>([]);
  friendIdsRef.current = feed?.friendIds ?? [];

  const posts = feed && composer ? postsForAudience(feed, audience) : (feed?.posts ?? []);
  const fillAttempts = useRef(0);

  useEffect(() => {
    fillAttempts.current = 0;
  }, [audience]);

  useEffect(() => {
    if (!composer || !feed || !board.hasMore || posts.length > 0 || fillAttempts.current >= 8) return;
    fillAttempts.current += 1;
    void board.loadMore();
  }, [audience, composer, feed, board.hasMore, posts.length]);

  const revealNotice = useCallback(async (notice: SocialNotice) => {
    const loaded = await fetchPost(notice.postId).catch(() => null);
    if (composer && loaded) {
      const authorId = loaded.post.authorId;
      setAudience(authorId === "me" || friendIdsRef.current.includes(authorId) ? "friends" : "public");
    }
    const opened = await board.ensurePost(notice.postId);
    if (!opened) return;
    if (notice.commentId) {
      const comments = await fetchComments(notice.postId).catch(() => null);
      if (comments) {
        board.updatePost(notice.postId, (current) => ({
          ...current,
          comments,
          commentsLoaded: true,
          commentCount: comments.length,
        }));
      }
    }
    setFocus({ postId: notice.postId, commentId: notice.commentId, likes: notice.kind === "post_like", token: Date.now() });
    setTimeout(() => {
      const y = postOffsets.current[notice.postId];
      if (y == null) return;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    }, 120);
  }, [board, composer]);

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
        nextVideoId: board.nextVideoId,
        registerVideo: board.registerVideo,
        openMedia: board.setLightbox,
        focus,
        revealNotice,
        toggleFollow: board.toggleFollow,
        postsPublic,
        openPostVisibility,
      }}
    >
      <Screen>
        <TitleBar title={title} onBack={onBack} right={composer ? <NotificationBell /> : undefined} />
        <ScrollBody
          ref={scrollRef}
          refreshControl={<RefreshControl refreshing={board.refreshing} onRefresh={() => void board.refresh()} tintColor={theme.colors.primary} />}
          onScroll={board.syncVideos}
          scrollEventThrottle={64}
        >
          {onOpenFriend ? <FriendRow onOpen={onOpenFriend} /> : null}
          {composer ? <AudienceSwitch value={audience} onChange={setAudience} /> : null}
          {composer && audience === "public" ? (
            <AppText size={13} muted style={styles.publicNote}>
              Posts from public accounts.
            </AppText>
          ) : null}
          {header}
          {composer && audience === "friends" ? <Composer /> : null}
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
          {posts.length ? (
            posts.map((post) => (
              <View
                key={post.id}
                onLayout={(event) => {
                  postOffsets.current[post.id] = event.nativeEvent.layout.y;
                }}
              >
                <PostCard post={post} />
              </View>
            ))
          ) : (
            <AppText muted style={styles.emptyText}>
              {composer
                ? audience === "public"
                  ? "No public posts yet."
                  : feed.friendIds.length
                    ? "No posts from you or your matches yet."
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

function unreadCount(notices: SocialNotice[], seenAt: string | null) {
  if (!seenAt) return notices.length;
  return notices.filter((notice) => notice.at > seenAt).length;
}

function SheetModal({ title, visible, onClose, children }: { title: string; visible: boolean; onClose: () => void; children: ReactNode }) {
  const theme = useAppTheme();
  const window = useWindowDimensions();
  const frame = appFrameSize(window);
  const listMax = Math.max(160, Math.round(frame.height * 0.42));
  const framed = frame.width < window.width;
  const cardWidth = Math.min(frame.width - 48, 340);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.sheetBackdrop, { alignItems: "center", justifyContent: "center" }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Dismiss ${title.toLowerCase()}`} style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          pointerEvents="box-none"
          style={{
            zIndex: 1,
            width: frame.width,
            height: frame.height,
            maxWidth: "100%",
            justifyContent: "flex-end",
            alignItems: "center",
            paddingBottom: 18,
            borderRadius: framed ? 36 : 0,
            overflow: "hidden",
          }}
        >
          <View style={[styles.sheet, { width: cardWidth, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, maxHeight: frame.height * 0.62 }]}>
            <View style={[styles.sheetHandle, { backgroundColor: theme.colors.border }]} />
            <View style={styles.sheetHeader}>
              <AppText size={17} weight="extrabold">{title}</AppText>
              <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title.toLowerCase()}`} onPress={onClose} hitSlop={10}>
                <AppText size={14} weight="bold" muted>Close</AppText>
              </Pressable>
            </View>
            <QuietScroll maxHeight={listMax}>{children}</QuietScroll>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function QuietScroll({ maxHeight, children }: { maxHeight: number; children: ReactNode }) {
  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    if (!document.getElementById("quiet-scroll-style")) {
      const style = document.createElement("style");
      style.id = "quiet-scroll-style";
      style.textContent = "[data-quiet-scroll]{scrollbar-width:none;-ms-overflow-style:none}[data-quiet-scroll]::-webkit-scrollbar{display:none;width:0;height:0}";
      document.head.appendChild(style);
    }
    const node = scroller.current?.getScrollableNode?.() as HTMLElement | undefined;
    if (node) node.setAttribute("data-quiet-scroll", "true");
  }, []);

  return (
    <ScrollView
      ref={scroller}
      style={{ maxHeight }}
      contentContainerStyle={styles.sheetList}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

function NoticeDrop({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const theme = useAppTheme();
  const window = useWindowDimensions();
  const frame = appFrameSize(window);
  const framed = frame.width < window.width;
  const cardWidth = Math.min(frame.width - 48, 340);
  const drop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    drop.setValue(0);
    Animated.timing(drop, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== "web" }).start();
  }, [drop, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.sheetBackdrop, { alignItems: "center", justifyContent: "center" }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notifications" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          pointerEvents="box-none"
          style={{
            zIndex: 1,
            width: frame.width,
            height: frame.height,
            maxWidth: "100%",
            alignItems: "center",
            paddingTop: 58,
            borderRadius: framed ? 36 : 0,
            overflow: "hidden",
          }}
        >
          <Animated.View
            style={{
              width: cardWidth,
              maxHeight: frame.height * 0.58,
              opacity: drop,
              transform: [{ translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }],
            }}
          >
            <View style={[styles.dropCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <View style={styles.dropHeader}>
                <AppText size={15} weight="extrabold">Notifications</AppText>
                <Pressable accessibilityRole="button" accessibilityLabel="Close notifications" onPress={onClose} hitSlop={10}>
                  <AppText size={13} weight="bold" muted>Close</AppText>
                </Pressable>
              </View>
              <QuietScroll maxHeight={Math.max(140, Math.round(frame.height * 0.46))}>{children}</QuietScroll>
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

function NotificationBell() {
  const theme = useAppTheme();
  const { revealNotice } = useSocial();
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<SocialNotice[]>([]);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const count = unreadCount(notices, seenAt);

  const refresh = useCallback(async () => {
    const loaded = await loadSocialNotices().catch(() => null);
    if (!loaded) return;
    setNotices(loaded.notices);
    setSeenAt(loaded.seenAt);
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeFeed(() => {
      void refresh();
    }, "social-notices");
  }, [refresh]);

  async function openBell() {
    setOpen(true);
    if (!count) return;
    const next = await markSocialNoticesSeen().catch(() => null);
    if (next) setSeenAt(next);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={count ? `Notifications, ${count} new` : "Notifications"}
        onPress={() => void openBell()}
        hitSlop={8}
        style={styles.bell}
      >
        <BellIcon color={theme.colors.primary} />
        {count ? (
          <View style={[styles.badge, { backgroundColor: theme.colors.primary, borderColor: theme.colors.background }]}>
            <AppText size={11} weight="extrabold" color={theme.colors.primaryText}>
              {count > 9 ? "9+" : count}
            </AppText>
          </View>
        ) : null}
      </Pressable>
      <NoticeDrop visible={open} onClose={() => setOpen(false)}>
        {notices.length ? (
          notices.map((notice) => (
            <Pressable
              key={notice.id}
              accessibilityRole="button"
              accessibilityLabel={`${notice.actorName} ${notice.action}`}
              style={styles.noticeItem}
              onPress={() => {
                setOpen(false);
                void revealNotice(notice);
              }}
            >
              <PersonAvatar name={notice.actorName} photo={notice.actorPhoto} size={36} />
              <View style={styles.personCopy}>
                <AppText size={13} numberOfLines={2}>
                  <AppText size={13} weight="extrabold">{notice.actorName}</AppText>
                  <AppText size={13} color={theme.colors.muted}> {notice.action}</AppText>
                </AppText>
                <AppText size={11} muted>{timeAgo(notice.at)}</AppText>
              </View>
              {open && notice.media ? <NotificationMedia media={notice.media} /> : null}
            </Pressable>
          ))
        ) : (
          <AppText muted style={styles.sheetEmpty}>No notifications yet.</AppText>
        )}
      </NoticeDrop>
    </>
  );
}

function BellIcon({ color }: { color: string }) {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M12 22a2.2 2.2 0 0 0 2.15-1.7h-4.3A2.2 2.2 0 0 0 12 22zm7-6.1V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v4.9L3.3 17.6v1.2h17.4v-1.2L19 15.9z"
      />
    </Svg>
  );
}

function postedAfterFollow(post: Post, followedAt: string | undefined) {
  if (!followedAt) return false;
  const posted = Date.parse(post.createdAt);
  const followed = Date.parse(followedAt);
  return !Number.isNaN(posted) && !Number.isNaN(followed) && posted >= followed;
}

function postsForAudience(feed: Feed, audience: "friends" | "public") {
  const visible = feed.posts.filter((post) => {
    const friend = post.authorId === "me" || feed.friendIds.includes(post.authorId);
    return audience === "friends" ? friend : !friend && feed.publicIds.includes(post.authorId);
  });
  if (audience !== "public") return visible;
  const fresh: Post[] = [];
  const rest: Post[] = [];
  const followedAt = feed.followedAt ?? {};
  for (const post of visible) {
    if (postedAfterFollow(post, followedAt[post.authorId])) fresh.push(post);
    else rest.push(post);
  }
  fresh.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  return [...fresh, ...rest];
}

function AudienceSwitch({ value, onChange }: { value: "friends" | "public"; onChange: (value: "friends" | "public") => void }) {
  const theme = useAppTheme();
  const options = [
    { id: "friends" as const, label: "Friends" },
    { id: "public" as const, label: "Public" },
  ];
  return (
    <View style={[styles.audience, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.id)}
            style={[styles.audienceOption, selected && { backgroundColor: theme.colors.primary }]}
          >
            <AppText size={13} weight="extrabold" color={selected ? theme.colors.primaryText : theme.colors.muted}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function FriendRow({ onOpen }: { onOpen: (userId: string) => void }) {
  const { feed, me } = useSocial();
  const [latest, setLatest] = useState<Record<string, string>>({});
  const [seen, setSeen] = useState<Record<string, string>>({});
  const friendKey = feed.friendIds.join(",");

  useEffect(() => {
    let alive = true;
    void recentFriendActivity(feed.friendIds).then((activity) => {
      if (alive) setLatest(activity);
    });
    return () => {
      alive = false;
    };
  }, [friendKey, feed.posts[0]?.createdAt, feed.friendIds]);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void readFriendRings().then((rings) => {
        if (alive) setSeen(rings);
      });
    };
    refresh();
    const stop = subscribeFriendRings(refresh);
    return () => {
      alive = false;
      stop();
    };
  }, []);

  // A ring at the back of a long row is easy to miss, so friends with a new post
  // lead the row, newest first. Everyone else keeps the order the feed gave us.
  const ordered = useMemo(() => {
    const fresh: string[] = [];
    const rest: string[] = [];
    for (const id of feed.friendIds) {
      if (friendHasFreshPost(latest[id], seen[id])) fresh.push(id);
      else rest.push(id);
    }
    fresh.sort((left, right) => Date.parse(latest[right]) - Date.parse(latest[left]));
    return [...fresh, ...rest];
  }, [feed.friendIds, latest, seen]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendRow}>
      <FriendCircle name={me.name || "You"} photo={me.photo} label="You" onPress={() => onOpen("me")} />
      {ordered.map((id) => {
        const person = feed.people[id];
        if (!person) return null;
        return (
          <FriendCircle
            key={id}
            name={person.name}
            photo={person.photo}
            label={firstName(person.name)}
            fresh={friendHasFreshPost(latest[id], seen[id])}
            onPress={() => onOpen(id)}
          />
        );
      })}
    </ScrollView>
  );
}

function FriendCircle({
  name,
  photo,
  label,
  fresh,
  onPress,
}: {
  name: string;
  photo?: string | null;
  label: string;
  fresh?: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} posts`} onPress={onPress} style={styles.friendCircle}>
      <View
        style={[
          styles.friendRing,
          { borderColor: fresh ? theme.colors.primary : "transparent" },
        ]}
      >
        <PersonAvatar name={name} photo={photo} size={64} />
      </View>
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
  if (media.type === "video") {
    return <PostVideo key={media.uri} postId={postId} uri={media.uri} onOpen={() => openMedia(media)} />;
  }
  return <FeedPhoto key={media.uri} uri={media.uri} cacheKey={media.cacheKey} onOpen={() => openMedia(media)} />;
}

function FeedPhoto({ uri, cacheKey, onOpen }: { uri: string; cacheKey?: string; onOpen: () => void }) {
  const [aspectRatio, setAspectRatio] = useState(1);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Open attachment" onPress={onOpen}>
      <Image
        source={{ uri, cacheKey }}
        cachePolicy="memory-disk"
        style={[styles.postMedia, { aspectRatio }]}
        contentFit="contain"
        onLoad={({ source }) => {
          if (source.width > 0 && source.height > 0) setAspectRatio(source.width / source.height);
        }}
      />
    </Pressable>
  );
}

function VideoScrubber({ player, keepPlaying }: { player: VideoPlayer; keepPlaying: boolean }) {
  const theme = useAppTheme();
  const barRef = useRef<View>(null);
  const playerRef = useRef(player);
  const draggingRef = useRef(false);
  const keepPlayingRef = useRef(keepPlaying);
  const durationRef = useRef(0);
  const frameRef = useRef({ x: 0, width: 1 });
  const pendingTime = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [dragging, setDragging] = useState(false);
  playerRef.current = player;
  keepPlayingRef.current = keepPlaying;

  const flushSeek = useCallback((seconds: number) => {
    pendingTime.current = null;
    if (rafRef.current != null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    seekMountedClip(playerRef.current, seconds);
  }, []);

  const queueSeek = useCallback((seconds: number) => {
    pendingTime.current = seconds;
    if (rafRef.current != null) return;
    const apply = () => {
      rafRef.current = null;
      const time = pendingTime.current;
      if (time == null) return;
      pendingTime.current = null;
      seekMountedClip(playerRef.current, time);
    };
    if (typeof requestAnimationFrame === "function") rafRef.current = requestAnimationFrame(apply);
    else apply();
  }, []);

  const seekToPageX = useCallback(
    (pageX: number, immediate = false) => {
      const length = durationRef.current || playerRef.current.duration;
      const { x, width } = frameRef.current;
      if (!(length > 0) || width <= 0) return;
      const ratio = Math.min(1, Math.max(0, (pageX - x) / width));
      setProgress(ratio);
      const seconds = ratio * length;
      if (immediate) flushSeek(seconds);
      else queueSeek(seconds);
    },
    [flushSeek, queueSeek],
  );

  const measureBar = useCallback(() => {
    barRef.current?.measureInWindow((x, _y, width) => {
      if (width > 0) frameRef.current = { x, width };
    });
  }, []);

  const finishDrag = useCallback(() => {
    draggingRef.current = false;
    setDragging(false);
    const clip = playerRef.current;
    const queued = pendingTime.current;
    if (queued != null) flushSeek(queued);
    clip.seekTolerance = { toleranceBefore: 0, toleranceAfter: 0 };
    clip.scrubbingModeOptions = { scrubbingModeEnabled: false };
    if (keepPlayingRef.current) playMountedClip(clip);
  }, [flushSeek]);

  useEffect(() => {
    player.timeUpdateEventInterval = 0.1;
    const time = player.addListener("timeUpdate", (event) => {
      const length = player.duration || durationRef.current;
      if (length > 0) {
        durationRef.current = length;
        setDuration(length);
      }
      if (draggingRef.current || !(length > 0)) return;
      setProgress(Math.min(1, Math.max(0, event.currentTime / length)));
    });
    const loaded = player.addListener("sourceLoad", (event) => {
      const length = event.duration || player.duration;
      if (!(length > 0)) return;
      durationRef.current = length;
      setDuration(length);
    });
    return () => {
      time.remove();
      loaded.remove();
      if (rafRef.current != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafRef.current);
    };
  }, [player]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          draggingRef.current = true;
          setDragging(true);
          const clip = playerRef.current;
          clip.scrubbingModeOptions = { scrubbingModeEnabled: true };
          clip.seekTolerance = { toleranceBefore: 0.35, toleranceAfter: 0.35 };
          clip.pause();
          const pageX = event.nativeEvent.pageX;
          seekToPageX(pageX);
          barRef.current?.measureInWindow((x, _y, width) => {
            if (width > 0) frameRef.current = { x, width };
            seekToPageX(pageX);
          });
        },
        onPanResponderMove: (event) => {
          seekToPageX(event.nativeEvent.pageX);
        },
        onPanResponderRelease: finishDrag,
        onPanResponderTerminate: finishDrag,
      }),
    [finishDrag, seekToPageX],
  );

  const current = progress * (duration || 0);

  return (
    <View pointerEvents="box-none" style={styles.scrubber}>
      {dragging ? (
        <AppText pointerEvents="none" size={12} weight="bold" style={styles.scrubberTime}>
          {clipClock(current)} / {clipClock(duration)}
        </AppText>
      ) : null}
      <View
        ref={barRef}
        accessibilityLabel="Video progress"
        onLayout={measureBar}
        style={styles.scrubberHit}
        {...pan.panHandlers}
      >
        <View style={styles.scrubberTrack}>
          <View style={[styles.scrubberFill, { width: `${progress * 100}%`, backgroundColor: theme.colors.primary }]} />
        </View>
      </View>
    </View>
  );
}

function PostVideo({ postId, uri, onOpen }: { postId: string; uri: string; onOpen: () => void }) {
  const ref = useRef<View>(null);
  const [aspectRatio, setAspectRatio] = useState(1);
  const { activeVideoId, nextVideoId, registerVideo } = useSocial();
  const source = useRef(uri);
  // The player starts empty. A clip downloads only once it is playing or next in line.
  const player = useVideoPlayer(null, (clip) => {
    clip.loop = true;
    clip.muted = !feedAudioReady;
  });
  const play = activeVideoId === postId;
  const wanted = play || nextVideoId === postId;
  const playRef = useRef(play);
  playRef.current = play;
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!wanted || loaded) return;
    setLoaded(true);
    // useCaching keeps the clip on the phone, so replays and scrolling back don't download it again.
    loadClip(player, source.current)
      .then(() => {
        if (playRef.current) playMountedClip(player);
      })
      .catch(() => setLoaded(false));
  }, [wanted, loaded, player]);

  useEffect(() => {
    const status = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") setReady(true);
    });
    const loadedSource = player.addListener("sourceLoad", () => setReady(true));
    return () => {
      status.remove();
      loadedSource.remove();
    };
  }, [player]);
  const [soundOn, setSoundOn] = useState(feedAudioReady);
  const soundTouched = useRef(false);

  useEffect(() => {
    const updateSize = (size?: { width: number; height: number }) => {
      if (size && size.width > 0 && size.height > 0) setAspectRatio(size.width / size.height);
    };
    if (Platform.OS === "web") {
      // Expo's web player does not expose video tracks. Use the browser's
      // displayed dimensions, which also account for the clip's rotation.
      const video = (ref.current as unknown as HTMLElement | null)?.querySelector("video");
      if (!video) return;
      const update = () => updateSize({ width: video.videoWidth, height: video.videoHeight });
      video.addEventListener("loadedmetadata", update);
      video.addEventListener("resize", update);
      update();
      return () => {
        video.removeEventListener("loadedmetadata", update);
        video.removeEventListener("resize", update);
      };
    }
    updateSize(player.videoTrack?.size ?? player.availableVideoTracks[0]?.size);
    const loaded = player.addListener("sourceLoad", (event) => updateSize(event.availableVideoTracks[0]?.size));
    const changed = player.addListener("videoTrackChange", (event) => updateSize(event.videoTrack?.size));
    return () => {
      loaded.remove();
      changed.remove();
    };
  }, [player]);

  useEffect(() => {
    armFeedAudio();
    if (feedAudioReady) {
      setSoundOn(true);
      return;
    }
    const waiter = () => { if (!soundTouched.current) setSoundOn(true); };
    feedAudioWaiters.add(waiter);
    return () => {
      feedAudioWaiters.delete(waiter);
    };
  }, []);

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
    player.muted = !soundOn;
    if (play && loaded) playMountedClip(player);
    else player.pause();
  }, [play, loaded, player, soundOn]);

  return (
    <View ref={ref} collapsable={false} style={styles.videoWrap}>
      {/* playsInline keeps the clip in the feed. Without it the iPhone home-screen app
          throws the video fullscreen the moment it starts playing on scroll. */}
      <VideoView
        player={player}
        style={[styles.postMedia, { aspectRatio }]}
        contentFit="contain"
        nativeControls={false}
        playsInline
        allowsPictureInPicture={false}
        fullscreenOptions={{ enable: false }}
        onFullscreenEnter={dismissNativeFullscreen}
      />
      {!ready ? (
        <View pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, styles.videoPlaceholder]}>
          <Svg width={40} height={40} viewBox="0 0 24 24">
            <Path d="M8 5v14l11-7z" fill="rgba(255,255,255,0.85)" />
          </Svg>
        </View>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Open attachment" onPress={onOpen} style={StyleSheet.absoluteFill} />
      <VideoScrubber player={player} keepPlaying={play} />
      <VideoSoundButton muted={!soundOn} onPress={() => {
        soundTouched.current = true;
        const next = !soundOn;
        player.muted = !next;
        setSoundOn(next);
      }} />
    </View>
  );
}

function MediaLightbox({ media, onClose }: { media: PostMedia | null; onClose: () => void }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const frame = appFrameSize(window);
  const topPad = Math.max(insets.top, 12);
  const bottomPad = Math.max(insets.bottom, 12);
  const fitted = {
    width: Math.max(frame.width - 24, 1),
    height: Math.max(frame.height - topPad - bottomPad - 72, 1),
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
      <View style={[styles.lightbox, { paddingTop: topPad, paddingBottom: bottomPad }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.lightboxDismiss} />
        <View style={styles.lightboxBody} pointerEvents="box-none">
          <View style={[styles.lightboxStage, fitted]}>
            {media?.type === "image" ? (
              <Image source={{ uri: media.uri, cacheKey: media.cacheKey }} cachePolicy="memory-disk" style={styles.lightboxMedia} contentFit="contain" />
            ) : null}
            {media?.type === "video" ? <LightboxVideo uri={media.uri} /> : null}
          </View>
        </View>
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
    </Modal>
  );
}

function VideoSoundButton({ muted, onPress }: { muted: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={muted ? "Unmute video" : "Mute video"}
    accessibilityState={{ selected: muted }} onPress={(event) => { event.stopPropagation(); onPress(); }}
    style={{ position: "absolute", bottom: 28, right: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", zIndex: 5 }}>
    <Image
      source={muted ? require("../../assets/brand/video-sound-off.svg") : require("../../assets/brand/video-sound-on.svg")}
      style={{ width: 22, height: 22 }}
      contentFit="contain"
      accessible={false}
      pointerEvents="none"
    />
  </Pressable>;
}

function LightboxVideo({ uri }: { uri: string }) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const player = useVideoPlayer({ uri, useCaching: true }, (clip) => {
    clip.loop = true;
    clip.muted = false;
  });
  useEffect(() => {
    const listener = player.addListener("playingChange", ({ isPlaying }) => setPlaying(isPlaying));
    playMountedClip(player);
    return () => {
      listener.remove();
      player.pause();
    };
  }, [player]);
  return (
    <View style={styles.lightboxMedia}>
      <VideoView
        player={player}
        style={styles.lightboxMedia}
        contentFit="contain"
        nativeControls={false}
        playsInline
        allowsPictureInPicture={false}
        fullscreenOptions={{ enable: false }}
        onFullscreenEnter={dismissNativeFullscreen}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? "Pause clip" : "Play clip"}
        onPress={() => {
          if (playing) player.pause();
          else playMountedClip(player);
        }}
        style={StyleSheet.absoluteFill}
      />
      <VideoScrubber player={player} keepPlaying={playing} />
      <VideoSoundButton muted={muted} onPress={() => { player.muted = !muted; setMuted(!muted); }} />
    </View>
  );
}

function PostCard({ post }: { post: Post }) {
  const theme = useAppTheme();
  const nav = useNavigation();
  const { run, updatePost, toggleFollow, feed, focus, postsPublic, openPostVisibility } = useSocial();
  const [showComments, setShowComments] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.text);
  const [menu, setMenu] = useState<null | "menu" | "report" | "block">(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [confirmingUnfollow, setConfirmingUnfollow] = useState(false);
  const author = usePerson(post.authorId);
  const following = Boolean(feed.followedAt?.[post.authorId]);
  const count = post.commentsLoaded ? post.comments.length : post.commentCount;

  useEffect(() => {
    if (focus?.postId !== post.id || !focus.commentId) return;
    let alive = true;
    setShowComments(true);
    if (post.commentsLoaded) return () => { alive = false; };
    void fetchComments(post.id).then((loaded) => {
      if (!alive) return;
      updatePost(post.id, (current) => ({ ...current, comments: loaded, commentsLoaded: true, commentCount: loaded.length }));
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [focus?.token, focus?.postId, focus?.commentId, post.id, post.commentsLoaded, updatePost]);

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
        <View style={[styles.postHeader, { flex: 1 }]}>
          <Pressable
            accessibilityRole="button"
            disabled={!author.isFriend && !author.isPublic}
            onPress={() => nav.push({ name: "request-profile", userId: post.authorId })}
          >
            <PersonAvatar name={author.name} photo={author.photo} size={48} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Pressable
              accessibilityRole="button"
              disabled={!author.isFriend && !author.isPublic}
              onPress={() => nav.push({ name: "request-profile", userId: post.authorId })}
            >
              <AppText size={17} weight="extrabold" numberOfLines={1}>{author.name}</AppText>
              <AppText size={14} muted>
                {timeAgo(post.createdAt)}
                {post.edited ? " · Edited" : ""}
              </AppText>
            </Pressable>
            {author.isMe && postsPublic !== null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={postsPublic ? "Public. Change who can see your posts." : "Friends only. Change who can see your posts."}
                onPress={openPostVisibility}
                hitSlop={8}
                style={styles.visibilityLink}
              >
                <AppText size={14} weight="bold" primary>
                  {postsPublic ? "Public" : "Friends only"}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
        {author.isMe && !confirmingDelete && !editing ? (
          <View style={styles.commentMeta}>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit post" onPress={() => { setDraft(post.text); setEditing(true); }} hitSlop={8}>
              <AppText size={15} weight="bold" muted>Edit</AppText>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Delete post" onPress={() => setConfirmingDelete(true)} hitSlop={8}>
              <AppText size={15} weight="bold" muted>Delete</AppText>
            </Pressable>
          </View>
        ) : null}
        {!author.isMe && !author.isFriend && author.isPublic ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={following ? "Following" : "Follow"}
            accessibilityState={{ selected: following, disabled: followBusy }}
            disabled={followBusy}
            onPress={() => {
              if (following) {
                setConfirmingUnfollow(true);
                return;
              }
              setFollowBusy(true);
              void toggleFollow(post.authorId).finally(() => setFollowBusy(false));
            }}
            hitSlop={8}
            style={[
              styles.followButton,
              { backgroundColor: following ? theme.colors.surfaceRaised : theme.colors.primary },
            ]}
          >
            <AppText size={14} weight="extrabold" color={following ? theme.colors.text : theme.colors.primaryText}>
              {following ? "Following" : "Follow"}
            </AppText>
          </Pressable>
        ) : null}
        {!author.isMe && !menu ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Post actions" onPress={() => setMenu("menu")} hitSlop={8}>
            <AppText size={15} weight="bold" muted>More</AppText>
          </Pressable>
        ) : null}
      </View>

      {confirmingUnfollow && following ? (
        <View style={[styles.confirm, styles.unfollowConfirm, { backgroundColor: theme.colors.surfaceRaised }]}>
          <AppText size={13} weight="semibold">
            Are you sure you want to unfollow <AppText size={13} weight="extrabold">{author.name}</AppText>?
          </AppText>
          <View style={styles.commentMeta}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel unfollow" onPress={() => setConfirmingUnfollow(false)} hitSlop={8}>
              <AppText size={13} weight="bold" muted>Cancel</AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Unfollow ${author.name}`}
              disabled={followBusy}
              onPress={() => {
                setConfirmingUnfollow(false);
                setFollowBusy(true);
                void toggleFollow(post.authorId).finally(() => setFollowBusy(false));
              }}
              hitSlop={8}
            >
              <AppText size={13} weight="extrabold" color={theme.colors.danger}>Unfollow</AppText>
            </Pressable>
          </View>
        </View>
      ) : null}

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

      <LikedBy post={post} forceOpen={focus?.postId === post.id && focus.likes ? focus.token : 0} />

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

function LikedBy({ post, forceOpen = 0 }: { post: Post; forceOpen?: number }) {
  const { feed, me } = useSocial();
  const [open, setOpen] = useState(false);
  const [extraPeople, setExtraPeople] = useState<Record<string, { name: string; photo: string | null }>>({});
  const friends = post.likedBy.filter((id) => feed.friendIds.includes(id) && feed.people[id]).map((id) => firstName(feed.people[id].name));
  const names = [...(post.likedByMe ? ["you"] : []), ...friends].slice(0, 2);
  const hidden = post.likes - names.length;

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  useEffect(() => {
    if (!open) return;
    const missing = post.likedBy.filter((id) => !feed.people[id] && !extraPeople[id]);
    if (!missing.length) return;
    let alive = true;
    void loadSocialPeople(missing).then((people) => {
      if (!alive) return;
      const next: Record<string, { name: string; photo: string | null }> = {};
      for (const [id, person] of people) next[id] = { name: person.name, photo: person.photo };
      if (!Object.keys(next).length) return;
      setExtraPeople((current) => ({ ...current, ...next }));
    });
    return () => { alive = false; };
  }, [open, post.likedBy, feed.people, extraPeople]);

  function personName(id: string) {
    return feed.people[id]?.name || extraPeople[id]?.name || "SwoleMate";
  }

  function personPhoto(id: string) {
    return feed.people[id]?.photo || extraPeople[id]?.photo || null;
  }

  const everyone = [
    ...(post.likedByMe ? [{ id: "me", name: "You", photo: me.photo ?? null }] : []),
    ...post.likedBy.map((id) => ({ id, name: personName(id), photo: personPhoto(id) })),
  ];

  if (!post.likes) return null;

  return (
    <>
      <View style={styles.likedBy}>
        <AppText size={12} muted>Liked by </AppText>
        <AppText size={12} weight="bold">
          {names.length ? names.join(", ") : `${post.likes} ${post.likes === 1 ? "person" : "people"}`}
        </AppText>
        {hidden > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Show everyone who liked this" onPress={() => setOpen(true)} hitSlop={6}>
            <AppText size={12} weight="bold" primary> and more</AppText>
          </Pressable>
        ) : null}
      </View>
      <SheetModal title="Likes" visible={open} onClose={() => setOpen(false)}>
        {everyone.map((person) => (
          <View key={person.id} style={styles.personRow}>
            <PersonAvatar name={person.name} photo={person.photo} size={44} />
            <AppText weight="bold" style={styles.personCopy}>{person.name}</AppText>
          </View>
        ))}
      </SheetModal>
    </>
  );
}

type ReplyTarget = { parentId: string; name: string };

function Comments({ post }: { post: Post }) {
  const { run, updatePost, focus } = useSocial();
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
          <CommentItem post={post} comment={thread} highlighted={focus?.commentId === thread.id} onReply={(name) => startReply(thread.id, name, false)} />
          {post.comments
            .filter((comment) => comment.parentId === thread.id)
            .map((reply) => (
              <View key={reply.id} style={styles.reply}>
                <CommentItem post={post} comment={reply} highlighted={focus?.commentId === reply.id} onReply={(name) => startReply(thread.id, name, true)} />
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
          submitBehavior="submit"
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

function CommentItem({ post, comment, onReply, highlighted = false }: { post: Post; comment: Comment; onReply: (name: string) => void; highlighted?: boolean }) {
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
        <View style={[styles.commentBubble, { backgroundColor: theme.colors.surfaceRaised, borderColor: highlighted ? theme.colors.primary : "transparent", borderWidth: 1 }]}>
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
  videoPlaceholder: {
    alignItems: "center",
    backgroundColor: "#111",
    justifyContent: "center",
  },
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
  publicNote: {
    lineHeight: 18,
    paddingTop: 12,
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
  bell: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    position: "relative",
    width: 40,
  },
  badge: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    justifyContent: "center",
    minWidth: 20,
    paddingHorizontal: 4,
    position: "absolute",
    right: -4,
    top: -2,
  },
  sheetBackdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    flex: 1,
  },
  sheet: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
    paddingBottom: 12,
  },
  sheetHandle: {
    alignSelf: "center",
    borderRadius: 3,
    height: 4,
    marginBottom: 8,
    marginTop: 10,
    width: 42,
  },
  sheetList: {
    paddingBottom: 8,
  },
  sheetEmpty: {
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  personRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  personCopy: {
    flex: 1,
    gap: 2,
  },
  dropCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    paddingBottom: 8,
  },
  dropHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  noticeItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  likedBy: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 6,
    paddingHorizontal: 18,
  },
  friendRow: {
    gap: 14,
    paddingVertical: 4,
  },
  friendCircle: {
    alignItems: "center",
    gap: 6,
    width: 76,
  },
  friendRing: {
    borderRadius: 40,
    borderWidth: 2,
    padding: 2,
  },
  audience: {
    alignSelf: "stretch",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 8,
    padding: 3,
  },
  audienceOption: {
    alignItems: "center",
    borderRadius: 11,
    flex: 1,
    paddingVertical: 8,
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
  visibilityLink: {
    alignSelf: "flex-start",
    marginTop: 1,
  },
  followButton: {
    borderRadius: 999,
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  postMedia: {
    aspectRatio: 1,
    borderRadius: 14,
    width: "100%",
  },
  videoWrap: {
    borderRadius: 14,
    overflow: "hidden",
    width: "100%",
  },
  scrubber: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 3,
  },
  scrubberTime: {
    bottom: 10,
    color: "#FFFFFF",
    left: 8,
    position: "absolute",
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  scrubberHit: {
    justifyContent: "flex-end",
    minHeight: 36,
    touchAction: "none",
    userSelect: "none",
  } as ViewStyle,
  scrubberTrack: {
    backgroundColor: "rgba(255, 255, 255, 0.38)",
    height: 3,
    overflow: "visible",
    width: "100%",
  },
  scrubberFill: {
    height: 3,
  },
  lightbox: {
    backgroundColor: "rgba(0, 0, 0, 0.92)",
    flex: 1,
    paddingHorizontal: 12,
  },
  lightboxDismiss: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  lightboxBody: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  lightboxStage: {
    alignSelf: "center",
    overflow: "hidden",
    zIndex: 1,
  },
  lightboxMedia: {
    height: "100%",
    width: "100%",
  },
  lightboxClose: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 14,
    marginTop: 12,
    minHeight: 48,
    minWidth: 160,
    paddingHorizontal: 28,
    paddingVertical: 12,
    zIndex: 2,
  },
  confirm: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  unfollowConfirm: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: 10,
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
