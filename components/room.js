import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ScrollView,
  Modal,
  Image,
  ActivityIndicator,
  Share,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Animated,
  PanResponder,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Svg, { Path, Rect, Circle, Line, Polyline } from 'react-native-svg';

// Enable smooth layout animations on Android for the Episodes Dropdown & Chat banners
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Safely resolve RoomPlayer from components/room/room_player.js
let RoomPlayerComponent = null;
try {
  const mod = require('./room/room_player');
  RoomPlayerComponent = mod?.default || mod;
} catch (_) {
  try {
    const fallbackMod = require('../components/room/room_player');
    RoomPlayerComponent = fallbackMod?.default || fallbackMod;
  } catch (__) {}
}

const { width } = Dimensions.get('window');

const BLACK = '#000000';
const CARD_BG = '#0D0D12';
const DARK_GREY = '#16161E';
const BORDER_GREY = '#262632';
const TEXT_GREY = '#8E8E98';
const WHITE = '#FFFFFF';
const PURE_RED = '#FF0000';
const BRAND_RED = '#E50914';
const EMERALD = '#10B981';

const VERCEL_API_BASE = 'https://anikoto-api-lyart.vercel.app';
const EPISODE_CHUNK_SIZE = 50;

const AVATARS = {
  'pfp1.jpg': require('../assets/pfp1.jpg'),
  'pfp2.jpg': require('../assets/pfp2.jpg'),
  'pfp3.jpg': require('../assets/pfp3.jpg'),
  'pfp4.jpg': require('../assets/pfp4.jpg'),
  'pfp5.jpg': require('../assets/pfp5.jpg'),
  'pfp6.jpg': require('../assets/pfp6.jpg'),
};

const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const formatMessageTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(Number(timestamp));
  if (isNaN(date.getTime())) return '';
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
};

// ============================================================================
// CUSTOM SVG ICONS
// ============================================================================
const IconBack = ({ size = 22, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);

const IconSettingsDots = ({ size = 22, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Circle cx="12" cy="5" r="2" />
    <Circle cx="12" cy="12" r="2" />
    <Circle cx="12" cy="19" r="2" />
  </Svg>
);

const IconCloseX = ({ size = 18, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Line x1="18" y1="6" x2="6" y2="18" />
    <Line x1="6" y1="6" x2="18" y2="18" />
  </Svg>
);

const IconChevronDown = ({ size = 20, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M6 9l6 6 6-6" />
  </Svg>
);

const IconChevronUp = ({ size = 20, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M18 15l-6-6-6 6" />
  </Svg>
);

const IconPlay = ({ size = 18, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M8 5v14l11-7z" />
  </Svg>
);

const IconSend = ({ size = 18, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <Line x1="22" y1="2" x2="11" y2="13" />
    <Path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </Svg>
);

const IconCheck = ({ size = 18, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 6L9 17l-5-5" />
  </Svg>
);

const IconReply = ({ size = 16, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="9 17 4 12 9 7" />
    <Path d="M20 18v-2a4 4 0 0 0-4-4H4" />
  </Svg>
);

const IconEdit = ({ size = 16, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </Svg>
);

const IconTrash = ({ size = 16, color = PURE_RED }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="3 6 5 6 21 6" />
    <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Svg>
);

const IconCopy = ({ size = 16, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Svg>
);

const IconQr = ({ size = 18, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Rect x="3" y="3" width="7" height="7" />
    <Rect x="14" y="3" width="7" height="7" />
    <Rect x="14" y="14" width="7" height="7" />
    <Rect x="3" y="14" width="7" height="7" />
  </Svg>
);

const IconUsers = ({ size = 18, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <Circle cx="9" cy="7" r="4" />
    <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
);

// ============================================================================
// ANIMATED 3-DOT WAVE TYPING INDICATOR
// ============================================================================
const AnimatedTypingDots = () => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createBounce = (anim, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: -5,
            duration: 240,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 240,
            useNativeDriver: true,
          }),
          Animated.delay(240),
        ])
      );

    const a1 = createBounce(dot1, 0);
    const a2 = createBounce(dot2, 120);
    const a3 = createBounce(dot3, 240);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.typingDotsContainer}>
      <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot1 }] }]} />
      <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot2 }] }]} />
      <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot3 }] }]} />
    </View>
  );
};

