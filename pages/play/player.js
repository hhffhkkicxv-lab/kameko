import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Animated, 
  StatusBar, BackHandler, Platform, AppState, useWindowDimensions 
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
import SubtitleSheet from './subtitle'; // Subtitle tracking delegated here!
import AudioSheet from './audio';
import SpeedSheet from './speed';
import SkipIntroOutro from './intro-outro';
import PlayPauseSkip from './play-pause-skip';

const BRAND_RED = '#E50914';
const VERCEL_API_BASE = 'https://anikoto-api-lyart.vercel.app';
const CUSTOM_PROXY_URL = 'https://icy-wave-30d8.prashant-yash69.workers.dev/proxy?url=';
const WATCH_HISTORY_COLLECTION = 'watch_history';

const DOWNLOAD_QUEUE_FILE_URI = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}kameko_downloads_queue.json` : null;
const LOCAL_WATCH_CACHE_URI = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}kameko_watch_progress_cache.json` : null;

const buildProxiedUrl = (rawUrl, referer = 'https://vidwish.live/') => {
  if (!rawUrl) return null;
  const str = String(rawUrl);
  if (str.startsWith('file://') || str.includes('prashant-yash69.workers.dev')) return str;
  return `${CUSTOM_PROXY_URL}${encodeURIComponent(str)}&referer=${encodeURIComponent(referer)}`;
};

