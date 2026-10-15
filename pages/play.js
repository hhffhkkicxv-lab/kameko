import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  View, Text, StyleSheet, Dimensions, 
  TouchableOpacity, Share, StatusBar, 
  ActivityIndicator, FlatList, Modal, Alert, ScrollView 
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Svg, { Defs, LinearGradient, Stop, Rect, Path } from 'react-native-svg';
import * as FileSystem from 'expo-file-system';
import ProxyImage from '../components/ProxyImage';

import Player from './play/player';

let AsyncStorage = null;
try {
  const mod = require('@react-native-async-storage/async-storage');
  AsyncStorage = mod?.default || mod;
} catch (_) {}

const { width, height } = Dimensions.get('window');
const BRAND_RED = '#E50914';
const PURE_RED = '#FF0000';
const TMDB_API_KEY = 'f39f02a34ded84924626dd5ec7de1f29';
const VERCEL_API_BASE = 'https://anikoto-api-lyart.vercel.app';
const EPISODE_CHUNK_SIZE = 50;
const WATCH_HISTORY_COLLECTION = 'watch_history';

// Local Storage Keys & File Paths
const PLAY_PREFS_STORAGE_KEY = '@kameko_play_preferences_v2';
const DOWNLOAD_QUEUE_STORAGE_KEY = '@kameko_downloads_queue_v1';
const PLAY_PREFS_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}kameko_play_prefs.json`
  : null;
const DOWNLOAD_QUEUE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}kameko_downloads_queue.json`
  : null;

const GRID_COLUMNS = 3;
const GRID_SPACING = 10;
const GRID_CARD_WIDTH = Math.floor((width - 32 - GRID_SPACING * (GRID_COLUMNS - 1)) / GRID_COLUMNS);

const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
};

// --- LOCAL STORAGE HELPERS (AsyncStorage + FileSystem + Web localStorage) ---
const readLocalJson = async (storageKey, fileUri, fallback = {}) => {
  try {
    if (AsyncStorage?.getItem) {
      const raw = await AsyncStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    }
  } catch (_) {}

  try {
    if (fileUri) {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists) {
        const raw = await FileSystem.readAsStringAsync(fileUri);
        if (raw) return JSON.parse(raw);
      }
    }
  } catch (_) {}

  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      const raw = globalThis.localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    }
  } catch (_) {}

  return fallback;
};

const writeLocalJson = async (storageKey, fileUri, data) => {
  const serialized = JSON.stringify(data);

  try {
    if (AsyncStorage?.setItem) {
      await AsyncStorage.setItem(storageKey, serialized);
    }
  } catch (_) {}

  try {
    if (fileUri) {
      await FileSystem.writeAsStringAsync(fileUri, serialized);
    }
  } catch (_) {}

  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      globalThis.localStorage.setItem(storageKey, serialized);
    }
  } catch (_) {}
};

