import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Animated, 
  Dimensions, StatusBar, BackHandler
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import * as FileSystem from 'expo-file-system';
import Slider from '@react-native-community/slider';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Svg, { Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';

import AspectRatioButton from './aspect-ratio';
import LockButton from './lock';
import VideoQualitySheet from './video_quality';
import SubtitleSheet from './subtitle';
import AudioSheet from './audio';
import SpeedSheet from './speed';
import SkipIntroOutro from './intro-outro';
import PlayPauseSkip from './play-pause-skip';

let AsyncStorage = null;
try {
  const mod = require('@react-native-async-storage/async-storage');
  AsyncStorage = mod?.default || mod;
} catch (_) {}

const BRAND_RED = '#E50914';
const VERCEL_API_BASE = 'https://anikoto-api-lyart.vercel.app';
const WATCH_HISTORY_COLLECTION = 'watch_history';
const DOWNLOAD_QUEUE_STORAGE_KEY = '@kameko_downloads_queue_v1';
const DOWNLOAD_QUEUE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}kameko_downloads_queue.json`
  : null;

// --- OFFLINE SUBTITLE (.VTT / .SRT) PARSER ---
const parseTimeToSeconds = (timeStr) => {
  const cleanTimeStr = (timeStr || '').trim().split(/\s+/)[0].replace(',', '.');
  const parts = cleanTimeStr.split(':');
  let seconds = NaN;
  if (parts.length === 3) {
    seconds = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return Number.isFinite(seconds) ? seconds : NaN;
};

const parseVttTextToCues = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return [];
  const cues = [];
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  let currentCue = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('-->')) {
      const [startStr, endStr] = line.split('-->');
      const start = parseTimeToSeconds(startStr);
      const end = parseTimeToSeconds(endStr);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        currentCue = { start, end, text: '' };
        cues.push(currentCue);
      }
    } else if (currentCue && line.trim() === '') {
      currentCue.text = currentCue.text.trim();
      currentCue = null;
    } else if (currentCue) {
      const cleanText = line.replace(/<[^>]*>/g, '');
      currentCue.text += (currentCue.text ? '\n' : '') + cleanText;
    }
  }
  if (currentCue) currentCue.text = currentCue.text.trim();
  return cues.filter(c => c.text.length > 0);
};

const readLocalDownloadsQueue = async () => {
  try {
    if (AsyncStorage?.getItem) {
      const raw = await AsyncStorage.getItem(DOWNLOAD_QUEUE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch (_) {}

  try {
    if (DOWNLOAD_QUEUE_FILE_URI) {
      const info = await FileSystem.getInfoAsync(DOWNLOAD_QUEUE_FILE_URI);
      if (info.exists) {
        const raw = await FileSystem.readAsStringAsync(DOWNLOAD_QUEUE_FILE_URI);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      }
    }
  } catch (_) {}

  return [];
};

// Icons
const IconBack = ({ size = 28 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5">
    <Path d="M19 12H5M12 19l-7-7 7-7" />
  </Svg>
);
const IconSubs = ({ size = 24, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <Rect x="3" y="5" width="18" height="14" rx="2" ry="2"/>
    <Path d="M7 15h3m4 0h3M7 9h10"/>
  </Svg>
);
const IconAudio = ({ size = 24, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <Path d="M3 18v-6a9 9 0 0118 0v6"/>
    <Path d="M21 19a2 2 0 01-2 2h-1v-6h3v4zM3 19a2 2 0 002 2h1v-6H3v4z"/>
  </Svg>
);
const IconNextEp = ({ size = 22, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
  </Svg>
);

const formatTime = (millis) => {
  if (isNaN(millis) || millis < 0) return "00:00";
  const totalSecs = Math.floor(millis / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSecs % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
};

export default function Player({
  route,
  navigation,
  user: propUser,
  activeProfile: propActiveProfile,
  currentProfile: propCurrentProfile,
  activeProfileId: propActiveProfileId,
}) {
  const params = route?.params || {};

  const { 
    animeTitle = 'Unknown', 
    animeId = null,
    id: paramId = null,
    userUid = null,
    uid: paramUid = null,
    user: paramUser = null,
    activeProfileId = null, 
    profileId: paramProfileId = null,
    currentProfileId: paramCurrentProfileId = null,
    activeProfile: paramActiveProfile = null,
    currentProfile: paramCurrentProfile = null,
    animeBackdrop = null, 
    coverImage = null,
    backdropUrl = null,
    backdrop = null,
    targetType = 'sub',
    activeUrl: paramActiveUrl = null,
    streamUrl: paramStreamUrl = null,
    localUri: paramLocalUri = null,
    localMetaUri: paramLocalMetaUri = null,
    localSubtitleUri: paramLocalSubtitleUri = null,
    isOffline: paramIsOffline = false,
  } = params;

  const initialOfflineUri =
    paramLocalUri ||
    (paramActiveUrl && String(paramActiveUrl).startsWith('file://') ? paramActiveUrl : null) ||
    (paramStreamUrl && String(paramStreamUrl).startsWith('file://') ? paramStreamUrl : null) ||
    null;

  const [isOfflineMode, setIsOfflineMode] = useState(
    Boolean(paramIsOffline || initialOfflineUri)
  );
  const [offlineStreamUri, setOfflineStreamUri] = useState(initialOfflineUri);
  const [offlineMetaUri, setOfflineMetaUri] = useState(paramLocalMetaUri || null);
  const [offlineSubUri, setOfflineSubUri] = useState(paramLocalSubtitleUri || null);

  // 1. Resolve User UID & Current Profile ID
  const [resolvedUid, setResolvedUid] = useState(() =>
    userUid ||
    paramUid ||
    paramUser?.uid ||
    propUser?.uid ||
    auth().currentUser?.uid ||
    null
  );

  const [currentProfileId, setCurrentProfileId] = useState(() =>
    activeProfileId ||
    paramProfileId ||
    paramCurrentProfileId ||
    propActiveProfileId ||
    paramActiveProfile?.id ||
    paramCurrentProfile?.id ||
    propActiveProfile?.id ||
    propCurrentProfile?.id ||
    null
  );

  const [resolvedBackdrop, setResolvedBackdrop] = useState(
    () => animeBackdrop || backdropUrl || backdrop || coverImage || ''
  );

  useEffect(() => {
    const incomingUid =
      userUid || paramUid || paramUser?.uid || propUser?.uid || auth().currentUser?.uid;
    if (incomingUid && incomingUid !== resolvedUid) {
      setResolvedUid(String(incomingUid));
    }

    const incomingProfId =
      activeProfileId ||
      paramProfileId ||
      paramCurrentProfileId ||
      propActiveProfileId ||
      paramActiveProfile?.id ||
      paramCurrentProfile?.id ||
      propActiveProfile?.id ||
      propCurrentProfile?.id;
    if (incomingProfId && String(incomingProfId) !== String(currentProfileId)) {
      setCurrentProfileId(String(incomingProfId));
    }
  }, [
    userUid,
    paramUid,
    paramUser?.uid,
    propUser?.uid,
    activeProfileId,
    paramProfileId,
    paramCurrentProfileId,
    propActiveProfileId,
    paramActiveProfile?.id,
    paramCurrentProfile?.id,
    propActiveProfile?.id,
    propCurrentProfile?.id,
  ]);

  // Fallback: Fetch activeProfileId from users/{uid} if not passed
  useEffect(() => {
    let isMounted = true;
    const ensureProfileId = async () => {
      const uid = resolvedUid || auth().currentUser?.uid;
      if (!uid || currentProfileId) return;

      try {
        const userDoc = await firestore().collection('users').doc(String(uid)).get();
        if (userDoc.exists) {
          const uData = userDoc.data();
          const savedProfId = uData?.activeProfileId || uData?.activeProfile?.id;
          if (savedProfId && isMounted) {
            setCurrentProfileId(String(savedProfId));
            return;
          }
        }

        const profSnap = await firestore()
          .collection('users')
          .doc(String(uid))
          .collection('profiles')
          .limit(1)
          .get();

        if (!profSnap.empty && isMounted) {
          setCurrentProfileId(String(profSnap.docs[0].id));
        }
      } catch (_) {}
    };

    ensureProfileId();
    return () => { isMounted = false; };
  }, [resolvedUid, currentProfileId]);

  // SEAMLESS BINGE STATE
  const [currentEpNum, setCurrentEpNum] = useState(params.episodeNum || 1);
  const [currentSlug, setCurrentSlug] = useState(params.slug || null);
  const [currentEpTitle, setCurrentEpTitle] = useState(params.episodeTitle || params.epTitle || '');

  const videoRef = useRef(null);
  const uiOpacity = useRef(new Animated.Value(1)).current;
  const nextEpOpacity = useRef(new Animated.Value(0.25)).current;
  
  const [status, setStatus] = useState({});
  const [showUI, setShowUI] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [resizeMode, setResizeMode] = useState(ResizeMode.CONTAIN);
  const [activeMenu, setActiveMenu] = useState(null); 
  const [selectedAudioType, setSelectedAudioType] = useState(targetType || 'sub');
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [is2xActive, setIs2xActive] = useState(false);
  
  const previousSpeedRef = useRef(1.0);
  const lastPositionRef = useRef(params.progress ? Number(params.progress) * 1000 : 0);
  const lastDurationRef = useRef(params.duration ? Number(params.duration) * 1000 : 0);
  const lastSavedTimeRef = useRef(0); 

  const [providerId, setProviderId] = useState(params.providerId || null);
  const [hasNextEpisode, setHasNextEpisode] = useState(false);
  const [nextEpisodeData, setNextEpisodeData] = useState(null);

  const [streamData, setStreamData] = useState(null);
  const [loadingStream, setLoadingStream] = useState(true);
  const [activeUrl, setActiveUrl] = useState(null); 
  const [qualityList, setQualityList] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState('Auto');
  const [currentAutoRes, setCurrentAutoRes] = useState('1080p');

  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [parsedSubs, setParsedSubs] = useState([]);
  const [currentSubText, setCurrentSubText] = useState('');
  const [subSettings, setSubSettings] = useState({ 
    color: '#FFFFFF', size: 16, height: 40, fontFamily: 'normal', backgroundColor: 'transparent'
  });

  const hideUITimeout = useRef(null);
  const longPressTimerRef = useRef(null);
  const didTriggerLongPressRef = useRef(false);
  const touchStartTimeRef = useRef(0);
  const touchStartPosRef = useRef({ x: 0, y: 0 });

  const activeMenuRef = useRef(activeMenu);
  const isLockedRef = useRef(isLocked);
  const showUIRef = useRef(showUI);
  useEffect(() => { activeMenuRef.current = activeMenu; }, [activeMenu]);
  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);
  useEffect(() => { showUIRef.current = showUI; }, [showUI]);

  const effectiveAnimeId = String(animeId || paramId || providerId || 'unknown');

  const latestMetaRef = useRef({});
  useEffect(() => {
    latestMetaRef.current = {
      uid: resolvedUid,
      profileId: currentProfileId,
      animeId: effectiveAnimeId,
      animeTitle: String(animeTitle || 'Unknown'),
      epNum: Number(currentEpNum || 1),
      epTitle: String(currentEpTitle || `Episode ${currentEpNum || 1}`),
      slug: String(currentSlug ? currentSlug : currentEpNum),
      backdrop: String(resolvedBackdrop || ''),
      audioType: String(selectedAudioType || 'sub'),
    };
  }, [
    resolvedUid,
    currentProfileId,
    effectiveAnimeId,
    animeTitle,
    currentEpNum,
    currentEpTitle,
    currentSlug,
    resolvedBackdrop,
    selectedAudioType,
  ]);

  // --- SAVE EVERY EPISODE'S PROGRESS (INCLUDING WATCHED EPISODES) FOR THE CURRENT PROFILE ---
  const saveWatchHistory = useCallback((positionMillis, durationMillis, force = false) => {
    const meta = latestMetaRef.current;
    if (!meta.uid || !meta.profileId || !meta.animeId || meta.animeId === 'unknown') return;

    const posMs = Math.max(0, Number(positionMillis || 0));
    const durMs = Math.max(0, Number(durationMillis || lastDurationRef.current || 0));
    const currentSecs = Math.floor(posMs / 1000);
    const durationSecs = Math.max(1, Math.floor(durMs / 1000));

    if (!force && currentSecs <= 0) return;

    const isCompleted = durMs > 10000 && currentSecs >= Math.floor(durationSecs * 0.85);
    const now = Date.now();
    const epDocId = `${meta.animeId}_ep_${meta.epNum}`;

    const episodePayload = {
      id: epDocId,
      animeId: String(meta.animeId),
      profileId: String(meta.profileId),
      animeTitle: meta.animeTitle,
      title: meta.animeTitle,
      episodeTitle: meta.epTitle,
      epTitle: meta.epTitle,
      episodeNum: meta.epNum,
      lastWatchedEp: meta.epNum,
      slug: meta.slug,
      backdropUrl: meta.backdrop,
      backdrop: meta.backdrop,
      progress: currentSecs,
      duration: durationSecs,
      positionMillis: Math.floor(posMs),
      durationMillis: Math.floor(durMs),
      formattedTimestamp: formatTime(posMs),
      formattedDuration: formatTime(durMs),
      finishedEp: Boolean(isCompleted),
      watched: true,
      audioType: meta.audioType,
      timestamp: now,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    };

    // Series-level document keeps the latest watched state + an `episodes` map of every episode's progress
    const seriesPayload = {
      ...episodePayload,
      episodes: {
        [String(meta.epNum)]: {
          episodeNum: meta.epNum,
          episodeTitle: meta.epTitle,
          slug: meta.slug,
          progress: currentSecs,
          duration: durationSecs,
          positionMillis: Math.floor(posMs),
          durationMillis: Math.floor(durMs),
          formattedTimestamp: formatTime(posMs),
          formattedDuration: formatTime(durMs),
          finishedEp: Boolean(isCompleted),
          watched: true,
          timestamp: now,
        },
      },
    };

    const currentProfileRef = firestore()
      .collection('users')
      .doc(String(meta.uid))
      .collection('profiles')
      .doc(String(meta.profileId));

    // 1. Save individual episode document so every episode's progress (even watched ones) is permanently stored
    currentProfileRef
      .collection(WATCH_HISTORY_COLLECTION)
      .doc(epDocId)
      .set(episodePayload, { merge: true })
      .catch(() => {});

    currentProfileRef
      .collection('progress')
      .doc(epDocId)
      .set(episodePayload, { merge: true })
      .catch(() => {});

    // 2. Save series-level summary + episodes map for ContinueWatching & Play.js
    currentProfileRef
      .collection(WATCH_HISTORY_COLLECTION)
      .doc(String(meta.animeId))
      .set(seriesPayload, { merge: true })
      .catch(() => {});

    currentProfileRef
      .collection('progress')
      .doc(String(meta.animeId))
      .set(seriesPayload, { merge: true })
      .catch(() => {});
  }, []);

  const navigationRef = useRef(navigation);
  const saveHistoryRef = useRef(saveWatchHistory);
  useEffect(() => { navigationRef.current = navigation; }, [navigation]);
  useEffect(() => { saveHistoryRef.current = saveWatchHistory; }, [saveWatchHistory]);

  // 1. Full Screen Lock & Hardware Back Handler (Runs strictly ONCE on mount)
  useEffect(() => {
    const lockLandscape = async () => {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch (_) {}
    };
    lockLandscape();

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeMenuRef.current) { 
        setActiveMenu(null); 
        return true; 
      }
      if (isLockedRef.current) { 
        setIsLocked(false); 
        setShowUI(true);
        Animated.timing(uiOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
        return true; 
      }
      if (saveHistoryRef.current) {
        saveHistoryRef.current(lastPositionRef.current, lastDurationRef.current);
      }
      if (navigationRef.current?.goBack) {
        navigationRef.current.goBack();
      }
      return true;
    });

    return () => {
      if (saveHistoryRef.current) {
        saveHistoryRef.current(lastPositionRef.current, lastDurationRef.current);
      }
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
        .catch(() => ScreenOrientation.unlockAsync().catch(() => {}));
      backHandler.remove();
    };
  }, []);

  // 2. Identify Next Episode (Supports both Offline Downloaded Queue & Online API)
  useEffect(() => {
    let isMounted = true;

    const resolveNextEpisode = async () => {
      try {
        const localDownloads = await readLocalDownloadsQueue();
        const nextOfflineEp = localDownloads.find(
          d =>
            d.status === 'completed' &&
            d.localUri &&
            (String(d.animeId) === String(effectiveAnimeId) ||
              (d.animeTitle || '').toLowerCase() === (animeTitle || '').toLowerCase()) &&
            Number(d.episodeNum) === Number(currentEpNum) + 1
        );

        if (nextOfflineEp && isMounted) {
          setNextEpisodeData({
            num: nextOfflineEp.episodeNum,
            title: nextOfflineEp.episodeTitle || `Episode ${nextOfflineEp.episodeNum}`,
            slug: nextOfflineEp.slug || nextOfflineEp.episodeNum,
            isOffline: true,
            localUri: nextOfflineEp.localUri,
            localMetaUri: nextOfflineEp.localMetaUri || null,
            localSubtitleUri: nextOfflineEp.localSubtitleUri || null,
            quality: nextOfflineEp.quality || '1080p',
          });
          setHasNextEpisode(true);
          Animated.timing(nextEpOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
          if (isOfflineMode) return;
        }
      } catch (_) {}

      if (isOfflineMode) {
        if (isMounted) {
          setHasNextEpisode(false);
          Animated.timing(nextEpOpacity, { toValue: 0.25, duration: 300, useNativeDriver: true }).start();
        }
        return;
      }

      try {
        let targetId = animeId || paramId;
        const searchRes = await fetch(`${VERCEL_API_BASE}/api/search?keyword=${encodeURIComponent(animeTitle)}`);
        const searchJson = await searchRes.json();
        const matches = searchJson?.data || [];
        if (matches.length > 0) {
          const exact = matches.find(m => (m.title || '').toLowerCase() === animeTitle.toLowerCase()) || matches[0];
          targetId = exact.id;
          if (!resolvedBackdrop && (exact.poster || exact.image) && isMounted) {
            setResolvedBackdrop(exact.poster || exact.image);
          }
        }

        if (isMounted && targetId) setProviderId(targetId);
        if (!targetId) return;

        const epRes = await fetch(`${VERCEL_API_BASE}/api/episodes/${encodeURIComponent(targetId)}`);
        const epJson = await epRes.json();
        const list = epJson?.data || [];

        if (isMounted && Array.isArray(list)) {
          const currentEpIndex = list.findIndex(ep => 
            (currentSlug && String(ep.slug) === String(currentSlug)) || 
            (ep.id && String(ep.id) === String(currentSlug)) || 
            String(ep.num) === String(currentEpNum)
          );

          if (currentEpIndex !== -1) {
            const currentEpObj = list[currentEpIndex];
            if (currentEpObj?.title && !currentEpTitle) {
              setCurrentEpTitle(currentEpObj.title);
            }
          }

          if (currentEpIndex !== -1 && currentEpIndex + 1 < list.length) {
            const nextEp = list[currentEpIndex + 1];
            setNextEpisodeData({
              num: nextEp.num,
              title: nextEp.title || `Episode ${nextEp.num}`,
              slug: nextEp.slug || nextEp.id || nextEp.num,
              isOffline: false,
            });
            setHasNextEpisode(true);
            Animated.timing(nextEpOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
          } else {
            setHasNextEpisode(false);
            Animated.timing(nextEpOpacity, { toValue: 0.25, duration: 300, useNativeDriver: true }).start();
          }
        }
      } catch (_) {
        if (isMounted) {
          setHasNextEpisode(false);
          Animated.timing(nextEpOpacity, { toValue: 0.25, duration: 300, useNativeDriver: true }).start();
        }
      }
    };

    if (animeTitle) resolveNextEpisode();
    return () => { isMounted = false; };
  }, [animeTitle, animeId, paramId, currentEpNum, currentSlug, isOfflineMode, effectiveAnimeId]);

  // 2.5 Fetch Previous Playback Progress for THIS Specific Episode (Even if Marked Watched)
  useEffect(() => {
    if (!resolvedUid || !currentProfileId || !effectiveAnimeId || effectiveAnimeId === 'unknown') return;

    const fetchEpisodeProgress = async () => {
      try {
        const profileRef = firestore()
          .collection('users')
          .doc(String(resolvedUid))
          .collection('profiles')
          .doc(String(currentProfileId));

        const epDocId = `${effectiveAnimeId}_ep_${currentEpNum}`;

        // 1. Check dedicated per-episode progress document first
        let epDoc = await profileRef.collection(WATCH_HISTORY_COLLECTION).doc(epDocId).get();
        if (!epDoc.exists) {
          epDoc = await profileRef.collection('progress').doc(epDocId).get();
        }

        let epData = epDoc.exists ? epDoc.data() : null;

        // 2. Fallback to series-level document (either nested episodes[epNum] or top-level match)
        if (!epData) {
          let seriesDoc = await profileRef.collection(WATCH_HISTORY_COLLECTION).doc(String(effectiveAnimeId)).get();
          if (!seriesDoc.exists) {
            seriesDoc = await profileRef.collection('progress').doc(String(effectiveAnimeId)).get();
          }
          if (seriesDoc.exists) {
            const sData = seriesDoc.data();
            if (sData?.episodes?.[String(currentEpNum)]) {
              epData = sData.episodes[String(currentEpNum)];
            } else {
              const targetSlug = currentSlug ? String(currentSlug) : String(currentEpNum);
              const matchesTop =
                String(sData?.slug) === targetSlug ||
                String(sData?.episodeNum) === String(currentEpNum) ||
                String(sData?.lastWatchedEp) === String(currentEpNum);
              if (matchesTop) epData = sData;
            }
          }
        }

        if (epData && Number(epData.progress) > 0) {
          const progSec = Number(epData.progress);
          const durSec = Number(epData.duration || 0);
          // Resume from saved timestamp (even on watched episodes) unless it was at the very end (>= 98%)
          const isAtVeryEnd = durSec > 0 && progSec >= durSec * 0.98;
          const savedMs = isAtVeryEnd ? 0 : progSec * 1000;

          lastPositionRef.current = savedMs;
          if (durSec > 0) lastDurationRef.current = durSec * 1000;

          if (videoRef.current && savedMs > 0) {
            await videoRef.current.setPositionAsync(savedMs).catch(() => {});
          }
        }
      } catch (_) {}
    };

    fetchEpisodeProgress();
  }, [resolvedUid, currentProfileId, effectiveAnimeId, currentSlug, currentEpNum]);

  // 3. Resolve Stream (Offline Local Vault Bundle OR Online M3U8 Stream)
  useEffect(() => {
    let isMounted = true;

    const resolveStream = async () => {
      setLoadingStream(true);
      setActiveUrl(null);

      // --- A. CHECK FOR OFFLINE DOWNLOADED BUNDLE FIRST ---
      let targetLocalM3u8 = offlineStreamUri;
      let targetLocalMeta = offlineMetaUri;
      let targetLocalSub = offlineSubUri;
      let offlineQualityLabel = params.quality || '1080p';

      if (!targetLocalM3u8) {
        try {
          const queue = await readLocalDownloadsQueue();
          const matchedDownload = queue.find(
            item =>
              item.status === 'completed' &&
              item.localUri &&
              (String(item.animeId) === String(effectiveAnimeId) ||
                (item.animeTitle || '').toLowerCase() === (animeTitle || '').toLowerCase()) &&
              Number(item.episodeNum) === Number(currentEpNum) &&
              String(item.audioType || 'sub').toLowerCase() === String(selectedAudioType || 'sub').toLowerCase()
          );

          if (matchedDownload) {
            const fileCheck = await FileSystem.getInfoAsync(matchedDownload.localUri);
            if (fileCheck.exists) {
              targetLocalM3u8 = matchedDownload.localUri;
              targetLocalMeta = matchedDownload.localMetaUri || null;
              targetLocalSub = matchedDownload.localSubtitleUri || null;
              offlineQualityLabel = matchedDownload.quality || '1080p';
            }
          }
        } catch (_) {}
      }

      if (targetLocalM3u8) {
        try {
          const m3u8Info = await FileSystem.getInfoAsync(targetLocalM3u8);
          if (m3u8Info.exists) {
            let metaJson = null;

            const inferredFolder = targetLocalM3u8.substring(0, targetLocalM3u8.lastIndexOf('/') + 1);
            const metaCandidate = targetLocalMeta || `${inferredFolder}metadata.json`;
            try {
              const metaInfo = await FileSystem.getInfoAsync(metaCandidate);
              if (metaInfo.exists) {
                const rawMeta = await FileSystem.readAsStringAsync(metaCandidate);
                metaJson = JSON.parse(rawMeta);
              }
            } catch (_) {}

            const subCandidate =
              targetLocalSub ||
              metaJson?.subtitle?.localUri ||
              `${inferredFolder}subtitle.vtt`;
            try {
              const subInfo = await FileSystem.getInfoAsync(subCandidate);
              if (subInfo.exists) {
                const rawVtt = await FileSystem.readAsStringAsync(subCandidate);
                const cues = parseVttTextToCues(rawVtt);
                if (cues.length > 0 && isMounted) {
                  setParsedSubs(cues);
                  setSubtitlesEnabled(true);
                }
              }
            } catch (_) {}

            const resolvedOfflineQual = metaJson?.quality || offlineQualityLabel || 'Offline HD';
            if (isMounted) {
              setIsOfflineMode(true);
              setCurrentAutoRes(resolvedOfflineQual);
              setSelectedQuality(resolvedOfflineQual);
              setQualityList([{ label: resolvedOfflineQual, uri: targetLocalM3u8 }]);
              setStreamData({
                m3u8: targetLocalM3u8,
                isOffline: true,
                intro: metaJson?.intro || null,
                outro: metaJson?.outro || null,
              });
              setActiveUrl(targetLocalM3u8);
              setLoadingStream(false);
            }
            return;
          }
        } catch (err) {
          console.warn('Offline file check error, falling back to online:', err);
        }
      }

      // --- B. ONLINE STREAM RESOLUTION ---
      const effectiveId = providerId || animeId || paramId;
      const effectiveSlug = currentSlug || currentEpNum;

      if (!effectiveId || !effectiveSlug) {
        if (isMounted) setLoadingStream(false);
        return;
      }

      let typeServers = ['hd-1', 'hd-2', 'vidstream-2'];
      
      try {
        const srvRes = await fetch(`${VERCEL_API_BASE}/api/servers?id=${encodeURIComponent(effectiveId)}&ep=${encodeURIComponent(effectiveSlug)}`);
        const srvJson = await srvRes.json();
        if (srvJson?.success && srvJson?.data) {
          const filtered = srvJson.data.filter(s => s.type === selectedAudioType).map(s => s.serverName);
          if (filtered.length > 0) typeServers = filtered;
        }
      } catch (_) {}

      let finalStreamData = null;
      for (const srv of typeServers) {
        try {
          const url = `${VERCEL_API_BASE}/api/stream?id=${encodeURIComponent(effectiveId)}&ep=${encodeURIComponent(effectiveSlug)}&server=${srv}&type=${selectedAudioType}`;
          const res = await fetch(url);
          const json = await res.json();
          let manifest = json?.success && json?.data?.m3u8
            ? json.data
            : (json?.success && json?.results?.streamingLink
                ? json.results
                : (json?.data?.streamingLink ? json.data : null));
          if (manifest) { finalStreamData = manifest; break; }
        } catch (_) {}
      }

      if (!isMounted) return;
      if (!finalStreamData) { setLoadingStream(false); return; }

      const masterUrl = finalStreamData.m3u8 || finalStreamData.streamingLink;
      
      try {
        const m3Res = await fetch(masterUrl, { headers: { "Referer": finalStreamData.referer || "https://vidwish.live/" }});
        const m3Text = await m3Res.text();
        const lines = m3Text.split('\n');
        let qualities = [{ label: 'Auto', uri: masterUrl }];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('RESOLUTION=')) {
            const resMatch = lines[i].match(/RESOLUTION=\d+x(\d+)/);
            if (resMatch && lines[i + 1]) {
              let streamUri = lines[i + 1].trim();
              if (!streamUri.startsWith('http')) {
                streamUri = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1) + streamUri;
              }
              qualities.push({ label: `${resMatch[1]}p`, uri: streamUri });
            }
          }
        }
        const uniqueQualities = [];
        const seenLabels = new Set();
        for (const q of qualities) {
          if (!seenLabels.has(q.label)) {
            seenLabels.add(q.label);
            uniqueQualities.push(q);
          }
        }
        setQualityList(uniqueQualities);
      } catch (_) {
        setQualityList([{ label: 'Auto', uri: masterUrl }]);
      }

      if (isMounted) {
        setIsOfflineMode(false);
        setStreamData(finalStreamData);
        setActiveUrl(masterUrl);
        setLoadingStream(false);
      }
    };

    resolveStream();
    return () => { isMounted = false; };
  }, [
    animeId,
    paramId,
    currentEpNum,
    currentSlug,
    selectedAudioType,
    providerId,
    offlineStreamUri,
    offlineMetaUri,
    offlineSubUri,
    effectiveAnimeId,
    animeTitle,
  ]);

  // 4. Playback Sync & Watch History Save inside Current Profile
  useEffect(() => {
    if (!status.isLoaded) return;
    const currentMs = status.positionMillis || 0;
    const durationMs = status.durationMillis || lastDurationRef.current || 0;
    const currentTimeSec = currentMs / 1000; 

    if (currentMs > 0) lastPositionRef.current = currentMs;
    if (durationMs > 0) lastDurationRef.current = durationMs;
    if (status.naturalSize?.height) setCurrentAutoRes(`${status.naturalSize.height}p`);

    if (subtitlesEnabled && parsedSubs.length > 0) {
      const activeCue = parsedSubs.find(c => currentTimeSec >= c.start && currentTimeSec <= c.end);
      if (activeCue && activeCue.text !== currentSubText) setCurrentSubText(activeCue.text);
      else if (!activeCue && currentSubText !== '') setCurrentSubText('');
    } else if (currentSubText !== '') { 
      setCurrentSubText(''); 
    }

    const currentSecs = Math.floor(currentTimeSec);
    
    // Save every 3 seconds while playing (saves progress even for already-watched episodes)
    if (status.isPlaying && currentSecs > 0) {
      if (Math.abs(currentSecs - lastSavedTimeRef.current) >= 3) {
        lastSavedTimeRef.current = currentSecs;
        saveWatchHistory(currentMs, durationMs);
      }
    }

    // If episode finishes playing to the end, force-save 100% completion
    if (status.didJustFinish && durationMs > 0) {
      saveWatchHistory(durationMs, durationMs, true);
    }
  }, [
    status.isLoaded,
    status.positionMillis,
    status.durationMillis,
    status.isPlaying,
    status.didJustFinish,
    status.naturalSize,
    subtitlesEnabled,
    parsedSubs,
    currentSubText,
    saveWatchHistory
  ]);

  useEffect(() => {
    if (resolvedUid && currentProfileId && status.isLoaded && lastPositionRef.current > 0) {
      saveWatchHistory(lastPositionRef.current, lastDurationRef.current);
    }
  }, [resolvedUid, currentProfileId, currentEpTitle, resolvedBackdrop, saveWatchHistory]);

  // 5. Seamless Next Episode Logic
  const handleNextEpisode = () => {
    if (!hasNextEpisode || !nextEpisodeData) return;

    saveWatchHistory(lastPositionRef.current, lastDurationRef.current);
    
    setLoadingStream(true);
    setActiveUrl(null);
    setCurrentSubText('');
    setParsedSubs([]);
    lastPositionRef.current = 0; 
    lastDurationRef.current = 0;
    lastSavedTimeRef.current = 0;

    if (nextEpisodeData.isOffline && nextEpisodeData.localUri) {
      setIsOfflineMode(true);
      setOfflineStreamUri(nextEpisodeData.localUri);
      setOfflineMetaUri(nextEpisodeData.localMetaUri || null);
      setOfflineSubUri(nextEpisodeData.localSubtitleUri || null);
    } else {
      setIsOfflineMode(false);
      setOfflineStreamUri(null);
      setOfflineMetaUri(null);
      setOfflineSubUri(null);
    }
    
    setCurrentEpNum(nextEpisodeData.num);
    setCurrentEpTitle(nextEpisodeData.title);
    setCurrentSlug(nextEpisodeData.slug);
  };

  // --- UI VISIBILITY: SHOW ON TAP & HIDE ON TAP + AUTO-HIDE TIMER ---
  const hideUINow = useCallback(() => {
    if (hideUITimeout.current) clearTimeout(hideUITimeout.current);
    Animated.timing(uiOpacity, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setShowUI(false);
      showUIRef.current = false;
    });
  }, [uiOpacity]);

  const resetHideTimer = useCallback(() => {
    if (activeMenuRef.current) return;
    setShowUI(true);
    showUIRef.current = true;
    Animated.timing(uiOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();

    if (hideUITimeout.current) clearTimeout(hideUITimeout.current);
    hideUITimeout.current = setTimeout(() => {
      if (status.isPlaying && !activeMenuRef.current) {
        hideUINow();
      }
    }, 3500);
  }, [status.isPlaying, uiOpacity, hideUINow]);

  // Toggle UI on single screen tap (if visible -> hide immediately; if hidden -> show & start timer)
  const toggleUIOnTap = useCallback(() => {
    if (activeMenuRef.current) {
      setActiveMenu(null);
      return;
    }
    if (showUIRef.current) {
      hideUINow();
    } else {
      resetHideTimer();
    }
  }, [hideUINow, resetHideTimer]);

  const handleTouchStart = (evt) => {
    didTriggerLongPressRef.current = false;
    touchStartTimeRef.current = Date.now();
    const pageX = evt?.nativeEvent?.pageX || 0;
    const pageY = evt?.nativeEvent?.pageY || 0;
    touchStartPosRef.current = { x: pageX, y: pageY };

    if (isLockedRef.current) return;

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      if (status.isPlaying && videoRef.current) {
        didTriggerLongPressRef.current = true;
        previousSpeedRef.current = playbackSpeed;
        videoRef.current.setRateAsync(2.0, true);
        setIs2xActive(true);
      }
    }, 450);
  };

  const handleTouchEnd = (evt) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (is2xActive || didTriggerLongPressRef.current) {
      setIs2xActive(false);
      didTriggerLongPressRef.current = false;
      if (videoRef.current) {
        videoRef.current.setRateAsync(previousSpeedRef.current, true);
      }
      return;
    }

    // If it was a quick tap (not a drag or long press), toggle UI visibility
    const elapsed = Date.now() - touchStartTimeRef.current;
    const pageX = evt?.nativeEvent?.pageX || touchStartPosRef.current.x;
    const pageY = evt?.nativeEvent?.pageY || touchStartPosRef.current.y;
    const moveDist = Math.hypot(
      pageX - touchStartPosRef.current.x,
      pageY - touchStartPosRef.current.y
    );

    if (elapsed < 350 && moveDist < 20) {
      toggleUIOnTap();
    }
  };

  useEffect(() => {
    if (status.isPlaying) {
      if (showUIRef.current) resetHideTimer();
    } else {
      if (hideUITimeout.current) clearTimeout(hideUITimeout.current);
      if (!isLocked) {
        setShowUI(true);
        showUIRef.current = true;
        Animated.timing(uiOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      }
      if (status.isLoaded && lastPositionRef.current > 0) {
        saveWatchHistory(lastPositionRef.current, lastDurationRef.current);
      }
    }
  }, [status.isPlaying, activeMenu, isLocked, resetHideTimer, uiOpacity, saveWatchHistory]);

  if (loadingStream) return <View style={styles.loaderContainerFull} />;

  const isLocalFileUri = Boolean(activeUrl && String(activeUrl).startsWith('file://'));
  const videoSource = isLocalFileUri
    ? {
        uri: activeUrl,
        overrideFileExtensionAndroid: 'm3u8',
      }
    : {
        uri: activeUrl,
        overrideFileExtensionAndroid: 'm3u8',
        headers: streamData?.referer ? { Referer: streamData.referer } : {},
      };

  return (
    <View style={styles.container}>
      {!loadingStream && activeUrl ? (
        <Video
          key={activeUrl}
          ref={videoRef}
          style={styles.videoPlayer}
          source={videoSource}
          useNativeControls={false}
          resizeMode={resizeMode}
          progressUpdateIntervalMillis={1000}
          onPlaybackStatusUpdate={setStatus}
          onLoad={async (loadStatus) => {
            if (loadStatus?.durationMillis) {
              lastDurationRef.current = loadStatus.durationMillis;
            }
            if (videoRef.current) {
              if (lastPositionRef.current > 0) {
                await videoRef.current.setPositionAsync(lastPositionRef.current).catch(() => {});
              }
              await videoRef.current.playAsync().catch(() => {});
            }
            saveWatchHistory(
              lastPositionRef.current || 1000,
              loadStatus?.durationMillis || lastDurationRef.current || 0,
              true
            );
          }}
          shouldPlay
        />
      ) : null}

      {/* Fullscreen Tap Catcher so tapping empty video area always toggles UI on/off */}
      <TouchableOpacity
        style={styles.tapSurface}
        activeOpacity={1}
        onPressIn={handleTouchStart}
        onPressOut={handleTouchEnd}
      />

      {is2xActive && (
        <View style={styles.speedIndicatorBadge} pointerEvents="none">
          <Text style={styles.speedIndicatorText}>2X SPEED ▶▶</Text>
        </View>
      )}

      {subtitlesEnabled && currentSubText !== '' && (
        <View style={[styles.subtitleContainer, { bottom: subSettings.height + (showUI ? 65 : 0) }]} pointerEvents="none">
          <Text
            style={[
              styles.subtitleText,
              {
                color: subSettings.color || '#FFFFFF',
                fontSize: subSettings.size || 16,
                fontFamily: subSettings.fontFamily || 'normal',
                backgroundColor: subSettings.backgroundColor || 'transparent'
              }
            ]}
          >
            {currentSubText}
          </Text>
        </View>
      )}

      <PlayPauseSkip
        status={status}
        videoRef={videoRef}
        resetHideTimer={resetHideTimer}
        toggleUI={toggleUIOnTap}
        isLocked={isLocked}
        uiOpacity={uiOpacity}
        showUI={showUI}
        setShowUI={(val) => {
          const nextVal = typeof val === 'function' ? val(showUIRef.current) : val;
          if (nextVal) {
            resetHideTimer();
          } else {
            hideUINow();
          }
        }}
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      />

      <SkipIntroOutro
        status={status}
        videoRef={videoRef}
        introData={streamData?.intro}
        isLocked={isLocked}
        onSkipOutro={hasNextEpisode ? handleNextEpisode : null}
      />

      <Animated.View style={[styles.uiLayer, { opacity: uiOpacity }]} pointerEvents={showUI ? 'box-none' : 'none'}>
        {!isLocked && (
          <View style={styles.topBarWrapper} pointerEvents="box-none">
            <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject} pointerEvents="none">
              <Defs>
                <LinearGradient id="topCinematic" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#000000" stopOpacity="0.95" />
                  <Stop offset="1" stopColor="#000000" stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#topCinematic)" />
            </Svg>
            <View style={styles.topBarContent} pointerEvents="box-none">
              <View style={styles.topLeftGroup}>
                <TouchableOpacity
                  onPress={() => {
                    saveWatchHistory(lastPositionRef.current, status.durationMillis || lastDurationRef.current || 0);
                    navigation.goBack();
                  }}
                  style={styles.iconBtn}
                  hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                >
                  <IconBack />
                </TouchableOpacity>
                <View style={styles.titleColumn} pointerEvents="none">
                  <View style={styles.titleRowWithBadge}>
                    <Text style={styles.mainTitle} numberOfLines={1}>{animeTitle}</Text>
                    {isOfflineMode && (
                      <View style={styles.offlineBadge}>
                        <Text style={styles.offlineBadgeText}>OFFLINE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.subTitle}>
                    Episode {currentEpNum} {currentEpTitle ? `• ${currentEpTitle}` : ''}
                  </Text>
                </View>
              </View>
              <View style={styles.topRightGroup}>
                <TouchableOpacity onPress={() => setActiveMenu('subs')} style={styles.iconBtn}>
                  <IconSubs color={subtitlesEnabled ? "#FFF" : "#777"} />
                </TouchableOpacity>
                {!isOfflineMode && (
                  <TouchableOpacity onPress={() => setActiveMenu('audio')} style={styles.iconBtn}>
                    <IconAudio />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setActiveMenu('quality')} style={styles.hdBtn}>
                  <Text style={styles.hdBtnText}>{isOfflineMode ? currentAutoRes : 'HD'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={styles.bottomBarWrapper} pointerEvents="box-none">
          <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <Defs>
              <LinearGradient id="botCinematic" x1="0" y1="1" x2="0" y2="0">
                <Stop offset="0" stopColor="#000000" stopOpacity="0.95" />
                <Stop offset="1" stopColor="#000000" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#botCinematic)" />
          </Svg>
          <View style={styles.bottomContent} pointerEvents="box-none">
            <View style={styles.bottomToolsRow} pointerEvents="box-none">
              <View style={styles.toolsLeft}>
                <LockButton
                  isLocked={isLocked}
                  setIsLocked={setIsLocked}
                  uiOpacity={uiOpacity}
                  setShowUI={setShowUI}
                  hideUITimeout={hideUITimeout}
                />
                {!isLocked && (
                  <TouchableOpacity onPress={() => setActiveMenu('speed')}>
                    <Text style={styles.speedBtnText}>{playbackSpeed.toFixed(2)}x</Text>
                  </TouchableOpacity>
                )}
              </View>
              {!isLocked && (
                <View style={styles.toolsRight}>
                  <Animated.View style={{ opacity: nextEpOpacity }}>
                    <TouchableOpacity
                      onPress={handleNextEpisode}
                      disabled={!hasNextEpisode}
                      style={[styles.iconBtn, { marginRight: 18 }]}
                    >
                      <IconNextEp color={hasNextEpisode ? "#FFF" : "rgba(255,255,255,0.3)"} />
                    </TouchableOpacity>
                  </Animated.View>
                  <AspectRatioButton resizeMode={resizeMode} setResizeMode={setResizeMode} />
                </View>
              )}
            </View>

            {!isLocked && (
              <View style={styles.progressRow}>
                <Text style={styles.timeText}>{formatTime(status.positionMillis || 0)}</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={status.durationMillis || lastDurationRef.current || 100}
                  value={status.positionMillis || 0}
                  minimumTrackTintColor={BRAND_RED}
                  maximumTrackTintColor="rgba(255,255,255,0.2)"
                  thumbTintColor="#FFF"
                  onSlidingComplete={async (val) => {
                    if (videoRef.current) {
                      await videoRef.current.setPositionAsync(val).catch(() => {});
                      lastPositionRef.current = val;
                      saveWatchHistory(val, status.durationMillis || lastDurationRef.current || 0, true);
                      resetHideTimer();
                    }
                  }}
                  onSlidingStart={() => {
                    if (hideUITimeout.current) clearTimeout(hideUITimeout.current);
                  }}
                />
                <Text style={styles.timeText}>
                  -{formatTime((status.durationMillis || 0) - (status.positionMillis || 0))}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Animated.View>

      <VideoQualitySheet
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        qualityList={qualityList}
        selectedQuality={selectedQuality}
        setSelectedQuality={setSelectedQuality}
        setActiveUrl={setActiveUrl}
        currentAutoRes={currentAutoRes}
      />
      <SubtitleSheet
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        subtitlesEnabled={subtitlesEnabled}
        setSubtitlesEnabled={setSubtitlesEnabled}
        subSettings={subSettings}
        setSubSettings={setSubSettings}
        animeId={isOfflineMode ? null : effectiveAnimeId}
        episodeNum={isOfflineMode ? null : currentEpNum}
        onSelectSubtitleTrack={(track) => {
          if (track && track.cues) {
            setParsedSubs(track.cues);
          } else if (!isOfflineMode) {
            setParsedSubs([]);
          }
        }}
      />
      <AudioSheet
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        animeId={effectiveAnimeId}
        episodeNum={currentEpNum}
        currentTargetType={selectedAudioType}
        onSelectAudioType={setSelectedAudioType}
      />
      <SpeedSheet
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        playbackSpeed={playbackSpeed}
        setPlaybackSpeed={setPlaybackSpeed}
        videoRef={videoRef}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', width: '100%', height: '100%' },
  videoPlayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  tapSurface: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  loaderContainerFull: { flex: 1, backgroundColor: '#000000' },
  speedIndicatorBadge: { position: 'absolute', top: 25, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', zIndex: 35 },
  speedIndicatorText: { color: '#FFF', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  subtitleContainer: { position: 'absolute', width: '100%', alignItems: 'center', zIndex: 25, elevation: 10, paddingHorizontal: 25 },
  subtitleText: { fontWeight: '800', textAlign: 'center', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  uiLayer: { ...StyleSheet.absoluteFillObject, zIndex: 10, justifyContent: 'space-between' },
  topBarWrapper: { width: '100%', position: 'absolute', top: 0, height: 120 },
  topBarContent: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 16 },
  topLeftGroup: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 16 },
  titleColumn: { paddingHorizontal: 10, flex: 1 },
  titleRowWithBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mainTitle: { color: '#FFF', fontSize: 17, fontWeight: '700', textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2, flexShrink: 1 },
  offlineBadge: { backgroundColor: BRAND_RED, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  offlineBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  subTitle: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontStyle: 'italic', marginTop: 2 },
  topRightGroup: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  iconBtn: { padding: 4, opacity: 0.9 },
  hdBtn: { borderWidth: 1.5, borderColor: '#FFF', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, height: 20, justifyContent: 'center', alignItems: 'center' },
  hdBtnText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  bottomBarWrapper: { width: '100%', position: 'absolute', bottom: 0, height: 120, justifyContent: 'flex-end' },
  bottomContent: { paddingHorizontal: 28, paddingBottom: 16 },
  bottomToolsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4 },
  toolsLeft: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  toolsRight: { flexDirection: 'row', alignItems: 'center' },
  speedBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600', opacity: 0.9 },
  progressRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  timeText: { color: '#FFF', fontSize: 13, fontFamily: 'monospace', minWidth: 45, textAlign: 'center' },
  slider: { flex: 1, marginHorizontal: 12, height: 28 },
});