const readLocalDownloadsQueue = async () => {
  try {
    if (DOWNLOAD_QUEUE_FILE_URI) {
      const info = await FileSystem.getInfoAsync(DOWNLOAD_QUEUE_FILE_URI);
      if (info?.exists) {
        const raw = await FileSystem.readAsStringAsync(DOWNLOAD_QUEUE_FILE_URI);
        if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed; }
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
        if (raw) { const parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object') { inMemoryWatchCache = parsed; return inMemoryWatchCache; } }
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
    if (LOCAL_WATCH_CACHE_URI) FileSystem.writeAsStringAsync(LOCAL_WATCH_CACHE_URI, JSON.stringify(current)).catch(() => {});
  } catch (_) {}
};

const extractResumeMillis = (dataObj) => {
  if (!dataObj) return { resumeMs: 0, durationMs: 0, timestamp: 0 };
  const durMs = Number(dataObj.durationMillis) > 0 ? Number(dataObj.durationMillis) : Number(dataObj.duration) > 0 ? Number(dataObj.duration) * 1000 : 0;
  const rawPosMs = Number(dataObj.positionMillis) > 0 ? Number(dataObj.positionMillis) : Number(dataObj.progress) > 0 ? Number(dataObj.progress) * 1000 : 0;
  const isAtVeryEnd = durMs > 10000 && rawPosMs >= durMs * 0.98;
  return { resumeMs: isAtVeryEnd ? 0 : Math.max(0, Math.floor(rawPosMs)), durationMs: Math.max(0, Math.floor(durMs)), timestamp: Number(dataObj.timestamp || dataObj.updatedAt || 0) };
};

const formatTime = (millis) => {
  if (!millis || isNaN(millis) || millis < 0) return '00:00';
  const totalSecs = Math.floor(millis / 1000);
  const h = Math.floor(totalSecs / 3600), m = Math.floor((totalSecs % 3600) / 60).toString().padStart(2, '0'), s = Math.floor(totalSecs % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
};

const IconBack = React.memo(({ size = 28 }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5"><Path d="M19 12H5M12 19l-7-7 7-7" /></Svg>));
const IconSubs = React.memo(({ size = 24, color = "#FFF" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><Rect x="3" y="5" width="18" height="14" rx="2" ry="2"/><Path d="M7 15h3m4 0h3M7 9h10"/></Svg>));
const IconAudio = React.memo(({ size = 24, color = "#FFF" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><Path d="M3 18v-6a9 9 0 0118 0v6"/><Path d="M21 19a2 2 0 01-2 2h-1v-6h3v4zM3 19a2 2 0 002 2h1v-6H3v4z"/></Svg>));
const IconNextEp = React.memo(({ size = 22, color = "#FFF" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></Svg>));

const TopGradientOverlay = React.memo(({ screenWidth }) => (
  <Svg width={screenWidth} height={130} viewBox="0 0 100 100" preserveAspectRatio="none" style={styles.topGradientSvg} pointerEvents="none">
    <Defs><LinearGradient id="topCinematic" x1="0%" y1="0%" x2="0%" y2="100%"><Stop offset="0%" stopColor="#000000" stopOpacity="0.88" /><Stop offset="45%" stopColor="#000000" stopOpacity="0.45" /><Stop offset="80%" stopColor="#000000" stopOpacity="0.12" /><Stop offset="100%" stopColor="#000000" stopOpacity="0" /></LinearGradient></Defs>
    <Rect x="0" y="0" width="100" height="100" fill="url(#topCinematic)" />
  </Svg>
));

const BottomGradientOverlay = React.memo(({ screenWidth }) => (
  <Svg width={screenWidth} height={130} viewBox="0 0 100 100" preserveAspectRatio="none" style={styles.bottomGradientSvg} pointerEvents="none">
    <Defs><LinearGradient id="botCinematic" x1="0%" y1="100%" x2="0%" y2="0%"><Stop offset="0%" stopColor="#000000" stopOpacity="0.90" /><Stop offset="45%" stopColor="#000000" stopOpacity="0.45" /><Stop offset="80%" stopColor="#000000" stopOpacity="0.12" /><Stop offset="100%" stopColor="#000000" stopOpacity="0" /></LinearGradient></Defs>
    <Rect x="0" y="0" width="100" height="100" fill="url(#botCinematic)" />
  </Svg>
));

export default function Player({ route, navigation, user: propUser, activeProfileId: propActiveProfileId }) {
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const landscapeWidth = Math.max(winWidth, winHeight);
  const params = route?.params || {};

  const { animeTitle = 'Unknown', animeId = null, id: paramId = null, userUid = null, targetType = 'sub', activeUrl: paramActiveUrl = null, streamUrl: paramStreamUrl = null, localUri: paramLocalUri = null, fileUri: paramFileUri = null, isOffline: paramIsOffline = false } = params;
  
  const initialOfflineUri = paramLocalUri || paramFileUri || (paramActiveUrl && String(paramActiveUrl).startsWith('file://') ? paramActiveUrl : null) || null;
  const initialPassedRemoteUrl = !initialOfflineUri && (paramStreamUrl || paramActiveUrl) ? buildProxiedUrl(paramStreamUrl || paramActiveUrl, params.referer || 'https://vidwish.live/') : null;

  const [isOfflineMode, setIsOfflineMode] = useState(Boolean(paramIsOffline || initialOfflineUri));
  const resolvedUid = userUid || propUser?.uid || auth().currentUser?.uid || null;
  const currentProfileId = params.activeProfileId || propActiveProfileId || 'default';
  const effectiveAnimeId = String(animeId || paramId || 'unknown');

  const [currentEpNum, setCurrentEpNum] = useState(Number(params.episodeNum || 1));
  const [currentSlug, setCurrentSlug] = useState(params.slug || null);
  const [currentEpTitle, setCurrentEpTitle] = useState(params.episodeTitle || params.epTitle || '');

  const videoRef = useRef(null);
  const uiOpacity = useRef(new Animated.Value(1)).current;
  const nextEpOpacity = useRef(new Animated.Value(0.25)).current;

  const [isLoaded, setIsLoaded] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  
  // Progress States (Throttled for Performance)
  const [posMillis, setPosMillis] = useState(0);
  const [durMillis, setDurMillis] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewMillis, setSeekPreviewMillis] = useState(0);

  const [showUI, setShowUI] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [resizeMode, setResizeMode] = useState(ResizeMode.CONTAIN);
  const [activeMenu, setActiveMenu] = useState(null); 
  const [selectedAudioType, setSelectedAudioType] = useState(targetType || 'sub');
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [is2xActive, setIs2xActive] = useState(false);

  // High Performance Engine Refs (Zero JS Re-Renders)
  const episodeSessionIdRef = useRef(1);
  const isVideoMountedRef = useRef(false);
  const lastPositionRef = useRef(0);
  const lastDurationRef = useRef(0);
  const lastRenderedSecRef = useRef(-1);

  const [cachedEpisodesList, setCachedEpisodesList] = useState([]);
  const [hasNextEpisode, setHasNextEpisode] = useState(false);
  const [nextEpisodeData, setNextEpisodeData] = useState(null);

  const [streamData, setStreamData] = useState(initialPassedRemoteUrl ? { m3u8: initialPassedRemoteUrl, referer: 'https://vidwish.live/' } : null);
  const [activeUrl, setActiveUrl] = useState(initialOfflineUri || initialPassedRemoteUrl || null);
  const [qualityList, setQualityList] = useState(initialPassedRemoteUrl ? [{ label: 'Auto', uri: initialPassedRemoteUrl }] : []);
  const [selectedQuality, setSelectedQuality] = useState('Auto');
  const [currentAutoRes, setCurrentAutoRes] = useState('1080p');

  // Subtitle States (Delegated strictly to external SubtitleSheet)
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [subSettings, setSubSettings] = useState({ color: '#FFFFFF', size: 16, height: 40, fontFamily: 'normal', backgroundColor: 'transparent' });
  const [subtitleData, setSubtitleData] = useState(null);

  const hideUITimeout = useRef(null);
  const longPressTimerRef = useRef(null);
  const activeMenuRef = useRef(activeMenu);
  const showUIRef = useRef(showUI);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => { activeMenuRef.current = activeMenu; }, [activeMenu]);
  useEffect(() => { showUIRef.current = showUI; }, [showUI]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const latestMetaRef = useRef({
    uid: resolvedUid, profileId: currentProfileId, animeId: effectiveAnimeId, animeTitle: String(animeTitle || 'Unknown'),
    epNum: Number(currentEpNum || 1), epTitle: String(currentEpTitle || `Episode ${currentEpNum || 1}`), slug: String(currentSlug ? currentSlug : currentEpNum),
    backdrop: params.backdropUrl || '', audioType: String(selectedAudioType || 'sub'),
  });

  const saveWatchHistory = useCallback((positionMillis, durationMillis, force = false) => {
    const meta = latestMetaRef.current;
    if (!meta.animeId || meta.animeId === 'unknown') return;

    const posMs = Math.max(0, Number(positionMillis || 0));
    const durMs = Math.max(0, Number(durationMillis || lastDurationRef.current || 0));
    const currentSecs = Math.floor(posMs / 1000);
    const durationSecs = Math.max(1, Math.floor(durMs / 1000));

    if (!force && currentSecs <= 0) return;
    const isCompleted = durMs > 10000 && currentSecs >= Math.floor(durationSecs * 0.85);
    const epDocId = `${meta.animeId}_ep_${meta.epNum}`;

    const episodePayload = {
      id: epDocId, animeId: String(meta.animeId), profileId: String(meta.profileId || 'default'),
      animeTitle: meta.animeTitle, episodeTitle: meta.epTitle, episodeNum: meta.epNum, slug: meta.slug,
      progress: currentSecs, duration: durationSecs, positionMillis: posMs, durationMillis: durMs,
      formattedTimestamp: formatTime(posMs), formattedDuration: formatTime(durMs),
      finishedEp: isCompleted, watched: true, audioType: meta.audioType, timestamp: Date.now(),
    };

    writeLocalWatchCacheEntry(`${meta.profileId || 'default'}_${epDocId}`, episodePayload);
    if (meta.uid && meta.profileId) {
      firestore().collection('users').doc(String(meta.uid)).collection('profiles').doc(String(meta.profileId))
        .collection(WATCH_HISTORY_COLLECTION).doc(epDocId).set(episodePayload, { merge: true }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const enterImmersiveLandscape = async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: true });
        StatusBar.setHidden(true, 'none');
        if (Platform.OS === 'android' && NavigationBar?.setVisibilityAsync) {
          await NavigationBar.setVisibilityAsync('hidden'); await NavigationBar.setBehaviorAsync('overlay-swipe');
        }
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch (_) {}
    };
    enterImmersiveLandscape();
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeMenuRef.current) { setActiveMenu(null); return true; }
      if (isLocked) { setIsLocked(false); setShowUI(true); Animated.timing(uiOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start(); return true; }
      saveWatchHistory(lastPositionRef.current, lastDurationRef.current, true);
      navigation.goBack();
      return true;
    });

    return () => {
      saveWatchHistory(lastPositionRef.current, lastDurationRef.current, true);
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => ScreenOrientation.unlockAsync().catch(() => {}));
      backHandler.remove();
    };
  }, [isLocked]);

  useEffect(() => {
    if (isOfflineMode || !animeTitle) return;
    fetch(`${VERCEL_API_BASE}/api/episodes/${encodeURIComponent(effectiveAnimeId)}`)
      .then(res => res.json()).then(json => { if (Array.isArray(json?.data || json?.results)) setCachedEpisodesList(json?.data || json?.results); }).catch(() => {});
  }, [animeTitle, isOfflineMode, effectiveAnimeId]);

  useEffect(() => {
    if (isOfflineMode || cachedEpisodesList.length === 0) return;
    const currentEpIndex = cachedEpisodesList.findIndex(ep => String(ep.slug || ep.id) === String(currentSlug) || Number(ep.num || ep.episode_no) === Number(currentEpNum));
    if (currentEpIndex !== -1 && currentEpIndex + 1 < cachedEpisodesList.length) {
      const nextEp = cachedEpisodesList[currentEpIndex + 1];
      setNextEpisodeData({ num: Number(nextEp.num || nextEp.episode_no || currentEpNum + 1), title: nextEp.title, slug: String(nextEp.slug || nextEp.id), isOffline: false });
      setHasNextEpisode(true);
      Animated.timing(nextEpOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    }
  }, [currentEpNum, currentSlug, cachedEpisodesList, isOfflineMode]);

  // =========================================================================
  // PARALLELIZED ULTRA-FAST BOOT SEQUENCE 
  // =========================================================================
  useEffect(() => {
    let isMounted = true;
    const sessionId = ++episodeSessionIdRef.current;
    const epDocId = `${effectiveAnimeId}_ep_${currentEpNum}`;
    setIsBuffering(true);
    isVideoMountedRef.current = false;

    const resolveOnlineStream = async () => {
      if (activeUrl) return;
      try {
        const effectiveSlug = currentSlug || currentEpNum;
        let finalStreamData = null;
        for (const srv of ['hd-1', 'hd-2', 'vidstream-2']) {
          const res = await fetch(`${VERCEL_API_BASE}/api/stream?id=${encodeURIComponent(effectiveSlug)}&server=${srv}&type=${selectedAudioType}`).catch(()=>null);
          const json = res ? await res.json() : null;
          if (json?.data?.m3u8) { finalStreamData = json.data; break; }
        }
        if (isMounted && sessionId === episodeSessionIdRef.current && finalStreamData) {
          const targetReferer = finalStreamData.referer || 'https://vidwish.live/';
          const proxiedUrl = buildProxiedUrl(finalStreamData.m3u8, targetReferer);
          setStreamData({ ...finalStreamData, m3u8: proxiedUrl });
          setActiveUrl(proxiedUrl);
          
          // Delegate subtitle URL to external subtitle.js component
          if (finalStreamData.subtitles?.length > 0) {
            const bestSub = finalStreamData.subtitles.find(s => String(s.label || '').toLowerCase().includes('eng')) || finalStreamData.subtitles[0];
            if (bestSub?.file) setSubtitleData({ url: buildProxiedUrl(bestSub.file, targetReferer) });
          }
        }
      } catch(e) {}
    };

    const resolveResumePosition = async () => {
      let targetStartMs = 0;
      try {
        const cache = await readLocalWatchCache();
        const entry = cache[`${currentProfileId || 'default'}_${epDocId}`] || cache[`any_${epDocId}`];
        if (entry) targetStartMs = extractResumeMillis(entry).resumeMs;
      } catch(e) {}

      if (targetStartMs > 0 && isMounted && sessionId === episodeSessionIdRef.current) {
        lastPositionRef.current = targetStartMs;
        if (isVideoMountedRef.current && videoRef.current) videoRef.current.setPositionAsync(targetStartMs).catch(()=>{});
      }

      if (resolvedUid && currentProfileId && effectiveAnimeId !== 'unknown') {
        firestore().collection('users').doc(String(resolvedUid)).collection('profiles').doc(String(currentProfileId))
          .collection(WATCH_HISTORY_COLLECTION).doc(epDocId).get().then(doc => {
            if (isMounted && sessionId === episodeSessionIdRef.current && doc.exists) {
              const fsRes = extractResumeMillis(doc.data());
              if (fsRes.resumeMs > lastPositionRef.current && lastPositionRef.current < 3000) {
                lastPositionRef.current = fsRes.resumeMs;
                if (isVideoMountedRef.current && videoRef.current) videoRef.current.setPositionAsync(fsRes.resumeMs).catch(()=>{});
              }
            }
          }).catch(()=>{});
      }
    };

    if (!isOfflineMode) resolveOnlineStream();
    resolveResumePosition();

    return () => { isMounted = false; };
  }, [currentEpNum, currentSlug, selectedAudioType, effectiveAnimeId, resolvedUid, currentProfileId]);

  // =========================================================================
  // HIGH PERFORMANCE PLAYBACK UPDATER (Strict 1000ms Throttling)
  // =========================================================================
  const handlePlaybackStatusUpdate = useCallback((st, sessionToken) => {
    if (sessionToken !== episodeSessionIdRef.current) return;
    if (!st?.isLoaded) { setIsBuffering(true); return; }

    const currentMs = st.positionMillis || 0;
    const durationMs = st.durationMillis || lastDurationRef.current || 0;
    const currentTimeSec = currentMs / 1000;
    const wholeSec = Math.floor(currentTimeSec);
    const bufferingNow = Boolean(st.isBuffering && !st.isPlaying);

    if (currentMs > 1000) lastPositionRef.current = currentMs;
    if (durationMs > 0) lastDurationRef.current = durationMs;

    // Throttle UI Bridge Updates purely for the Progress Slider
    if (wholeSec !== lastRenderedSecRef.current || Boolean(st.isPlaying) !== isPlayingRef.current || bufferingNow !== isBuffering) {
      lastRenderedSecRef.current = wholeSec;
      setIsLoaded(true); setIsBuffering(bufferingNow); setIsPlaying(Boolean(st.isPlaying));
      
      if (!isSeeking && currentMs >= 0) { setPosMillis(currentMs); setDurMillis(durationMs); }
      if (st.isPlaying && wholeSec % 5 === 0 && wholeSec > 0) saveWatchHistory(currentMs, durationMs);
    }
    if (st.didJustFinish && durationMs > 0) saveWatchHistory(durationMs, durationMs, true);
  }, [isSeeking, isBuffering, saveWatchHistory]);

  const handleNextEpisode = useCallback(async () => {
    if (!hasNextEpisode || !nextEpisodeData) return;
    saveWatchHistory(lastPositionRef.current, lastDurationRef.current, true);
    
    episodeSessionIdRef.current += 1;
    isVideoMountedRef.current = false;
    lastPositionRef.current = 0; lastDurationRef.current = 0; lastRenderedSecRef.current = -1;

    try { await videoRef.current?.stopAsync?.(); } catch (_) {}

    setIsBuffering(true); setActiveUrl(null); setIsLoaded(false); setPosMillis(0); setDurMillis(0); setSubtitleData(null);
    setCurrentEpNum(Number(nextEpisodeData.num)); setCurrentEpTitle(nextEpisodeData.title || `Episode ${nextEpisodeData.num}`); setCurrentSlug(String(nextEpisodeData.slug));
  }, [hasNextEpisode, nextEpisodeData, saveWatchHistory]);

  const hideUINow = useCallback(() => {
    if (hideUITimeout.current) clearTimeout(hideUITimeout.current);
    Animated.timing(uiOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => { setShowUI(false); showUIRef.current = false; });
  }, [uiOpacity]);

  const resetHideTimer = useCallback(() => {
    if (activeMenuRef.current) return;
    setShowUI(true); showUIRef.current = true;
    Animated.timing(uiOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    if (hideUITimeout.current) clearTimeout(hideUITimeout.current);
    hideUITimeout.current = setTimeout(() => { if (isPlayingRef.current && !activeMenuRef.current) hideUINow(); }, 3500);
  }, [uiOpacity, hideUINow]);

  const toggleUIOnTap = useCallback(() => {
    if (activeMenuRef.current) { setActiveMenu(null); return; }
    if (showUIRef.current) hideUINow(); else resetHideTimer();
  }, [hideUINow, resetHideTimer]);

  const handleTouchStart = () => {
    if (isLocked) return;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      if (isPlayingRef.current && videoRef.current) { videoRef.current.setRateAsync(2.0, true); setIs2xActive(true); }
    }, 450);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (is2xActive) { setIs2xActive(false); if (videoRef.current) videoRef.current.setRateAsync(playbackSpeed, true); }
  };

  useEffect(() => {
    if (isPlaying) { if (showUIRef.current) resetHideTimer(); } 
    else {
      if (hideUITimeout.current) clearTimeout(hideUITimeout.current);
      if (!isLocked) { setShowUI(true); showUIRef.current = true; Animated.timing(uiOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start(); }
    }
  }, [isPlaying, activeMenu, isLocked, resetHideTimer, uiOpacity]);

  const displayPosMillis = isSeeking ? seekPreviewMillis : posMillis;
  const displayDurMillis = durMillis || lastDurationRef.current || 100;
  const activeSessionToken = episodeSessionIdRef.current;

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />

      {activeUrl ? (
        <Video
          key={`${currentEpNum}_${activeUrl}`}
          ref={videoRef}
          style={styles.videoPlayer}
          source={{ uri: activeUrl, overrideFileExtensionAndroid: 'm3u8', headers: { Referer: streamData?.referer || 'https://vidwish.live/' } }}
          useNativeControls={false}
          resizeMode={resizeMode}
          progressUpdateIntervalMillis={1000}
          onPlaybackStatusUpdate={(st) => handlePlaybackStatusUpdate(st, activeSessionToken)}
          onLoad={async (loadStatus) => {
            if (activeSessionToken !== episodeSessionIdRef.current) return;
            isVideoMountedRef.current = true;
            setIsLoaded(true); setIsBuffering(false);
            if (loadStatus?.durationMillis > 0) setDurMillis(loadStatus.durationMillis);
            
            if (videoRef.current) {
              if (lastPositionRef.current > 0) await videoRef.current.setPositionAsync(lastPositionRef.current).catch(()=>{});
              if (playbackSpeed !== 1.0) await videoRef.current.setRateAsync(playbackSpeed, true).catch(()=>{});
              await videoRef.current.playAsync().catch(()=>{});
            }
          }}
          shouldPlay
        />
      ) : null}

      {is2xActive && (
        <View style={styles.speedIndicatorBadge} pointerEvents="none">
          <Text style={styles.speedIndicatorText}>2X SPEED ▶▶</Text>
        </View>
      )}

      {/* EXTERNAL PLAY/PAUSE/DOUBLE-TAP SCRIPT */}
      <PlayPauseSkip
        status={{ isLoaded: isLoaded && activeUrl, isBuffering, isPlaying, positionMillis: displayPosMillis, durationMillis: displayDurMillis }}
        videoRef={videoRef} resetHideTimer={resetHideTimer} toggleUI={toggleUIOnTap} isLocked={isLocked} uiOpacity={uiOpacity} showUI={showUI}
        setShowUI={(val) => { const nextVal = typeof val === 'function' ? val(showUIRef.current) : val; if (nextVal) resetHideTimer(); else hideUINow(); }}
        activeMenu={activeMenu} setActiveMenu={setActiveMenu} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
      />

      <SkipIntroOutro
        status={{ isLoaded: isLoaded && activeUrl, isBuffering, isPlaying, positionMillis: displayPosMillis, durationMillis: displayDurMillis }}
        videoRef={videoRef} introData={streamData?.intro} outroData={streamData?.outro} isLocked={isLocked} onSkipOutro={hasNextEpisode ? handleNextEpisode : null}
      />

      {/* DELEGATED SUBTITLE RENDERER */}
      <SubtitleSheet 
        activeMenu={activeMenu} setActiveMenu={setActiveMenu} subtitlesEnabled={subtitlesEnabled} setSubtitlesEnabled={setSubtitlesEnabled} 
        subSettings={subSettings} setSubSettings={setSubSettings} animeId={effectiveAnimeId} animeTitle={animeTitle} episodeNum={currentEpNum} 
        slug={currentSlug || currentEpNum} isOffline={isOfflineMode} 
        currentPositionMillis={displayPosMillis} // Passes current time down directly
        subtitleData={subtitleData}              // Passes URL down directly
        showUI={showUI}
      />

      <Animated.View style={[styles.uiLayer, { opacity: uiOpacity }]} pointerEvents={showUI ? 'box-none' : 'none'}>
        {!isLocked && (
          <View style={styles.topBarWrapper} pointerEvents="box-none">
            <TopGradientOverlay screenWidth={landscapeWidth} />
            <View style={styles.topBarContent} pointerEvents="box-none">
              <View style={styles.topLeftGroup}>
                <TouchableOpacity onPress={() => { saveWatchHistory(lastPositionRef.current, lastDurationRef.current, true); navigation.goBack(); }} style={styles.iconBtn} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}><IconBack /></TouchableOpacity>
                <View style={styles.titleColumn} pointerEvents="none">
                  <View style={styles.titleRowWithBadge}><Text style={styles.mainTitle} numberOfLines={1}>{animeTitle}</Text>{isOfflineMode && <View style={styles.offlineBadge}><Text style={styles.offlineBadgeText}>OFFLINE</Text></View>}</View>
                  <Text style={styles.subTitle} numberOfLines={1}>Episode {currentEpNum} {currentEpTitle ? `• ${currentEpTitle}` : ''}</Text>
                </View>
              </View>
              <View style={styles.topRightGroup}>
                <TouchableOpacity onPress={() => setActiveMenu('subs')} style={[styles.iconBtn, styles.topRightSpacing]}><IconSubs color={subtitlesEnabled ? "#FFF" : "#777"} /></TouchableOpacity>
                {!isOfflineMode && <TouchableOpacity onPress={() => setActiveMenu('audio')} style={[styles.iconBtn, styles.topRightSpacing]}><IconAudio /></TouchableOpacity>}
                <TouchableOpacity onPress={() => setActiveMenu('quality')} style={styles.hdBtn}><Text style={styles.hdBtnText}>{isOfflineMode ? currentAutoRes : 'HD'}</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={styles.bottomBarWrapper} pointerEvents="box-none">
          <BottomGradientOverlay screenWidth={landscapeWidth} />
          <View style={styles.bottomContent} pointerEvents="box-none">
            <View style={styles.bottomToolsRow} pointerEvents="box-none">
              <View style={styles.toolsLeft}>
                <LockButton isLocked={isLocked} setIsLocked={setIsLocked} uiOpacity={uiOpacity} setShowUI={setShowUI} hideUITimeout={hideUITimeout} />
                {!isLocked && <TouchableOpacity onPress={() => setActiveMenu('speed')} style={{ marginLeft: 20 }}><Text style={styles.speedBtnText}>{playbackSpeed.toFixed(2)}x</Text></TouchableOpacity>}
              </View>
              {!isLocked && (
                <View style={styles.toolsRight}>
                  <Animated.View style={{ opacity: nextEpOpacity }}><TouchableOpacity onPress={handleNextEpisode} disabled={!hasNextEpisode} style={[styles.iconBtn, { marginRight: 18 }]}><IconNextEp color={hasNextEpisode ? "#FFF" : "rgba(255,255,255,0.3)"} /></TouchableOpacity></Animated.View>
                  <AspectRatioButton resizeMode={resizeMode} setResizeMode={setResizeMode} />
                </View>
              )}
            </View>

            {!isLocked && (
              <View style={styles.progressRow}>
                <Text style={styles.timeText}>{formatTime(displayPosMillis)}</Text>
                <Slider
                  style={styles.slider} minimumValue={0} maximumValue={displayDurMillis} value={displayPosMillis} minimumTrackTintColor={BRAND_RED} maximumTrackTintColor="rgba(255,255,255,0.2)" thumbTintColor="#FFF"
                  onSlidingStart={() => { setIsSeeking(true); if (hideUITimeout.current) clearTimeout(hideUITimeout.current); }}
                  onValueChange={(val) => setSeekPreviewMillis(val)}
                  onSlidingComplete={async (val) => {
                    setIsSeeking(false); setPosMillis(val); lastPositionRef.current = val;
                    // KEYFRAME SNAPPING FOR SEAMLESS SEEKING
                    if (videoRef.current) { await videoRef.current.setPositionAsync(val).catch(()=>{}); saveWatchHistory(val, displayDurMillis, true); resetHideTimer(); }
                  }}
                />
                <Text style={styles.timeText}>-{formatTime(Math.max(0, displayDurMillis - displayPosMillis))}</Text>
              </View>
            )}
          </View>
        </View>
      </Animated.View>

      {activeMenu === 'quality' && <VideoQualitySheet activeMenu={activeMenu} setActiveMenu={setActiveMenu} qualityList={qualityList} selectedQuality={selectedQuality} setSelectedQuality={setSelectedQuality} currentAutoRes={currentAutoRes} setActiveUrl={(newQualityUri) => { setActiveUrl(buildProxiedUrl(newQualityUri, streamData?.referer || 'https://vidwish.live/')); }} />}
      {activeMenu === 'audio' && <AudioSheet activeMenu={activeMenu} setActiveMenu={setActiveMenu} animeId={effectiveAnimeId} episodeNum={currentEpNum} slug={currentSlug || currentEpNum} currentTargetType={selectedAudioType} onSelectAudioType={setSelectedAudioType} />}
      {activeMenu === 'speed' && <SpeedSheet activeMenu={activeMenu} setActiveMenu={setActiveMenu} playbackSpeed={playbackSpeed} setPlaybackSpeed={setPlaybackSpeed} videoRef={videoRef} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', width: '100%', height: '100%' },
  videoPlayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  speedIndicatorBadge: { position: 'absolute', top: 25, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', zIndex: 35 },
  speedIndicatorText: { color: '#FFF', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  uiLayer: { ...StyleSheet.absoluteFillObject, zIndex: 10, justifyContent: 'space-between' },
  topBarWrapper: { width: '100%', position: 'absolute', top: 0, left: 0, right: 0, height: 130 },
  topGradientSvg: { position: 'absolute', top: 0, left: 0, right: 0 },
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
  bottomBarWrapper: { width: '100%', position: 'absolute', bottom: 0, left: 0, right: 0, height: 130, justifyContent: 'flex-end' },
  bottomGradientSvg: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  bottomContent: { paddingHorizontal: 28, paddingBottom: 16 },
  bottomToolsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4 },
  toolsLeft: { flexDirection: 'row', alignItems: 'center' },
  toolsRight: { flexDirection: 'row', alignItems: 'center' },
  speedBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600', opacity: 0.9 },
  progressRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  timeText: { color: '#FFF', fontSize: 13, fontFamily: 'monospace', minWidth: 45, textAlign: 'center' },
  slider: { flex: 1, marginHorizontal: 12, height: 28 },
});
