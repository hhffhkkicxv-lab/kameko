import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Animated, 
  Dimensions, StatusBar, BackHandler
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import Slider from '@react-native-community/slider';
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

const BRAND_RED = '#E50914';
const VERCEL_API_BASE = 'https://anikoto-api-lyart.vercel.app';

// Icons
const IconBack = ({ size = 28 }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5"><Path d="M19 12H5M12 19l-7-7 7-7" /></Svg>);
const IconSubs = ({ size = 24, color = "#FFF" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><Rect x="3" y="5" width="18" height="14" rx="2" ry="2"/><Path d="M7 15h3m4 0h3M7 9h10"/></Svg>);
const IconAudio = ({ size = 24, color = "#FFF" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><Path d="M3 18v-6a9 9 0 0118 0v6"/><Path d="M21 19a2 2 0 01-2 2h-1v-6h3v4zM3 19a2 2 0 002 2h1v-6H3v4z"/></Svg>);
const IconNextEp = ({ size = 22, color = "#FFF" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></Svg>);

export default function Player({ route, navigation }) {
  // Extract base route params
  const { 
    animeTitle = 'Unknown', 
    animeId = null,
    userUid = null,
    targetType = 'sub'
  } = route?.params || {};

  // SEAMLESS BINGE STATE (Replaces navigation route params)
  const [currentEpNum, setCurrentEpNum] = useState(route?.params?.episodeNum || 1);
  const [currentSlug, setCurrentSlug] = useState(route?.params?.slug || null);
  const [currentEpTitle, setCurrentEpTitle] = useState(route?.params?.episodeTitle || '');

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
  const lastPositionRef = useRef(0);
  const lastSavedTimeRef = useRef(0);

  const [providerId, setProviderId] = useState(null);
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

  const activeMenuRef = useRef(activeMenu);
  const isLockedRef = useRef(isLocked);
  useEffect(() => { activeMenuRef.current = activeMenu; }, [activeMenu]);
  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);

  // 1. Full Screen Lock (Fixed Nav Bar Reappearing Bug)
  useEffect(() => {
    let isMounted = true;
    const lockEdgeToEdge = async () => {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch (_) {}
    };
    lockEdgeToEdge();

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeMenuRef.current) { setActiveMenu(null); return true; }
      if (isLockedRef.current) { 
        setIsLocked(false); 
        setShowUI(true);
        Animated.timing(uiOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
        return true; 
      }
      navigation.goBack();
      return true;
    });

    return () => {
      isMounted = false;
      ScreenOrientation.unlockAsync().catch(() => {});
      // WE DO NOT UN-HIDE THE STATUS BAR OR NAV BAR HERE ANYMORE!
      backHandler.remove();
    };
  }, []);

  // 2. Fetch Provider ID and Identify Next Episode
  useEffect(() => {
    let isMounted = true;
    const fetchProviderAndEpisodes = async () => {
      try {
        let targetId = animeId;
        const searchRes = await fetch(`${VERCEL_API_BASE}/api/search?keyword=${encodeURIComponent(animeTitle)}`);
        const searchJson = await searchRes.json();
        const matches = searchJson?.data || [];
        if (matches.length > 0) {
          const exact = matches.find(m => (m.title || '').toLowerCase() === animeTitle.toLowerCase()) || matches[0];
          targetId = exact.id;
        }

        if (isMounted) setProviderId(targetId);

        const epRes = await fetch(`${VERCEL_API_BASE}/api/episodes/${encodeURIComponent(targetId)}`);
        const epJson = await epRes.json();
        const list = epJson?.data || [];

        if (isMounted && Array.isArray(list)) {
          const currentEpIndex = list.findIndex(ep => 
            (currentSlug && String(ep.slug) === String(currentSlug)) || 
            (ep.id && String(ep.id) === String(currentSlug)) || 
            String(ep.num) === String(currentEpNum)
          );

          if (currentEpIndex !== -1 && currentEpIndex + 1 < list.length) {
            const nextEp = list[currentEpIndex + 1];
            setNextEpisodeData({
              num: nextEp.num,
              title: nextEp.title || `Episode ${nextEp.num}`,
              slug: nextEp.slug || nextEp.id || nextEp.num
            });
            setHasNextEpisode(true);
            Animated.timing(nextEpOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
          } else {
            setHasNextEpisode(false);
            Animated.timing(nextEpOpacity, { toValue: 0.25, duration: 300, useNativeDriver: true }).start();
          }
        }
      } catch (err) {
        if (isMounted) {
          setHasNextEpisode(false);
          Animated.timing(nextEpOpacity, { toValue: 0.25, duration: 300, useNativeDriver: true }).start();
        }
      }
    };
    if (animeTitle) fetchProviderAndEpisodes();
    return () => { isMounted = false; };
  }, [animeTitle, currentEpNum, currentSlug]);

  // 2.5 Fetch Previous Playback Progress from Firebase
  useEffect(() => {
    if (!userUid || !animeId) return;

    const fetchProgress = async () => {
      try {
        const doc = await firestore().collection('users').doc(userUid).collection('progress').doc(String(animeId)).get();
        if (doc.exists) {
          const data = doc.data();
          const targetSlug = currentSlug ? String(currentSlug) : String(currentEpNum);
          
          if (data.slug === targetSlug && !data.finishedEp && data.progress > 0) {
            lastPositionRef.current = data.progress * 1000;
          }
        }
      } catch (e) {}
    };

    fetchProgress();
  }, [userUid, animeId, currentSlug, currentEpNum]);

  // 3. Resolve Native M3U8 Stream
  useEffect(() => {
    let isMounted = true;
    const resolveStream = async () => {
      const effectiveId = providerId || animeId;
      const effectiveSlug = currentSlug || currentEpNum;

      if (!effectiveId || !effectiveSlug) return;

      setLoadingStream(true);
      setActiveUrl(null);
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
          let manifest = json?.success && json?.data?.m3u8 ? json.data : (json?.success && json?.results?.streamingLink ? json.results : (json?.data?.streamingLink ? json.data : null));
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
              if (!streamUri.startsWith('http')) streamUri = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1) + streamUri;
              qualities.push({ label: `${resMatch[1]}p`, uri: streamUri });
            }
          }
        }
        const uniqueQualities = []; const seenLabels = new Set();
        for (const q of qualities) { if (!seenLabels.has(q.label)) { seenLabels.add(q.label); uniqueQualities.push(q); } }
        setQualityList(uniqueQualities);
      } catch (_) {
        setQualityList([{ label: 'Auto', uri: masterUrl }]);
      }

      if (isMounted) {
        setStreamData(finalStreamData);
        setActiveUrl(masterUrl);
        setLoadingStream(false);
      }
    };

    resolveStream();
    return () => { isMounted = false; };
  }, [animeId, currentEpNum, currentSlug, selectedAudioType, providerId]);

  // 4. Playback Sync & Database Save
  useEffect(() => {
    if (!status.isLoaded) return;
    const currentMs = status.positionMillis || 0;
    const currentTimeSec = currentMs / 1000; 

    if (currentMs > 0) lastPositionRef.current = currentMs;
    if (status.naturalSize?.height) setCurrentAutoRes(`${status.naturalSize.height}p`);

    if (subtitlesEnabled && parsedSubs.length > 0) {
      const activeCue = parsedSubs.find(c => currentTimeSec >= c.start && currentTimeSec <= c.end);
      if (activeCue && activeCue.text !== currentSubText) setCurrentSubText(activeCue.text);
      else if (!activeCue && currentSubText !== '') setCurrentSubText('');
    } else if (currentSubText !== '') { 
      setCurrentSubText(''); 
    }

    const currentSecs = Math.floor(currentTimeSec);
    const durationSecs = Math.floor((status.durationMillis || 1) / 1000);
    if (userUid && animeId && status.isPlaying && currentSecs > 0) {
      if (Math.abs(currentSecs - lastSavedTimeRef.current) >= 10) {
        lastSavedTimeRef.current = currentSecs;
        const isCompleted = currentSecs > (durationSecs * 0.85); 
        
        firestore().collection('users').doc(userUid).collection('progress').doc(String(animeId)).set({
          animeId: String(animeId),
          slug: currentSlug ? String(currentSlug) : String(currentEpNum),
          lastWatchedEp: currentEpNum,
          progress: currentSecs,
          duration: durationSecs,
          finishedEp: isCompleted,
          timestamp: Date.now()
        }, { merge: true }).catch(() => {});
      }
    }
  }, [status.positionMillis, subtitlesEnabled, parsedSubs, currentSubText]);

  // 5. Seamless Next Episode Logic (No Navigation Crash!)
  const handleNextEpisode = () => {
    if (!hasNextEpisode || !nextEpisodeData) return;
    
    // Smoothly wipe local state
    setLoadingStream(true);
    setActiveUrl(null);
    setCurrentSubText('');
    setParsedSubs([]);
    lastPositionRef.current = 0; 
    
    // Inject new episode data - Component stays mounted!
    setCurrentEpNum(nextEpisodeData.num);
    setCurrentEpTitle(nextEpisodeData.title);
    setCurrentSlug(nextEpisodeData.slug);
  };

  const handleTouchStart = () => {
    if (isLocked) return;
    longPressTimerRef.current = setTimeout(() => {
      if (status.isPlaying && videoRef.current) {
        previousSpeedRef.current = playbackSpeed;
        videoRef.current.setRateAsync(2.0, true);
        setIs2xActive(true);
      }
    }, 450);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    if (is2xActive) {
      setIs2xActive(false);
      if (videoRef.current) videoRef.current.setRateAsync(previousSpeedRef.current, true);
    }
  };

  const resetHideTimer = useCallback(() => {
    if (activeMenu || isLocked) return; 
    setShowUI(true);
    Animated.timing(uiOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    if (hideUITimeout.current) clearTimeout(hideUITimeout.current);
    hideUITimeout.current = setTimeout(() => {
      if (status.isPlaying && !activeMenu) {
        Animated.timing(uiOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => setShowUI(false));
      }
    }, 3500);
  }, [activeMenu, status.isPlaying, isLocked]);

  useEffect(() => {
    if (status.isPlaying) resetHideTimer();
    else {
      if (hideUITimeout.current) clearTimeout(hideUITimeout.current);
      if (!isLocked) { setShowUI(true); Animated.timing(uiOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start(); }
    }
  }, [status.isPlaying, activeMenu, isLocked, resetHideTimer]);

  const formatTime = (millis) => {
    if (isNaN(millis) || millis < 0) return "00:00";
    const totalSecs = Math.floor(millis / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(totalSecs % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  };

  if (loadingStream) return <View style={styles.loaderContainerFull} />;

  return (
    <View style={styles.container}>
      {!loadingStream && activeUrl ? (
        <Video
          key={activeUrl}
          ref={videoRef}
          style={styles.videoPlayer}
          source={{ uri: activeUrl, overrideFileExtensionAndroid: 'm3u8', headers: streamData?.referer ? { "Referer": streamData.referer } : {} }}
          useNativeControls={false}
          resizeMode={resizeMode}
          onPlaybackStatusUpdate={setStatus}
          onLoad={async () => {
            if (videoRef.current) {
              if (lastPositionRef.current > 0) await videoRef.current.setPositionAsync(lastPositionRef.current);
              await videoRef.current.playAsync();
            }
          }}
          shouldPlay
        />
      ) : null}

      {is2xActive && (
        <View style={styles.speedIndicatorBadge} pointerEvents="none"><Text style={styles.speedIndicatorText}>2X SPEED ▶▶</Text></View>
      )}

      {subtitlesEnabled && currentSubText !== '' && (
        <View style={[styles.subtitleContainer, { bottom: subSettings.height + (showUI ? 65 : 0) }]} pointerEvents="none">
          <Text style={[styles.subtitleText, { color: subSettings.color || '#FFFFFF', fontSize: subSettings.size || 16, fontFamily: subSettings.fontFamily || 'normal', backgroundColor: subSettings.backgroundColor || 'transparent' }]}>
            {currentSubText}
          </Text>
        </View>
      )}

      <PlayPauseSkip status={status} videoRef={videoRef} resetHideTimer={resetHideTimer} isLocked={isLocked} uiOpacity={uiOpacity} showUI={showUI} setShowUI={setShowUI} activeMenu={activeMenu} setActiveMenu={setActiveMenu} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} />

      <SkipIntroOutro status={status} videoRef={videoRef} introData={streamData?.intro} isLocked={isLocked} onSkipOutro={hasNextEpisode ? handleNextEpisode : null} />

      <Animated.View style={[styles.uiLayer, { opacity: uiOpacity }]} pointerEvents={showUI ? 'box-none' : 'none'}>
        {!isLocked && (
          <View style={styles.topBarWrapper}>
            <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject} pointerEvents="none">
              <Defs><LinearGradient id="topCinematic" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#000000" stopOpacity="0.95" /><Stop offset="1" stopColor="#000000" stopOpacity="0" /></LinearGradient></Defs>
              <Rect width="100%" height="100%" fill="url(#topCinematic)" />
            </Svg>
            <View style={styles.topBarContent}>
              <View style={styles.topLeftGroup}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}><IconBack /></TouchableOpacity>
                <View style={styles.titleColumn}>
                  <Text style={styles.mainTitle} numberOfLines={1}>{animeTitle}</Text>
                  <Text style={styles.subTitle}>Episode {currentEpNum} {currentEpTitle ? `• ${currentEpTitle}` : ''}</Text>
                </View>
              </View>
              <View style={styles.topRightGroup}>
                <TouchableOpacity onPress={() => setActiveMenu('subs')} style={styles.iconBtn}><IconSubs color={subtitlesEnabled ? "#FFF" : "#777"} /></TouchableOpacity>
                <TouchableOpacity onPress={() => setActiveMenu('audio')} style={styles.iconBtn}><IconAudio /></TouchableOpacity>
                <TouchableOpacity onPress={() => setActiveMenu('quality')} style={styles.hdBtn}><Text style={styles.hdBtnText}>HD</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={styles.bottomBarWrapper}>
          <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <Defs><LinearGradient id="botCinematic" x1="0" y1="1" x2="0" y2="0"><Stop offset="0" stopColor="#000000" stopOpacity="0.95" /><Stop offset="1" stopColor="#000000" stopOpacity="0" /></LinearGradient></Defs>
            <Rect width="100%" height="100%" fill="url(#botCinematic)" />
          </Svg>
          <View style={styles.bottomContent}>
            <View style={styles.bottomToolsRow}>
              <View style={styles.toolsLeft}>
                <LockButton isLocked={isLocked} setIsLocked={setIsLocked} uiOpacity={uiOpacity} setShowUI={setShowUI} hideUITimeout={hideUITimeout} />
                {!isLocked && (<TouchableOpacity onPress={() => setActiveMenu('speed')}><Text style={styles.speedBtnText}>{playbackSpeed.toFixed(2)}x</Text></TouchableOpacity>)}
              </View>
              {!isLocked && (
                <View style={styles.toolsRight}>
                  <Animated.View style={{ opacity: nextEpOpacity }}>
                    <TouchableOpacity onPress={handleNextEpisode} disabled={!hasNextEpisode} style={[styles.iconBtn, { marginRight: 18 }]}><IconNextEp color={hasNextEpisode ? "#FFF" : "rgba(255,255,255,0.3)"} /></TouchableOpacity>
                  </Animated.View>
                  <AspectRatioButton resizeMode={resizeMode} setResizeMode={setResizeMode} />
                </View>
              )}
            </View>

            {!isLocked && (
              <View style={styles.progressRow}>
                <Text style={styles.timeText}>{formatTime(status.positionMillis || 0)}</Text>
                <Slider style={styles.slider} minimumValue={0} maximumValue={status.durationMillis || 100} value={status.positionMillis || 0} minimumTrackTintColor={BRAND_RED} maximumTrackTintColor="rgba(255,255,255,0.2)" thumbTintColor="#FFF" onSlidingComplete={async (val) => { if (videoRef.current) { await videoRef.current.setPositionAsync(val); lastPositionRef.current = val; resetHideTimer(); } }} onSlidingStart={() => { if (hideUITimeout.current) clearTimeout(hideUITimeout.current); }} />
                <Text style={styles.timeText}>-{formatTime((status.durationMillis || 0) - (status.positionMillis || 0))}</Text>
              </View>
            )}
          </View>
        </View>
      </Animated.View>

      <VideoQualitySheet activeMenu={activeMenu} setActiveMenu={setActiveMenu} qualityList={qualityList} selectedQuality={selectedQuality} setSelectedQuality={setSelectedQuality} setActiveUrl={setActiveUrl} currentAutoRes={currentAutoRes} />
      <SubtitleSheet activeMenu={activeMenu} setActiveMenu={setActiveMenu} subtitlesEnabled={subtitlesEnabled} setSubtitlesEnabled={setSubtitlesEnabled} subSettings={subSettings} setSubSettings={setSubSettings} animeId={animeId} episodeNum={currentEpNum} onSelectSubtitleTrack={(track) => { if (track && track.cues) { setParsedSubs(track.cues); } else { setParsedSubs([]); } }} />
      <AudioSheet activeMenu={activeMenu} setActiveMenu={setActiveMenu} animeId={animeId} episodeNum={currentEpNum} currentTargetType={selectedAudioType} onSelectAudioType={setSelectedAudioType} />
      <SpeedSheet activeMenu={activeMenu} setActiveMenu={setActiveMenu} playbackSpeed={playbackSpeed} setPlaybackSpeed={setPlaybackSpeed} videoRef={videoRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', width: '100%', height: '100%' },
  videoPlayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  loaderContainerFull: { flex: 1, backgroundColor: '#000000' },
  speedIndicatorBadge: { position: 'absolute', top: 25, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', zIndex: 35 },
  speedIndicatorText: { color: '#FFF', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  subtitleContainer: { position: 'absolute', width: '100%', alignItems: 'center', zIndex: 25, elevation: 10, paddingHorizontal: 25 },
  subtitleText: { fontWeight: '800', textAlign: 'center', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  uiLayer: { ...StyleSheet.absoluteFillObject, zIndex: 10, justifyContent: 'space-between' },
  topBarWrapper: { width: '100%', position: 'absolute', top: 0, height: 120 },
  topBarContent: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 16 },
  topLeftGroup: { flexDirection: 'row', alignItems: 'center' },
  titleColumn: { paddingHorizontal: 10 },
  mainTitle: { color: '#FFF', fontSize: 17, fontWeight: '700', textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
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
