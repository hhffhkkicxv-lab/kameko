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
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Svg, { Path, Rect, Circle, Line, Polyline } from 'react-native-svg';
import { createAgoraRtcEngine, ClientRoleType, CHANNEL_PROFILE_TYPE } from 'react-native-agora';

// Load player from components/room/room_player.js
import RoomPlayer from '../components/room/room_player';

const { width } = Dimensions.get('window');

const BLACK = '#000000';
const CARD_BG = '#111115';
const DARK_GREY = '#18181E';
const BORDER_GREY = '#282832';
const TEXT_GREY = '#8E8E98';
const WHITE = '#FFFFFF';
const PURE_RED = '#FF0000';
const EMERALD = '#10B981';

const VERCEL_API_BASE = 'https://anikoto-api-lyart.vercel.app';
const EPISODE_CHUNK_SIZE = 50;

// Replace with your Agora App ID from the Agora Console
const AGORA_APP_ID = 'YOUR_AGORA_APP_ID_HERE';

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

// ============================================================================
// CUSTOM SVG ICONS
// ============================================================================
const IconBack = ({ size = 22, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);

const IconVerticalDots = ({ size = 22, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Circle cx="12" cy="5" r="2" />
    <Circle cx="12" cy="12" r="2" />
    <Circle cx="12" cy="19" r="2" />
  </Svg>
);

const IconCloseX = ({ size = 20, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <Line x1="18" y1="6" x2="6" y2="18" />
    <Line x1="6" y1="6" x2="18" y2="18" />
  </Svg>
);

const IconMicOn = ({ size = 18, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <Path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <Line x1="12" y1="19" x2="12" y2="23" />
    <Line x1="8" y1="23" x2="16" y2="23" />
  </Svg>
);

const IconMicOff = ({ size = 18, color = PURE_RED }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Line x1="1" y1="1" x2="23" y2="23" />
    <Path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
    <Path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
    <Line x1="12" y1="19" x2="12" y2="23" />
    <Line x1="8" y1="23" x2="16" y2="23" />
  </Svg>
);

const IconSpeakerOn = ({ size = 18, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M11 5L6 9H2v6h4l5 4V5z" />
    <Path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </Svg>
);

const IconSpeakerMuted = ({ size = 18, color = PURE_RED }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M11 5L6 9H2v6h4l5 4V5z" />
    <Line x1="23" y1="9" x2="17" y2="15" />
    <Line x1="17" y1="9" x2="23" y2="15" />
  </Svg>
);

const IconCopy = ({ size = 16, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Svg>
);

const IconTrash = ({ size = 14, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="3 6 5 6 21 6" />
    <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Svg>
);

const IconPlay = ({ size = 16, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M8 5v14l11-7z" />
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

  const [setupMode, setSetupMode] = useState('create');
  const [roomCode, setRoomCode] = useState(routeParams.roomCode || '');
  const [activeRoomData, setActiveRoomData] = useState(null);
  const [isInsideRoom, setIsInsideRoom] = useState(false);
  const [isCreatingOrJoining, setIsCreatingOrJoining] = useState(false);

  const [roomPasswordInput, setRoomPasswordInput] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinPasswordInput, setJoinPasswordInput] = useState('');

  const [allEpisodes, setAllEpisodes] = useState([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(true);
  const [providerAnimeId, setProviderAnimeId] = useState(animeDocId);
  const [selectedChunkIndex, setSelectedChunkIndex] = useState(0);
  const [selectedEpMap, setSelectedEpMap] = useState({});

  const [settingsMenuVisible, setSettingsMenuVisible] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [copiedFeedback, setCopiedFeedback] = useState(false);

  // --- AGORA VOICE CHAT STATES ---
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [muteEveryoneForMe, setMuteEveryoneForMe] = useState(false);
  const agoraEngineRef = useRef(null);

  // Active Episode Video Player + Live Chat State
  const [playingEpisode, setPlayingEpisode] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [streamReferer, setStreamReferer] = useState('https://vidwish.live/');
  const [loadingStream, setLoadingStream] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);

  // --- INITIALIZE AGORA RTC ENGINE ---
  useEffect(() => {
    let engine = null;
    const initAgora = async () => {
      try {
        engine = createAgoraRtcEngine();
        engine.initialize({ appId: AGORA_APP_ID });
        engine.setChannelProfile(CHANNEL_PROFILE_TYPE.channelProfileLiveBroadcasting);
        engine.enableAudio();
        engine.enableAudioVolumeIndication(200, 3, true);

        engine.registerEventHandler({
          onActiveSpeaker: (_, uid) => {
            if (uid === 0) setIsSpeaking(true);
          },
          onAudioVolumeIndication: (_, speakers) => {
            const speakingNow = speakers.some((s) => (s.volume || 0) > 10);
            setIsSpeaking(speakingNow);
          },
        });

        agoraEngineRef.current = engine;
      } catch (e) {
        console.warn('Agora Init Error:', e);
      }
    };

    initAgora();

    return () => {
      try {
        engine?.leaveChannel();
        engine?.release();
      } catch (_) {}
    };
  }, []);

  // Join Agora Channel when inside room
  useEffect(() => {
    if (!isInsideRoom || !roomCode || !agoraEngineRef.current) return;
    try {
      const numericUid = Math.abs(
        Array.from(memberKey).reduce((acc, char) => 0 | (31 * acc + char.charCodeAt(0)), 0)
      ) % 100000;

      agoraEngineRef.current.joinChannel('', String(roomCode), numericUid, {
        clientRoleType: ClientRoleType.ClientRoleBroadcaster,
      });
      agoraEngineRef.current.muteLocalAudioStream(true);
      setIsMicMuted(true);
    } catch (e) {
      console.warn('Agora Join Error:', e);
    }

    return () => {
      try {
        agoraEngineRef.current?.leaveChannel();
      } catch (_) {}
    };
  }, [isInsideRoom, roomCode, memberKey]);

  // Handle Mute / Unmute Mic with Agora
  const handleToggleMic = async () => {
    const nextMuted = !isMicMuted;
    setIsMicMuted(nextMuted);

    try {
      if (agoraEngineRef.current) {
        agoraEngineRef.current.muteLocalAudioStream(nextMuted);
      }
    } catch (_) {}

    if (roomCode) {
      firestore()
        .collection('rooms')
        .doc(roomCode)
        .set(
          {
            membersMap: {
              [memberKey]: {
                isMuted: nextMuted,
                isSpeaking: !nextMuted && isSpeaking,
              },
            },
          },
          { merge: true }
        )
        .catch(() => {});
    }
  };

  // Handle Mute Everyone For Me
  useEffect(() => {
    if (!agoraEngineRef.current) return;
    try {
      agoraEngineRef.current.adjustPlaybackSignalVolume(muteEveryoneForMe ? 0 : 100);
    } catch (_) {}
  }, [muteEveryoneForMe]);

  // Fetch Series Episodes for Room Creation
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
            matches.find((m) => (m.title || '').toLowerCase() === animeTitle.toLowerCase()) ||
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
          }));
          setAllEpisodes(formatted);
          setSelectedEpMap({ [formatted[0].num]: formatted[0] });
        } else if (isMounted) {
          const fallbackEp = [{ id: '1', slug: '1', num: 1, title: 'Episode 1' }];
          setAllEpisodes(fallbackEp);
          setSelectedEpMap({ 1: fallbackEp[0] });
        }
      } catch (_) {
        if (isMounted) {
          const fallbackEp = [{ id: '1', slug: '1', num: 1, title: 'Episode 1' }];
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

  const episodeChunks = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < allEpisodes.length; i += EPISODE_CHUNK_SIZE) {
      chunks.push(allEpisodes.slice(i, i + EPISODE_CHUNK_SIZE));
    }
    return chunks;
  }, [allEpisodes]);

  const currentChunkEpisodes = episodeChunks[selectedChunkIndex] || allEpisodes;

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

  // Create Room in Firestore
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
        isMuted: true,
        isSpeaking: false,
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
        kickedKeys: [],
        currentEpisode: chosenList[0],
        playbackState: {
          isPlaying: false,
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
      setIsInsideRoom(true);
      setInviteModalVisible(true);
    } catch (err) {
      Alert.alert('Room Error', `Could not create room: ${err.message}`);
    } finally {
      setIsCreatingOrJoining(false);
    }
  };

  // Join Existing Room
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
        isMuted: true,
        isSpeaking: false,
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
      setIsInsideRoom(true);
    } catch (err) {
      Alert.alert('Join Error', `Could not join room: ${err.message}`);
    } finally {
      setIsCreatingOrJoining(false);
    }
  };

  // Real-Time Room Document & Live Chat Subscription
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
      .limitToLast(100)
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

  // Resolve Stream When Episode is Selected
  useEffect(() => {
    if (!isInsideRoom || !playingEpisode || !activeRoomData) return;
    let isMounted = true;

    const loadRoomEpisodeStream = async () => {
      setLoadingStream(true);
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
      if (isMounted) setLoadingStream(false);
    };

    loadRoomEpisodeStream();
    return () => { isMounted = false; };
  }, [isInsideRoom, playingEpisode?.num, activeRoomData?.providerAnimeId]);

  const isCurrentUserAdmin = activeRoomData?.adminKey === memberKey;

  const joinedMembersList = useMemo(() => {
    if (!activeRoomData?.membersMap) return [];
    const list = Object.values(activeRoomData.membersMap);
    return list.sort((a, b) => {
      if (a.isAdmin && !b.isAdmin) return -1;
      if (!a.isAdmin && b.isAdmin) return 1;
      return (a.joinedAt || 0) - (b.joinedAt || 0);
    });
  }, [activeRoomData?.membersMap]);

  const handleAdminDeleteUser = (targetMember) => {
    if (!isCurrentUserAdmin || !targetMember || targetMember.key === memberKey) return;

    Alert.alert(
      'Remove User',
      `Remove ${targetMember.name} from the room?`,
      [
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
      ]
    );
  };

  const handleLeaveOrCloseRoom = async () => {
    setSettingsMenuVisible(false);
    try {
      agoraEngineRef.current?.leaveChannel();
    } catch (_) {}

    if (!roomCode) {
      if (onBack) onBack();
      return;
    }

    const roomRef = firestore().collection('rooms').doc(roomCode);

    if (isCurrentUserAdmin) {
      Alert.alert(
        'Close Room',
        'Closing the room will end the watch party for all joined members. Continue?',
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

  const handleSelectRoomEpisode = async (ep) => {
    setPlayingEpisode(ep);
    if (isCurrentUserAdmin && roomCode) {
      try {
        await firestore()
          .collection('rooms')
          .doc(roomCode)
          .update({
            currentEpisode: ep,
            playbackState: {
              isPlaying: true,
              positionMillis: 0,
              updatedAt: Date.now(),
            },
          });
      } catch (_) {}
    }
  };

  const handleCopyRoomCode = async () => {
    if (!roomCode) return;
    setCopiedFeedback(true);
    setTimeout(() => setCopiedFeedback(false), 2000);
    try {
      await Share.share({
        message: `Join my Kameko Watch Room for ${animeTitle}! Room Code: ${roomCode}`,
      });
    } catch (_) {}
  };

  const qrCodeImageUrl = roomCode
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=${encodeURIComponent(
        `KAMEKO_ROOM:${roomCode}`
      )}`
    : '';

  // Setup View
  if (!isInsideRoom) {
    const selectedCount = Object.keys(selectedEpMap).length;

    return (
      <View style={styles.container}>
        <StatusBar hidden={true} />
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.iconCircleBtn}
            onPress={onBack || (() => navigation?.goBack?.())}
          >
            <IconBack />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Watch Room • {animeTitle}
          </Text>
          <View style={{ width: 38 }} />
        </View>

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
                      <Text style={styles.adminTagText}>ADMIN</Text>
                    </View>
                  </View>
                  <Text style={styles.hostSubtext}>Hosting {animeTitle}</Text>
                </View>
              </View>

              <Text style={styles.inputLabel}>Room Password (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Leave blank for open room..."
                placeholderTextColor={TEXT_GREY}
                value={roomPasswordInput}
                onChangeText={setRoomPasswordInput}
                secureTextEntry={false}
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

            {episodeChunks.length > 1 && (
              <View style={{ marginBottom: 10 }}>
                <FlatList
                  horizontal
                  data={episodeChunks}
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(_, idx) => `setup-chunk-${idx}`}
                  contentContainerStyle={{ gap: 8 }}
                  renderItem={({ item, index }) => {
                    const label = `${item[0].num} - ${item[item.length - 1].num}`;
                    const isActive = selectedChunkIndex === index;
                    return (
                      <TouchableOpacity
                        style={[styles.chunkPill, isActive && styles.chunkPillActive]}
                        onPress={() => setSelectedChunkIndex(index)}
                      >
                        <Text style={[styles.chunkPillText, isActive && styles.chunkPillTextActive]}>
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
                {currentChunkEpisodes.map((ep) => {
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
                  Create Room ({selectedCount} {selectedCount === 1 ? 'Episode' : 'Episodes'})
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
                Room Password (If required)
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter password if locked..."
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

  // Active Room View
  const roomEpisodes = activeRoomData?.episodes || [];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar hidden={true} />

      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.iconCircleBtn} onPress={handleLeaveOrCloseRoom}>
          <IconBack />
        </TouchableOpacity>

        <View style={styles.headerCenterCol}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {activeRoomData?.animeTitle || animeTitle}
          </Text>
          <Text style={styles.headerRoomCodeSub}>
            ROOM: {roomCode} • {joinedMembersList.length} ONLINE
          </Text>
        </View>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={[
              styles.iconCircleBtn,
              !isMicMuted && styles.micActiveCircle,
              isSpeaking && styles.micSpeakingBorder,
            ]}
            onPress={handleToggleMic}
          >
            {isMicMuted ? <IconMicOff size={17} /> : <IconMicOn size={17} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconCircleBtn}
            onPress={() => setMuteEveryoneForMe(!muteEveryoneForMe)}
          >
            {muteEveryoneForMe ? <IconSpeakerMuted size={17} /> : <IconSpeakerOn size={17} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconCircleBtn}
            onPress={() => setSettingsMenuVisible(true)}
          >
            <IconVerticalDots size={20} color={WHITE} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Load Super Lightweight RoomPlayer Component */}
      {playingEpisode && (
        <RoomPlayer
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
      )}

      <View style={styles.membersSliderSection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            Joined Members ({joinedMembersList.length})
          </Text>
          {muteEveryoneForMe && (
            <Text style={styles.deafenedNoticeText}>Everyone Muted For You</Text>
          )}
        </View>

        <FlatList
          horizontal
          data={joinedMembersList}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.membersSliderContent}
          renderItem={({ item }) => {
            const isMe = item.key === memberKey;
            const effectiveMuted = isMe
              ? isMicMuted
              : muteEveryoneForMe || item.isMuted;
            const effectiveSpeaking = !effectiveMuted && (isMe ? isSpeaking : item.isSpeaking);

            return (
              <View style={styles.memberCard}>
                <View
                  style={[
                    styles.memberAvatarWrap,
                    effectiveSpeaking && styles.memberAvatarSpeaking,
                  ]}
                >
                  <Image
                    source={AVATARS[item.avatar] || AVATARS['pfp1.jpg']}
                    style={styles.memberAvatarImg}
                  />

                  {item.isAdmin && (
                    <View style={styles.memberAdminRibbon}>
                      <Text style={styles.memberAdminRibbonText}>ADMIN</Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.memberMicBadge,
                      !effectiveMuted && { backgroundColor: EMERALD },
                    ]}
                  >
                    {effectiveMuted ? (
                      <IconMicOff size={10} color={WHITE} />
                    ) : (
                      <IconMicOn size={10} color={WHITE} />
                    )}
                  </View>

                  {isCurrentUserAdmin && !isMe && (
                    <TouchableOpacity
                      style={styles.kickMemberBtn}
                      onPress={() => handleAdminDeleteUser(item)}
                    >
                      <IconTrash size={11} color={WHITE} />
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={styles.memberNameText} numberOfLines={1}>
                  {isMe ? `${item.name} (You)` : item.name}
                </Text>
              </View>
            );
          }}
        />
      </View>

      <View style={styles.roomEpisodesSection}>
        <Text style={[styles.sectionTitle, { paddingHorizontal: 16, marginBottom: 10 }]}>
          Room Episodes ({roomEpisodes.length})
        </Text>

        <FlatList
          data={roomEpisodes}
          keyExtractor={(item) => String(item.num)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isNowPlaying = playingEpisode && Number(playingEpisode.num) === Number(item.num);
            return (
              <TouchableOpacity
                style={[styles.roomEpRow, isNowPlaying && styles.roomEpRowActive]}
                activeOpacity={0.85}
                onPress={() => handleSelectRoomEpisode(item)}
              >
                <View style={[styles.roomEpNumBox, isNowPlaying && { backgroundColor: PURE_RED }]}>
                  <Text style={styles.roomEpNumText}>{item.num}</Text>
                </View>

                <View style={{ flex: 1, paddingHorizontal: 12 }}>
                  <Text style={styles.roomEpTitle} numberOfLines={1}>
                    {item.title || `Episode ${item.num}`}
                  </Text>
                  {isNowPlaying && (
                    <Text style={styles.roomEpPlayingSub}>NOW PLAYING IN ROOM</Text>
                  )}
                </View>

                <IconPlay size={18} color={isNowPlaying ? PURE_RED : WHITE} />
              </TouchableOpacity>
            );
          }}
        />
      </View>

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
              <Text style={styles.settingsItemText}>Invite (QR & Room Code)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingsItemRow}
              onPress={() => {
                handleToggleMic();
                setSettingsMenuVisible(false);
              }}
            >
              {isMicMuted ? <IconMicOn size={18} color={WHITE} /> : <IconMicOff size={18} color={PURE_RED} />}
              <Text style={styles.settingsItemText}>
                {isMicMuted ? 'Unmute My Microphone' : 'Mute My Microphone'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingsItemRow}
              onPress={() => {
                setMuteEveryoneForMe(!muteEveryoneForMe);
                setSettingsMenuVisible(false);
              }}
            >
              {muteEveryoneForMe ? (
                <IconSpeakerOn size={18} color={WHITE} />
              ) : (
                <IconSpeakerMuted size={18} color={PURE_RED} />
              )}
              <Text style={styles.settingsItemText}>
                {muteEveryoneForMe ? 'Unmute Everyone For Me' : 'Mute Everyone For Me'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingsItemRow, { borderBottomWidth: 0 }]}
              onPress={handleLeaveOrCloseRoom}
            >
              <IconTrash size={18} color={PURE_RED} />
              <Text style={[styles.settingsItemText, { color: PURE_RED }]}>
                {isCurrentUserAdmin ? 'Close Room for Everyone' : 'Leave Room'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
                <IconCloseX size={20} color={WHITE} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inviteSubtitle}>
              Scan this QR code or enter the alphanumeric code to join {animeTitle}
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
                onPress={handleCopyRoomCode}
              >
                <IconCopy size={16} color={WHITE} />
                <Text style={styles.copyCodeBtnText}>
                  {copiedFeedback ? 'Shared!' : 'Share / Copy'}
                </Text>
              </TouchableOpacity>
            </View>

            {activeRoomData?.hasPassword && (
              <Text style={styles.passwordHintText}>
                Password Protected: {activeRoomData.password}
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BLACK },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 36,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_GREY,
  },
  iconCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: DARK_GREY,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  micActiveCircle: { backgroundColor: 'rgba(16,185,129,0.18)', borderColor: EMERALD },
  micSpeakingBorder: { borderWidth: 2, borderColor: EMERALD },
  headerCenterCol: { flex: 1, paddingHorizontal: 12 },
  headerTitle: { color: WHITE, fontSize: 16, fontWeight: '900' },
  headerRoomCodeSub: { color: PURE_RED, fontSize: 10, fontWeight: '800', marginTop: 2, letterSpacing: 0.6 },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  modeTabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  modeTabBtnActive: { backgroundColor: PURE_RED },
  modeTabText: { color: TEXT_GREY, fontSize: 13, fontWeight: '800' },
  modeTabTextActive: { color: WHITE, fontWeight: '900' },
  setupCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER_GREY,
    marginBottom: 14,
  },
  hostProfileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  hostAvatar: { width: 46, height: 46, borderRadius: 8 },
  hostName: { color: WHITE, fontSize: 15, fontWeight: '800' },
  hostSubtext: { color: TEXT_GREY, fontSize: 12, marginTop: 2 },
  adminTagBadge: { backgroundColor: PURE_RED, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  adminTagText: { color: WHITE, fontSize: 9, fontWeight: '900' },
  inputLabel: { color: TEXT_GREY, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6 },
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
  codeTextInput: { fontSize: 18, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  epSelectHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { color: WHITE, fontSize: 14, fontWeight: '900' },
  selectAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: DARK_GREY,
    borderWidth: 1,
    borderColor: PURE_RED,
  },
  selectAllBtnActive: { backgroundColor: PURE_RED },
  selectAllBtnText: { color: PURE_RED, fontSize: 11, fontWeight: '900' },
  chunkPill: {
    backgroundColor: DARK_GREY,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  chunkPillActive: { backgroundColor: PURE_RED, borderColor: PURE_RED },
  chunkPillText: { color: TEXT_GREY, fontSize: 12, fontWeight: '700' },
  chunkPillTextActive: { color: WHITE, fontWeight: '900' },
  epSelectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 16 },
  epSelectBox: {
    width: '23%',
    paddingVertical: 10,
    backgroundColor: CARD_BG,
    borderRadius: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  epSelectBoxActive: { backgroundColor: PURE_RED, borderColor: PURE_RED },
  epSelectBoxText: { color: TEXT_GREY, fontSize: 12, fontWeight: '700' },
  epSelectBoxTextActive: { color: WHITE, fontWeight: '900' },
  primaryActionBtn: {
    backgroundColor: PURE_RED,
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  primaryActionBtnText: { color: WHITE, fontSize: 15, fontWeight: '900' },
  membersSliderSection: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER_GREY },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  deafenedNoticeText: { color: PURE_RED, fontSize: 11, fontWeight: '800' },
  membersSliderContent: { paddingHorizontal: 16, gap: 14 },
  memberCard: { width: 74, alignItems: 'center' },
  memberAvatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 12,
    position: 'relative',
    backgroundColor: DARK_GREY,
    borderWidth: 2,
    borderColor: BORDER_GREY,
  },
  memberAvatarSpeaking: { borderColor: EMERALD },
  memberAvatarImg: { width: '100%', height: '100%', borderRadius: 10 },
  memberAdminRibbon: {
    position: 'absolute',
    top: -6,
    alignSelf: 'center',
    backgroundColor: PURE_RED,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 3,
  },
  memberAdminRibbonText: { color: WHITE, fontSize: 8, fontWeight: '900' },
  memberMicBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: PURE_RED,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BLACK,
  },
  kickMemberBtn: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: PURE_RED,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BLACK,
  },
  memberNameText: { color: WHITE, fontSize: 11, fontWeight: '700', marginTop: 7, textAlign: 'center' },
  roomEpisodesSection: { flex: 1, paddingTop: 12 },
  roomEpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  roomEpRowActive: { borderColor: PURE_RED, backgroundColor: '#170E10' },
  roomEpNumBox: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: DARK_GREY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roomEpNumText: { color: WHITE, fontSize: 13, fontWeight: '900' },
  roomEpTitle: { color: WHITE, fontSize: 13, fontWeight: '700' },
  roomEpPlayingSub: { color: PURE_RED, fontSize: 9, fontWeight: '900', marginTop: 2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  settingsSheet: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  settingsSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  settingsSheetTitle: { color: WHITE, fontSize: 17, fontWeight: '900' },
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
  settingsItemText: { color: WHITE, fontSize: 14, fontWeight: '700' },
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
  inviteHeaderRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  inviteTitle: { color: WHITE, fontSize: 18, fontWeight: '900' },
  inviteSubtitle: { color: TEXT_GREY, fontSize: 12, textAlign: 'center', marginBottom: 16, lineHeight: 17 },
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
  qrCodeImg: { width: '100%', height: '100%' },
  codeLabel: { color: TEXT_GREY, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
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
  codeBigText: { color: WHITE, fontSize: 22, fontWeight: '900', letterSpacing: 3 },
  copyCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PURE_RED,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 6,
  },
  copyCodeBtnText: { color: WHITE, fontSize: 13, fontWeight: '900' },
  passwordHintText: { color: TEXT_GREY, fontSize: 12, fontWeight: '700', marginTop: 12 },
});
