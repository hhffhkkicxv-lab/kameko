import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Animated, 
  StatusBar, BackHandler, Platform, AppState 
} from 'react-native';
import { Video, ResizeMode, Audio } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import * as FileSystem from 'expo-file-system';
import Slider from '@react-native-community/slider';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Svg, { Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';

// --- ALL EXTERNAL PLAYER SCRIPTS KEPT 100% INTACT ---
import AspectRatioButton from './aspect-ratio';
import LockButton from './lock';
import VideoQualitySheet from './video_quality';
import SubtitleSheet from './subtitle';
import AudioSheet from './audio';
import SpeedSheet from './speed';
import SkipIntroOutro from './intro-outro';
import PlayPauseSkip from './play-pause-skip';

const BRAND_RED = '#E50914';
const VERCEL_API_BASE = 'https://anikoto-api-lyart.vercel.app';
// EXACT CLOUDFLARE WORKER PROXY FROM YOUR BLAZE-X WEB PLAYER
const CUSTOM_PROXY_URL = 'https://icy-wave-30d8.prashant-yash69.workers.dev/proxy?url=';
const WATCH_HISTORY_COLLECTION = 'watch_history';

const DOWNLOAD_QUEUE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}kameko_downloads_queue.json`
  : null;

const LOCAL_WATCH_CACHE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}kameko_watch_progress_cache.json`
  : null;

// Helper to wrap any M3U8 or VTT URL in your Blaze-X Cloudflare Worker Proxy
const buildProxiedUrl = (rawUrl, referer = 'https://vidwish.live/') => {
  if (!rawUrl) return null;
  const str = String(rawUrl);
  if (str.startsWith('file://') || str.includes('prashant-yash69.workers.dev')) {
    return str;
  }
  return `${CUSTOM_PROXY_URL}${encodeURIComponent(str)}&referer=${encodeURIComponent(referer)}`;
};

// --- SUBTITLE (.VTT / .SRT) PARSER ---
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
  return cues.filter((c) => c.text.length > 0);
};

const findActiveSubtitleCue = (cues, timeSec) => {
  let low = 0;
  let high = cues.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const cue = cues[mid];
    if (timeSec < cue.start) {
      high = mid - 1;
    } else if (timeSec > cue.end) {
      low = mid + 1;
    } else {
      return cue.text;
    }
  }
  return '';
};

