import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
  Animated,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import Slider from '@react-native-community/slider';
import firestore from '@react-native-firebase/firestore';
import Svg, { Path, Rect, Line } from 'react-native-svg';

const PURE_RED = '#FF0000';
const BRAND_RED = '#E50914';
const WHITE = '#FFFFFF';
const BLACK = '#000000';

const formatTime = (millis) => {
  if (!millis || isNaN(millis) || millis < 0) return '00:00';
  const totalSecs = Math.floor(millis / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSecs % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
};

// ============================================================================
// ULTRA-LIGHTWEIGHT SVG ICONS
// ============================================================================
const IconPlay = ({ size = 34, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M8 5v14l11-7z" />
  </Svg>
);

const IconPause = ({ size = 34, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Rect x="6" y="4" width="4.5" height="16" rx="1" />
    <Rect x="13.5" y="4" width="4.5" height="16" rx="1" />
  </Svg>
);

const IconFullscreenEnter = ({ size = 20, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </Svg>
);

const IconFullscreenExit = ({ size = 20, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
  </Svg>
);

const IconChat = ({ size = 20, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Svg>
);

const IconSend = ({ size = 16, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <Line x1="22" y1="2" x2="11" y2="13" />
    <Path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </Svg>
);

const IconBack = ({ size = 22, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);

export default function RoomPlayer({
  roomCode,
  streamUrl,
  streamReferer = 'https://vidwish.live/',
  animeTitle = 'Watch Party',
  episodeNum = 1,
  episodeTitle = '',
  memberKey = 'guest',
  memberName = 'User',
  memberAvatar = 'pfp1.jpg',
  isAdmin = false,
  messages: externalMessages = null,
  playbackState: externalPlaybackState = null,
}) {
  const videoRef = useRef(null);
  const chatListRef = useRef(null);

  // Player & UI States
  const [status, setStatus] = useState({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewMillis, setSeekPreviewMillis] = useState(0);

  // Left Chat Overlay States (5-second auto-hide + touch-to-scroll + manual pin)
  const [roomMessages, setRoomMessages] = useState([]);
  const [chatOverlayVisible, setChatOverlayVisible] = useState(false);
  const [chatPinnedByButton, setChatPinnedByButton] = useState(false);
  const [isTouchingChat, setIsTouchingChat] = useState(false);
  const [quickChatText, setQuickChatText] = useState('');

  // Shared Room Playback State
  const [remotePlayback, setRemotePlayback] = useState(externalPlaybackState);

  const uiOpacity = useRef(new Animated.Value(1)).current;
  const chatOpacity = useRef(new Animated.Value(0)).current;

  const hideUITimerRef = useRef(null);
  const hideChatTimerRef = useRef(null);
  const isApplyingRemoteSyncRef = useRef(false);
  const lastBroadcastTimestampRef = useRef(0);
  const prevMessagesCountRef = useRef(0);
  const isTouchingChatRef = useRef(false);
  const chatPinnedRef = useRef(false);

  useEffect(() => {
    isTouchingChatRef.current = isTouchingChat;
  }, [isTouchingChat]);

  useEffect(() => {
    chatPinnedRef.current = chatPinnedByButton;
  }, [chatPinnedByButton]);

  // 1. Subscribe to Room Playback Sync & Messages (if not passed from parent)
  useEffect(() => {
    if (!roomCode) return;

    const roomRef = firestore().collection('rooms').doc(String(roomCode));

    const unsubRoom = roomRef.onSnapshot(
      (doc) => {
        if (!doc.exists) return;
        const data = doc.data();
        if (data?.playbackState) {
          setRemotePlayback(data.playbackState);
        }
      },
      () => {}
    );

    let unsubMsgs = null;
    if (!Array.isArray(externalMessages)) {
      unsubMsgs = roomRef
        .collection('messages')
        .orderBy('createdAt', 'asc')
        .limitToLast(60)
        .onSnapshot(
          (snap) => {
            const list = [];
            snap?.forEach((d) => list.push({ id: d.id, ...d.data() }));
            setRoomMessages(list);
          },
          () => {}
        );
    }

    return () => {
      unsubRoom();
      if (unsubMsgs) unsubMsgs();
    };
  }, [roomCode, externalMessages]);

  const activeMessages = Array.isArray(externalMessages) ? externalMessages : roomMessages;

  useEffect(() => {
    if (externalPlaybackState) {
      setRemotePlayback(externalPlaybackState);
    }
  }, [externalPlaybackState]);

  // 2. Show Left Chat Overlay for 5 Seconds Whenever a New Message Arrives
  const scheduleChatAutoHide = useCallback(() => {
    if (hideChatTimerRef.current) clearTimeout(hideChatTimerRef.current);
    if (chatPinnedRef.current || isTouchingChatRef.current) return;

    hideChatTimerRef.current = setTimeout(() => {
      if (!chatPinnedRef.current && !isTouchingChatRef.current) {
        Animated.timing(chatOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start(() => setChatOverlayVisible(false));
      }
    }, 5000);
  }, [chatOpacity]);

  const revealChatOverlay = useCallback(
    (pinOpen = false) => {
      if (pinOpen) {
        setChatPinnedByButton(true);
        chatPinnedRef.current = true;
      }
      setChatOverlayVisible(true);
      Animated.timing(chatOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();

      setTimeout(() => {
        chatListRef.current?.scrollToEnd?.({ animated: true });
      }, 60);

      if (!pinOpen) {
        scheduleChatAutoHide();
      } else if (hideChatTimerRef.current) {
        clearTimeout(hideChatTimerRef.current);
      }
    },
    [chatOpacity, scheduleChatAutoHide]
  );

  useEffect(() => {
    if (activeMessages.length > prevMessagesCountRef.current) {
      revealChatOverlay(false);
    }
    prevMessagesCountRef.current = activeMessages.length;
  }, [activeMessages.length, revealChatOverlay]);

  const handleToggleChatButton = () => {
    if (chatOverlayVisible && chatPinnedByButton) {
      setChatPinnedByButton(false);
      chatPinnedRef.current = false;
      if (hideChatTimerRef.current) clearTimeout(hideChatTimerRef.current);
      Animated.timing(chatOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(() => setChatOverlayVisible(false));
    } else {
      revealChatOverlay(true);
    }
  };

  // Pause 5s auto-hide while user touches/scrolls the left message box
  const handleChatTouchStart = () => {
    setIsTouchingChat(true);
    isTouchingChatRef.current = true;
    if (hideChatTimerRef.current) clearTimeout(hideChatTimerRef.current);
  };

  const handleChatTouchEnd = () => {
    setIsTouchingChat(false);
    isTouchingChatRef.current = false;
    if (!chatPinnedRef.current) {
      scheduleChatAutoHide();
    }
  };

  // 3. Broadcast Play / Pause / Seek to ALL Room Members
  const broadcastPlaybackToRoom = useCallback(
    async (nextIsPlaying, nextPositionMillis) => {
      if (!roomCode) return;
      const now = Date.now();
      lastBroadcastTimestampRef.current = now;

      try {
        await firestore()
          .collection('rooms')
          .doc(String(roomCode))
          .update({
            playbackState: {
              isPlaying: Boolean(nextIsPlaying),
              positionMillis: Math.max(0, Math.floor(nextPositionMillis || 0)),
              updatedBy: String(memberKey),
              updatedByName: String(memberName),
              updatedAt: now,
            },
          });
      } catch (_) {}
    },
    [roomCode, memberKey, memberName]
  );

  // 4. Apply Incoming Play / Pause / Seek Changes From Any Other Member
  useEffect(() => {
    if (!remotePlayback || !videoRef.current || !status?.isLoaded || isSeeking) return;

    // Ignore our own echo update
    if (
      remotePlayback.updatedBy === memberKey &&
      Math.abs((remotePlayback.updatedAt || 0) - lastBroadcastTimestampRef.current) < 1500
    ) {
      return;
    }

    const applyRemoteState = async () => {
      try {
        isApplyingRemoteSyncRef.current = true;
        const localPos = status.positionMillis || 0;
        const targetPos = remotePlayback.positionMillis || 0;

        // If another user interacted with the progress bar (difference > 2.2s), seek immediately
        if (Math.abs(localPos - targetPos) > 2200) {
          await videoRef.current.setPositionAsync(targetPos).catch(() => {});
        }

        // If another user paused or played, match their state for everyone
        if (remotePlayback.isPlaying && !status.isPlaying) {
          await videoRef.current.playAsync().catch(() => {});
        } else if (!remotePlayback.isPlaying && status.isPlaying) {
          await videoRef.current.pauseAsync().catch(() => {});
        }
      } catch (_) {
      } finally {
        setTimeout(() => {
          isApplyingRemoteSyncRef.current = false;
        }, 250);
      }
    };

    applyRemoteState();
  }, [
    remotePlayback?.isPlaying,
    remotePlayback?.positionMillis,
    remotePlayback?.updatedAt,
    remotePlayback?.updatedBy,
    status?.isLoaded,
    isSeeking,
    memberKey,
  ]);

  // 5. Handle Play / Pause Toggle (Syncs for All Users)
  const handleTogglePlayPause = async () => {
    if (!videoRef.current || !status?.isLoaded) return;
    resetUIHideTimer();

    const nextPlaying = !status.isPlaying;
    const currentPos = status.positionMillis || 0;

    try {
      isApplyingRemoteSyncRef.current = true;
      if (nextPlaying) {
        await videoRef.current.playAsync();
      } else {
        await videoRef.current.pauseAsync();
      }
      await broadcastPlaybackToRoom(nextPlaying, currentPos);
    } catch (_) {
    } finally {
      setTimeout(() => {
        isApplyingRemoteSyncRef.current = false;
      }, 250);
    }
  };

  // 6. Handle Progress Bar Seek (Syncs for All Users)
  const handleSliderComplete = async (val) => {
    if (!videoRef.current || !status?.isLoaded) {
      setIsSeeking(false);
      return;
    }

    const targetMs = Math.max(0, Math.floor(val));
    try {
      isApplyingRemoteSyncRef.current = true;
      await videoRef.current.setPositionAsync(targetMs);
      await broadcastPlaybackToRoom(status.isPlaying, targetMs);
    } catch (_) {
    } finally {
      setIsSeeking(false);
      resetUIHideTimer();
      setTimeout(() => {
        isApplyingRemoteSyncRef.current = false;
      }, 250);
    }
  };

  // 7. Fullscreen Orientation & Immersive Mode Toggle
  const handleToggleFullscreen = async () => {
    const nextFs = !isFullscreen;
    setIsFullscreen(nextFs);
    resetUIHideTimer();

    try {
      if (nextFs) {
        StatusBar.setHidden(true, 'none');
        if (NavigationBar?.setVisibilityAsync) {
          await NavigationBar.setVisibilityAsync('hidden');
        }
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      }
    } catch (_) {}
  };

  useEffect(() => {
    return () => {
      if (hideUITimerRef.current) clearTimeout(hideUITimerRef.current);
      if (hideChatTimerRef.current) clearTimeout(hideChatTimerRef.current);
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  // 8. Show UI on Tap & Hide UI on Tap
  const hideUIOverlay = useCallback(() => {
    if (hideUITimerRef.current) clearTimeout(hideUITimerRef.current);
    Animated.timing(uiOpacity, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => setShowUI(false));
  }, [uiOpacity]);

  const resetUIHideTimer = useCallback(() => {
    setShowUI(true);
    Animated.timing(uiOpacity, {
      toValue: 1,
      duration: 160,
      useNativeDriver: true,
    }).start();

    if (hideUITimerRef.current) clearTimeout(hideUITimerRef.current);
    hideUITimerRef.current = setTimeout(() => {
      if (status?.isPlaying) {
        hideUIOverlay();
      }
    }, 3200);
  }, [status?.isPlaying, uiOpacity, hideUIOverlay]);

  const handleToggleUITap = () => {
    if (showUI) {
      hideUIOverlay();
    } else {
      resetUIHideTimer();
    }
  };

  // Send message directly from Fullscreen or Inline overlay
  const handleSendQuickChat = async () => {
    const text = quickChatText.trim();
    if (!text || !roomCode) return;
    setQuickChatText('');

    try {
      await firestore()
        .collection('rooms')
        .doc(String(roomCode))
        .collection('messages')
        .add({
          senderKey: String(memberKey),
          senderName: String(memberName),
          senderAvatar: String(memberAvatar),
          isAdmin: Boolean(isAdmin),
          text,
          episodeNum: Number(episodeNum || 1),
          createdAt: Date.now(),
        });
    } catch (_) {}
  };

  const currentPosMillis = isSeeking ? seekPreviewMillis : status?.positionMillis || 0;
  const durationMillis = status?.durationMillis || 1;

  // ============================================================================
  // SHARED ULTRA-LIGHTWEIGHT PLAYER UI (USED FOR BOTH INLINE & FULLSCREEN)
  // ============================================================================
  const renderPlayerContent = () => (
    <View style={styles.playerCoreContainer}>
      {streamUrl ? (
        <Video
          ref={videoRef}
          style={styles.videoSurface}
          source={{
            uri: streamUrl,
            overrideFileExtensionAndroid: 'm3u8',
            headers: streamReferer ? { Referer: streamReferer } : {},
          }}
          useNativeControls={false}
          resizeMode={ResizeMode.CONTAIN}
          progressUpdateIntervalMillis={1000}
          shouldPlay={true}
          onPlaybackStatusUpdate={setStatus}
        />
      ) : (
        <View style={styles.loaderCenter}>
          <ActivityIndicator size="large" color={PURE_RED} />
        </View>
      )}

      {/* Background Tap Surface to Show / Hide UI */}
      <TouchableOpacity
        style={styles.tapCatcher}
        activeOpacity={1}
        onPress={handleToggleUITap}
      />

      {/* LEFT-SIDE 5-SECOND AUTO-HIDING CHAT OVERLAY (Touch to Scroll Up & Down) */}
      {chatOverlayVisible && (
        <Animated.View
          style={[
            styles.leftChatOverlayBox,
            isFullscreen ? styles.leftChatFullscreen : styles.leftChatInline,
            { opacity: chatOpacity },
          ]}
          onTouchStart={handleChatTouchStart}
          onTouchEnd={handleChatTouchEnd}
          onTouchCancel={handleChatTouchEnd}
        >
          <FlatList
            ref={chatListRef}
            data={activeMessages}
            keyExtractor={(item, idx) => String(item.id || idx)}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
            onScrollBeginDrag={handleChatTouchStart}
            onScrollEndDrag={handleChatTouchEnd}
            onMomentumScrollEnd={handleChatTouchEnd}
            onContentSizeChange={() =>
              chatListRef.current?.scrollToEnd?.({ animated: true })
            }
            contentContainerStyle={styles.leftChatListContent}
            renderItem={({ item }) => (
              <View style={styles.leftChatBubble}>
                <Text style={styles.leftChatSender} numberOfLines={1}>
                  {item.senderName || 'User'}
                  {item.isAdmin ? ' (ADMIN)' : ''}:
                </Text>
                <Text style={styles.leftChatText}>{item.text}</Text>
              </View>
            )}
          />

          {/* Quick Chat Input when Pinned or Fullscreen */}
          {(chatPinnedByButton || isFullscreen) && (
            <View style={styles.leftChatInputRow}>
              <TextInput
                style={styles.leftChatInput}
                placeholder="Message room..."
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={quickChatText}
                onChangeText={setQuickChatText}
                onFocus={handleChatTouchStart}
                onBlur={handleChatTouchEnd}
                onSubmitEditing={handleSendQuickChat}
                returnKeyType="send"
              />
              <TouchableOpacity style={styles.leftChatSendBtn} onPress={handleSendQuickChat}>
                <IconSend size={13} color={WHITE} />
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      )}

      {/* MINIMAL CONTROLS LAYER (Play/Pause Only + Progress Bar + Chat SVG + Fullscreen Button) */}
      <Animated.View
        style={[styles.controlsLayer, { opacity: uiOpacity }]}
        pointerEvents={showUI ? 'box-none' : 'none'}
      >
        {/* Top Minimal Strip */}
        <View style={styles.topStrip} pointerEvents="box-none">
          <View style={styles.topLeftRow}>
            {isFullscreen && (
              <TouchableOpacity
                style={styles.topIconBtn}
                onPress={handleToggleFullscreen}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              >
                <IconBack size={22} color={WHITE} />
              </TouchableOpacity>
            )}
            <Text style={styles.topTitleText} numberOfLines={1}>
              {animeTitle} • Ep {episodeNum} {episodeTitle ? `- ${episodeTitle}` : ''}
            </Text>
          </View>

          {/* Show Messages Button ("Chat SVG") */}
          <TouchableOpacity
            style={[
              styles.chatSvgBtn,
              chatOverlayVisible && chatPinnedByButton && styles.chatSvgBtnActive,
            ]}
            activeOpacity={0.8}
            onPress={handleToggleChatButton}
          >
            <IconChat size={18} color={WHITE} />
          </TouchableOpacity>
        </View>

        {/* Center Play / Pause Button ONLY */}
        <View style={styles.centerPlayPauseWrap} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.centerPlayPauseBtn}
            activeOpacity={0.8}
            onPress={handleTogglePlayPause}
          >
            {status?.isPlaying ? (
              <IconPause size={32} color={WHITE} />
            ) : (
              <IconPlay size={32} color={WHITE} />
            )}
          </TouchableOpacity>
        </View>

        {/* Bottom Progress Bar + Fullscreen Button */}
        <View style={styles.bottomStrip} pointerEvents="box-none">
          <Text style={styles.timeText}>{formatTime(currentPosMillis)}</Text>

          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={durationMillis}
            value={currentPosMillis}
            minimumTrackTintColor={BRAND_RED}
            maximumTrackTintColor="rgba(255,255,255,0.28)"
            thumbTintColor={WHITE}
            onSlidingStart={() => {
              setIsSeeking(true);
              if (hideUITimerRef.current) clearTimeout(hideUITimerRef.current);
            }}
            onValueChange={(val) => setSeekPreviewMillis(val)}
            onSlidingComplete={handleSliderComplete}
          />

          <Text style={styles.timeText}>
            -{formatTime(Math.max(0, durationMillis - currentPosMillis))}
          </Text>

          <TouchableOpacity
            style={styles.fullscreenBtn}
            activeOpacity={0.8}
            onPress={handleToggleFullscreen}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            {isFullscreen ? (
              <IconFullscreenExit size={20} color={WHITE} />
            ) : (
              <IconFullscreenEnter size={20} color={WHITE} />
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );

  return (
    <View style={styles.inlineWrapper}>
      {!isFullscreen && renderPlayerContent()}

      {/* Fullscreen Modal Using the Exact Same Lightweight UI */}
      <Modal
        visible={isFullscreen}
        animationType="fade"
        transparent={false}
        hardwareAccelerated={true}
        statusBarTranslucent={true}
        onRequestClose={handleToggleFullscreen}
      >
        <View style={styles.fullscreenModalContainer}>
          <StatusBar hidden={true} />
          {isFullscreen && renderPlayerContent()}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineWrapper: {
    width: '100%',
    height: 225,
    backgroundColor: BLACK,
    overflow: 'hidden',
  },
  fullscreenModalContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: BLACK,
  },
  playerCoreContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: BLACK,
    justifyContent: 'space-between',
  },
  videoSurface: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  tapCatcher: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  loaderCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Left-Side 5-Second Auto-Hiding & Scrollable Chat Overlay
  leftChatOverlayBox: {
    position: 'absolute',
    left: 12,
    zIndex: 15,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  leftChatInline: {
    bottom: 48,
    width: '58%',
    maxHeight: 125,
  },
  leftChatFullscreen: {
    bottom: 62,
    width: '42%',
    maxHeight: '58%',
  },
  leftChatListContent: {
    paddingVertical: 2,
    gap: 5,
  },
  leftChatBubble: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    backgroundColor: 'rgba(20,20,26,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 5,
  },
  leftChatSender: {
    color: PURE_RED,
    fontSize: 11,
    fontWeight: '900',
  },
  leftChatText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '600',
  },
  leftChatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  leftChatInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: WHITE,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
  },
  leftChatSendBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: PURE_RED,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Minimal Controls Layer
  controlsLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  topStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  topLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
    gap: 8,
  },
  topIconBtn: {
    padding: 4,
  },
  topTitleText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
  },
  chatSvgBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  chatSvgBtnActive: {
    backgroundColor: PURE_RED,
    borderColor: PURE_RED,
  },

  // Center Play/Pause Button Only
  centerPlayPauseWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPlayPauseBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },

  // Bottom Progress & Fullscreen Bar
  bottomStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 8,
  },
  timeText: {
    color: WHITE,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
    minWidth: 42,
    textAlign: 'center',
  },
  slider: {
    flex: 1,
    height: 26,
  },
  fullscreenBtn: {
    padding: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
  },
});