// ============================================================================
// SWIPE-TO-REPLY + ANIMATED CHAT MESSAGE ITEM
// ============================================================================
const SwipeableChatMessage = React.memo(({ item, isMe, onSwipeReply, onLongPressMessage }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const entryScale = useRef(new Animated.Value(0.94)).current;
  const triggeredRef = useRef(false);

  useEffect(() => {
    Animated.spring(entryScale, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [entryScale]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dx > 12 && Math.abs(gestureState.dy) < 18;
      },
      onPanResponderMove: (_, gestureState) => {
        const clampedDx = Math.max(0, Math.min(gestureState.dx, 72));
        translateX.setValue(clampedDx);
        if (clampedDx >= 48 && !triggeredRef.current) {
          triggeredRef.current = true;
        }
      },
      onPanResponderRelease: () => {
        if (triggeredRef.current) {
          onSwipeReply(item);
        }
        triggeredRef.current = false;
        Animated.spring(translateX, {
          toValue: 0,
          friction: 6,
          tension: 100,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        triggeredRef.current = false;
        Animated.spring(translateX, {
          toValue: 0,
          friction: 6,
          tension: 100,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  const replyIconOpacity = translateX.interpolate({
    inputRange: [0, 25, 55],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  });

  const replyIconScale = translateX.interpolate({
    inputRange: [0, 50],
    outputRange: [0.6, 1.15],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.messageSwipeWrapper}>
      {/* Background Swipe-to-Reply Indicator Icon */}
      <Animated.View
        style={[
          styles.swipeReplyIconBadge,
          {
            opacity: replyIconOpacity,
            transform: [{ scale: replyIconScale }],
          },
        ]}
      >
        <IconReply size={16} color={PURE_RED} />
      </Animated.View>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.messageRowContainer,
          isMe ? styles.messageRowMe : styles.messageRowOther,
          { transform: [{ translateX }, { scale: entryScale }] },
        ]}
      >
        {!isMe && (
          <Image
            source={AVATARS[item.senderAvatar] || AVATARS['pfp1.jpg']}
            style={styles.chatAvatar}
          />
        )}

        <TouchableOpacity
          activeOpacity={0.88}
          delayLongPress={260}
          onLongPress={() => onLongPressMessage(item)}
          style={[
            styles.messageBubble,
            isMe ? styles.messageBubbleMe : styles.messageBubbleOther,
          ]}
        >
          {/* Sender Header for Others */}
          {!isMe && (
            <View style={styles.senderHeaderRow}>
              <Text style={styles.senderNameText} numberOfLines={1}>
                {item.senderName || 'Member'}
              </Text>
              {item.isAdmin && (
                <View style={styles.chatAdminTag}>
                  <Text style={styles.chatAdminTagText}>ADMIN</Text>
                </View>
              )}
            </View>
          )}

          {/* Quoted Reply Block */}
          {item.replyTo && (
            <View style={[styles.quotedReplyBox, isMe && styles.quotedReplyBoxMe]}>
              <Text style={styles.quotedReplySender} numberOfLines={1}>
                @{item.replyTo.senderName || 'User'}
              </Text>
              <Text style={styles.quotedReplyText} numberOfLines={1}>
                {item.replyTo.text}
              </Text>
            </View>
          )}

          {/* Message Body */}
          <Text style={styles.messageBodyText}>{item.text}</Text>

          {/* Timestamp & Edited Badge Footer */}
          <View style={styles.messageMetaFooter}>
            {item.isEdited && (
              <Text style={[styles.editedBadgeText, isMe && styles.metaTextMe]}>
                edited •
              </Text>
            )}
            <Text style={[styles.timestampText, isMe && styles.metaTextMe]}>
              {formatMessageTime(item.createdAt)}
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
});

// ============================================================================
// MAIN ROOM COMPONENT
// ============================================================================
export default function Room({
  anime: propAnime,
  user: propUser,
  activeProfile: propActiveProfile,
  currentProfile: propCurrentProfile,
  activeProfileId: propActiveProfileId,
  onBack,
  navigation,
  route,
}) {
  const routeParams = route?.params || {};
  const currentAnime = propAnime || routeParams.anime || {
    id: 'solo-leveling',
    title: 'Solo Leveling',
    coverImage: '',
    backdrop: '',
  };

  const resolvedUser = propUser || routeParams.user || auth().currentUser || null;
  const resolvedUid = resolvedUser?.uid || auth().currentUser?.uid || 'guest_uid';

  const incomingProfile =
    propActiveProfile ||
    propCurrentProfile ||
    routeParams.activeProfile ||
    routeParams.currentProfile ||
    null;

  const [currentProfile, setCurrentProfile] = useState(incomingProfile);
  const [currentProfileId, setCurrentProfileId] = useState(
    () => propActiveProfileId || incomingProfile?.id || routeParams.activeProfileId || 'default'
  );

  // Enforce Hidden Top Notification Bar + Visible Default Phone Navigation Bar
  useEffect(() => {
    const configureSystemBars = async () => {
      try {
        StatusBar.setHidden(true, 'none');
        if (Platform.OS === 'android' && NavigationBar?.setVisibilityAsync) {
          await NavigationBar.setVisibilityAsync('visible');
        }
      } catch (_) {}
    };
    configureSystemBars();
  }, []);

  // Auto-resolve profile from Firestore if not provided
  useEffect(() => {
    if (currentProfile?.id || !resolvedUid || resolvedUid === 'guest_uid') return;
    let isMounted = true;

    const loadProfileFallback = async () => {
      try {
        const userDoc = await firestore().collection('users').doc(String(resolvedUid)).get();
        if (userDoc.exists) {
          const uData = userDoc.data();
          if (uData?.activeProfile?.id && isMounted) {
            setCurrentProfile(uData.activeProfile);
            setCurrentProfileId(String(uData.activeProfile.id));
            return;
          }
        }
        const snap = await firestore()
          .collection('users')
          .doc(String(resolvedUid))
          .collection('profiles')
          .limit(1)
          .get();
        if (!snap.empty && isMounted) {
          const d = snap.docs[0];
          setCurrentProfile({ id: d.id, ...d.data() });
          setCurrentProfileId(String(d.id));
        }
      } catch (_) {}
    };

    loadProfileFallback();
    return () => { isMounted = false; };
  }, [resolvedUid, currentProfile?.id]);

  const memberKey = `${resolvedUid}_${currentProfileId}`;
  const memberName = currentProfile?.name || resolvedUser?.displayName || 'Kameko User';
  const memberAvatar = currentProfile?.avatar || 'pfp1.jpg';

  const animeDocId = String(currentAnime.animeId || currentAnime.id || 'anime');
  const animeTitle = currentAnime.animeTitle || currentAnime.title || 'Anime Room';
  const animeCover = currentAnime.coverImage || currentAnime.backdrop || '';

  // --- SETUP & ROOM STATE ---
  const [setupMode, setSetupMode] = useState('create'); // 'create' | 'join'
  const [roomCode, setRoomCode] = useState(routeParams.roomCode || '');
  const [activeRoomData, setActiveRoomData] = useState(null);
  const [isInsideRoom, setIsInsideRoom] = useState(false);
  const [isCreatingOrJoining, setIsCreatingOrJoining] = useState(false);

  const [roomPasswordInput, setRoomPasswordInput] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinPasswordInput, setJoinPasswordInput] = useState('');

  // Episodes Fetch & Multi-Select (Setup) + Dropdown (Active Room)
  const [allEpisodes, setAllEpisodes] = useState([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(true);
  const [providerAnimeId, setProviderAnimeId] = useState(animeDocId);
  const [selectedChunkIndex, setSelectedChunkIndex] = useState(0);
  const [selectedEpMap, setSelectedEpMap] = useState({});

  // Collapsible Episodes Dropdown State (in Active Room)
  const [episodesDropdownOpen, setEpisodesDropdownOpen] = useState(false);
  const [roomEpChunkIndex, setRoomEpChunkIndex] = useState(0);

  // Modals
  const [settingsMenuVisible, setSettingsMenuVisible] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [membersModalVisible, setMembersModalVisible] = useState(false);
  const [copiedFeedback, setCopiedFeedback] = useState(false);

  // Player Stream State
  const [playingEpisode, setPlayingEpisode] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [streamReferer, setStreamReferer] = useState('https://vidwish.live/');

  // --- 100,000x CHAT STATES ---
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [replyingToMsg, setReplyingToMsg] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [selectedActionMsg, setSelectedActionMsg] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const chatFlatListRef = useRef(null);
  const inputRef = useRef(null);
  const lastTypingWriteRef = useRef(0);
  const stopTypingTimeoutRef = useRef(null);

  // Periodic tick to expire stale typing indicators cleanly
  useEffect(() => {
    if (!isInsideRoom) return;
    const interval = setInterval(() => setNowTick(Date.now()), 2000);
    return () => clearInterval(interval);
  }, [isInsideRoom]);

  // 1. Fetch Series Episodes for Room Setup
  useEffect(() => {
    let isMounted = true;
    const fetchSeriesEpisodes = async () => {
      setLoadingEpisodes(true);
      try {
        let targetId = animeDocId;
        const searchRes = await fetch(
          `${VERCEL_API_BASE}/api/search?keyword=${encodeURIComponent(animeTitle)}`
        );
        const searchJson = await searchRes.json();
        const matches = searchJson?.data || [];
        if (matches.length > 0) {
          const exact =
            matches.find((m) => String(m.title || '').toLowerCase() === animeTitle.toLowerCase()) ||
            matches[0];
          if (exact?.id) targetId = exact.id;
        }
        if (isMounted) setProviderAnimeId(targetId);

        const epRes = await fetch(`${VERCEL_API_BASE}/api/episodes/${encodeURIComponent(targetId)}`);
        const epJson = await epRes.json();
        const list = epJson?.data || [];

        if (isMounted && Array.isArray(list) && list.length > 0) {
          const formatted = list.map((ep, idx) => ({
            id: String(ep.id || idx + 1),
            slug: String(ep.slug || ep.id || ep.num || idx + 1),
            num: Number(ep.num || idx + 1),
            title: ep.title || `Episode ${ep.num || idx + 1}`,
            isFiller: Boolean(ep.isFiller),
          }));
          setAllEpisodes(formatted);
          setSelectedEpMap({ [formatted[0].num]: formatted[0] });
        } else if (isMounted) {
          const fallbackEp = [{ id: '1', slug: '1', num: 1, title: 'Episode 1', isFiller: false }];
          setAllEpisodes(fallbackEp);
          setSelectedEpMap({ 1: fallbackEp[0] });
        }
      } catch (_) {
        if (isMounted) {
          const fallbackEp = [{ id: '1', slug: '1', num: 1, title: 'Episode 1', isFiller: false }];
          setAllEpisodes(fallbackEp);
          setSelectedEpMap({ 1: fallbackEp[0] });
        }
      } finally {
        if (isMounted) setLoadingEpisodes(false);
      }
    };

    fetchSeriesEpisodes();
    return () => { isMounted = false; };
  }, [animeDocId, animeTitle]);

  const setupEpisodeChunks = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < allEpisodes.length; i += EPISODE_CHUNK_SIZE) {
      chunks.push(allEpisodes.slice(i, i + EPISODE_CHUNK_SIZE));
    }
    return chunks;
  }, [allEpisodes]);

  const currentSetupChunkEpisodes = setupEpisodeChunks[selectedChunkIndex] || allEpisodes;

  const isAllSelected =
    allEpisodes.length > 0 &&
    Object.keys(selectedEpMap).length === allEpisodes.length;

  const handleToggleSelectAllEpisodes = () => {
    if (isAllSelected) {
      setSelectedEpMap({});
    } else {
      const nextMap = {};
      allEpisodes.forEach((ep) => {
        nextMap[ep.num] = ep;
      });
      setSelectedEpMap(nextMap);
    }
  };

  const handleToggleSingleEpisode = (ep) => {
    setSelectedEpMap((prev) => {
      const copy = { ...prev };
      if (copy[ep.num]) {
        delete copy[ep.num];
      } else {
        copy[ep.num] = ep;
      }
      return copy;
    });
  };

  // 2. Create Room in Firestore
  const handleCreateRoom = async () => {
    const chosenList = Object.values(selectedEpMap).sort((a, b) => a.num - b.num);
    if (chosenList.length === 0) {
      Alert.alert('Select Episodes', 'Please select at least one episode for the room.');
      return;
    }

    setIsCreatingOrJoining(true);
    try {
      const generatedCode = generateRoomCode();
      const cleanPassword = roomPasswordInput.trim();

      const adminMemberObj = {
        key: memberKey,
        uid: String(resolvedUid),
        profileId: String(currentProfileId),
        name: memberName,
        avatar: memberAvatar,
        isAdmin: true,
        joinedAt: Date.now(),
      };

      const roomPayload = {
        code: generatedCode,
        animeId: animeDocId,
        providerAnimeId: String(providerAnimeId || animeDocId),
        animeTitle: animeTitle,
        animeCover: animeCover,
        password: cleanPassword || null,
        hasPassword: Boolean(cleanPassword),
        adminKey: memberKey,
        adminUid: String(resolvedUid),
        adminProfileId: String(currentProfileId),
        adminName: memberName,
        episodes: chosenList,
        membersMap: {
          [memberKey]: adminMemberObj,
        },
        typingMap: {},
        kickedKeys: [],
        currentEpisode: chosenList[0],
        playbackState: {
          isPlaying: true,
          positionMillis: 0,
          updatedAt: Date.now(),
        },
        status: 'active',
        createdAt: Date.now(),
      };

      await firestore().collection('rooms').doc(generatedCode).set(roomPayload);

      if (resolvedUid && resolvedUid !== 'guest_uid') {
        await firestore()
          .collection('users')
          .doc(String(resolvedUid))
          .collection('profiles')
          .doc(String(currentProfileId))
          .collection('rooms')
          .doc(generatedCode)
          .set({
            code: generatedCode,
            animeId: animeDocId,
            animeTitle: animeTitle,
            animeCover: animeCover,
            role: 'admin',
            episodesCount: chosenList.length,
            createdAt: Date.now(),
          });
      }

      setRoomCode(generatedCode);
      setPlayingEpisode(chosenList[0]);
      setIsInsideRoom(true);
      setInviteModalVisible(true);
    } catch (err) {
      Alert.alert('Room Error', `Could not create room: ${err.message}`);
    } finally {
      setIsCreatingOrJoining(false);
    }
  };

  // 3. Join Room by Alphanumeric Code
  const handleJoinRoom = async () => {
    const cleanCode = joinCodeInput.trim().toUpperCase();
    if (!cleanCode) {
      Alert.alert('Enter Code', 'Please enter a valid alphanumeric room code.');
      return;
    }

    setIsCreatingOrJoining(true);
    try {
      const roomRef = firestore().collection('rooms').doc(cleanCode);
      const doc = await roomRef.get();

      if (!doc.exists || doc.data()?.status === 'closed') {
        Alert.alert('Room Not Found', 'No active room found with that code.');
        setIsCreatingOrJoining(false);
        return;
      }

      const data = doc.data();
      if (Array.isArray(data.kickedKeys) && data.kickedKeys.includes(memberKey)) {
        Alert.alert('Access Denied', 'You were removed from this room by the admin.');
        setIsCreatingOrJoining(false);
        return;
      }

      if (data.hasPassword && data.password && data.password !== joinPasswordInput.trim()) {
        Alert.alert('Incorrect Password', 'The password you entered for this room is incorrect.');
        setIsCreatingOrJoining(false);
        return;
      }

      const viewerMemberObj = {
        key: memberKey,
        uid: String(resolvedUid),
        profileId: String(currentProfileId),
        name: memberName,
        avatar: memberAvatar,
        isAdmin: data.adminKey === memberKey,
        joinedAt: Date.now(),
      };

      await roomRef.set(
        {
          membersMap: {
            [memberKey]: viewerMemberObj,
          },
        },
        { merge: true }
      );

      setRoomCode(cleanCode);
      if (data.currentEpisode) setPlayingEpisode(data.currentEpisode);
      setIsInsideRoom(true);
    } catch (err) {
      Alert.alert('Join Error', `Could not join room: ${err.message}`);
    } finally {
      setIsCreatingOrJoining(false);
    }
  };

  // 4. Real-Time Room & Chat Listeners
  useEffect(() => {
    if (!isInsideRoom || !roomCode) return;

    const roomRef = firestore().collection('rooms').doc(roomCode);

    const unsubRoom = roomRef.onSnapshot(
      (doc) => {
        if (!doc.exists || doc.data()?.status === 'closed') {
          setIsInsideRoom(false);
          setPlayingEpisode(null);
          setActiveRoomData(null);
          Alert.alert('Room Closed', 'This room has been closed by the admin.');
          return;
        }

        const data = doc.data();
        if (Array.isArray(data.kickedKeys) && data.kickedKeys.includes(memberKey)) {
          setIsInsideRoom(false);
          setPlayingEpisode(null);
          setActiveRoomData(null);
          Alert.alert('Removed', 'You have been removed from the room by the admin.');
          return;
        }

        setActiveRoomData(data);
        if (
          data.currentEpisode &&
          (!playingEpisode || String(playingEpisode.num) !== String(data.currentEpisode.num))
        ) {
          setPlayingEpisode(data.currentEpisode);
        }
      },
      () => {}
    );

    const unsubChat = roomRef
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .limitToLast(120)
      .onSnapshot(
        (snap) => {
          const msgs = [];
          snap?.forEach((d) => msgs.push({ id: d.id, ...d.data() }));
          setChatMessages(msgs);
        },
        () => {}
      );

    return () => {
      unsubRoom();
      unsubChat();
    };
  }, [isInsideRoom, roomCode, memberKey]);

  // 5. Resolve M3U8 Stream for Selected Room Episode
  useEffect(() => {
    if (!isInsideRoom || !playingEpisode || !activeRoomData) return;
    let isMounted = true;

    const loadRoomEpisodeStream = async () => {
      setStreamUrl(null);
      const targetId = activeRoomData.providerAnimeId || activeRoomData.animeId || providerAnimeId;
      const targetSlug = playingEpisode.slug || playingEpisode.num;
      const servers = ['hd-1', 'hd-2', 'vidstream-2'];

      for (const srv of servers) {
        try {
          const url = `${VERCEL_API_BASE}/api/stream?id=${encodeURIComponent(targetId)}&ep=${encodeURIComponent(targetSlug)}&server=${srv}&type=sub`;
          const res = await fetch(url);
          const json = await res.json();
          const payload = json?.data || json?.results;
          if (payload?.m3u8 || payload?.streamingLink) {
            if (isMounted) {
              setStreamUrl(payload.m3u8 || payload.streamingLink);
              if (payload.referer) setStreamReferer(payload.referer);
            }
            break;
          }
        } catch (_) {}
      }
    };

    loadRoomEpisodeStream();
    return () => { isMounted = false; };
  }, [isInsideRoom, playingEpisode?.num, activeRoomData?.providerAnimeId]);

  // 6. Live Typing Status Sync (Broadcasts Avatar & Name While Typing)
  const syncTypingStatus = useCallback(
    (isTypingNow) => {
      if (!roomCode || !isInsideRoom) return;
      firestore()
        .collection('rooms')
        .doc(roomCode)
        .set(
          {
            typingMap: {
              [memberKey]: isTypingNow
                ? {
                    key: memberKey,
                    name: memberName,
                    avatar: memberAvatar,
                    isTyping: true,
                    updatedAt: Date.now(),
                  }
                : firestore.FieldValue.delete(),
            },
          },
          { merge: true }
        )
        .catch(() => {});
    },
    [roomCode, isInsideRoom, memberKey, memberName, memberAvatar]
  );

  const handleChatInputChange = (text) => {
    setChatInput(text);

    if (!text.trim()) {
      if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);
      syncTypingStatus(false);
      return;
    }

    const now = Date.now();
    if (now - lastTypingWriteRef.current > 2000) {
      lastTypingWriteRef.current = now;
      syncTypingStatus(true);
    }

    if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);
    stopTypingTimeoutRef.current = setTimeout(() => {
      syncTypingStatus(false);
    }, 3200);
  };

  // Active Typing Users (Excludes Self, Expires After 5.5 Seconds)
  const activeTypingUsers = useMemo(() => {
    if (!activeRoomData?.typingMap) return [];
    return Object.values(activeRoomData.typingMap).filter(
      (u) =>
        u &&
        u.key !== memberKey &&
        u.isTyping &&
        nowTick - (u.updatedAt || 0) < 5500
    );
  }, [activeRoomData?.typingMap, memberKey, nowTick]);

  // 7. Send New Message OR Save Edited Message
  const handleSendOrSaveMessage = async () => {
    const cleanText = chatInput.trim();
    if (!cleanText || !roomCode) return;

    setChatInput('');
    if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);
    syncTypingStatus(false);

    const messagesRef = firestore()
      .collection('rooms')
      .doc(roomCode)
      .collection('messages');

    // A. If Editing an Existing Message
    if (editingMsg) {
      const targetId = editingMsg.id;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setEditingMsg(null);
      try {
        await messagesRef.doc(targetId).update({
          text: cleanText,
          isEdited: true,
          editedAt: Date.now(),
        });
      } catch (_) {}
      return;
    }

    // B. Sending a Brand New Message (with Optional Swipe Reply Quote)
    const replyPayload = replyingToMsg
      ? {
          id: replyingToMsg.id,
          senderName: replyingToMsg.senderName || 'User',
          text: replyingToMsg.text || '',
        }
      : null;

    if (replyingToMsg) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setReplyingToMsg(null);
    }

    try {
      await messagesRef.add({
        senderKey: memberKey,
        senderName: memberName,
        senderAvatar: memberAvatar,
        isAdmin: activeRoomData?.adminKey === memberKey,
        text: cleanText,
        replyTo: replyPayload,
        isEdited: false,
        episodeNum: playingEpisode?.num || 1,
        createdAt: Date.now(),
      });
      setTimeout(() => {
        chatFlatListRef.current?.scrollToEnd?.({ animated: true });
      }, 80);
    } catch (_) {}
  };

  // 8. Swipe to Reply, Edit Message, & Unsend Message Handlers
  const handleTriggerSwipeReply = useCallback((msg) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditingMsg(null);
    setReplyingToMsg(msg);
    setTimeout(() => inputRef.current?.focus?.(), 60);
  }, []);

  const handleStartEditMessage = (msg) => {
    setSelectedActionMsg(null);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setReplyingToMsg(null);
    setEditingMsg(msg);
    setChatInput(msg.text || '');
    setTimeout(() => inputRef.current?.focus?.(), 80);
  };

  const handleUnsendMessage = async (msg) => {
    setSelectedActionMsg(null);
    if (!msg?.id || !roomCode) return;
    try {
      await firestore()
        .collection('rooms')
        .doc(roomCode)
        .collection('messages')
        .doc(msg.id)
        .delete();
    } catch (_) {}
  };

  // 9. Room Episodes Chunks (Identical to Play.js)
  const roomEpisodes = activeRoomData?.episodes || [];
  const roomEpisodeChunks = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < roomEpisodes.length; i += EPISODE_CHUNK_SIZE) {
      chunks.push(roomEpisodes.slice(i, i + EPISODE_CHUNK_SIZE));
    }
    return chunks;
  }, [roomEpisodes]);

  const currentRoomChunkEpisodes =
    roomEpisodeChunks[roomEpChunkIndex] || roomEpisodeChunks[0] || roomEpisodes;

  const toggleEpisodesDropdown = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEpisodesDropdownOpen((prev) => !prev);
  };

  const handleSelectRoomEpisode = async (ep) => {
    setPlayingEpisode(ep);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEpisodesDropdownOpen(false);

    if (roomCode) {
      try {
        await firestore()
          .collection('rooms')
          .doc(roomCode)
          .update({
            currentEpisode: ep,
            playbackState: {
              isPlaying: true,
              positionMillis: 0,
              updatedBy: memberKey,
              updatedAt: Date.now(),
            },
          });
      } catch (_) {}
    }
  };

  // 10. Room Admin & Leave/Close Controls
  const isCurrentUserAdmin = activeRoomData?.adminKey === memberKey;

  const joinedMembersList = useMemo(() => {
    if (!activeRoomData?.membersMap) return [];
    return Object.values(activeRoomData.membersMap).sort((a, b) => {
      if (a.isAdmin && !b.isAdmin) return -1;
      if (!a.isAdmin && b.isAdmin) return 1;
      return (a.joinedAt || 0) - (b.joinedAt || 0);
    });
  }, [activeRoomData?.membersMap]);

  const handleAdminKickMember = (targetMember) => {
    if (!isCurrentUserAdmin || !targetMember || targetMember.key === memberKey) return;
    Alert.alert('Remove Member', `Remove ${targetMember.name} from this watch room?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const roomRef = firestore().collection('rooms').doc(roomCode);
            const nextMap = { ...(activeRoomData.membersMap || {}) };
            delete nextMap[targetMember.key];
            await roomRef.update({
              membersMap: nextMap,
              kickedKeys: firestore.FieldValue.arrayUnion(targetMember.key),
            });
          } catch (_) {}
        },
      },
    ]);
  };

  const handleLeaveOrCloseRoom = async () => {
    setSettingsMenuVisible(false);
    syncTypingStatus(false);

    if (!roomCode) {
      if (onBack) onBack();
      return;
    }

    const roomRef = firestore().collection('rooms').doc(roomCode);

    if (isCurrentUserAdmin) {
      Alert.alert(
        'Close Watch Room',
        'Closing the room will end the watch party for everyone. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Close Room',
            style: 'destructive',
            onPress: async () => {
              try {
                await roomRef.update({ status: 'closed' });
                await roomRef.delete().catch(() => {});
              } catch (_) {}
              setIsInsideRoom(false);
              setActiveRoomData(null);
              if (onBack) onBack();
            },
          },
        ]
      );
    } else {
      try {
        const nextMap = { ...(activeRoomData?.membersMap || {}) };
        delete nextMap[memberKey];
        await roomRef.update({ membersMap: nextMap });
      } catch (_) {}
      setIsInsideRoom(false);
      setActiveRoomData(null);
      if (onBack) onBack();
    }
  };

  const handleShareRoomCode = async () => {
    if (!roomCode) return;
    setCopiedFeedback(true);
    setTimeout(() => setCopiedFeedback(false), 2000);
    try {
      await Share.share({
        message: `Join my Kameko Watch Party for ${animeTitle}! Room Code: ${roomCode}`,
      });
    } catch (_) {}
  };

  const qrCodeImageUrl = roomCode
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=${encodeURIComponent(
        `KAMEKO_ROOM:${roomCode}`
      )}`
    : '';

  // ============================================================================
  // RENDER 1: CREATE OR JOIN ROOM SETUP SCREEN
  // ============================================================================
  if (!isInsideRoom) {
    const selectedCount = Object.keys(selectedEpMap).length;

    return (
      <View style={styles.container}>
        <StatusBar hidden={true} />

        {/* Top Bar */}
        <View style={styles.topHeaderBar}>
          <TouchableOpacity
            style={styles.topCircleBtn}
            onPress={onBack || (() => navigation?.goBack?.())}
          >
            <IconBack />
          </TouchableOpacity>
          <Text style={styles.topHeaderTitle} numberOfLines={1}>
            Watch Room • {animeTitle}
          </Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Create / Join Switcher */}
        <View style={styles.modeTabsRow}>
          <TouchableOpacity
            style={[styles.modeTabBtn, setupMode === 'create' && styles.modeTabBtnActive]}
            onPress={() => setSetupMode('create')}
          >
            <Text style={[styles.modeTabText, setupMode === 'create' && styles.modeTabTextActive]}>
              Create Room
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTabBtn, setupMode === 'join' && styles.modeTabBtnActive]}
            onPress={() => setSetupMode('join')}
          >
            <Text style={[styles.modeTabText, setupMode === 'join' && styles.modeTabTextActive]}>
              Join with Code
            </Text>
          </TouchableOpacity>
        </View>

        {setupMode === 'create' ? (
          <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <View style={styles.setupCard}>
              <View style={styles.hostProfileRow}>
                <Image
                  source={AVATARS[memberAvatar] || AVATARS['pfp1.jpg']}
                  style={styles.hostAvatar}
                />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.hostName}>{memberName}</Text>
                    <View style={styles.adminTagBadge}>
                      <Text style={styles.adminTagText}>HOST</Text>
                    </View>
                  </View>
                  <Text style={styles.hostSubtext}>{animeTitle}</Text>
                </View>
              </View>

              <Text style={styles.inputLabel}>Room Password (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Leave blank for open room..."
                placeholderTextColor={TEXT_GREY}
                value={roomPasswordInput}
                onChangeText={setRoomPasswordInput}
                maxLength={20}
              />
            </View>

            <View style={styles.epSelectHeaderRow}>
              <Text style={styles.sectionTitle}>
                Select Episodes ({selectedCount}/{allEpisodes.length})
              </Text>
              <TouchableOpacity
                style={[styles.selectAllBtn, isAllSelected && styles.selectAllBtnActive]}
                onPress={handleToggleSelectAllEpisodes}
              >
                <Text style={[styles.selectAllBtnText, isAllSelected && { color: WHITE }]}>
                  {isAllSelected ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
            </View>

            {setupEpisodeChunks.length > 1 && (
              <View style={{ marginBottom: 10 }}>
                <FlatList
                  horizontal
                  data={setupEpisodeChunks}
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(_, idx) => `setup-chunk-${idx}`}
                  contentContainerStyle={{ gap: 8 }}
                  renderItem={({ item, index }) => {
                    const label = `${item[0].num} - ${item[item.length - 1].num}`;
                    const isActive = selectedChunkIndex === index;
                    return (
                      <TouchableOpacity
                        style={[styles.chunkRectPill, isActive && styles.chunkRectPillActive]}
                        onPress={() => setSelectedChunkIndex(index)}
                      >
                        <Text style={[styles.chunkRectPillText, isActive && styles.chunkRectPillTextActive]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            )}

            {loadingEpisodes ? (
              <ActivityIndicator size="small" color={PURE_RED} style={{ marginTop: 30 }} />
            ) : (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.epSelectGrid}
                showsVerticalScrollIndicator={false}
              >
                {currentSetupChunkEpisodes.map((ep) => {
                  const isSelected = Boolean(selectedEpMap[ep.num]);
                  return (
                    <TouchableOpacity
                      key={ep.num}
                      style={[styles.epSelectBox, isSelected && styles.epSelectBoxActive]}
                      activeOpacity={0.8}
                      onPress={() => handleToggleSingleEpisode(ep)}
                    >
                      <Text style={[styles.epSelectBoxText, isSelected && styles.epSelectBoxTextActive]}>
                        Ep {ep.num}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity
              style={[
                styles.primaryActionBtn,
                (isCreatingOrJoining || selectedCount === 0) && { opacity: 0.5 },
              ]}
              disabled={isCreatingOrJoining || selectedCount === 0}
              onPress={handleCreateRoom}
            >
              {isCreatingOrJoining ? (
                <ActivityIndicator size="small" color={WHITE} />
              ) : (
                <Text style={styles.primaryActionBtnText}>
                  Launch Watch Room ({selectedCount} {selectedCount === 1 ? 'Ep' : 'Eps'})
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <View style={styles.setupCard}>
              <Text style={styles.inputLabel}>Alphanumeric Room Code</Text>
              <TextInput
                style={[styles.textInput, styles.codeTextInput]}
                placeholder="e.g. KMK8F2"
                placeholderTextColor={TEXT_GREY}
                autoCapitalize="characters"
                value={joinCodeInput}
                onChangeText={setJoinCodeInput}
                maxLength={10}
              />

              <Text style={[styles.inputLabel, { marginTop: 14 }]}>
                Room Password (If locked)
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter password if required..."
                placeholderTextColor={TEXT_GREY}
                value={joinPasswordInput}
                onChangeText={setJoinPasswordInput}
              />

              <TouchableOpacity
                style={[styles.primaryActionBtn, { marginTop: 20 }]}
                disabled={isCreatingOrJoining}
                onPress={handleJoinRoom}
              >
                {isCreatingOrJoining ? (
                  <ActivityIndicator size="small" color={WHITE} />
                ) : (
                  <Text style={styles.primaryActionBtnText}>Join Watch Room</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  }

  // ============================================================================
  // RENDER 2: ACTIVE WATCH ROOM (TOP BAR -> PLAYER -> PLAY.JS EPISODES DROPDOWN -> 100000x CHAT)
  // ============================================================================
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar hidden={true} />

      {/* 1. TOP BAR: Back Button (Left) + Room Info (Center) + Settings Button (Right) */}
      <View style={styles.topHeaderBar}>
        <TouchableOpacity style={styles.topCircleBtn} onPress={handleLeaveOrCloseRoom}>
          <IconBack />
        </TouchableOpacity>

        <View style={styles.topHeaderCenter}>
          <Text style={styles.topHeaderTitle} numberOfLines={1}>
            {activeRoomData?.animeTitle || animeTitle}
          </Text>
          <View style={styles.topStatusPillRow}>
            <View style={styles.liveGreenDot} />
            <Text style={styles.topRoomCodeText}>
              ROOM {roomCode} • {joinedMembersList.length} WATCHING
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.topCircleBtn}
          onPress={() => setSettingsMenuVisible(true)}
        >
          <IconSettingsDots size={20} color={WHITE} />
        </TouchableOpacity>
      </View>

      {/* 2. SYNCED VIDEO PLAYER (components/room/room_player.js) */}
      <View style={styles.playerSectionWrapper}>
        {RoomPlayerComponent && playingEpisode ? (
          <RoomPlayerComponent
            roomCode={roomCode}
            streamUrl={streamUrl}
            streamReferer={streamReferer}
            animeTitle={activeRoomData?.animeTitle || animeTitle}
            episodeNum={playingEpisode.num}
            episodeTitle={playingEpisode.title}
            memberKey={memberKey}
            memberName={memberName}
            memberAvatar={memberAvatar}
            isAdmin={isCurrentUserAdmin}
            messages={chatMessages}
            playbackState={activeRoomData?.playbackState}
          />
        ) : (
          <View style={styles.playerFallbackBox}>
            <ActivityIndicator size="large" color={PURE_RED} />
          </View>
        )}
      </View>

      {/* 3. COLLAPSIBLE EPISODES DROPDOWN (EXACT PLAY.JS VIEW & STYLING) */}
      <View style={styles.dropdownWrapper}>
        <TouchableOpacity
          style={styles.dropdownHeaderBar}
          activeOpacity={0.85}
          onPress={toggleEpisodesDropdown}
        >
          <View style={styles.dropdownHeaderLeft}>
            <Text style={styles.dropdownHeaderTitle}>
              Episodes ({roomEpisodes.length})
            </Text>
            {playingEpisode && (
              <View style={styles.nowPlayingMiniBadge}>
                <Text style={styles.nowPlayingMiniText}>
                  Playing Ep {playingEpisode.num}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.dropdownHeaderRight}>
            <Text style={styles.dropdownToggleHint}>
              {episodesDropdownOpen ? 'Hide' : 'View All'}
            </Text>
            {episodesDropdownOpen ? (
              <IconChevronUp size={18} color={WHITE} />
            ) : (
              <IconChevronDown size={18} color={WHITE} />
            )}
          </View>
        </TouchableOpacity>

        {episodesDropdownOpen && (
          <View style={styles.dropdownExpandedBody}>
            {/* 1 - 50 Rectangular Chunk Selector Pills (Play.js Style) */}
            {roomEpisodeChunks.length > 1 && (
              <FlatList
                horizontal
                data={roomEpisodeChunks}
                showsHorizontalScrollIndicator={false}
                keyExtractor={(_, idx) => `room-ep-chunk-${idx}`}
                contentContainerStyle={styles.chunkSelectorContainer}
                renderItem={({ item, index }) => {
                  const rangeLabel = `${item[0].num} - ${item[item.length - 1].num}`;
                  const isActive = roomEpChunkIndex === index;
                  return (
                    <TouchableOpacity
                      style={[styles.chunkRectPill, isActive && styles.chunkRectPillActive]}
                      activeOpacity={0.85}
                      onPress={() => setRoomEpChunkIndex(index)}
                    >
                      <Text
                        style={[
                          styles.chunkRectPillText,
                          isActive && styles.chunkRectPillTextActive,
                        ]}
                      >
                        {rangeLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            {/* Episode Rows (Play.js Style: •Num + #050505 Card + Filler Tag + Play Icon) */}
            <FlatList
              data={currentRoomChunkEpisodes}
              keyExtractor={(item) => String(item.num)}
              style={styles.dropdownEpisodesList}
              contentContainerStyle={{ paddingVertical: 8 }}
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isNowPlaying =
                  playingEpisode && Number(playingEpisode.num) === Number(item.num);
                return (
                  <View style={styles.episodeRow}>
                    <Text
                      style={[
                        styles.bulletNumber,
                        isNowPlaying && { color: PURE_RED },
                      ]}
                    >
                      •{item.num}
                    </Text>

                    <TouchableOpacity
                      style={[
                        styles.episodeCard,
                        isNowPlaying && styles.episodeCardActive,
                      ]}
                      activeOpacity={0.8}
                      onPress={() => handleSelectRoomEpisode(item)}
                    >
                      <Text
                        style={[
                          styles.episodeCardTitle,
                          isNowPlaying && { color: PURE_RED, fontWeight: '800' },
                        ]}
                        numberOfLines={1}
                      >
                        {item.title || `Episode ${item.num}`}
                      </Text>

                      <View style={styles.cardRightGroup}>
                        {item.isFiller && (
                          <View style={styles.fillerTag}>
                            <Text style={styles.fillerTagText}>FILLER</Text>
                          </View>
                        )}
                        <IconPlay
                          size={18}
                          color={isNowPlaying ? PURE_RED : WHITE}
                        />
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          </View>
        )}
      </View>

      {/* 4. 100,000x LIVE CHAT SECTION */}
      <View style={styles.chatMasterSection}>
        {/* Chat Subheader with Online Member Avatars Stack */}
        <View style={styles.chatTopSubheader}>
          <View style={styles.chatSubheaderLeft}>
            <View style={styles.chatPulseDot} />
            <Text style={styles.chatSubheaderTitle}>LIVE PARTY CHAT</Text>
            <Text style={styles.chatSwipeHint}>• Swipe right to reply • Hold to edit/unsend</Text>
          </View>

          <TouchableOpacity
            style={styles.avatarStackBtn}
            activeOpacity={0.8}
            onPress={() => setMembersModalVisible(true)}
          >
            {joinedMembersList.slice(0, 4).map((m, idx) => (
              <Image
                key={m.key}
                source={AVATARS[m.avatar] || AVATARS['pfp1.jpg']}
                style={[styles.stackedMiniAvatar, { marginLeft: idx === 0 ? 0 : -8 }]}
              />
            ))}
          </TouchableOpacity>
        </View>

        {/* Messages FlatList */}
        <FlatList
          ref={chatFlatListRef}
          data={chatMessages}
          keyExtractor={(item) => item.id}
          style={styles.chatListArea}
          contentContainerStyle={styles.chatListContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            chatFlatListRef.current?.scrollToEnd?.({ animated: true })
          }
          ListEmptyComponent={
            <View style={styles.emptyChatWrap}>
              <Text style={styles.emptyChatTitle}>Watch Party Chat is Live</Text>
              <Text style={styles.emptyChatSub}>
                Send a message, swipe right on any bubble to reply, or hold your message to edit or unsend.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <SwipeableChatMessage
              item={item}
              isMe={item.senderKey === memberKey}
              onSwipeReply={handleTriggerSwipeReply}
              onLongPressMessage={(msg) => setSelectedActionMsg(msg)}
            />
          )}
        />

        {/* LIVE TYPING INDICATOR BAR WITH USER AVATAR & 3-DOT BOUNCING WAVE */}
        {activeTypingUsers.length > 0 && (
          <View style={styles.typingIndicatorBar}>
            <View style={styles.typingAvatarsWrap}>
              {activeTypingUsers.slice(0, 3).map((u, i) => (
                <Image
                  key={u.key}
                  source={AVATARS[u.avatar] || AVATARS['pfp1.jpg']}
                  style={[styles.typingUserAvatar, { marginLeft: i === 0 ? 0 : -6 }]}
                />
              ))}
            </View>
            <Text style={styles.typingStatusText} numberOfLines={1}>
              {activeTypingUsers.length === 1
                ? `${activeTypingUsers[0].name} is typing`
                : `${activeTypingUsers.map((u) => u.name).join(', ')} are typing`}
            </Text>
            <AnimatedTypingDots />
          </View>
        )}

        {/* REPLYING OR EDITING BANNER ABOVE INPUT */}
        {(replyingToMsg || editingMsg) && (
          <View style={styles.composerBannerBar}>
            <View style={styles.composerBannerAccent} />
            <View style={{ flex: 1, paddingHorizontal: 10 }}>
              <Text style={styles.composerBannerLabel}>
                {editingMsg
                  ? 'Editing Your Message'
                  : `Replying to @${replyingToMsg?.senderName || 'User'}`}
              </Text>
              <Text style={styles.composerBannerPreview} numberOfLines={1}>
                {editingMsg ? editingMsg.text : replyingToMsg?.text}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.composerBannerCancelBtn}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                if (editingMsg) setChatInput('');
                setEditingMsg(null);
                setReplyingToMsg(null);
              }}
            >
              <IconCloseX size={15} color={TEXT_GREY} />
            </TouchableOpacity>
          </View>
        )}

        {/* SLEEK COMPOSER INPUT BAR */}
        <View style={styles.composerInputContainer}>
          <Image
            source={AVATARS[memberAvatar] || AVATARS['pfp1.jpg']}
            style={styles.composerMyAvatar}
          />
          <TextInput
            ref={inputRef}
            style={styles.composerTextInput}
            placeholder={
              editingMsg
                ? 'Update your message...'
                : replyingToMsg
                ? `Reply to ${replyingToMsg.senderName}...`
                : 'Message the watch party...'
            }
            placeholderTextColor={TEXT_GREY}
            value={chatInput}
            onChangeText={handleChatInputChange}
            onSubmitEditing={handleSendOrSaveMessage}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[
              styles.composerSendBtn,
              editingMsg && { backgroundColor: EMERALD },
              !chatInput.trim() && { opacity: 0.45 },
            ]}
            disabled={!chatInput.trim()}
            activeOpacity={0.8}
            onPress={handleSendOrSaveMessage}
          >
            {editingMsg ? (
              <IconCheck size={18} color={WHITE} />
            ) : (
              <IconSend size={17} color={WHITE} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ============================================================================ */}
      {/* MESSAGE LONG-PRESS ACTION SHEET (REPLY, EDIT, UNSEND, COPY) */}
      {/* ============================================================================ */}
      <Modal
        visible={Boolean(selectedActionMsg)}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedActionMsg(null)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setSelectedActionMsg(null)}
          />
          {selectedActionMsg && (
            <View style={styles.msgActionSheet}>
              <View style={styles.msgActionPreviewBox}>
                <Text style={styles.msgActionPreviewSender}>
                  {selectedActionMsg.senderName} • {formatMessageTime(selectedActionMsg.createdAt)}
                </Text>
                <Text style={styles.msgActionPreviewText} numberOfLines={2}>
                  {selectedActionMsg.text}
                </Text>
              </View>

              {/* Reply Option */}
              <TouchableOpacity
                style={styles.settingsItemRow}
                onPress={() => {
                  const target = selectedActionMsg;
                  setSelectedActionMsg(null);
                  handleTriggerSwipeReply(target);
                }}
              >
                <IconReply size={18} color={WHITE} />
                <Text style={styles.settingsItemText}>Reply to Message</Text>
              </TouchableOpacity>

              {/* Edit Option (Only for Sender) */}
              {selectedActionMsg.senderKey === memberKey && (
                <TouchableOpacity
                  style={styles.settingsItemRow}
                  onPress={() => handleStartEditMessage(selectedActionMsg)}
                >
                  <IconEdit size={18} color={WHITE} />
                  <Text style={styles.settingsItemText}>Edit Message</Text>
                </TouchableOpacity>
              )}

              {/* Share / Copy Text Option */}
              <TouchableOpacity
                style={styles.settingsItemRow}
                onPress={() => {
                  const txt = selectedActionMsg.text;
                  setSelectedActionMsg(null);
                  Share.share({ message: txt }).catch(() => {});
                }}
              >
                <IconCopy size={18} color={WHITE} />
                <Text style={styles.settingsItemText}>Copy / Share Text</Text>
              </TouchableOpacity>

              {/* Unsend Option (For Sender or Room Admin) */}
              {(selectedActionMsg.senderKey === memberKey || isCurrentUserAdmin) && (
                <TouchableOpacity
                  style={[styles.settingsItemRow, { borderBottomWidth: 0 }]}
                  onPress={() => handleUnsendMessage(selectedActionMsg)}
                >
                  <IconTrash size={18} color={PURE_RED} />
                  <Text style={[styles.settingsItemText, { color: PURE_RED }]}>
                    Unsend Message
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </Modal>

      {/* ============================================================================ */}
      {/* TOP RIGHT SETTINGS MODAL (Invite QR/Code, Members List, Leave/Close) */}
      {/* ============================================================================ */}
      <Modal
        visible={settingsMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSettingsMenuVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setSettingsMenuVisible(false)}
          />

          <View style={styles.settingsSheet}>
            <View style={styles.settingsSheetHeader}>
              <Text style={styles.settingsSheetTitle}>Room Settings</Text>
              <TouchableOpacity
                style={styles.closeIconBtn}
                onPress={() => setSettingsMenuVisible(false)}
              >
                <IconCloseX size={18} color={WHITE} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.settingsItemRow}
              onPress={() => {
                setSettingsMenuVisible(false);
                setInviteModalVisible(true);
              }}
            >
              <IconQr size={18} color={WHITE} />
              <Text style={styles.settingsItemText}>Invite Friends (QR & Room Code)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingsItemRow}
              onPress={() => {
                setSettingsMenuVisible(false);
                setMembersModalVisible(true);
              }}
            >
              <IconUsers size={18} color={WHITE} />
              <Text style={styles.settingsItemText}>
                Joined Members ({joinedMembersList.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingsItemRow, { borderBottomWidth: 0 }]}
              onPress={handleLeaveOrCloseRoom}
            >
              <IconTrash size={18} color={PURE_RED} />
              <Text style={[styles.settingsItemText, { color: PURE_RED }]}>
                {isCurrentUserAdmin ? 'Close Room for Everyone' : 'Leave Watch Room'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ============================================================================ */}
      {/* JOINED MEMBERS MODAL (With Admin Remove Button) */}
      {/* ============================================================================ */}
      <Modal
        visible={membersModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMembersModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setMembersModalVisible(false)}
          />
          <View style={styles.settingsSheet}>
            <View style={styles.settingsSheetHeader}>
              <Text style={styles.settingsSheetTitle}>
                Room Members ({joinedMembersList.length})
              </Text>
              <TouchableOpacity
                style={styles.closeIconBtn}
                onPress={() => setMembersModalVisible(false)}
              >
                <IconCloseX size={18} color={WHITE} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {joinedMembersList.map((m) => {
                const isMe = m.key === memberKey;
                return (
                  <View key={m.key} style={styles.memberModalRow}>
                    <Image
                      source={AVATARS[m.avatar] || AVATARS['pfp1.jpg']}
                      style={styles.memberModalAvatar}
                    />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.memberModalName}>
                          {isMe ? `${m.name} (You)` : m.name}
                        </Text>
                        {m.isAdmin && (
                          <View style={styles.adminTagBadge}>
                            <Text style={styles.adminTagText}>ADMIN</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {isCurrentUserAdmin && !isMe && (
                      <TouchableOpacity
                        style={styles.memberKickBtn}
                        onPress={() => handleAdminKickMember(m)}
                      >
                        <IconTrash size={14} color={WHITE} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ============================================================================ */}
      {/* INVITE QR & ALPHANUMERIC CODE MODAL */}
      {/* ============================================================================ */}
      <Modal
        visible={inviteModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setInviteModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.inviteCard}>
            <View style={styles.inviteHeaderRow}>
              <Text style={styles.inviteTitle}>Invite to Watch Room</Text>
              <TouchableOpacity
                style={styles.closeIconBtn}
                onPress={() => setInviteModalVisible(false)}
              >
                <IconCloseX size={18} color={WHITE} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inviteSubtitle}>
              Scan this QR code or share the alphanumeric code to watch {animeTitle} together
            </Text>

            <View style={styles.qrFrameBox}>
              {qrCodeImageUrl ? (
                <Image
                  source={{ uri: qrCodeImageUrl }}
                  style={styles.qrCodeImg}
                  resizeMode="contain"
                />
              ) : null}
            </View>

            <Text style={styles.codeLabel}>ALPHANUMERIC ROOM CODE</Text>
            <View style={styles.codeDisplayRow}>
              <Text style={styles.codeBigText}>{roomCode}</Text>
              <TouchableOpacity
                style={styles.copyCodeBtn}
                activeOpacity={0.8}
                onPress={handleShareRoomCode}
              >
                <IconCopy size={16} color={WHITE} />
                <Text style={styles.copyCodeBtnText}>
                  {copiedFeedback ? 'Shared!' : 'Share Code'}
                </Text>
              </TouchableOpacity>
            </View>

            {activeRoomData?.hasPassword && (
              <Text style={styles.passwordHintText}>
                Room Password: {activeRoomData.password}
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BLACK,
  },

  // 1. Top Header Bar
  topHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 14,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_GREY,
  },
  topCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: DARK_GREY,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  topHeaderCenter: {
    flex: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  topHeaderTitle: {
    color: WHITE,
    fontSize: 15,
    fontWeight: '900',
  },
  topStatusPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  liveGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: EMERALD,
  },
  topRoomCodeText: {
    color: TEXT_GREY,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  // 2. Player Wrapper
  playerSectionWrapper: {
    width: '100%',
    backgroundColor: BLACK,
  },
  playerFallbackBox: {
    width: '100%',
    height: 220,
    backgroundColor: BLACK,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // 3. Collapsible Episodes Dropdown (Play.js Style)
  dropdownWrapper: {
    width: '100%',
    backgroundColor: '#08080C',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER_GREY,
  },
  dropdownHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  dropdownHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dropdownHeaderTitle: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '900',
  },
  nowPlayingMiniBadge: {
    backgroundColor: 'rgba(229,9,20,0.18)',
    borderWidth: 1,
    borderColor: BRAND_RED,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  nowPlayingMiniText: {
    color: PURE_RED,
    fontSize: 10,
    fontWeight: '900',
  },
  dropdownHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dropdownToggleHint: {
    color: TEXT_GREY,
    fontSize: 12,
    fontWeight: '700',
  },
  dropdownExpandedBody: {
    maxHeight: 245,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingBottom: 6,
  },
  dropdownEpisodesList: {
    maxHeight: 190,
  },

  // Play.js Exact Episode & Chunk Styles
  chunkSelectorContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  chunkRectPill: {
    backgroundColor: '#161616',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  chunkRectPillActive: {
    backgroundColor: PURE_RED,
    borderColor: PURE_RED,
  },
  chunkRectPillText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '700',
  },
  chunkRectPillTextActive: {
    color: WHITE,
    fontWeight: '900',
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  bulletNumber: {
    color: WHITE,
    fontSize: 15,
    fontWeight: '800',
    minWidth: 26,
    marginRight: 6,
  },
  episodeCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  episodeCardActive: {
    borderColor: PURE_RED,
    backgroundColor: '#14080A',
  },
  episodeCardTitle: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    paddingRight: 8,
  },
  cardRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fillerTag: {
    backgroundColor: 'rgba(255,165,0,0.2)',
    borderWidth: 1,
    borderColor: '#FFA500',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  fillerTagText: {
    color: '#FFA500',
    fontSize: 9,
    fontWeight: '900',
  },

  // 4. 100,000x Live Chat Section
  chatMasterSection: {
    flex: 1,
    backgroundColor: '#050508',
  },
  chatTopSubheader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#0B0B10',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  chatSubheaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  chatPulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: PURE_RED,
  },
  chatSubheaderTitle: {
    color: WHITE,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  chatSwipeHint: {
    color: TEXT_GREY,
    fontSize: 10,
    fontWeight: '600',
  },
  avatarStackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stackedMiniAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: BLACK,
  },

  chatListArea: {
    flex: 1,
  },
  chatListContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  emptyChatWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 30,
  },
  emptyChatTitle: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptyChatSub: {
    color: TEXT_GREY,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },

  // Swipeable Message Bubbles
  messageSwipeWrapper: {
    position: 'relative',
    justifyContent: 'center',
    marginBottom: 10,
  },
  swipeReplyIconBadge: {
    position: 'absolute',
    left: 6,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(229,9,20,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PURE_RED,
  },
  messageRowContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  messageRowOther: {
    justifyContent: 'flex-start',
    paddingRight: 42,
  },
  messageRowMe: {
    justifyContent: 'flex-end',
    paddingLeft: 42,
  },
  chatAvatar: {
    width: 28,
    height: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  messageBubble: {
    maxWidth: '100%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  messageBubbleOther: {
    backgroundColor: '#13131C',
    borderColor: 'rgba(255,255,255,0.09)',
    borderBottomLeftRadius: 4,
  },
  messageBubbleMe: {
    backgroundColor: '#25090D',
    borderColor: 'rgba(229,9,20,0.45)',
    borderBottomRightRadius: 4,
  },
  senderHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  senderNameText: {
    color: '#F3F4F6',
    fontSize: 11,
    fontWeight: '800',
  },
  chatAdminTag: {
    backgroundColor: PURE_RED,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  chatAdminTagText: {
    color: WHITE,
    fontSize: 8,
    fontWeight: '900',
  },
  quotedReplyBox: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderLeftWidth: 3,
    borderLeftColor: PURE_RED,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 5,
  },
  quotedReplyBoxMe: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderLeftColor: WHITE,
  },
  quotedReplySender: {
    color: PURE_RED,
    fontSize: 10,
    fontWeight: '900',
  },
  quotedReplyText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
  },
  messageBodyText: {
    color: WHITE,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  messageMetaFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  editedBadgeText: {
    color: TEXT_GREY,
    fontSize: 9,
    fontStyle: 'italic',
  },
  timestampText: {
    color: TEXT_GREY,
    fontSize: 9,
    fontWeight: '700',
  },
  metaTextMe: {
    color: 'rgba(255,255,255,0.65)',
  },

  // Live Typing Indicator with Avatar & Wave Dots
  typingIndicatorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#0B0B12',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 8,
  },
  typingAvatarsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingUserAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PURE_RED,
  },
  typingStatusText: {
    color: '#D1D5DB',
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
  },
  typingDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 2,
  },
  typingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: PURE_RED,
  },

  // Reply / Edit Active Banner
  composerBannerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14141D',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: BORDER_GREY,
  },
  composerBannerAccent: {
    width: 3,
    height: 26,
    borderRadius: 2,
    backgroundColor: PURE_RED,
  },
  composerBannerLabel: {
    color: PURE_RED,
    fontSize: 11,
    fontWeight: '900',
  },
  composerBannerPreview: {
    color: TEXT_GREY,
    fontSize: 11,
    marginTop: 1,
  },
  composerBannerCancelBtn: {
    padding: 6,
  },

  // Composer Input Bar
  composerInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: CARD_BG,
    borderTopWidth: 1,
    borderTopColor: BORDER_GREY,
    gap: 8,
  },
  composerMyAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  composerTextInput: {
    flex: 1,
    backgroundColor: DARK_GREY,
    color: WHITE,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  composerSendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: PURE_RED,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Setup Mode Styles
  modeTabsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 14,
    backgroundColor: CARD_BG,
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  modeTabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  modeTabBtnActive: {
    backgroundColor: PURE_RED,
  },
  modeTabText: {
    color: TEXT_GREY,
    fontSize: 13,
    fontWeight: '800',
  },
  modeTabTextActive: {
    color: WHITE,
    fontWeight: '900',
  },
  setupCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER_GREY,
    marginBottom: 14,
  },
  hostProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  hostAvatar: {
    width: 46,
    height: 46,
    borderRadius: 8,
  },
  hostName: {
    color: WHITE,
    fontSize: 15,
    fontWeight: '800',
  },
  hostSubtext: {
    color: TEXT_GREY,
    fontSize: 12,
    marginTop: 2,
  },
  adminTagBadge: {
    backgroundColor: PURE_RED,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  adminTagText: {
    color: WHITE,
    fontSize: 9,
    fontWeight: '900',
  },
  inputLabel: {
    color: TEXT_GREY,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: DARK_GREY,
    color: WHITE,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  codeTextInput: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  epSelectHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '900',
  },
  selectAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: DARK_GREY,
    borderWidth: 1,
    borderColor: PURE_RED,
  },
  selectAllBtnActive: {
    backgroundColor: PURE_RED,
  },
  selectAllBtnText: {
    color: PURE_RED,
    fontSize: 11,
    fontWeight: '900',
  },
  epSelectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 16,
  },
  epSelectBox: {
    width: '23%',
    paddingVertical: 10,
    backgroundColor: CARD_BG,
    borderRadius: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  epSelectBoxActive: {
    backgroundColor: PURE_RED,
    borderColor: PURE_RED,
  },
  epSelectBoxText: {
    color: TEXT_GREY,
    fontSize: 12,
    fontWeight: '700',
  },
  epSelectBoxTextActive: {
    color: WHITE,
    fontWeight: '900',
  },
  primaryActionBtn: {
    backgroundColor: PURE_RED,
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  primaryActionBtnText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: '900',
  },

  // Modals (Message Actions, Settings, Members, Invite)
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  msgActionSheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  msgActionPreviewBox: {
    backgroundColor: DARK_GREY,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: PURE_RED,
  },
  msgActionPreviewSender: {
    color: TEXT_GREY,
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 2,
  },
  msgActionPreviewText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '600',
  },
  settingsSheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  settingsSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  settingsSheetTitle: {
    color: WHITE,
    fontSize: 17,
    fontWeight: '900',
  },
  closeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: DARK_GREY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_GREY,
  },
  settingsItemText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '700',
  },
  memberModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_GREY,
  },
  memberModalAvatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
  },
  memberModalName: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '800',
  },
  memberKickBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: PURE_RED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: PURE_RED,
  },
  inviteHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inviteTitle: {
    color: WHITE,
    fontSize: 18,
    fontWeight: '900',
  },
  inviteSubtitle: {
    color: TEXT_GREY,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 17,
  },
  qrFrameBox: {
    width: 200,
    height: 200,
    borderRadius: 12,
    backgroundColor: WHITE,
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  qrCodeImg: {
    width: '100%',
    height: '100%',
  },
  codeLabel: {
    color: TEXT_GREY,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 6,
  },
  codeDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DARK_GREY,
    borderRadius: 8,
    paddingLeft: 18,
    paddingRight: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: BORDER_GREY,
    width: '100%',
    justifyContent: 'space-between',
  },
  codeBigText: {
    color: WHITE,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
  },
  copyCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PURE_RED,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 6,
  },
  copyCodeBtnText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '900',
  },
  passwordHintText: {
    color: TEXT_GREY,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 12,
  },
});