// UI Icons
const IconBack = ({ size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5">
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);
const IconPlay = ({ size = 18, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M8 5v14l11-7z" />
  </Svg>
);
const IconPlus = ({ size = 24, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);
const IconCheck = ({ size = 24, color = BRAND_RED }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3">
    <Path d="M20 6L9 17l-5-5" />
  </Svg>
);
const IconShare = ({ size = 22, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <Path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
  </Svg>
);
const IconDownload = ({ size = 22, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </Svg>
);
const IconClose = ({ size = 18, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

export default function Play({
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
  const initialAnime = propAnime || routeParams.anime || {
    id: 'solo-leveling',
    title: 'Solo Leveling',
    coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151807-m1gX3iqITmI6.png',
    backdrop: 'https://image.tmdb.org/t/p/original/vIgyYkXkg6NC2whRbYjBD7eb3Er.jpg',
    description: 'In a world of gifted hunters, Sung Jinwoo struggles as the weakest.',
    genres: ['Action', 'Fantasy'],
    score: 85,
    rating: 'U/A 13+',
    status: 'RELEASING'
  };

  const [currentAnime, setCurrentAnime] = useState(initialAnime);

  useEffect(() => {
    if (propAnime?.id || propAnime?.animeId) {
      setCurrentAnime(propAnime);
    } else if (routeParams.anime?.id) {
      setCurrentAnime(routeParams.anime);
    }
  }, [propAnime, routeParams.anime]);

  const resolvedUser =
    propUser ||
    routeParams.user ||
    currentAnime?.user ||
    auth().currentUser ||
    null;

  const incomingProfile =
    propActiveProfile ||
    propCurrentProfile ||
    currentAnime?.activeProfile ||
    currentAnime?.currentProfile ||
    routeParams.activeProfile ||
    routeParams.currentProfile ||
    null;

  const [resolvedProfile, setResolvedProfile] = useState(incomingProfile);
  const [resolvedProfileId, setResolvedProfileId] = useState(
    () =>
      propActiveProfileId ||
      incomingProfile?.id ||
      currentAnime?.activeProfileId ||
      routeParams.activeProfileId ||
      null
  );

  useEffect(() => {
    if (incomingProfile?.id) {
      setResolvedProfile(incomingProfile);
      setResolvedProfileId(String(incomingProfile.id));
    } else if (propActiveProfileId) {
      setResolvedProfileId(String(propActiveProfileId));
    }
  }, [incomingProfile, propActiveProfileId]);

  const resolvedUid =
    resolvedUser?.uid ||
    currentAnime?.userUid ||
    routeParams.userUid ||
    auth().currentUser?.uid ||
    null;

  // Fallback: Fetch active profile from Firestore if Play was opened without one
  useEffect(() => {
    if (resolvedProfileId || !resolvedUid) return;
    let isMounted = true;

    const fetchActiveProfileFallback = async () => {
      try {
        const userDoc = await firestore().collection('users').doc(String(resolvedUid)).get();
        if (userDoc.exists) {
          const uData = userDoc.data();
          if (uData?.activeProfile?.id && isMounted) {
            setResolvedProfile(uData.activeProfile);
            setResolvedProfileId(String(uData.activeProfile.id));
            return;
          }
          if (uData?.activeProfileId && isMounted) {
            setResolvedProfileId(String(uData.activeProfileId));
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
          const firstDoc = snap.docs[0];
          const prof = { id: firstDoc.id, ...firstDoc.data() };
          setResolvedProfile(prof);
          setResolvedProfileId(String(firstDoc.id));
        }
      } catch (_) {}
    };

    fetchActiveProfileFallback();
    return () => { isMounted = false; };
  }, [resolvedUid, resolvedProfileId]);

  const animeDocId = String(currentAnime.animeId || currentAnime.id);
  const resolvedTitle = currentAnime.animeTitle || currentAnime.title || 'Unknown';
  const resolvedBackdrop =
    currentAnime.backdropUrl ||
    currentAnime.animeBackdrop ||
    currentAnime.backdrop ||
    currentAnime.coverImage ||
    '';

  const [activeTab, setActiveTab] = useState('episodes'); 
  const [descExpanded, setDescExpanded] = useState(false);
  const [inLibrary, setInLibrary] = useState(false);
  const [moreLikeThis, setMoreLikeThis] = useState([]);

  // Progress Tracking
  const [userProgressMap, setUserProgressMap] = useState({});
  const [latestWatched, setLatestWatched] = useState(null);

  // TMDB Metadata
  const [titleLogo, setTitleLogo] = useState(null);
  const [tmdbSynopsis, setTmdbSynopsis] = useState(currentAnime.description);
  const [isUpcoming, setIsUpcoming] = useState(currentAnime.status?.toUpperCase() === 'UPCOMING');

  // Episodes List & Pagination
  const [vercelAnimeId, setVercelAnimeId] = useState(animeDocId);
  const [episodes, setEpisodes] = useState([]);
  const [episodesLoading, setEpisodesLoading] = useState(true);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const hasRestoredLocalChunkRef = useRef(false);

  // Player Overlay
  const [loadingEpisode, setLoadingEpisode] = useState(null);
  const [activePlayback, setActivePlayback] = useState(null);

  // --- DOWNLOAD STEPPED MODAL STATES ---
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [downloadTargetEp, setDownloadTargetEp] = useState(null);
  const [downloadStep, setDownloadStep] = useState(1); // 1: Sub/Dub, 2: Subtitle, 3: Quality (No Auto)
  const [selectedDownloadType, setSelectedDownloadType] = useState('sub');
  const [downloadSubTracks, setDownloadSubTracks] = useState([]);
  const [selectedSubTrack, setSelectedSubTrack] = useState(null);
  const [downloadQualities, setDownloadQualities] = useState([]);
  const [selectedDownloadQuality, setSelectedDownloadQuality] = useState(null);
  const [isFetchingDownloadData, setIsFetchingDownloadData] = useState(false);

  // --- LOAD & SAVE PREFERENCES IN LOCAL STORAGE ---
  const updateLocalPreferences = useCallback(async (patch) => {
    const existing = await readLocalJson(PLAY_PREFS_STORAGE_KEY, PLAY_PREFS_FILE_URI, {});
    const merged = {
      ...existing,
      ...patch,
      selectedChunksByAnime: {
        ...(existing.selectedChunksByAnime || {}),
        ...(patch.selectedChunksByAnime || {}),
      },
      updatedAt: Date.now(),
    };
    await writeLocalJson(PLAY_PREFS_STORAGE_KEY, PLAY_PREFS_FILE_URI, merged);
    return merged;
  }, []);

  // Restore saved chunk index & download defaults for this anime from local storage
  useEffect(() => {
    let isMounted = true;
    hasRestoredLocalChunkRef.current = false;

    const restoreSavedSelection = async () => {
      const savedPrefs = await readLocalJson(PLAY_PREFS_STORAGE_KEY, PLAY_PREFS_FILE_URI, {});
      if (!isMounted) return;

      const savedChunk = savedPrefs?.selectedChunksByAnime?.[animeDocId];
      if (typeof savedChunk === 'number' && savedChunk >= 0) {
        hasRestoredLocalChunkRef.current = true;
        setCurrentChunkIndex(savedChunk);
      } else {
        setCurrentChunkIndex(0);
      }

      if (savedPrefs?.preferredDownloadType) {
        setSelectedDownloadType(savedPrefs.preferredDownloadType);
      }
    };

    restoreSavedSelection();
    return () => { isMounted = false; };
  }, [animeDocId]);

  // Save selected episode chunk range in local storage whenever user taps a rectangle pill
  const handleSelectChunk = useCallback((index, rangeLabel) => {
    setCurrentChunkIndex(index);
    hasRestoredLocalChunkRef.current = true;
    updateLocalPreferences({
      selectedChunksByAnime: {
        [animeDocId]: index,
      },
      lastSelectedChunk: {
        animeId: animeDocId,
        animeTitle: resolvedTitle,
        chunkIndex: index,
        rangeLabel,
        timestamp: Date.now(),
      },
    });
  }, [animeDocId, resolvedTitle, updateLocalPreferences]);

  // 1. Firebase Watch History & Watchlist Listener
  useEffect(() => {
    if (!resolvedUid || !animeDocId) return;

    const libRef = firestore()
      .collection('users')
      .doc(String(resolvedUid))
      .collection('library')
      .doc(animeDocId);
    const libUnsub = libRef.onSnapshot(doc => setInLibrary(doc?.exists || false), () => {});

    if (!resolvedProfileId) {
      return () => libUnsub();
    }

    const historyRef = firestore()
      .collection('users')
      .doc(String(resolvedUid))
      .collection('profiles')
      .doc(String(resolvedProfileId))
      .collection(WATCH_HISTORY_COLLECTION)
      .where('animeId', '==', animeDocId);
      
    const historyUnsub = historyRef.onSnapshot(snapshot => {
      if (snapshot && !snapshot.empty) {
        const pMap = {};
        let latest = null;
        snapshot.forEach(doc => {
          const data = doc.data();
          const epKey = String(data.slug || data.episodeNum || data.lastWatchedEp || '');
          if (epKey) pMap[epKey] = data;
          if (data.episodeNum) pMap[`ep_${data.episodeNum}`] = data;
          if (data.lastWatchedEp) pMap[`ep_${data.lastWatchedEp}`] = data;
          if (!latest || (data.timestamp || 0) > (latest.timestamp || 0)) {
            latest = data;
          }
        });
        setUserProgressMap(pMap);
        setLatestWatched(latest);
      } else {
        setUserProgressMap({});
        setLatestWatched(null);
      }
    }, () => {});

    return () => {
      historyUnsub();
      libUnsub();
    };
  }, [resolvedUid, resolvedProfileId, animeDocId]);

  const toggleLibrary = async () => {
    if (!resolvedUid || !animeDocId) return;
    const ref = firestore()
      .collection('users')
      .doc(String(resolvedUid))
      .collection('library')
      .doc(animeDocId);

    if (inLibrary) {
      await ref.delete().catch(() => {});
    } else {
      await ref.set({
        id: animeDocId,
        animeId: animeDocId,
        title: resolvedTitle,
        img: currentAnime.coverImage || resolvedBackdrop,
        backdrop: resolvedBackdrop,
        profileId: resolvedProfileId,
        addedAt: firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    }
  };

  // --- 3-STEP DOWNLOAD MODAL HANDLERS (Sub/Dub -> Subtitle -> Quality without Auto) ---
  const handleOpenDownload = async (episodeItem) => {
    if (!episodeItem) return;
    const savedPrefs = await readLocalJson(PLAY_PREFS_STORAGE_KEY, PLAY_PREFS_FILE_URI, {});
    setDownloadTargetEp(episodeItem);
    setDownloadStep(1);
    setSelectedDownloadType(savedPrefs?.preferredDownloadType || 'sub');
    setSelectedSubTrack(null);
    setSelectedDownloadQuality(null);
    setDownloadSubTracks([]);
    setDownloadQualities([]);
    setDownloadModalVisible(true);
  };

  // Step 1 -> Step 2: User picks Sub or Dub, then load available subtitle tracks
  const handleSelectAudioTypeForDownload = async (type) => {
    setSelectedDownloadType(type);
    setDownloadStep(2);
    setIsFetchingDownloadData(true);

    // Save selected audio type in local storage immediately
    updateLocalPreferences({ preferredDownloadType: type });

    try {
      const safeId = encodeURIComponent(vercelAnimeId || animeDocId);
      const safeEp = encodeURIComponent(String(downloadTargetEp.slug));
      const servers = ['hd-1', 'hd-2'];
      let subs = [];

      for (const srv of servers) {
        try {
          const res = await fetchWithTimeout(
            `${VERCEL_API_BASE}/api/stream?id=${safeId}&ep=${safeEp}&server=${srv}&type=${type}`
          );
          const json = await res.json();
          const payload = json?.data || json?.results || {};
          if (Array.isArray(payload.subtitles) && payload.subtitles.length > 0) {
            subs = payload.subtitles;
            break;
          }
        } catch (_) {}
      }

      setDownloadSubTracks(subs);
      if (subs.length > 0) {
        const defaultSub = subs.find(s => s.default) || subs[0];
        setSelectedSubTrack(defaultSub);
      } else {
        setSelectedSubTrack({ label: 'None / Off', file: null, lang: 'none' });
      }
    } catch (_) {
      setDownloadSubTracks([]);
      setSelectedSubTrack({ label: 'None / Off', file: null, lang: 'none' });
    } finally {
      setIsFetchingDownloadData(false);
    }
  };

  // Step 2 -> Step 3: User picks Subtitle, then resolve explicit stream qualities (NO AUTO OPTION)
  const handleSelectSubtitleForDownload = async (subTrack) => {
    const chosenSub = subTrack || { label: 'None / Off', file: null, lang: 'none' };
    setSelectedSubTrack(chosenSub);
    setDownloadStep(3);
    setIsFetchingDownloadData(true);

    updateLocalPreferences({
      preferredSubtitleLang: chosenSub.label || chosenSub.lang || 'None / Off',
    });

    try {
      const safeId = encodeURIComponent(vercelAnimeId || animeDocId);
      const safeEp = encodeURIComponent(String(downloadTargetEp.slug));
      const servers = ['hd-1', 'hd-2', 'vidstream-2'];
      let masterUrl = null;
      let streamReferer = 'https://vidwish.live/';

      for (const srv of servers) {
        try {
          const res = await fetchWithTimeout(
            `${VERCEL_API_BASE}/api/stream?id=${safeId}&ep=${safeEp}&server=${srv}&type=${selectedDownloadType}`
          );
          const json = await res.json();
          const payload = json?.data || json?.results || {};
          if (payload?.m3u8 || payload?.streamingLink) {
            masterUrl = payload.m3u8 || payload.streamingLink;
            if (payload.referer) streamReferer = payload.referer;
            break;
          }
        } catch (_) {}
      }

      let explicitQualities = [];

      if (masterUrl) {
        try {
          const m3Res = await fetchWithTimeout(masterUrl, {
            headers: { Referer: streamReferer }
          });
          const m3Text = await m3Res.text();
          const lines = m3Text.split('\n');

          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('RESOLUTION=')) {
              const resMatch = lines[i].match(/RESOLUTION=\d+x(\d+)/);
              if (resMatch && lines[i + 1]) {
                const label = `${resMatch[1]}p`;
                let streamUri = lines[i + 1].trim();
                if (!streamUri.startsWith('http')) {
                  streamUri = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1) + streamUri;
                }
                if (label.toLowerCase() !== 'auto') {
                  explicitQualities.push({
                    label,
                    resolution: Number(resMatch[1]),
                    uri: streamUri,
                    referer: streamReferer,
                  });
                }
              }
            }
          }
        } catch (_) {}
      }

      // Deduplicate and strictly filter out any "Auto" label
      const uniqueQualities = [];
      const seenLabels = new Set();
      for (const q of explicitQualities) {
        if (q.label && q.label.toLowerCase() !== 'auto' && !seenLabels.has(q.label)) {
          seenLabels.add(q.label);
          uniqueQualities.push(q);
        }
      }

      // Sort highest resolution first (e.g., 1080p, 720p, 480p, 360p)
      uniqueQualities.sort((a, b) => (b.resolution || 0) - (a.resolution || 0));

      // Fallback explicit quality list (never includes Auto)
      const finalQualities =
        uniqueQualities.length > 0
          ? uniqueQualities
          : [
              { label: '1080p', resolution: 1080, uri: masterUrl || '', referer: streamReferer },
              { label: '720p', resolution: 720, uri: masterUrl || '', referer: streamReferer },
              { label: '480p', resolution: 480, uri: masterUrl || '', referer: streamReferer },
              { label: '360p', resolution: 360, uri: masterUrl || '', referer: streamReferer },
            ];

      setDownloadQualities(finalQualities);
      setSelectedDownloadQuality(finalQualities[0]);
    } catch (_) {
      const fallback = [
        { label: '1080p', resolution: 1080, uri: '' },
        { label: '720p', resolution: 720, uri: '' },
        { label: '480p', resolution: 480, uri: '' },
      ];
      setDownloadQualities(fallback);
      setSelectedDownloadQuality(fallback[0]);
    } finally {
      setIsFetchingDownloadData(false);
    }
  };

  // Step 3 Final: Save all selected download options (Sub/Dub, Subtitle, Quality) to Local Storage & Firestore
  const handleConfirmDownloadFinal = async (qualityOption) => {
    const finalQuality = qualityOption || selectedDownloadQuality;
    if (!finalQuality || !downloadTargetEp) return;

    const downloadRecord = {
      id: `${animeDocId}_ep_${downloadTargetEp.num}_${selectedDownloadType}_${finalQuality.label}`,
      animeId: animeDocId,
      animeTitle: resolvedTitle,
      backdrop: resolvedBackdrop,
      coverImage: currentAnime.coverImage || resolvedBackdrop,
      episodeNum: Number(downloadTargetEp.num),
      episodeTitle: downloadTargetEp.title || `Episode ${downloadTargetEp.num}`,
      slug: String(downloadTargetEp.slug),
      audioType: selectedDownloadType, // 'sub' | 'dub'
      subtitle: {
        label: selectedSubTrack?.label || selectedSubTrack?.lang || 'None / Off',
        file: selectedSubTrack?.file || null,
        lang: selectedSubTrack?.lang || 'none',
      },
      quality: finalQuality.label, // e.g., '1080p', '720p' (never Auto)
      streamUri: finalQuality.uri || null,
      referer: finalQuality.referer || 'https://vidwish.live/',
      profileId: resolvedProfileId || 'default',
      userUid: resolvedUid || null,
      status: 'queued',
      savedAt: Date.now(),
    };

    // 1. Save in Local Storage Downloads Queue
    const existingQueue = await readLocalJson(DOWNLOAD_QUEUE_STORAGE_KEY, DOWNLOAD_QUEUE_FILE_URI, []);
    const queueArray = Array.isArray(existingQueue) ? existingQueue : [];
    const filteredQueue = queueArray.filter(item => item.id !== downloadRecord.id);
    const updatedQueue = [downloadRecord, ...filteredQueue];
    await writeLocalJson(DOWNLOAD_QUEUE_STORAGE_KEY, DOWNLOAD_QUEUE_FILE_URI, updatedQueue);

    // 2. Save user's last download selections in Local Storage Preferences
    await updateLocalPreferences({
      preferredDownloadType: selectedDownloadType,
      preferredSubtitleLang: downloadRecord.subtitle.label,
      preferredDownloadQuality: finalQuality.label,
      lastDownload: downloadRecord,
    });

    // 3. Also sync to Firestore under the active profile if logged in
    if (resolvedUid && resolvedProfileId) {
      firestore()
        .collection('users')
        .doc(String(resolvedUid))
        .collection('profiles')
        .doc(String(resolvedProfileId))
        .collection('downloads')
        .doc(`${animeDocId}_ep_${downloadTargetEp.num}`)
        .set(downloadRecord, { merge: true })
        .catch(() => {});
    }

    setDownloadModalVisible(false);
    Alert.alert(
      'Download Saved',
      `${resolvedTitle} • Ep ${downloadTargetEp.num}\nAudio: ${selectedDownloadType.toUpperCase()}\nSubtitle: ${downloadRecord.subtitle.label}\nQuality: ${finalQuality.label}`
    );
  };

  // 2. Fetch TMDB Data & "More Like This" Anime Recommendations
  useEffect(() => {
    let isMounted = true;
    const loadTMDB = async () => {
      try {
        const cleanTitle = resolvedTitle.replace(/\(Dub\)|\(Sub\)/gi, '').trim();
        const searchType = currentAnime.format === 'MOVIE' ? 'movie' : 'tv';
        const tmdbRes = await fetchWithTimeout(
          `https://api.themoviedb.org/3/search/${searchType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}`
        );
        const tmdbJson = await tmdbRes.json();
        const show = tmdbJson?.results?.[0];

        if (show && isMounted) {
          const detailRes = await fetchWithTimeout(
            `https://api.themoviedb.org/3/${searchType}/${show.id}?api_key=${TMDB_API_KEY}&append_to_response=images`
          );
          const detailJson = await detailRes.json();
          if (detailJson?.overview && isMounted) setTmdbSynopsis(detailJson.overview);

          const logos = detailJson?.images?.logos || [];
          const bestLogo = logos.find(l => l.iso_639_1 === 'en') || logos.find(l => l.iso_639_1 === 'ja') || logos[0];
          if (bestLogo && isMounted) setTitleLogo(`https://image.tmdb.org/t/p/w500${bestLogo.file_path}`);
        }
      } catch (_) {}
    };

    const loadMoreLikeThis = async () => {
      try {
        const aniQuery = `
          query ($search: String) {
            Media (search: $search, type: ANIME) {
              status
              recommendations (sort: RATING_DESC, perPage: 18) {
                nodes {
                  mediaRecommendation {
                    id
                    title { romaji english }
                    bannerImage
                    coverImage { extraLarge large }
                    format
                    seasonYear
                    averageScore
                    status
                    description
                  }
                }
              }
              relations {
                edges {
                  relationType
                  node {
                    id
                    title { romaji english }
                    bannerImage
                    coverImage { extraLarge large }
                    format
                    seasonYear
                    averageScore
                    status
                    description
                  }
                }
              }
            }
          }
        `;
        const aRes = await fetchWithTimeout('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: aniQuery, variables: { search: resolvedTitle } })
        });
        const aJson = await aRes.json();
        const media = aJson?.data?.Media;

        const recNodes = (media?.recommendations?.nodes || [])
          .map(n => n?.mediaRecommendation)
          .filter(Boolean);

        const relNodes = (media?.relations?.edges || [])
          .map(e => e?.node)
          .filter(Boolean);

        const combined = [...recNodes, ...relNodes];
        const uniqueList = [];
        const seenIds = new Set();

        for (const node of combined) {
          const idStr = String(node.id);
          if (!seenIds.has(idStr)) {
            seenIds.add(idStr);
            uniqueList.push({
              id: idStr,
              animeId: idStr,
              title: node.title?.english || node.title?.romaji || 'Untitled',
              coverImage: node.coverImage?.extraLarge || node.coverImage?.large || '',
              backdrop: node.bannerImage || node.coverImage?.extraLarge || node.coverImage?.large || '',
              format: node.format || 'TV',
              score: node.averageScore || 85,
              year: node.seasonYear || '',
              status: node.status || 'FINISHED',
              description: node.description ? node.description.replace(/<[^>]*>/g, '') : '',
            });
          }
        }

        if (isMounted) {
          setMoreLikeThis(uniqueList);
        }
      } catch (_) {}
    };

    loadTMDB();
    loadMoreLikeThis();
    return () => { isMounted = false; };
  }, [resolvedTitle, currentAnime.format]);

  // 3. Fetch Flat Episodes
  useEffect(() => {
    let isMounted = true;
    const fetchEpisodes = async () => {
      setEpisodesLoading(true);
      if (isUpcoming) {
        if (isMounted) setEpisodesLoading(false);
        return;
      }
      try {
        let targetId = animeDocId;
        const searchRes = await fetchWithTimeout(
          `${VERCEL_API_BASE}/api/search?keyword=${encodeURIComponent(resolvedTitle)}`
        );
        const searchJson = await searchRes.json();
        const matches = searchJson?.data || [];
        if (matches.length > 0) {
          const exact = matches.find(m => (m.title || '').toLowerCase() === resolvedTitle.toLowerCase()) || matches[0];
          targetId = exact.id;
        }
        if (isMounted) setVercelAnimeId(targetId);

        const res = await fetchWithTimeout(`${VERCEL_API_BASE}/api/episodes/${encodeURIComponent(targetId)}`);
        const json = await res.json();
        const list = json?.data || [];

        if (isMounted && Array.isArray(list)) {
          const formatted = list.map((ep, idx) => ({
            id: String(ep.id || idx + 1),
            slug: String(ep.slug || ep.id || ep.num),
            num: ep.num || (idx + 1),
            title: ep.title || `Episode ${ep.num || idx + 1}`,
            isFiller: ep.isFiller || false,
            isSub: ep.isSub ?? true,
            isDub: ep.isDub ?? false,
          }));
          setEpisodes(formatted);
          
          // Only auto-jump to latestWatched chunk if user hasn't explicitly saved a chunk in local storage
          if (!hasRestoredLocalChunkRef.current) {
            const targetEpNum = latestWatched?.episodeNum || latestWatched?.lastWatchedEp || currentAnime?.episodeNum;
            if (targetEpNum) {
              const epIndex = formatted.findIndex(e => String(e.num) === String(targetEpNum));
              if (epIndex !== -1) {
                setCurrentChunkIndex(Math.floor(epIndex / EPISODE_CHUNK_SIZE));
              }
            }
          }
        }
      } catch (err) {
        if (isMounted) setEpisodes([]);
      } finally {
        if (isMounted) setEpisodesLoading(false);
      }
    };

    fetchEpisodes();
    return () => { isMounted = false; };
  }, [animeDocId, resolvedTitle, isUpcoming, latestWatched?.episodeNum, latestWatched?.lastWatchedEp]);

  // Episode Chunking Logic
  const episodeChunks = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < episodes.length; i += EPISODE_CHUNK_SIZE) {
      chunks.push(episodes.slice(i, i + EPISODE_CHUNK_SIZE));
    }
    return chunks;
  }, [episodes]);

  const currentEpisodesToRender = episodeChunks[currentChunkIndex] || episodeChunks[0] || [];

  // 4. Playback Navigation Handler
  const handlePlayEpisode = async (episodeItem) => {
    if (!episodeItem) return;

    try {
      setLoadingEpisode(episodeItem.num);
      const safeId = encodeURIComponent(vercelAnimeId || animeDocId);
      const safeEp = encodeURIComponent(String(episodeItem.slug));

      let streamManifest = null;
      try {
        const streamUrl = `${VERCEL_API_BASE}/api/stream?id=${safeId}&ep=${safeEp}&server=hd-1&type=sub`;
        const res = await fetchWithTimeout(streamUrl, {}, 8000);
        const json = await res.json();
        streamManifest = json?.data || json?.results || null;
      } catch (_) {}

      const savedEpProgress =
        userProgressMap[String(episodeItem.slug)] ||
        userProgressMap[`ep_${episodeItem.num}`] ||
        null;

      const playbackPayload = {
        streamUrl: streamManifest?.m3u8 || streamManifest?.streamingLink || null,
        referer: streamManifest?.referer || 'https://vidwish.live/',
        subtitles: streamManifest?.subtitles || [],
        animeTitle: resolvedTitle,
        title: resolvedTitle,
        animeBackdrop: resolvedBackdrop,
        backdropUrl: resolvedBackdrop,
        backdrop: resolvedBackdrop,
        coverImage: currentAnime.coverImage || resolvedBackdrop,
        episodeNum: Number(episodeItem.num),
        episodeTitle: episodeItem.title || `Episode ${episodeItem.num}`,
        epTitle: episodeItem.title || `Episode ${episodeItem.num}`,
        animeId: animeDocId,
        providerId: vercelAnimeId || animeDocId,
        slug: String(episodeItem.slug),
        progress: savedEpProgress && !savedEpProgress.finishedEp ? Number(savedEpProgress.progress || 0) : 0,
        duration: savedEpProgress ? Number(savedEpProgress.duration || 0) : 0,
        userUid: resolvedUid,
        uid: resolvedUid,
        user: resolvedUser,
        activeProfileId: resolvedProfileId,
        profileId: resolvedProfileId,
        activeProfile: resolvedProfile,
        currentProfile: resolvedProfile,
        targetType: currentAnime.targetType || 'sub',
      };

      // Save selected episode & chunk in local storage
      await updateLocalPreferences({
        selectedChunksByAnime: {
          [animeDocId]: currentChunkIndex,
        },
        lastPlayedEpisode: {
          animeId: animeDocId,
          animeTitle: resolvedTitle,
          episodeNum: Number(episodeItem.num),
          episodeTitle: episodeItem.title || `Episode ${episodeItem.num}`,
          slug: String(episodeItem.slug),
          chunkIndex: currentChunkIndex,
          timestamp: Date.now(),
        },
      });

      if (navigation?.navigate) {
        navigation.navigate('Player', playbackPayload);
      } else {
        setActivePlayback(playbackPayload);
      }
    } catch (e) {
      Alert.alert('Playback Error', `Failed to play: ${e.message}`);
    } finally {
      setLoadingEpisode(null);
    }
  };

  // 5. Smart Target Episode Resolution
  const targetEp = (() => {
    if (episodes.length === 0) return null;
    if (latestWatched) {
      const lastEp = episodes.find(
        e =>
          String(e.slug) === String(latestWatched.slug) ||
          String(e.num) === String(latestWatched.episodeNum || latestWatched.lastWatchedEp)
      );
      if (lastEp) {
        if (latestWatched.finishedEp) {
          const nextEpIndex = episodes.findIndex(e => e.slug === lastEp.slug) + 1;
          if (nextEpIndex < episodes.length) return episodes[nextEpIndex];
        }
        return lastEp;
      }
    }
    if (currentAnime?.episodeNum) {
      const matched = episodes.find(e => String(e.num) === String(currentAnime.episodeNum));
      if (matched) return matched;
    }
    return episodes[0];
  })();

  let resumePct = 0;
  if (
    targetEp &&
    latestWatched &&
    latestWatched.duration > 0 &&
    (String(latestWatched.slug) === String(targetEp.slug) ||
      String(latestWatched.episodeNum || latestWatched.lastWatchedEp) === String(targetEp.num))
  ) {
    resumePct = Math.min((latestWatched.progress / latestWatched.duration) * 100, 100);
  }

  // Header Component
  const renderHeader = () => (
    <View style={styles.heroSection}>
      <View style={styles.backdropBox}>
        <ProxyImage
          source={{ uri: resolvedBackdrop || currentAnime.coverImage }}
          style={styles.backdropImg}
          resizeMode="cover"
        />
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
          <Defs>
            <LinearGradient id="heroDark" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000000" stopOpacity="0.1" />
              <Stop offset="0.65" stopColor="#000000" stopOpacity="0.85" />
              <Stop offset="1" stopColor="#000000" stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#heroDark)" />
        </Svg>
      </View>

      <View style={styles.heroForeground}>
        <View style={styles.logoRow}>
          {titleLogo ? (
            <ProxyImage source={{ uri: titleLogo }} style={styles.titleLogo} resizeMode="contain" />
          ) : (
            <Text style={styles.fallbackTitleText}>{resolvedTitle}</Text>
          )}
        </View>

        <View style={styles.badgesRow}>
          <View style={styles.newBadge}><Text style={styles.newBadgeText}>New Episode</Text></View>
          <View style={styles.ratingBadge}><Text style={styles.ratingBadgeText}>{currentAnime.rating || 'U/A 13+'}</Text></View>
          <Text style={styles.scoreText}>★ {currentAnime.score || 85}%</Text>
        </View>

        <TouchableOpacity
          style={[styles.resumeBtn, (episodes.length === 0 || isUpcoming) && { opacity: 0.5 }]}
          activeOpacity={0.85}
          onPress={() => targetEp && handlePlayEpisode(targetEp)}
          disabled={episodes.length === 0 || isUpcoming}
        >
          <View style={styles.resumeContentRow}>
            <Text style={styles.resumeBtnText}>
              {isUpcoming ? 'Not Yet Released' : (
                latestWatched?.finishedEp && targetEp?.slug !== latestWatched?.slug 
                  ? `Play Next: Episode ${targetEp?.num}` 
                  : resumePct > 0 
                    ? `Resume Episode ${targetEp?.num || 1}` 
                    : `Watch Episode ${targetEp?.num || 1}`
              )}
            </Text>
            <IconPlay size={18} color="#FFF" />
          </View>
          {resumePct > 0 && !latestWatched?.finishedEp && (
            <View style={styles.resumeProgressUnderline}>
              <View style={[styles.resumeProgressFill, { width: `${resumePct}%` }]} />
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.actionsBar}>
          <TouchableOpacity style={styles.actionTab} onPress={toggleLibrary} activeOpacity={0.7}>
            {inLibrary ? <IconCheck /> : <IconPlus />}
            <Text style={styles.actionTabText}>Watchlist</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionTab} onPress={() => targetEp && handleOpenDownload(targetEp)} activeOpacity={0.7}>
            <IconDownload />
            <Text style={styles.actionTabText}>Download</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionTab} onPress={() => Share.share({ message: `Watch ${resolvedTitle} on Kameko!` })} activeOpacity={0.7}>
            <IconShare />
            <Text style={styles.actionTabText}>Share</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.synopsisContainer}>
          <Text style={styles.synopsisBody} numberOfLines={descExpanded ? undefined : 3}>{tmdbSynopsis}</Text>
          {tmdbSynopsis?.length > 110 && (
            <TouchableOpacity onPress={() => setDescExpanded(!descExpanded)} activeOpacity={0.7} style={styles.moreBtn}>
              <Text style={styles.moreBtnText}>{descExpanded ? 'Less Details ▲' : 'More Details ▼'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* TABS: EPISODES & MORE LIKE THIS */}
        <View style={styles.tabsHeader}>
          <TouchableOpacity
            style={[styles.tabTitleBtn, activeTab === 'episodes' && styles.tabTitleBtnActive]}
            onPress={() => setActiveTab('episodes')}
          >
            <Text style={[styles.tabTitleText, activeTab === 'episodes' && styles.tabTitleTextActive]}>
              Episodes ({episodes.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabTitleBtn, activeTab === 'moreLikeThis' && styles.tabTitleBtnActive]}
            onPress={() => setActiveTab('moreLikeThis')}
          >
            <Text style={[styles.tabTitleText, activeTab === 'moreLikeThis' && styles.tabTitleTextActive]}>
              More Like This ({moreLikeThis.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* RECTANGULAR EPISODE SELECTOR PILLS (Pure Red with White Text when selected) */}
        {activeTab === 'episodes' && episodeChunks.length > 0 && (
          <FlatList 
            horizontal
            data={episodeChunks}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, index) => `chunk-${index}`}
            contentContainerStyle={styles.chunkSelectorContainer}
            renderItem={({ item, index }) => {
              const startEp = item[0].num;
              const endEp = item[item.length - 1].num;
              const rangeLabel = `${startEp} - ${endEp}`;
              const isActive = currentChunkIndex === index;
              return (
                <TouchableOpacity 
                  style={[styles.chunkRectPill, isActive && styles.chunkRectPillActive]}
                  activeOpacity={0.85}
                  onPress={() => handleSelectChunk(index, rangeLabel)}
                >
                  <Text style={[styles.chunkRectPillText, isActive && styles.chunkRectPillTextActive]}>
                    {rangeLabel}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </View>
  );

  const isEpisodesTab = activeTab === 'episodes';

  return (
    <View style={styles.screenContainer}>
      <StatusBar hidden={true} />

      <View style={styles.topNavFloat}>
        <TouchableOpacity style={styles.navBackCircle} onPress={onBack || (() => navigation?.goBack?.())}>
          <IconBack />
        </TouchableOpacity>
      </View>

      <FlatList
        key={isEpisodesTab ? 'episodes-list' : 'more-like-this-grid'}
        numColumns={isEpisodesTab ? 1 : GRID_COLUMNS}
        data={isEpisodesTab ? currentEpisodesToRender : moreLikeThis}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={renderHeader}
        columnWrapperStyle={!isEpisodesTab ? styles.gridRowWrapper : undefined}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            {episodesLoading ? (
              <ActivityIndicator size="small" color={BRAND_RED} />
            ) : (
              <Text style={styles.emptyText}>
                {isEpisodesTab ? 'No episodes found.' : 'No similar anime found.'}
              </Text>
            )}
          </View>
        )}
        renderItem={({ item }) => {
          if (isEpisodesTab) {
            const isLoadingThis = loadingEpisode === item.num;
            const epProgress = userProgressMap[String(item.slug)] || userProgressMap[`ep_${item.num}`];
            const isFinished = epProgress?.finishedEp === true;

            return (
              <View style={styles.episodeRow}>
                <Text style={[styles.bulletNumber, isFinished && styles.watchedText]}>•{item.num}</Text>

                <TouchableOpacity
                  style={[styles.episodeCard, isFinished && styles.watchedCardBg]}
                  activeOpacity={0.8}
                  onPress={() => handlePlayEpisode(item)}
                >
                  <Text style={[styles.episodeCardTitle, isFinished && styles.watchedText]} numberOfLines={1}>
                    {item.title}
                  </Text>

                  <View style={styles.cardRightGroup}>
                    {item.isFiller && (
                      <View style={[styles.fillerTag, isFinished && { borderColor: 'rgba(255,165,0,0.5)' }]}>
                        <Text style={[styles.fillerTagText, isFinished && { color: 'rgba(255,165,0,0.5)' }]}>FILLER</Text>
                      </View>
                    )}
                    {isLoadingThis ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <IconPlay size={18} color={isFinished ? "rgba(255,255,255,0.4)" : "#FFF"} />
                    )}
                  </View>
                  
                  {epProgress && !isFinished && epProgress.duration > 0 && (
                    <View style={styles.epMiniProgressBg}>
                      <View style={[styles.epMiniProgressFill, { width: `${Math.min((epProgress.progress / epProgress.duration) * 100, 100)}%` }]} />
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.downloadIconBtn} activeOpacity={0.7} onPress={() => handleOpenDownload(item)}>
                  <IconDownload size={22} color={isFinished ? "rgba(255,255,255,0.4)" : "#FFF"} />
                </TouchableOpacity>
              </View>
            );
          }

          // GRID CARD FOR "MORE LIKE THIS"
          return (
            <TouchableOpacity
              style={styles.gridAnimeCard}
              activeOpacity={0.85}
              onPress={() => {
                const enrichedTarget = {
                  ...item,
                  userUid: resolvedUid,
                  activeProfileId: resolvedProfileId,
                  activeProfile: resolvedProfile,
                  currentProfile: resolvedProfile,
                };
                if (navigation?.push) {
                  navigation.push('Play', {
                    anime: enrichedTarget,
                    user: resolvedUser,
                    activeProfile: resolvedProfile,
                    activeProfileId: resolvedProfileId,
                  });
                } else {
                  setTitleLogo(null);
                  setTmdbSynopsis(item.description || '');
                  setCurrentAnime(enrichedTarget);
                  setActiveTab('episodes');
                }
              }}
            >
              <View style={styles.gridPosterBox}>
                <ProxyImage source={{ uri: item.coverImage }} style={styles.gridPosterImg} resizeMode="cover" />
                <View style={styles.gridScoreBadge}>
                  <Text style={styles.gridScoreText}>★ {item.score}%</Text>
                </View>
              </View>
              <Text style={styles.gridAnimeTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.gridAnimeMeta} numberOfLines={1}>
                {item.format}{item.year ? ` • ${item.year}` : ''}
              </Text>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.listPadding}
        showsVerticalScrollIndicator={false}
      />

      {/* --- 3-STEP DOWNLOAD MODAL (1. Sub/Dub -> 2. Subtitle -> 3. Quality [No Auto]) --- */}
      <Modal
        visible={downloadModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setDownloadModalVisible(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  Download Episode {downloadTargetEp?.num}
                </Text>
                <Text style={styles.modalSubHeader} numberOfLines={1}>
                  {downloadTargetEp?.title || resolvedTitle}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDownloadModalVisible(false)} style={styles.modalCloseBtn}>
                <IconClose size={18} />
              </TouchableOpacity>
            </View>

            {/* Step Progress Indicator */}
            <View style={styles.stepIndicatorRow}>
              <View style={[styles.stepBadge, downloadStep >= 1 && styles.stepBadgeActive]}>
                <Text style={[styles.stepBadgeText, downloadStep >= 1 && styles.stepBadgeTextActive]}>
                  1. Audio ({selectedDownloadType.toUpperCase()})
                </Text>
              </View>
              <View style={[styles.stepBadge, downloadStep >= 2 && styles.stepBadgeActive]}>
                <Text style={[styles.stepBadgeText, downloadStep >= 2 && styles.stepBadgeTextActive]}>
                  2. Subtitle
                </Text>
              </View>
              <View style={[styles.stepBadge, downloadStep === 3 && styles.stepBadgeActive]}>
                <Text style={[styles.stepBadgeText, downloadStep === 3 && styles.stepBadgeTextActive]}>
                  3. Quality
                </Text>
              </View>
            </View>

            {/* STEP 1: CHOOSE SUB OR DUB */}
            {downloadStep === 1 && (
              <View style={styles.modalStepContent}>
                <Text style={styles.modalStepLabel}>Step 1: Choose Audio Track</Text>
                <View style={styles.modalOptionsRow}>
                  <TouchableOpacity
                    style={[
                      styles.modalOptionCard,
                      selectedDownloadType === 'sub' && styles.modalOptionCardActive,
                    ]}
                    activeOpacity={0.85}
                    onPress={() => handleSelectAudioTypeForDownload('sub')}
                  >
                    <Text style={styles.modalOptionCardTitle}>SUB</Text>
                    <Text style={styles.modalOptionCardSub}>Japanese Audio</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modalOptionCard,
                      selectedDownloadType === 'dub' && styles.modalOptionCardActive,
                    ]}
                    activeOpacity={0.85}
                    onPress={() => handleSelectAudioTypeForDownload('dub')}
                  >
                    <Text style={styles.modalOptionCardTitle}>DUB</Text>
                    <Text style={styles.modalOptionCardSub}>English Audio</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* STEP 2: SELECT SUBTITLE TRACK */}
            {downloadStep === 2 && (
              <View style={styles.modalStepContent}>
                <Text style={styles.modalStepLabel}>Step 2: Select Subtitle</Text>
                {isFetchingDownloadData ? (
                  <ActivityIndicator size="small" color={PURE_RED} style={{ marginVertical: 24 }} />
                ) : (
                  <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={true}>
                    {downloadSubTracks.map((sub, idx) => {
                      const label = sub.label || sub.lang || `Subtitle Track ${idx + 1}`;
                      const isSelected = (selectedSubTrack?.label || selectedSubTrack?.lang) === label;
                      return (
                        <TouchableOpacity 
                          key={idx} 
                          style={[styles.modalListItem, isSelected && styles.modalListItemActive]} 
                          activeOpacity={0.85}
                          onPress={() => handleSelectSubtitleForDownload(sub)}
                        >
                          <Text style={[styles.modalListItemText, isSelected && styles.modalListItemTextActive]}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}

                    <TouchableOpacity 
                      style={[
                        styles.modalListItem,
                        selectedSubTrack?.lang === 'none' && styles.modalListItemActive,
                      ]} 
                      activeOpacity={0.85}
                      onPress={() => handleSelectSubtitleForDownload({ label: 'No Subtitles / Off', file: null, lang: 'none' })}
                    >
                      <Text style={styles.modalListItemText}>No Subtitles / Off</Text>
                    </TouchableOpacity>
                  </ScrollView>
                )}

                <TouchableOpacity style={styles.modalBackBtn} onPress={() => setDownloadStep(1)}>
                  <Text style={styles.modalBackText}>← Change Audio (Sub/Dub)</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* STEP 3: SELECT QUALITY (STRICTLY NO AUTO OPTION) */}
            {downloadStep === 3 && (
              <View style={styles.modalStepContent}>
                <Text style={styles.modalStepLabel}>Step 3: Select Video Quality</Text>
                {isFetchingDownloadData ? (
                  <ActivityIndicator size="small" color={PURE_RED} style={{ marginVertical: 24 }} />
                ) : (
                  <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={true}>
                    {downloadQualities
                      .filter(q => q.label && q.label.toLowerCase() !== 'auto')
                      .map((q, idx) => {
                        const isSelected = selectedDownloadQuality?.label === q.label;
                        return (
                          <TouchableOpacity 
                            key={idx} 
                            style={[styles.modalListItem, isSelected && styles.modalListItemActive]} 
                            activeOpacity={0.85}
                            onPress={() => {
                              setSelectedDownloadQuality(q);
                              handleConfirmDownloadFinal(q);
                            }}
                          >
                            <Text style={[styles.modalListItemText, isSelected && styles.modalListItemTextActive]}>
                              {q.label}
                            </Text>
                            <IconDownload size={18} color="#FFF" />
                          </TouchableOpacity>
                        );
                      })}
                  </ScrollView>
                )}
                
                <View style={styles.modalFooterActions}>
                  <TouchableOpacity style={styles.modalBackBtn} onPress={() => setDownloadStep(2)}>
                    <Text style={styles.modalBackText}>← Change Subtitle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.modalConfirmBtn, !selectedDownloadQuality && { opacity: 0.5 }]} 
                    disabled={!selectedDownloadQuality}
                    onPress={() => handleConfirmDownloadFinal(selectedDownloadQuality)}
                  >
                    <Text style={styles.modalConfirmText}>Save & Download</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Fullscreen Player Overlay */}
      {activePlayback && (
        <View style={styles.playerFullscreenContainer}>
          <Player
            route={{ params: activePlayback }}
            navigation={{ goBack: () => setActivePlayback(null) }}
            user={resolvedUser}
            activeProfile={resolvedProfile}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: { flex: 1, backgroundColor: '#000000' },
  playerFullscreenContainer: { ...StyleSheet.absoluteFillObject, zIndex: 9999, backgroundColor: '#000' },
  topNavFloat: { position: 'absolute', top: 38, left: 16, zIndex: 100 },
  navBackCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  heroSection: { width: '100%', marginBottom: 15 },
  backdropBox: { width: '100%', height: height * 0.58, position: 'absolute', top: 0, left: 0 },
  backdropImg: { width: '100%', height: '100%' },
  heroForeground: { paddingTop: height * 0.36, paddingHorizontal: 16 },
  logoRow: { width: '100%', alignItems: 'center', marginBottom: 12 },
  titleLogo: { width: width * 0.8, height: 100 },
  fallbackTitleText: { color: '#FFF', fontSize: 32, fontWeight: '900', textAlign: 'center', textShadowColor: '#000', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  badgesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 18 },
  newBadge: { backgroundColor: BRAND_RED, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  newBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  ratingBadge: { backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  ratingBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  scoreText: { color: '#CCC', fontSize: 12, fontWeight: '700' },
  resumeBtn: { width: '100%', backgroundColor: BRAND_RED, borderRadius: 6, paddingVertical: 14, justifyContent: 'center', marginBottom: 20, overflow: 'hidden' },
  resumeContentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  resumeBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  resumeProgressUnderline: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(0,0,0,0.2)' },
  resumeProgressFill: { height: '100%', backgroundColor: '#FFFFFF' },
  actionsBar: { flexDirection: 'row', justifyContent: 'center', gap: 48, marginBottom: 20 },
  actionTab: { alignItems: 'center', gap: 6 },
  actionTabText: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },
  synopsisContainer: { marginBottom: 18 },
  synopsisBody: { color: '#D1D5DB', fontSize: 13, lineHeight: 19 },
  moreBtn: { marginTop: 4 },
  moreBtnText: { color: BRAND_RED, fontSize: 12, fontWeight: '700' },
  tabsHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#222', gap: 24 },
  tabTitleBtn: { paddingVertical: 12 },
  tabTitleBtnActive: { borderBottomWidth: 3, borderBottomColor: PURE_RED },
  tabTitleText: { color: '#777', fontSize: 15, fontWeight: '700' },
  tabTitleTextActive: { color: '#FFF' },
  
  // Rectangular Episode Selector Pills (Selected = Pure Red with White Text)
  chunkSelectorContainer: { paddingVertical: 14, gap: 10 },
  chunkRectPill: {
    backgroundColor: '#161616',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 4, // Sharp rectangle shape
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  chunkRectPillActive: {
    backgroundColor: PURE_RED,
    borderColor: PURE_RED,
  },
  chunkRectPillText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '700',
  },
  chunkRectPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },

  listPadding: { paddingBottom: 60 },
  episodeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 },
  bulletNumber: { color: '#FFF', fontSize: 16, fontWeight: '800', minWidth: 26, marginRight: 6 },
  episodeCard: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#050505', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 4, paddingVertical: 14, paddingHorizontal: 14, overflow: 'hidden' },
  episodeCardTitle: { color: '#FFF', fontSize: 14, fontWeight: '600', flex: 1 },
  cardRightGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fillerTag: { backgroundColor: 'rgba(255,165,0,0.2)', borderWidth: 1, borderColor: '#FFA500', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  fillerTagText: { color: '#FFA500', fontSize: 9, fontWeight: '900' },
  downloadIconBtn: { padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 4, marginLeft: 8, justifyContent: 'center', alignItems: 'center' },
  
  watchedText: { color: 'rgba(255,255,255,0.4)' },
  watchedCardBg: { backgroundColor: '#111', borderColor: 'rgba(255,255,255,0.05)' },
  epMiniProgressBg: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.1)' },
  epMiniProgressFill: { height: '100%', backgroundColor: PURE_RED },

  // "More Like This" 3-Column Grid Styles
  gridRowWrapper: {
    paddingHorizontal: 16,
    justifyContent: 'flex-start',
    gap: GRID_SPACING,
    marginBottom: 16,
  },
  gridAnimeCard: {
    width: GRID_CARD_WIDTH,
  },
  gridPosterBox: {
    width: GRID_CARD_WIDTH,
    height: Math.floor(GRID_CARD_WIDTH * 1.45),
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#161616',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  gridPosterImg: {
    width: '100%',
    height: '100%',
  },
  gridScoreBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.78)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  gridScoreText: {
    color: '#FACC15',
    fontSize: 10,
    fontWeight: '800',
  },
  gridAnimeTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  gridAnimeMeta: {
    color: '#888888',
    fontSize: 10,
    marginTop: 2,
    fontWeight: '600',
  },

  emptyContainer: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { color: '#777', fontSize: 13 },

  // Stepped Download Modal Styles
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContainer: { width: '100%', maxWidth: 440, backgroundColor: '#121212', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', elevation: 24 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  modalTitle: { color: '#FFF', fontSize: 17, fontWeight: '900' },
  modalSubHeader: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },
  modalCloseBtn: { padding: 4 },
  stepIndicatorRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  stepBadge: { flex: 1, paddingVertical: 6, borderRadius: 4, backgroundColor: '#1E1E1E', alignItems: 'center' },
  stepBadgeActive: { backgroundColor: PURE_RED },
  stepBadgeText: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '700' },
  stepBadgeTextActive: { color: '#FFFFFF', fontWeight: '900' },
  modalStepContent: { gap: 12 },
  modalStepLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  modalOptionsRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  modalOptionCard: { flex: 1, backgroundColor: '#1C1C1C', paddingVertical: 20, borderRadius: 6, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  modalOptionCardActive: { backgroundColor: PURE_RED, borderColor: PURE_RED },
  modalOptionCardTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  modalOptionCardSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 4, fontWeight: '600' },
  modalListItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1C1C1C', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 6, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  modalListItemActive: { backgroundColor: PURE_RED, borderColor: PURE_RED },
  modalListItemText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  modalListItemTextActive: { color: '#FFFFFF', fontWeight: '900' },
  modalBackBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  modalBackText: { color: '#CCCCCC', fontSize: 13, fontWeight: '700' },
  modalFooterActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  modalConfirmBtn: { backgroundColor: PURE_RED, paddingVertical: 11, paddingHorizontal: 20, borderRadius: 6 },
  modalConfirmText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
});
