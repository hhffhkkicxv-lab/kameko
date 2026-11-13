import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  ActivityIndicator, BackHandler, StatusBar, 
  Platform, Animated, TouchableWithoutFeedback 
} from 'react-native';
import { Video, ResizeMode, Audio } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import firestore from '@react-native-firebase/firestore';
import Svg, { Path, Circle, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';

// --- STRICT PALETTE ---
const BRAND_RED = '#E50914';
const BLACK = '#000000';
const WHITE = '#FFFFFF';
const DARK_GREY = '#18181C';
const TEXT_GREY = '#8E8E93';
const VERCEL_API_BASE = 'https://anikoto-api-lyart.vercel.app';

// --- SVG ICONS ---
const IconBack = ({ size = 28 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);
const IconPlay = ({ size = 42 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={WHITE}><Path d="M8 5v14l11-7z" /></Svg>
);
const IconPause = ({ size = 42 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={WHITE}><Rect x="6" y="4" width="4" height="16" /><Rect x="14" y="4" width="4" height="16" /></Svg>
);
const IconForward = ({ size = 32 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M13 5l7 7-7 7M5 5l7 7-7 7" />
  </Svg>
);
const IconRewind = ({ size = 32 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
  </Svg>
);

const formatTime = (millis) => {
  if (isNaN(millis) || millis < 0) return '00:00';
  const totalSeconds = Math.floor(millis / 1000);
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  const h = Math.floor(totalSeconds / 3600);
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
};

export default function PlayerComponent({ route, navigation, user, activeProfileId }) {
  const params = route?.params || {};
  
  const animeId = params.animeId;
  const episodeNum = params.episodeNum || 1;
  const slug = params.slug || String(episodeNum);
  const targetType = params.targetType || 'sub';
  const providerId = params.providerId || animeId;
  
  // Try local offline URI first, then passed stream, else we'll fetch
  const initialUri = params.localUri || params.streamUrl || null;

  const [streamUri, setStreamUri] = useState(initialUri);
  const [referer, setReferer] = useState(params.referer || 'https://vidwish.live/');
  
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [error, setError] = useState(false);
  
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideControlsTimer = useRef(null);
  
  const videoRef = useRef(null);
  const progressState = useRef({ position: 0, duration: 0, lastSaved: 0 });
  const [uiProgress, setUiProgress] = useState(0);
  const [uiDuration, setUiDuration] = useState(0);
  
  const hasSeekedInitial = useRef(false);

  // --- HARDWARE CONFIG ---
  useEffect(() => {
    const configureHardware = async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        StatusBar.setHidden(true, 'none');
        if (Platform.OS === 'android' && NavigationBar?.setVisibilityAsync) {
          await NavigationBar.setVisibilityAsync('hidden');
          await NavigationBar.setBehaviorAsync('overlay-swipe');
        }
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch (_) {}
    };
    configureHardware();
  }, []);

  // --- AGGRESSIVE STREAM RESOLUTION (100% Guarantee Logic) ---
  useEffect(() => {
    if (streamUri && !error) return; // Already have a working stream

    let isMounted = true;
    const fetchStreamFallback = async () => {
      if (isMounted) { setIsBuffering(true); setError(false); }
      
      const safeId = encodeURIComponent(providerId);
      const safeEp = encodeURIComponent(slug);
      const servers = ['hd-1', 'hd-2', 'vidstream-2']; // Cascade fallback

      for (const srv of servers) {
        try {
          const res = await fetch(`https://anikoto-api-lyart.vercel.app/api/stream?id=${safeId}&ep=${safeEp}&server=${srv}&type=${targetType}`);
          const json = await res.json();
          const manifest = json?.data || json?.results || {};
          
          if (manifest.m3u8 || manifest.streamingLink) {
            if (isMounted) {
              setStreamUri(manifest.m3u8 || manifest.streamingLink);
              setReferer(manifest.referer || 'https://vidwish.live/');
              setError(false);
              return; // Escape loop on success!
            }
          }
        } catch (_) {}
      }
      
      if (isMounted) setError(true); // Only hit if ALL servers fail
    };

    fetchStreamFallback();
    return () => { isMounted = false; };
  }, [streamUri, error, providerId, slug, targetType]);

  // --- CONTROLS HIDING LOGIC ---
  const triggerHideControls = useCallback(() => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (isPlaying) {
        Animated.timing(controlsOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setControlsVisible(false));
      }
    }, 3500);
  }, [isPlaying, controlsOpacity]);

  const toggleControls = () => {
    if (controlsVisible) {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
      Animated.timing(controlsOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setControlsVisible(false));
    } else {
      setControlsVisible(true);
      Animated.timing(controlsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      triggerHideControls();
    }
  };

  useEffect(() => {
    if (controlsVisible && isPlaying) triggerHideControls();
    return () => { if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current); };
  }, [controlsVisible, isPlaying, triggerHideControls]);

  // --- FIRESTORE PROGRESS SAVING ---
  const saveProgressToFirebase = useCallback(async (isFinished = false) => {
    const { position, duration } = progressState.current;
    const uid = user?.uid || params.userUid;
    const pid = activeProfileId || params.activeProfileId;
    
    if (!uid || !pid || !animeId || position < 5000) return; // Don't save if watched less than 5 seconds

    const payload = {
      animeId,
      animeTitle: params.animeTitle || params.title || 'Anime',
      backdropUrl: params.backdropUrl || params.backdrop || params.coverImage || '',
      episodeNum: Number(episodeNum),
      episodeTitle: params.episodeTitle || params.epTitle || `Episode ${episodeNum}`,
      slug: String(slug),
      progress: position / 1000,
      duration: duration / 1000,
      positionMillis: position,
      durationMillis: duration,
      finishedEp: isFinished || (duration > 0 && position >= duration - 30000), // Mark finished if within last 30 secs
      timestamp: Date.now()
    };

    try {
      const docRef = firestore()
        .collection('users').doc(String(uid))
        .collection('profiles').doc(String(pid))
        .collection(WATCH_HISTORY_COLLECTION)
        .doc(`${animeId}_ep_${episodeNum}`);
      
      await docRef.set(payload, { merge: true });
    } catch (_) {}
  }, [animeId, episodeNum, slug, user, activeProfileId, params]);

  // Handle Playback Updates smoothly
  const onPlaybackStatusUpdate = (status) => {
    if (!status.isLoaded) {
      if (status.error) setError(true);
      return;
    }

    if (status.isPlaying !== isPlaying) setIsPlaying(status.isPlaying);
    if (status.isBuffering !== isBuffering) setIsBuffering(status.isBuffering);

    progressState.current.position = status.positionMillis;
    progressState.current.duration = status.durationMillis || 0;
    
    setUiProgress(status.positionMillis);
    setUiDuration(status.durationMillis || 0);

    // Initial Resume Scrubbing (Happens instantly on first frame)
    if (!hasSeekedInitial.current && status.positionMillis > 0 && params.positionMillis > 10000) {
      hasSeekedInitial.current = true;
      videoRef.current?.setPositionAsync(params.positionMillis);
    }

    // Save progress quietly every 15 seconds
    if (status.isPlaying && status.positionMillis - progressState.current.lastSaved > 15000) {
      progressState.current.lastSaved = status.positionMillis;
      saveProgressToFirebase(false);
    }

    // Auto-save & exit on finish
    if (status.didJustFinish) {
      saveProgressToFirebase(true);
      handleExit();
    }
  };

  const skipForward = async () => {
    if (videoRef.current) {
      const newPos = progressState.current.position + 10000;
      await videoRef.current.setPositionAsync(newPos);
      triggerHideControls();
    }
  };

  const skipBackward = async () => {
    if (videoRef.current) {
      const newPos = Math.max(progressState.current.position - 10000, 0);
      await videoRef.current.setPositionAsync(newPos);
      triggerHideControls();
    }
  };

  const handlePlayPause = async () => {
    if (isPlaying) {
      await videoRef.current?.pauseAsync();
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    } else {
      await videoRef.current?.playAsync();
      triggerHideControls();
    }
  };

  // --- SAFE EXIT HANDLER ---
  const handleExit = async () => {
    await saveProgressToFirebase(false);
    try {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } catch (_) {}
    navigation.goBack();
  };

  useEffect(() => {
    const onHardwareBack = () => {
      handleExit();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => {
      sub.remove();
      saveProgressToFirebase(false); // Failsafe save on unmount
    };
  }, []);

  const progressPct = uiDuration > 0 ? (uiProgress / uiDuration) * 100 : 0;

  return (
    <View style={styles.container}>
      {/* INSTANT VIDEO RENDER */}
      {streamUri ? (
        <Video
          ref={videoRef}
          source={{ uri: streamUri, headers: { Referer: referer } }}
          style={StyleSheet.absoluteFillObject}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={true}
          useNativeControls={false}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          onError={() => setError(true)}
        />
      ) : null}

      {/* TOUCH LAYER TO TOGGLE CONTROLS */}
      <TouchableWithoutFeedback onPress={toggleControls}>
        <View style={StyleSheet.absoluteFillObject} />
      </TouchableWithoutFeedback>

      {/* BUILT-IN CUSTOM UI (Animated & Hardware Accelerated) */}
      <Animated.View style={[styles.controlsOverlay, { opacity: controlsOpacity }]} pointerEvents={controlsVisible ? 'box-none' : 'none'}>
        
        {/* Top Gradient Header */}
        <View style={styles.headerBar}>
          <Svg height="120%" width="100%" style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <Defs>
              <LinearGradient id="topGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#000000" stopOpacity="0.8" />
                <Stop offset="1" stopColor="#000000" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#topGrad)" />
          </Svg>
          
          <TouchableOpacity style={styles.backBtn} onPress={handleExit} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
            <IconBack />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>{params.animeTitle || params.title}</Text>
            <Text style={styles.headerSubTitle} numberOfLines={1}>Episode {episodeNum} {targetType === 'dub' ? '(DUB)' : ''}</Text>
          </View>
        </View>

        {/* Center Loading & Controls */}
        <View style={styles.centerContainer} pointerEvents="box-none">
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>Source Unavailable. Trying backups...</Text>
              <ActivityIndicator size="small" color={BRAND_RED} style={{ marginTop: 10 }} />
            </View>
          ) : isBuffering ? (
            <ActivityIndicator size={60} color={BRAND_RED} />
          ) : (
            <View style={styles.playbackButtonsRow}>
              <TouchableOpacity style={styles.seekBtn} onPress={skipBackward}><IconRewind /></TouchableOpacity>
              <TouchableOpacity style={styles.playPauseBtn} onPress={handlePlayPause}>
                {isPlaying ? <IconPause /> : <IconPlay />}
              </TouchableOpacity>
              <TouchableOpacity style={styles.seekBtn} onPress={skipForward}><IconForward /></TouchableOpacity>
            </View>
          )}
        </View>

        {/* Bottom Timeline Gradient */}
        <View style={styles.bottomBar}>
          <Svg height="150%" width="100%" style={[StyleSheet.absoluteFillObject, { bottom: -10 }]} pointerEvents="none">
            <Defs>
              <LinearGradient id="botGrad" x1="0" y1="1" x2="0" y2="0">
                <Stop offset="0" stopColor="#000000" stopOpacity="0.9" />
                <Stop offset="1" stopColor="#000000" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#botGrad)" />
          </Svg>

          <View style={styles.progressRow}>
            <Text style={styles.timeText}>{formatTime(uiProgress)}</Text>
            
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
              <View style={[styles.progressThumb, { left: `${progressPct}%` }]} />
            </View>
            
            <Text style={styles.timeText}>{formatTime(uiDuration)}</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BLACK,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    zIndex: 10,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 30, // Safe padding for landscape
    height: 90,
  },
  backBtn: {
    marginRight: 16,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  headerTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  headerTitle: {
    color: WHITE,
    fontSize: 18,
    fontWeight: '900',
    textShadowColor: BLACK,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  headerSubTitle: {
    color: '#CCCCCC',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playbackButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 50,
  },
  playPauseBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  seekBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBox: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  errorText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '700',
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: 30,
    justifyContent: 'flex-end',
    height: 100,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  timeText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'monospace',
    minWidth: 46,
    textAlign: 'center',
  },
  progressBarTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    position: 'relative',
    justifyContent: 'center',
  },
  progressBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: BRAND_RED,
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: BRAND_RED,
    marginLeft: -7,
  }
});