const readLocalDownloadsQueue = async () => {
  try {
    if (DOWNLOAD_QUEUE_FILE_URI) {
      const info = await FileSystem.getInfoAsync(DOWNLOAD_QUEUE_FILE_URI);
      if (info?.exists) {
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

let inMemoryWatchCache = null;

const readLocalWatchCache = async () => {
  if (inMemoryWatchCache) return inMemoryWatchCache;
  try {
    if (LOCAL_WATCH_CACHE_URI) {
      const info = await FileSystem.getInfoAsync(LOCAL_WATCH_CACHE_URI);
      if (info?.exists) {
        const raw = await FileSystem.readAsStringAsync(LOCAL_WATCH_CACHE_URI);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            inMemoryWatchCache = parsed;
            return inMemoryWatchCache;
          }
        }
      }
    }
  } catch (_) {}
  inMemoryWatchCache = {};
  return inMemoryWatchCache;
};

const writeLocalWatchCacheEntry = async (key, payload) => {
  try {
    const current = await readLocalWatchCache();
    current[key] = payload;
    inMemoryWatchCache = current;
    if (LOCAL_WATCH_CACHE_URI) {
      await FileSystem.writeAsStringAsync(LOCAL_WATCH_CACHE_URI, JSON.stringify(current));
    }
  } catch (_) {}
};

const extractResumeMillis = (dataObj) => {
  if (!dataObj) return { resumeMs: 0, durationMs: 0, timestamp: 0 };
  const durMs =
    Number(dataObj.durationMillis) > 0
      ? Number(dataObj.durationMillis)
      : Number(dataObj.duration) > 0
      ? Number(dataObj.duration) * 1000
      : 0;

  const rawPosMs =
    Number(dataObj.positionMillis) > 0
      ? Number(dataObj.positionMillis)
      : Number(dataObj.progress) > 0
      ? Number(dataObj.progress) * 1000
      : 0;

  const isAtVeryEnd = durMs > 10000 && rawPosMs >= durMs * 0.98;
  return {
    resumeMs: isAtVeryEnd ? 0 : Math.max(0, Math.floor(rawPosMs)),
    durationMs: Math.max(0, Math.floor(durMs)),
    timestamp: Number(dataObj.timestamp || dataObj.updatedAt || 0),
  };
};

const formatTime = (millis) => {
  if (!millis || isNaN(millis) || millis < 0) return '00:00';
  const totalSecs = Math.floor(millis / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSecs % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
};

// --- MEMOIZED ICONS & CINEMATIC GRADIENTS ---
const IconBack = React.memo(({ size = 28 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5">
    <Path d="M19 12H5M12 19l-7-7 7-7" />
  </Svg>
));
const IconSubs = React.memo(({ size = 24, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <Rect x="3" y="5" width="18" height="14" rx="2" ry="2"/>
    <Path d="M7 15h3m4 0h3M7 9h10"/>
  </Svg>
));
const IconAudio = React.memo(({ size = 24, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <Path d="M3 18v-6a9 9 0 0118 0v6"/>
    <Path d="M21 19a2 2 0 01-2 2h-1v-6h3v4zM3 19a2 2 0 002 2h1v-6H3v4z"/>
  </Svg>
));
const IconNextEp = React.memo(({ size = 22, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
  </Svg>
));

const TopGradientOverlay = React.memo(() => (
  <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject} pointerEvents="none">
    <Defs>
      <LinearGradient id="topCinematic" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#000000" stopOpacity="0.95" />
        <Stop offset="1" stopColor="#000000" stopOpacity="0" />
      </LinearGradient>
    </Defs>
    <Rect width="100%" height="100%" fill="url(#topCinematic)" />
  </Svg>
));

const BottomGradientOverlay = React.memo(() => (
  <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject} pointerEvents="none">
    <Defs>
      <LinearGradient id="botCinematic" x1="0" y1="1" x2="0" y2="0">
        <Stop offset="0" stopColor="#000000" stopOpacity="0.95" />
        <Stop offset="1" stopColor="#000000" stopOpacity="0" />
      </LinearGradient>
    </Defs>
    <Rect width="100%" height="100%" fill="url(#botCinematic)" />
  </Svg>
));

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
    fileUri: paramFileUri = null,
    localMetaUri: paramLocalMetaUri = null,
    localSubtitleUri: paramLocalSubtitleUri = null,
    isOffline: paramIsOffline = false,
  } = params;

  const initialOfflineUri =
    paramLocalUri ||
    paramFileUri ||
    (paramActiveUrl && String(paramActiveUrl).startsWith('file://') ? paramActiveUrl : null) ||
    (paramStreamUrl && String(paramStreamUrl).startsWith('file://') ? paramStreamUrl : null) ||
    null;

  // If Play.js already passed a remote streamUrl, proxy it immediately for 0ms boot!
  const initialPassedRemoteUrl =
    !initialOfflineUri && (paramStreamUrl || paramActiveUrl)
      ? buildProxiedUrl(paramStreamUrl || paramActiveUrl, params.referer || 'https://vidwish.live/')
      : null;

  const [isOfflineMode, setIsOfflineMode] = useState(Boolean(paramIsOffline || initialOfflineUri));
  const [offlineStreamUri, setOfflineStreamUri] = useState(initialOfflineUri);
  const [offlineMetaUri, setOfflineMetaUri] = useState(paramLocalMetaUri || null);
  const [offlineSubUri, setOfflineSubUri] = useState(paramLocalSubtitleUri || null);

  const [resolvedUid] = useState(() =>
    userUid || paramUid || paramUser?.uid || propUser?.uid || auth().currentUser?.uid || null
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
    let isMounted = true;
    const ensureProfileId = async () => {
      const uid = resolvedUid || auth().currentUser?.uid;
      if (!uid || currentProfileId) return;
      try {
        const userDoc = await firestore().collection('users').doc(String(uid)).get();
        if (userDoc.exists) {
          const savedProfId = userDoc.data()?.activeProfileId || userDoc.data()?.activeProfile?.id;
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

  const [currentEpNum, setCurrentEpNum] = useState(Number(params.episodeNum || 1));
  const [currentSlug, setCurrentSlug] = useState(params.slug || null);
  const [currentEpTitle, setCurrentEpTitle] = useState(params.episodeTitle || params.epTitle || '');

  const videoRef = useRef(null);
  const uiOpacity = useRef(new Animated.Value(1)).current;
  const nextEpOpacity = useRef(new Animated.Value(0.25)).current;

  const initialParamResume = useMemo(() => extractResumeMillis(params), []);

  const [isLoaded, setIsLoaded] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [initialStartMillis, setInitialStartMillis] = useState(initialParamResume.resumeMs);
  const [posMillis, setPosMillis] = useState(initialParamResume.resumeMs);
  const [durMillis, setDurMillis] = useState(initialParamResume.durationMs);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewMillis, setSeekPreviewMillis] = useState(0);

  const [showUI, setShowUI] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [resizeMode, setResizeMode] = useState(ResizeMode.CONTAIN);
  const [activeMenu, setActiveMenu] = useState(null); 
  const [selectedAudioType, setSelectedAudioType] = useState(targetType || 'sub');
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [is2xActive, setIs2xActive] = useState(false);

  const episodeSessionIdRef = useRef(1);
  const isInitialMountRef = useRef(true);
  const hasRestoredPositionOnLoadRef = useRef(false);
  const previousSpeedRef = useRef(1.0);
  const lastPositionRef = useRef(initialParamResume.resumeMs);
  const lastDurationRef = useRef(initialParamResume.durationMs);
  const lastSavedSecRef = useRef(Math.floor(initialParamResume.resumeMs / 1000));
  const lastRenderedSecRef = useRef(-1);

  const [providerId, setProviderId] = useState(params.providerId || null);
  const [cachedEpisodesList, setCachedEpisodesList] = useState([]);
  const [hasNextEpisode, setHasNextEpisode] = useState(false);
  const [nextEpisodeData, setNextEpisodeData] = useState(null);

  const [streamData, setStreamData] = useState(
    initialPassedRemoteUrl ? { m3u8: initialPassedRemoteUrl, referer: params.referer || 'https://vidwish.live/' } : null
  );
  const [loadingStream, setLoadingStream] = useState(!initialPassedRemoteUrl && !initialOfflineUri);
  const [activeUrl, setActiveUrl] = useState(initialOfflineUri || initialPassedRemoteUrl || null);
  const [rawMasterUrl, setRawMasterUrl] = useState(paramStreamUrl || paramActiveUrl || null);
  const [qualityList, setQualityList] = useState(
    initialPassedRemoteUrl ? [{ label: 'Auto', uri: initialPassedRemoteUrl }] : []
  );
  const [selectedQuality, setSelectedQuality] = useState('Auto');
  const [currentAutoRes, setCurrentAutoRes] = useState('1080p');
  const [streamErrorRetryCount, setStreamErrorRetryCount] = useState(0);

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
  const isPlayingRef = useRef(isPlaying);
  const subtitlesEnabledRef = useRef(subtitlesEnabled);
  const parsedSubsRef = useRef(parsedSubs);
  const currentSubTextRef = useRef(currentSubText);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => { activeMenuRef.current = activeMenu; }, [activeMenu]);
  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);
  useEffect(() => { showUIRef.current = showUI; }, [showUI]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { subtitlesEnabledRef.current = subtitlesEnabled; }, [subtitlesEnabled]);
  useEffect(() => { parsedSubsRef.current = parsedSubs; }, [parsedSubs]);
  useEffect(() => { currentSubTextRef.current = currentSubText; }, [currentSubText]);

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

  // --- AUTO-PAUSE ON PHONE CALL / BACKGROUND ---
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/active/) && nextState.match(/inactive|background/)) {
        if (videoRef.current && isPlayingRef.current) {
          videoRef.current.pauseAsync().catch(() => {});
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

  const saveWatchHistory = useCallback((positionMillis, durationMillis, force = false, customMeta = null) => {
    const meta = customMeta || latestMetaRef.current;
    if (!meta.animeId || meta.animeId === 'unknown') return;

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
      profileId: String(meta.profileId || 'default'),
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
    };

    const localKey = `${meta.profileId || 'default'}_${epDocId}`;
    writeLocalWatchCacheEntry(localKey, episodePayload);
    writeLocalWatchCacheEntry(`any_${epDocId}`, episodePayload);

    if (!meta.uid || !meta.profileId) return;

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

    currentProfileRef
      .collection(WATCH_HISTORY_COLLECTION)
      .doc(epDocId)
      .set(episodePayload, { merge: true })
      .catch(() => {});

    currentProfileRef
      .collection(WATCH_HISTORY_COLLECTION)
      .doc(String(meta.animeId))
      .set(seriesPayload, { merge: true })
      .catch(() => {});
  }, []);

  const navigationRef = useRef(navigation);
  const saveHistoryRef = useRef(saveWatchHistory);
  useEffect(() => { navigationRef.current = navigation; }, [navigation]);
  useEffect(() => { saveHistoryRef.current = saveWatchHistory; }, [saveWatchHistory]);

  // 1. Full Screen Immersive Lock & Hardware Back Handler
  useEffect(() => {
    const enterImmersiveLandscape = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
        StatusBar.setHidden(true, 'none');
        if (Platform.OS === 'android' && NavigationBar?.setVisibilityAsync) {
          await NavigationBar.setVisibilityAsync('hidden');
          await NavigationBar.setBehaviorAsync('overlay-swipe');
        }
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch (_) {}
    };
    enterImmersiveLandscape();

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeMenuRef.current) { 
        setActiveMenu(null); 
        return true; 
      }
      if (isLockedRef.current) { 
        setIsLocked(false); 
        setShowUI(true);
        Animated.timing(uiOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
        return true; 
      }
      if (saveHistoryRef.current) {
        saveHistoryRef.current(lastPositionRef.current, lastDurationRef.current, true);
      }
      if (navigationRef.current?.goBack) {
        navigationRef.current.goBack();
      }
      return true;
    });

    return () => {
      if (saveHistoryRef.current) {
        saveHistoryRef.current(lastPositionRef.current, lastDurationRef.current, true);
      }
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
        .catch(() => ScreenOrientation.unlockAsync().catch(() => {}));
      backHandler.remove();
    };
  }, []);

  // 2. Fetch Series Episodes List ONCE in Background (For Next Episode Button)
  useEffect(() => {
    let isMounted = true;
    if (isOfflineMode || !animeTitle) return;

    const fetchSeriesEpisodesOnce = async () => {
      try {
        let targetId = providerId || animeId || paramId;

        // If targetId is a pure number (AniList ID), resolve the slug first
        if (!targetId || /^\d+$/.test(String(targetId))) {
          const searchRes = await fetch(`${VERCEL_API_BASE}/api/search?keyword=${encodeURIComponent(animeTitle)}`);
          const searchJson = await searchRes.json();
          const matches = searchJson?.data || [];
          if (matches.length > 0) {
            const exact = matches.find((m) => String(m.title || '').toLowerCase() === animeTitle.toLowerCase()) || matches[0];
            if (exact?.id) targetId = exact.id;
            if (!resolvedBackdrop && (exact.poster || exact.image) && isMounted) {
              setResolvedBackdrop(exact.poster || exact.image);
            }
          }
        }

        if (isMounted && targetId) setProviderId(targetId);
        if (!targetId) return;

        const epRes = await fetch(`${VERCEL_API_BASE}/api/episodes/${encodeURIComponent(targetId)}`);
        const epJson = await epRes.json();
        const list = epJson?.data || [];
        if (isMounted && Array.isArray(list)) {
          setCachedEpisodesList(list);
        }
      } catch (_) {}
    };

    fetchSeriesEpisodesOnce();
    return () => { isMounted = false; };
  }, [animeTitle, isOfflineMode]);

  // 2.2 Resolve Next Episode Pointer
  useEffect(() => {
    let isMounted = true;

    const updateNextEpisodePointer = async () => {
      try {
        const localDownloads = await readLocalDownloadsQueue();
        const nextOfflineEp = localDownloads.find((d) => {
          const uriCandidate = d.localUri || d.fileUri || d.streamUri;
          const isValidOffline =
            (d.status === 'completed' || d.status === 'downloaded' || Boolean(uriCandidate)) &&
            Boolean(uriCandidate);
          const sameAnime =
            String(d.animeId) === String(effectiveAnimeId) ||
            String(d.animeTitle || '').toLowerCase() === String(animeTitle || '').toLowerCase();
          return isValidOffline && sameAnime && Number(d.episodeNum) === Number(currentEpNum) + 1;
        });

        if (nextOfflineEp && isMounted) {
          const resolvedNextUri =
            nextOfflineEp.localUri || nextOfflineEp.fileUri || nextOfflineEp.streamUri;
          setNextEpisodeData({
            num: Number(nextOfflineEp.episodeNum),
            title: nextOfflineEp.episodeTitle || `Episode ${nextOfflineEp.episodeNum}`,
            slug: String(nextOfflineEp.slug || nextOfflineEp.episodeNum),
            isOffline: String(resolvedNextUri).startsWith('file://'),
            localUri: resolvedNextUri,
            localMetaUri: nextOfflineEp.localMetaUri || null,
            localSubtitleUri: nextOfflineEp.localSubtitleUri || nextOfflineEp.subtitle?.file || null,
            quality: nextOfflineEp.quality || '1080p',
          });
          setHasNextEpisode(true);
          Animated.timing(nextEpOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
          if (isOfflineMode) return;
        }
      } catch (_) {}

      if (isOfflineMode) {
        if (isMounted) {
          setHasNextEpisode(false);
          Animated.timing(nextEpOpacity, { toValue: 0.25, duration: 250, useNativeDriver: true }).start();
        }
        return;
      }

      if (cachedEpisodesList.length > 0 && isMounted) {
        const currentEpIndex = cachedEpisodesList.findIndex(
          (ep) =>
            (currentSlug && String(ep.slug) === String(currentSlug)) ||
            (ep.id && String(ep.id) === String(currentSlug)) ||
            Number(ep.num) === Number(currentEpNum)
        );

        if (currentEpIndex !== -1) {
          const currentEpObj = cachedEpisodesList[currentEpIndex];
          if (currentEpObj?.title && (!currentEpTitle || currentEpTitle === `Episode ${currentEpNum}`)) {
            setCurrentEpTitle(currentEpObj.title);
          }
        }

        if (currentEpIndex !== -1 && currentEpIndex + 1 < cachedEpisodesList.length) {
          const nextEp = cachedEpisodesList[currentEpIndex + 1];
          setNextEpisodeData({
            num: Number(nextEp.num),
            title: nextEp.title || `Episode ${nextEp.num}`,
            slug: String(nextEp.slug || nextEp.id || nextEp.num),
            isOffline: false,
          });
          setHasNextEpisode(true);
          Animated.timing(nextEpOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
        } else {
          setHasNextEpisode(false);
          Animated.timing(nextEpOpacity, { toValue: 0.25, duration: 250, useNativeDriver: true }).start();
        }
      }
    };

    updateNextEpisodePointer();
    return () => { isMounted = false; };
  }, [currentEpNum, currentSlug, cachedEpisodesList, isOfflineMode, effectiveAnimeId, animeTitle]);

  // =========================================================================
  // 3. BLAZE-X INSTANT STREAM & SUBTITLE ENGINE (0MS UI BLOCKING)
  // =========================================================================
  useEffect(() => {
    let isMounted = true;
    const currentSessionId = ++episodeSessionIdRef.current;
    hasRestoredPositionOnLoadRef.current = false;

    const loadEpisodeProgressAndStream = async () => {
      setIsBuffering(true);

      const epDocId = `${effectiveAnimeId}_ep_${currentEpNum}`;
      const localKey = `${currentProfileId || 'default'}_${epDocId}`;

      // Step A: Instant Local Resume Lookup (Never blocks stream fetching!)
      let candidates = [];
      if (isInitialMountRef.current) {
        const paramRes = extractResumeMillis(params);
        if (paramRes.resumeMs > 0) candidates.push({ ...paramRes, source: 'params' });
      }
      isInitialMountRef.current = false;

      try {
        const localCache = await readLocalWatchCache();
        const cachedEntry = localCache[localKey] || localCache[`any_${epDocId}`];
        if (cachedEntry) {
          const localRes = extractResumeMillis(cachedEntry);
          if (localRes.resumeMs > 0) candidates.push({ ...localRes, source: 'local' });
        }
      } catch (_) {}

      let targetResumeMs = 0;
      let targetDurationMs = 0;
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.resumeMs - a.resumeMs);
        targetResumeMs = candidates[0].resumeMs;
        targetDurationMs = candidates[0].durationMs;
      }

      lastPositionRef.current = targetResumeMs;
      lastDurationRef.current = targetDurationMs;
      lastSavedSecRef.current = Math.floor(targetResumeMs / 1000);
      lastRenderedSecRef.current = -1;
      setInitialStartMillis(targetResumeMs);
      setPosMillis(targetResumeMs);
      setDurMillis(targetDurationMs);

      // Async Firestore progress check in parallel (if user hasn't scrubbed yet)
      if (resolvedUid && currentProfileId && effectiveAnimeId && effectiveAnimeId !== 'unknown') {
        firestore()
          .collection('users')
          .doc(String(resolvedUid))
          .collection('profiles')
          .doc(String(currentProfileId))
          .collection(WATCH_HISTORY_COLLECTION)
          .doc(epDocId)
          .get()
          .then((epDoc) => {
            if (!isMounted || currentSessionId !== episodeSessionIdRef.current) return;
            if (epDoc.exists) {
              const fsRes = extractResumeMillis(epDoc.data());
              if (fsRes.resumeMs > lastPositionRef.current && lastPositionRef.current < 3000) {
                lastPositionRef.current = fsRes.resumeMs;
                setInitialStartMillis(fsRes.resumeMs);
                setPosMillis(fsRes.resumeMs);
                if (videoRef.current) {
                  videoRef.current.setPositionAsync(fsRes.resumeMs).catch(() => {});
                }
              }
            }
          })
          .catch(() => {});
      }

      // Step B: Offline File Check First
      let targetLocalVideoUri = offlineStreamUri;
      let targetLocalMeta = offlineMetaUri;
      let targetLocalSub = offlineSubUri;
      let offlineQualityLabel = params.quality || '1080p';
      let matchedQueueRecord = null;

      try {
        const queue = await readLocalDownloadsQueue();
        matchedQueueRecord = queue.find((item) => {
          const sameAnime =
            String(item.animeId) === String(effectiveAnimeId) ||
            String(item.animeTitle || '').toLowerCase() === String(animeTitle || '').toLowerCase();
          const sameEp = Number(item.episodeNum) === Number(currentEpNum);
          return sameAnime && sameEp;
        });

        if (matchedQueueRecord) {
          const candidateUri =
            targetLocalVideoUri ||
            matchedQueueRecord.localUri ||
            matchedQueueRecord.fileUri ||
            matchedQueueRecord.streamUri ||
            null;

          if (candidateUri) {
            if (String(candidateUri).startsWith('file://')) {
              const fileCheck = await FileSystem.getInfoAsync(candidateUri);
              if (fileCheck?.exists) targetLocalVideoUri = candidateUri;
            } else if (String(candidateUri).startsWith('http')) {
              targetLocalVideoUri = candidateUri;
            }
          }

          targetLocalMeta = targetLocalMeta || matchedQueueRecord.localMetaUri || null;
          targetLocalSub =
            targetLocalSub ||
            matchedQueueRecord.localSubtitleUri ||
            matchedQueueRecord.subtitle?.localUri ||
            matchedQueueRecord.subtitle?.file ||
            null;
          offlineQualityLabel = matchedQueueRecord.quality || offlineQualityLabel;
        }
      } catch (_) {}

      if (targetLocalVideoUri) {
        const isLocalDiskFile = String(targetLocalVideoUri).startsWith('file://');
        let canPlayDirectly = !isLocalDiskFile;

        if (isLocalDiskFile) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(targetLocalVideoUri);
            canPlayDirectly = Boolean(fileInfo?.exists);
          } catch (_) {
            canPlayDirectly = false;
          }
        }

        if (canPlayDirectly) {
          const inferredFolder = isLocalDiskFile
            ? targetLocalVideoUri.substring(0, targetLocalVideoUri.lastIndexOf('/') + 1)
            : null;
          let metaJson = null;

          if (inferredFolder || targetLocalMeta) {
            try {
              const metaCandidate = targetLocalMeta || `${inferredFolder}metadata.json`;
              if (String(metaCandidate).startsWith('file://')) {
                const metaInfo = await FileSystem.getInfoAsync(metaCandidate);
                if (metaInfo?.exists) {
                  metaJson = JSON.parse(await FileSystem.readAsStringAsync(metaCandidate));
                }
              }
            } catch (_) {}
          }

          const resolvedOfflineQual = metaJson?.quality || offlineQualityLabel || 'Offline HD';
          const finalOfflinePlayUri = isLocalDiskFile
            ? targetLocalVideoUri
            : buildProxiedUrl(targetLocalVideoUri, matchedQueueRecord?.referer || 'https://vidwish.live/');

          if (isMounted && currentSessionId === episodeSessionIdRef.current) {
            setIsOfflineMode(true);
            setCurrentAutoRes(resolvedOfflineQual);
            setSelectedQuality(resolvedOfflineQual);
            setQualityList([{ label: resolvedOfflineQual, uri: finalOfflinePlayUri }]);
            setStreamData({
              m3u8: finalOfflinePlayUri,
              referer: matchedQueueRecord?.referer || 'https://vidwish.live/',
              isOffline: true,
              intro: metaJson?.intro || null,
              outro: metaJson?.outro || null,
            });
            setActiveUrl(finalOfflinePlayUri);
            setLoadingStream(false);
          }

          // Load offline subtitles non-blockingly
          try {
            const subCandidate =
              targetLocalSub ||
              metaJson?.subtitle?.localUri ||
              (inferredFolder ? `${inferredFolder}subtitle.vtt` : null);

            if (subCandidate) {
              let rawVtt = '';
              if (String(subCandidate).startsWith('file://')) {
                const subInfo = await FileSystem.getInfoAsync(subCandidate);
                if (subInfo?.exists) rawVtt = await FileSystem.readAsStringAsync(subCandidate);
              } else if (String(subCandidate).startsWith('http')) {
                const subRes = await fetch(buildProxiedUrl(subCandidate, matchedQueueRecord?.referer || 'https://vidwish.live/'));
                rawVtt = await subRes.text();
              }
              if (rawVtt) {
                const cues = parseVttTextToCues(rawVtt);
                if (cues.length > 0 && isMounted && currentSessionId === episodeSessionIdRef.current) {
                  setParsedSubs(cues);
                  setSubtitlesEnabled(true);
                }
              }
            }
          } catch (_) {}

          return;
        }
      }

      // Step C: BLAZE-X ONLINE STREAM ENGINE (/api/servers -> /api/stream -> Cloudflare Worker Proxy)
      let effectiveId = providerId || animeId || paramId;
      const effectiveSlug = currentSlug || currentEpNum;

      if (!effectiveId || !effectiveSlug) {
        if (isMounted && currentSessionId === episodeSessionIdRef.current) {
          setLoadingStream(false);
        }
        return;
      }

      // If effectiveId is an AniList numeric ID, resolve the Anikoto slug first
      if (/^\d+$/.test(String(effectiveId)) && animeTitle) {
        try {
          const sRes = await fetch(`${VERCEL_API_BASE}/api/search?keyword=${encodeURIComponent(animeTitle)}`);
          const sJson = await sRes.json();
          const matches = sJson?.data || [];
          if (matches.length > 0) {
            const exact = matches.find((m) => String(m.title || '').toLowerCase() === animeTitle.toLowerCase()) || matches[0];
            if (exact?.id) {
              effectiveId = exact.id;
              if (isMounted) setProviderId(exact.id);
            }
          }
        } catch (_) {}
      }

      // Mirror Blaze-X Web Player: Fetch available servers or use default priority order
      let typeServers = ['hd-1', 'hd-2', 'vidstream-2'];
      try {
        const srvRes = await fetch(
          `${VERCEL_API_BASE}/api/servers?id=${encodeURIComponent(effectiveId)}&ep=${encodeURIComponent(effectiveSlug)}`
        );
        const srvJson = await srvRes.json();
        if (srvJson?.success && Array.isArray(srvJson.data) && srvJson.data.length > 0) {
          const matchedType = srvJson.data
            .filter((s) => s.type === selectedAudioType)
            .map((s) => s.serverName)
            .filter(Boolean);
          if (matchedType.length > 0) {
            typeServers = matchedType.includes('hd-1')
              ? ['hd-1', ...matchedType.filter((s) => s !== 'hd-1')]
              : matchedType;
          }
        }
      } catch (_) {}

      let finalStreamData = null;

      for (const srv of typeServers) {
        try {
          const url = `${VERCEL_API_BASE}/api/stream?id=${encodeURIComponent(effectiveId)}&ep=${encodeURIComponent(effectiveSlug)}&server=${encodeURIComponent(srv)}&type=${selectedAudioType}`;
          const res = await fetch(url);
          const json = await res.json();
          const dataObj = json?.data || json?.results || {};
          const rawM3u8 = dataObj.m3u8 || dataObj.streamingLink || null;

          if (rawM3u8) {
            finalStreamData = {
              m3u8: rawM3u8,
              referer: dataObj.referer || 'https://vidwish.live/',
              intro: dataObj.intro || { start: 0, end: 0 },
              outro: dataObj.outro || { start: 0, end: 0 },
              subtitles: Array.isArray(dataObj.subtitles) ? dataObj.subtitles : [],
            };
            break;
          }
        } catch (_) {}
      }

      if (!isMounted || currentSessionId !== episodeSessionIdRef.current) return;
      if (!finalStreamData || !finalStreamData.m3u8) {
        setLoadingStream(false);
        setIsBuffering(false);
        return;
      }

      const rawUrl = finalStreamData.m3u8;
      const targetReferer = finalStreamData.referer || 'https://vidwish.live/';
      // Wrap in your Blaze-X Cloudflare Worker Proxy for instant playback!
      const proxiedMasterUrl = buildProxiedUrl(rawUrl, targetReferer);

      // 1. IMMEDIATELY MOUNT VIDEO PLAYER (0ms delay - no waiting for quality or subtitle parsing!)
      setIsOfflineMode(false);
      setRawMasterUrl(rawUrl);
      setStreamData(finalStreamData);
      setQualityList([{ label: 'Auto', uri: proxiedMasterUrl }]);
      setSelectedQuality('Auto');
      setActiveUrl(proxiedMasterUrl);
      setLoadingStream(false);

      // 2. NON-BLOCKING BACKGROUND QUALITY PARSER (Via Cloudflare Worker Proxy)
      fetch(proxiedMasterUrl)
        .then((r) => r.text())
        .then((m3Text) => {
          if (!isMounted || currentSessionId !== episodeSessionIdRef.current) return;
          const lines = m3Text.split('\n');
          const qualities = [{ label: 'Auto', uri: proxiedMasterUrl }];

          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('RESOLUTION=')) {
              const resMatch = lines[i].match(/RESOLUTION=\d+x(\d+)/);
              if (resMatch && lines[i + 1]) {
                let variantLine = lines[i + 1].trim();
                let finalVariantUri = variantLine;

                if (!variantLine.startsWith('http')) {
                  const baseRaw = rawUrl.substring(0, rawUrl.lastIndexOf('/') + 1);
                  finalVariantUri = buildProxiedUrl(baseRaw + variantLine, targetReferer);
                } else if (!variantLine.includes('prashant-yash69.workers.dev')) {
                  finalVariantUri = buildProxiedUrl(variantLine, targetReferer);
                }

                qualities.push({ label: `${resMatch[1]}p`, uri: finalVariantUri });
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
        })
        .catch(() => {});

      // 3. NON-BLOCKING BACKGROUND SUBTITLE PARSER (Via Cloudflare Worker Proxy)
      if (Array.isArray(finalStreamData.subtitles) && finalStreamData.subtitles.length > 0) {
        const captions = finalStreamData.subtitles.filter(
          (t) => !t.kind || t.kind === 'captions' || t.kind === 'subtitles'
        );
        const bestSub =
          captions.find((s) => String(s.label || s.lang || '').toLowerCase().includes('eng')) ||
          captions.find((s) => s.default) ||
          captions[0];

        if (bestSub?.file) {
          const proxiedSubUrl = buildProxiedUrl(bestSub.file, targetReferer);
          fetch(proxiedSubUrl)
            .then((r) => r.text())
            .then((vttText) => {
              if (!isMounted || currentSessionId !== episodeSessionIdRef.current) return;
              const cues = parseVttTextToCues(vttText);
              if (cues.length > 0) {
                setParsedSubs(cues);
              }
            })
            .catch(() => {});
        }
      }
    };

    loadEpisodeProgressAndStream();
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
    resolvedUid,
    currentProfileId,
  ]);

  // 4. ULTRA-LIGHTWEIGHT PLAYBACK CALLBACK
  const handlePlaybackStatusUpdate = useCallback(
    (st, sessionToken) => {
      if (sessionToken !== episodeSessionIdRef.current) return;

      if (!st?.isLoaded) {
        setIsBuffering(true);
        return;
      }

      const currentMs = st.positionMillis || 0;
      const durationMs = st.durationMillis || lastDurationRef.current || 0;
      const currentTimeSec = currentMs / 1000;
      const wholeSec = Math.floor(currentTimeSec);
      const bufferingNow = Boolean(st.isBuffering && !st.isPlaying);

      if (hasRestoredPositionOnLoadRef.current || currentMs > 1000) {
        if (currentMs > 0) lastPositionRef.current = currentMs;
      }
      if (durationMs > 0) lastDurationRef.current = durationMs;

      if (st.naturalSize?.height) {
        const resLabel = `${st.naturalSize.height}p`;
        setCurrentAutoRes((prev) => (prev === resLabel ? prev : resLabel));
      }

      // 1. O(log n) Binary Search Subtitle Cue Lookup
      if (subtitlesEnabledRef.current && parsedSubsRef.current.length > 0) {
        const nextText = findActiveSubtitleCue(parsedSubsRef.current, currentTimeSec);
        if (nextText !== currentSubTextRef.current) {
          currentSubTextRef.current = nextText;
          setCurrentSubText(nextText);
        }
      } else if (currentSubTextRef.current !== '') {
        currentSubTextRef.current = '';
        setCurrentSubText('');
      }

      // 2. Update React UI once per second or on play/buffer state change
      if (
        wholeSec !== lastRenderedSecRef.current ||
        Boolean(st.isPlaying) !== isPlayingRef.current ||
        bufferingNow !== isBuffering
      ) {
        lastRenderedSecRef.current = wholeSec;
        setIsLoaded(true);
        setIsBuffering(bufferingNow);
        setIsPlaying(Boolean(st.isPlaying));
        if (!isSeeking && (hasRestoredPositionOnLoadRef.current || currentMs >= lastPositionRef.current)) {
          setPosMillis(currentMs);
        }
        if (durationMs > 0) {
          setDurMillis(durationMs);
        }
      }

      // 3. Throttled background save every 5 seconds (matches Blaze-X web player)
      if (
        hasRestoredPositionOnLoadRef.current &&
        st.isPlaying &&
        wholeSec > 0 &&
        Math.abs(wholeSec - lastSavedSecRef.current) >= 5
      ) {
        lastSavedSecRef.current = wholeSec;
        saveWatchHistory(currentMs, durationMs);
      }

      if (st.didJustFinish && durationMs > 0) {
        saveWatchHistory(durationMs, durationMs, true);
      }
    },
    [isSeeking, isBuffering, saveWatchHistory]
  );

  // 5. SEAMLESS NEXT EPISODE HANDLER
  const handleNextEpisode = useCallback(async () => {
    if (!hasNextEpisode || !nextEpisodeData) return;

    const departingMeta = { ...latestMetaRef.current };
    const departingPos = lastPositionRef.current;
    const departingDur = lastDurationRef.current;

    episodeSessionIdRef.current += 1;
    hasRestoredPositionOnLoadRef.current = false;

    try {
      await videoRef.current?.stopAsync?.();
    } catch (_) {}

    saveWatchHistory(departingPos, departingDur, true, departingMeta);

    lastPositionRef.current = 0;
    lastDurationRef.current = 0;
    lastSavedSecRef.current = 0;
    lastRenderedSecRef.current = -1;
    currentSubTextRef.current = '';

    setLoadingStream(true);
    setIsBuffering(true);
    setActiveUrl(null);
    setIsLoaded(false);
    setInitialStartMillis(0);
    setPosMillis(0);
    setDurMillis(0);
    setCurrentSubText('');
    setParsedSubs([]);

    if (nextEpisodeData.localUri) {
      setIsOfflineMode(Boolean(nextEpisodeData.isOffline));
      setOfflineStreamUri(nextEpisodeData.localUri);
      setOfflineMetaUri(nextEpisodeData.localMetaUri || null);
      setOfflineSubUri(nextEpisodeData.localSubtitleUri || null);
    } else {
      setIsOfflineMode(false);
      setOfflineStreamUri(null);
      setOfflineMetaUri(null);
      setOfflineSubUri(null);
    }

    setCurrentEpNum(Number(nextEpisodeData.num));
    setCurrentEpTitle(nextEpisodeData.title || `Episode ${nextEpisodeData.num}`);
    setCurrentSlug(String(nextEpisodeData.slug));
  }, [hasNextEpisode, nextEpisodeData, saveWatchHistory]);

  // --- UI VISIBILITY & LONG-PRESS 2X ---
  const hideUINow = useCallback(() => {
    if (hideUITimeout.current) clearTimeout(hideUITimeout.current);
    Animated.timing(uiOpacity, {
      toValue: 0,
      duration: 200,
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
      duration: 180,
      useNativeDriver: true,
    }).start();

    if (hideUITimeout.current) clearTimeout(hideUITimeout.current);
    hideUITimeout.current = setTimeout(() => {
      if (isPlayingRef.current && !activeMenuRef.current) {
        hideUINow();
      }
    }, 3500);
  }, [uiOpacity, hideUINow]);

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
      if (isPlayingRef.current && videoRef.current) {
        didTriggerLongPressRef.current = true;
        previousSpeedRef.current = playbackSpeed;
        videoRef.current.setRateAsync(2.0, true);
        setIs2xActive(true);
      }
    }, 450);
  };

  const handleTouchEnd = () => {
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
    }
  };

  useEffect(() => {
    if (isPlaying) {
      if (showUIRef.current) resetHideTimer();
    } else {
      if (hideUITimeout.current) clearTimeout(hideUITimeout.current);
      if (!isLocked) {
        setShowUI(true);
        showUIRef.current = true;
        Animated.timing(uiOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      }
      if (isLoaded && lastPositionRef.current > 0) {
        saveWatchHistory(lastPositionRef.current, lastDurationRef.current, true);
      }
    }
  }, [isPlaying, activeMenu, isLocked, isLoaded, resetHideTimer, uiOpacity, saveWatchHistory]);

  const displayPosMillis = isSeeking ? seekPreviewMillis : posMillis;
  const displayDurMillis = durMillis || lastDurationRef.current || 100;

  // Passed to PlayPauseSkip so the center spinner rotates while fetching or buffering
  const lightStatus = useMemo(
    () => ({
      isLoaded: isLoaded && !loadingStream,
      isBuffering: loadingStream || isBuffering,
      isPlaying,
      positionMillis: displayPosMillis,
      durationMillis: displayDurMillis,
    }),
    [isLoaded, loadingStream, isBuffering, isPlaying, displayPosMillis, displayDurMillis]
  );

  // Source builder compatible with Cloudflare Worker Proxy & local files
  const videoSource = useMemo(() => {
    if (!activeUrl) return null;
    const cleanUrl = String(activeUrl);
    const isLocalFile = cleanUrl.startsWith('file://');
    const lowerUrl = cleanUrl.split('?')[0].toLowerCase();

    if (isLocalFile) {
      if (lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.mkv') || lowerUrl.endsWith('.webm')) {
        return { uri: cleanUrl };
      }
      if (lowerUrl.endsWith('.ts')) {
        return { uri: cleanUrl, overrideFileExtensionAndroid: 'ts' };
      }
      return { uri: cleanUrl, overrideFileExtensionAndroid: 'm3u8' };
    }

    return {
      uri: cleanUrl,
      overrideFileExtensionAndroid: lowerUrl.endsWith('.mp4') ? 'mp4' : 'm3u8',
      headers: {
        Referer: streamData?.referer || 'https://vidwish.live/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    };
  }, [activeUrl, streamData?.referer]);

  const activeSessionToken = episodeSessionIdRef.current;

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />

      {videoSource ? (
        <Video
          key={`${currentEpNum}_${activeUrl}`}
          ref={videoRef}
          style={styles.videoPlayer}
          source={videoSource}
          positionMillis={initialStartMillis > 0 ? initialStartMillis : 0}
          useNativeControls={false}
          resizeMode={resizeMode}
          progressUpdateIntervalMillis={isOfflineMode ? 500 : 750}
          onPlaybackStatusUpdate={(st) => handlePlaybackStatusUpdate(st, activeSessionToken)}
          onError={() => {
            // Automatic fallback if proxy or direct URL hiccups
            if (streamErrorRetryCount === 0 && rawMasterUrl && activeUrl !== rawMasterUrl) {
              setStreamErrorRetryCount(1);
              setActiveUrl(rawMasterUrl);
            }
          }}
          onLoad={async (loadStatus) => {
            if (activeSessionToken !== episodeSessionIdRef.current) return;
            setIsLoaded(true);
            setIsBuffering(false);
            const loadedDur = loadStatus?.durationMillis || lastDurationRef.current || 0;
            if (loadedDur > 0) {
              lastDurationRef.current = loadedDur;
              setDurMillis(loadedDur);
            }
            const targetStartMs = lastPositionRef.current > 0 ? lastPositionRef.current : initialStartMillis;
            const currentLoadedPos = loadStatus?.positionMillis || 0;

            if (videoRef.current) {
              if (targetStartMs > 0 && Math.abs(currentLoadedPos - targetStartMs) > 1500) {
                await videoRef.current
                  .setPositionAsync(targetStartMs, { toleranceMillisBefore: 0, toleranceMillisAfter: 0 })
                  .catch(() => {});
              }
              hasRestoredPositionOnLoadRef.current = true;
              if (playbackSpeed !== 1.0) {
                await videoRef.current.setRateAsync(playbackSpeed, true).catch(() => {});
              }
              await videoRef.current.playAsync().catch(() => {});
            } else {
              hasRestoredPositionOnLoadRef.current = true;
            }
            saveWatchHistory(targetStartMs || 1000, loadedDur, true);
          }}
          shouldPlay
        />
      ) : null}

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

      {/* EXTERNAL PLAY / PAUSE / DOUBLE-TAP SKIP SCRIPT */}
      <PlayPauseSkip
        status={lightStatus}
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

      {/* EXTERNAL INTRO / OUTRO SKIP SCRIPT */}
      <SkipIntroOutro
        status={lightStatus}
        videoRef={videoRef}
        introData={streamData?.intro}
        outroData={streamData?.outro}
        isLocked={isLocked}
        onSkipOutro={hasNextEpisode ? handleNextEpisode : null}
      />

      {/* TOP & BOTTOM PLAYER UI LAYER (MOUNTED AT 0MS) */}
      <Animated.View style={[styles.uiLayer, { opacity: uiOpacity }]} pointerEvents={showUI ? 'box-none' : 'none'}>
        {!isLocked && (
          <View style={styles.topBarWrapper} pointerEvents="box-none">
            <TopGradientOverlay />
            <View style={styles.topBarContent} pointerEvents="box-none">
              <View style={styles.topLeftGroup}>
                <TouchableOpacity
                  onPress={() => {
                    saveWatchHistory(lastPositionRef.current, lastDurationRef.current, true);
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
                  <Text style={styles.subTitle} numberOfLines={1}>
                    Episode {currentEpNum} {currentEpTitle ? `• ${currentEpTitle}` : ''}
                  </Text>
                </View>
              </View>
              <View style={styles.topRightGroup}>
                <TouchableOpacity onPress={() => setActiveMenu('subs')} style={[styles.iconBtn, styles.topRightSpacing]}>
                  <IconSubs color={subtitlesEnabled ? "#FFF" : "#777"} />
                </TouchableOpacity>
                {!isOfflineMode && (
                  <TouchableOpacity onPress={() => setActiveMenu('audio')} style={[styles.iconBtn, styles.topRightSpacing]}>
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
          <BottomGradientOverlay />
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
                  <TouchableOpacity onPress={() => setActiveMenu('speed')} style={{ marginLeft: 20 }}>
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
                <Text style={styles.timeText}>{formatTime(displayPosMillis)}</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={displayDurMillis}
                  value={displayPosMillis}
                  minimumTrackTintColor={BRAND_RED}
                  maximumTrackTintColor="rgba(255,255,255,0.2)"
                  thumbTintColor="#FFF"
                  onSlidingStart={() => {
                    setIsSeeking(true);
                    if (hideUITimeout.current) clearTimeout(hideUITimeout.current);
                  }}
                  onValueChange={(val) => setSeekPreviewMillis(val)}
                  onSlidingComplete={async (val) => {
                    setIsSeeking(false);
                    setPosMillis(val);
                    lastPositionRef.current = val;
                    if (videoRef.current) {
                      await videoRef.current
                        .setPositionAsync(val, { toleranceMillisBefore: 0, toleranceMillisAfter: 0 })
                        .catch(() => {});
                      saveWatchHistory(val, displayDurMillis, true);
                      resetHideTimer();
                    }
                  }}
                />
                <Text style={styles.timeText}>
                  -{formatTime(Math.max(0, displayDurMillis - displayPosMillis))}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Animated.View>

      {/* EXTERNAL VIDEO QUALITY SHEET */}
      {activeMenu === 'quality' && (
        <VideoQualitySheet
          activeMenu={activeMenu}
          setActiveMenu={setActiveMenu}
          qualityList={qualityList}
          selectedQuality={selectedQuality}
          setSelectedQuality={setSelectedQuality}
          setActiveUrl={(newQualityUri) => {
            setInitialStartMillis(lastPositionRef.current);
            hasRestoredPositionOnLoadRef.current = false;
            setActiveUrl(buildProxiedUrl(newQualityUri, streamData?.referer || 'https://vidwish.live/'));
          }}
          currentAutoRes={currentAutoRes}
        />
      )}

      {/* EXTERNAL SUBTITLE SHEET */}
      <SubtitleSheet
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        subtitlesEnabled={subtitlesEnabled}
        setSubtitlesEnabled={setSubtitlesEnabled}
        subSettings={subSettings}
        setSubSettings={setSubSettings}
        animeId={effectiveAnimeId}
        animeTitle={animeTitle}
        episodeNum={currentEpNum}
        slug={currentSlug || currentEpNum}
        isOffline={isOfflineMode}
        localSubtitleUri={offlineSubUri}
        localMetaUri={offlineMetaUri}
        localVideoUri={offlineStreamUri}
        onSelectSubtitleTrack={(track) => {
          if (track && Array.isArray(track.cues)) {
            setParsedSubs(track.cues);
          } else {
            setParsedSubs([]);
            setCurrentSubText('');
          }
        }}
      />

      {/* EXTERNAL AUDIO SHEET */}
      {activeMenu === 'audio' && (
        <AudioSheet
          activeMenu={activeMenu}
          setActiveMenu={setActiveMenu}
          animeId={effectiveAnimeId}
          episodeNum={currentEpNum}
          slug={currentSlug || currentEpNum}
          currentTargetType={selectedAudioType}
          onSelectAudioType={(newAudioType) => {
            setInitialStartMillis(lastPositionRef.current);
            hasRestoredPositionOnLoadRef.current = false;
            setSelectedAudioType(newAudioType);
          }}
        />
      )}

      {/* EXTERNAL SPEED SHEET */}
      {activeMenu === 'speed' && (
        <SpeedSheet
          activeMenu={activeMenu}
          setActiveMenu={setActiveMenu}
          playbackSpeed={playbackSpeed}
          setPlaybackSpeed={setPlaybackSpeed}
          videoRef={videoRef}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', width: '100%', height: '100%' },
  videoPlayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  speedIndicatorBadge: { position: 'absolute', top: 25, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', zIndex: 35 },
  speedIndicatorText: { color: '#FFF', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  subtitleContainer: { position: 'absolute', width: '100%', alignItems: 'center', zIndex: 25, elevation: 10, paddingHorizontal: 25 },
  subtitleText: { fontWeight: '800', textAlign: 'center', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  uiLayer: { ...StyleSheet.absoluteFillObject, zIndex: 10, justifyContent: 'space-between' },
  topBarWrapper: { width: '100%', position: 'absolute', top: 0, height: 120 },
  topBarContent: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 16 },
  topLeftGroup: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 16 },
  titleColumn: { paddingHorizontal: 10, flex: 1 },
  titleRowWithBadge: { flexDirection: 'row', alignItems: 'center' },
  mainTitle: { color: '#FFF', fontSize: 17, fontWeight: '700', textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2, flexShrink: 1, marginRight: 8 },
  offlineBadge: { backgroundColor: BRAND_RED, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  offlineBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  subTitle: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontStyle: 'italic', marginTop: 2 },
  topRightGroup: { flexDirection: 'row', alignItems: 'center' },
  topRightSpacing: { marginRight: 20 },
  iconBtn: { padding: 4, opacity: 0.9 },
  hdBtn: { borderWidth: 1.5, borderColor: '#FFF', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, height: 20, justifyContent: 'center', alignItems: 'center' },
  hdBtnText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  bottomBarWrapper: { width: '100%', position: 'absolute', bottom: 0, height: 120, justifyContent: 'flex-end' },
  bottomContent: { paddingHorizontal: 28, paddingBottom: 16 },
  bottomToolsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4 },
  toolsLeft: { flexDirection: 'row', alignItems: 'center' },
  toolsRight: { flexDirection: 'row', alignItems: 'center' },
  speedBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600', opacity: 0.9 },
  progressRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  timeText: { color: '#FFF', fontSize: 13, fontFamily: 'monospace', minWidth: 45, textAlign: 'center' },
  slider: { flex: 1, marginHorizontal: 12, height: 28 },
});
