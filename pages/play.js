import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  View, Text, StyleSheet, Dimensions, 
  TouchableOpacity, Share as NativeShare, StatusBar, 
  ActivityIndicator, FlatList, Modal, ScrollView 
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle } from 'react-native-svg';
import * as FileSystem from 'expo-file-system';
import * as NavigationBar from 'expo-navigation-bar';
import ProxyImage from '../components/ProxyImage';

import Player from './play/player';

// Safe dynamic imports for share.js and room.js from components/pages
let ShareComponent = null;
try {
  const mod = require('../components/share');
  ShareComponent = mod?.default || mod;
} catch (_) {}

let RoomComponent = null;
try {
  const mod = require('../components/room');
  RoomComponent = mod?.default || mod;
} catch (_) {
  try {
    const modPage = require('./room');
    RoomComponent = modPage?.default || modPage;
  } catch (__) {}
}

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
const GRID_SPACING = 12;
const GRID_CARD_WIDTH = Math.floor((width - 40 - GRID_SPACING * (GRID_COLUMNS - 1)) / GRID_COLUMNS);
const GRID_CARD_HEIGHT = Math.floor(GRID_CARD_WIDTH * 1.5);

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

// --- LOCAL STORAGE HELPERS ---
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

// --- UI ICONS ---
const IconBack = ({ size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5">
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);
const IconVerticalDots = ({ size = 20, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Circle cx="12" cy="5" r="2" />
    <Circle cx="12" cy="12" r="2" />
    <Circle cx="12" cy="19" r="2" />
  </Svg>
);
const IconPlay = ({ size = 18, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M8 5v14l11-7z" />
  </Svg>
);
const IconPlus = ({ size = 22, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);
const IconCheck = ({ size = 20, color = BRAND_RED }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3">
    <Path d="M20 6L9 17l-5-5" />
  </Svg>
);
const IconShare = ({ size = 20, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <Path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
  </Svg>
);
const IconDownload = ({ size = 20, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </Svg>
);
const IconRoom = ({ size = 20, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <Circle cx="9" cy="7" r="4" />
    <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
);
const IconClose = ({ size = 18, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);
const BookmarkIcon = ({ filled }) => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? BRAND_RED : "none"} stroke={filled ? BRAND_RED : "#FFFFFF"} strokeWidth="2.5">
    <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
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
  const [librarySet, setLibrarySet] = useState(new Set());
  const inLibrary = librarySet.has(animeDocId);

  const [moreLikeThis, setMoreLikeThis] = useState([]);
  const [sequelsAndRelated, setSequelsAndRelated] = useState([]);

  // Top-right vertical "..." menu + Share / Room overlay states
  const [topMenuVisible, setTopMenuVisible] = useState(false);
  const [shareOverlayVisible, setShareOverlayVisible] = useState(false);
  const [roomOverlayVisible, setRoomOverlayVisible] = useState(false);

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

  // --- MULTI-EPISODE DOWNLOAD SHEET STATES ---
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [downloadChunkIndex, setDownloadChunkIndex] = useState(0);
  const [selectedEpSlugs, setSelectedEpSlugs] = useState([]);
  const [selectedDownloadType, setSelectedDownloadType] = useState('sub');
  const [downloadSubTracks, setDownloadSubTracks] = useState([]);
  const [selectedSubTrack, setSelectedSubTrack] = useState(null);
  const [downloadQualities, setDownloadQualities] = useState([]);
  const [selectedDownloadQuality, setSelectedDownloadQuality] = useState(null);
  const [isFetchingDownloadData, setIsFetchingDownloadData] = useState(false);

  // When Download Menu is open: show phone's bottom navigation bar, but keep top notification bar hidden!
  useEffect(() => {
    const syncDownloadMenuBars = async () => {
      try {
        StatusBar.setHidden(true, 'none');
        if (downloadModalVisible) {
          await NavigationBar.setVisibilityAsync('visible');
        }
      } catch (_) {}
    };
    syncDownloadMenuBars();
  }, [downloadModalVisible]);

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
        setDownloadChunkIndex(savedChunk);
      } else {
        setCurrentChunkIndex(0);
        setDownloadChunkIndex(0);
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

  // 1. Firebase Watch History & Watchlist Listener (Tracks full librarySet for RecentSlider-style cards too)
  useEffect(() => {
    if (!resolvedUid) return;

    const libColRef = firestore()
      .collection('users')
      .doc(String(resolvedUid))
      .collection('library');

    const libUnsub = libColRef.onSnapshot(snap => {
      const nextSet = new Set();
      snap?.forEach(doc => nextSet.add(String(doc.id)));
      setLibrarySet(nextSet);
    }, () => {});

    if (!resolvedProfileId || !animeDocId) {
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
          if (data.episodes && typeof data.episodes === 'object') {
            Object.keys(data.episodes).forEach(k => {
              pMap[`ep_${k}`] = data.episodes[k];
              if (data.episodes[k]?.slug) pMap[String(data.episodes[k].slug)] = data.episodes[k];
            });
          }
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

  // Toggle Watchlist for main anime or any card in Sequel Slider / More Like This Grid
  const toggleLibraryItem = async (targetItem = null) => {
    if (!resolvedUid) return;
    const itemId = String(targetItem?.id || targetItem?.animeId || animeDocId);
    const itemTitle = targetItem?.title || resolvedTitle;
    const itemImg = targetItem?.image || targetItem?.coverImage || currentAnime.coverImage || resolvedBackdrop;

    const ref = firestore()
      .collection('users')
      .doc(String(resolvedUid))
      .collection('library')
      .doc(itemId);

    if (librarySet.has(itemId)) {
      await ref.delete().catch(() => {});
    } else {
      await ref.set({
        id: itemId,
        animeId: itemId,
        title: itemTitle,
        img: itemImg,
        backdrop: targetItem?.backdrop || itemImg,
        profileId: resolvedProfileId,
        addedAt: firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    }
  };

  // --- UNIFIED DOWNLOAD OPTIONS RESOLVER (Subtitles stay available in BOTH Sub & Dub!) ---
  const fetchUnifiedDownloadOptions = useCallback(async (epItem, audioType) => {
    const sampleEp = epItem || episodes[0];
    if (!sampleEp) return;
    setIsFetchingDownloadData(true);

    try {
      const safeId = encodeURIComponent(vercelAnimeId || animeDocId);
      const safeEp = encodeURIComponent(String(sampleEp.slug));
      const servers = ['hd-1', 'hd-2', 'vidstream-2'];

      let targetMasterUrl = null;
      let targetReferer = 'https://vidwish.live/';
      let collectedSubtitles = [];

      // 1. Fetch stream for the selected audioType (sub or dub)
      for (const srv of servers) {
        try {
          const res = await fetchWithTimeout(
            `${VERCEL_API_BASE}/api/stream?id=${safeId}&ep=${safeEp}&server=${srv}&type=${audioType}`
          );
          const json = await res.json();
          const payload = json?.data || json?.results || {};
          if (payload?.m3u8 || payload?.streamingLink) {
            targetMasterUrl = payload.m3u8 || payload.streamingLink;
            if (payload.referer) targetReferer = payload.referer;
            if (Array.isArray(payload.subtitles) && payload.subtitles.length > 0) {
              collectedSubtitles = [...payload.subtitles];
            }
            break;
          }
        } catch (_) {}
      }

      // 2. Always merge SUB stream subtitles so DUB also has full subtitle selection!
      if (audioType === 'dub' || collectedSubtitles.length === 0) {
        for (const srv of servers) {
          try {
            const subRes = await fetchWithTimeout(
              `${VERCEL_API_BASE}/api/stream?id=${safeId}&ep=${safeEp}&server=${srv}&type=sub`
            );
            const subJson = await subRes.json();
            const subPayload = subJson?.data || subJson?.results || {};
            if (!targetMasterUrl && (subPayload?.m3u8 || subPayload?.streamingLink)) {
              targetMasterUrl = subPayload.m3u8 || subPayload.streamingLink;
              if (subPayload.referer) targetReferer = subPayload.referer;
            }
            if (Array.isArray(subPayload?.subtitles) && subPayload.subtitles.length > 0) {
              const seenSubLabels = new Set(collectedSubtitles.map(s => s.label || s.lang));
              for (const s of subPayload.subtitles) {
                const lbl = s.label || s.lang;
                if (lbl && !seenSubLabels.has(lbl)) {
                  seenSubLabels.add(lbl);
                  collectedSubtitles.push(s);
                }
              }
              break;
            }
          } catch (_) {}
        }
      }

      setDownloadSubTracks(collectedSubtitles);

      setSelectedSubTrack(prev => {
        if (prev && prev.lang === 'none') return prev;
        if (prev) {
          const match = collectedSubtitles.find(
            s => (s.label || s.lang) === (prev.label || prev.lang)
          );
          if (match) return match;
        }
        if (collectedSubtitles.length > 0) {
          return (
            collectedSubtitles.find(s =>
              String(s.label || s.lang || '').toLowerCase().includes('eng')
            ) ||
            collectedSubtitles.find(s => s.default) ||
            collectedSubtitles[0]
          );
        }
        return { label: 'No Subtitles / Off', file: null, lang: 'none' };
      });

      // 3. Parse explicit video qualities (strictly excluding "Auto")
      let explicitQualities = [];
      if (targetMasterUrl) {
        try {
          const m3Res = await fetchWithTimeout(targetMasterUrl, {
            headers: { Referer: targetReferer }
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
                  streamUri = targetMasterUrl.substring(0, targetMasterUrl.lastIndexOf('/') + 1) + streamUri;
                }
                if (label.toLowerCase() !== 'auto') {
                  explicitQualities.push({
                    label,
                    resolution: Number(resMatch[1]),
                    uri: streamUri,
                    referer: targetReferer,
                  });
                }
              }
            }
          }
        } catch (_) {}
      }

      const uniqueQualities = [];
      const seenLabels = new Set();
      for (const q of explicitQualities) {
        if (q.label && q.label.toLowerCase() !== 'auto' && !seenLabels.has(q.label)) {
          seenLabels.add(q.label);
          uniqueQualities.push(q);
        }
      }

      uniqueQualities.sort((a, b) => (b.resolution || 0) - (a.resolution || 0));

      const finalQualities =
        uniqueQualities.length > 0
          ? uniqueQualities
          : [
              { label: '1080p', resolution: 1080, uri: targetMasterUrl || '', referer: targetReferer },
              { label: '720p', resolution: 720, uri: targetMasterUrl || '', referer: targetReferer },
              { label: '480p', resolution: 480, uri: targetMasterUrl || '', referer: targetReferer },
              { label: '360p', resolution: 360, uri: targetMasterUrl || '', referer: targetReferer },
            ];

      setDownloadQualities(finalQualities);
      setSelectedDownloadQuality(prev => {
        if (prev) {
          const matchedQ = finalQualities.find(q => q.label === prev.label);
          if (matchedQ) return matchedQ;
        }
        return finalQualities[0];
      });
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
  }, [vercelAnimeId, animeDocId, episodes]);

  // Open Multi-Episode Download Sheet (Used by Top `⋮` Menu, Hero Download Button, and Episode Row Button)
  const handleOpenDownload = async (preselectedEp = null) => {
    setTopMenuVisible(false);

    // Hide notification bar and show phone's bottom navigation bar
    try {
      StatusBar.setHidden(true, 'none');
      await NavigationBar.setVisibilityAsync('visible');
    } catch (_) {}

    const savedPrefs = await readLocalJson(PLAY_PREFS_STORAGE_KEY, PLAY_PREFS_FILE_URI, {});
    const initialAudio = savedPrefs?.preferredDownloadType || 'sub';

    const targetEp = preselectedEp || targetEpToPlay || episodes[0] || null;
    if (targetEp) {
      setSelectedEpSlugs([String(targetEp.slug)]);
      const epIdx = episodes.findIndex(e => String(e.slug) === String(targetEp.slug));
      if (epIdx !== -1) {
        setDownloadChunkIndex(Math.floor(epIdx / EPISODE_CHUNK_SIZE));
      } else {
        setDownloadChunkIndex(currentChunkIndex);
      }
    } else {
      setSelectedEpSlugs([]);
      setDownloadChunkIndex(currentChunkIndex);
    }

    setSelectedDownloadType(initialAudio);
    setDownloadModalVisible(true);
    if (targetEp) {
      fetchUnifiedDownloadOptions(targetEp, initialAudio);
    }
  };

  const toggleEpisodeSelectionForDownload = (epItem) => {
    const slugStr = String(epItem.slug);
    setSelectedEpSlugs(prev => {
      if (prev.includes(slugStr)) {
        return prev.filter(s => s !== slugStr);
      }
      return [...prev, slugStr];
    });
  };

  const handleSelectAllInDownloadChunk = (chunkEpisodes) => {
    const chunkSlugs = chunkEpisodes.map(e => String(e.slug));
    const allSelected = chunkSlugs.every(s => selectedEpSlugs.includes(s));
    if (allSelected) {
      setSelectedEpSlugs(prev => prev.filter(s => !chunkSlugs.includes(s)));
    } else {
      setSelectedEpSlugs(prev => Array.from(new Set([...prev, ...chunkSlugs])));
    }
  };

  const handleSwitchDownloadAudioType = (type) => {
    setSelectedDownloadType(type);
    updateLocalPreferences({ preferredDownloadType: type });
    const firstSelectedEp =
      episodes.find(e => selectedEpSlugs.includes(String(e.slug))) || episodes[0];
    if (firstSelectedEp) {
      fetchUnifiedDownloadOptions(firstSelectedEp, type);
    }
  };

  // Queue All Selected Episodes Simultaneously & Silently in Local Storage
  const handleConfirmBatchDownload = async () => {
    const finalQuality = selectedDownloadQuality || downloadQualities[0];
    const chosenEpisodes = episodes.filter(e => selectedEpSlugs.includes(String(e.slug)));
    if (!finalQuality || chosenEpisodes.length === 0) return;

    // Close modal immediately without any system alert popup
    setDownloadModalVisible(false);

    const isSingleMatch = chosenEpisodes.length === 1;
    const newRecords = chosenEpisodes.map((epItem) => ({
      id: `${animeDocId}_ep_${epItem.num}_${selectedDownloadType}_${finalQuality.label}`,
      animeId: animeDocId,
      animeTitle: resolvedTitle,
      backdrop: resolvedBackdrop,
      coverImage: currentAnime.coverImage || resolvedBackdrop,
      synopsis: tmdbSynopsis || currentAnime.description || '',
      genres: Array.isArray(currentAnime.genres) ? currentAnime.genres : ['Action', 'Adventure'],
      totalEpisodes: episodes.length || 12,
      episodeNum: Number(epItem.num),
      episodeTitle: epItem.title || `Episode ${epItem.num}`,
      slug: String(epItem.slug),
      audioType: selectedDownloadType,
      subtitle: {
        label: selectedSubTrack?.label || selectedSubTrack?.lang || 'No Subtitles / Off',
        file: isSingleMatch ? selectedSubTrack?.file || null : null,
        lang: selectedSubTrack?.lang || 'none',
      },
      quality: finalQuality.label,
      streamUri: isSingleMatch ? finalQuality.uri || null : null,
      referer: finalQuality.referer || 'https://vidwish.live/',
      profileId: resolvedProfileId || 'default',
      userUid: resolvedUid || null,
      status: 'queued',
      savedAt: Date.now(),
    }));

    const existingQueue = await readLocalJson(DOWNLOAD_QUEUE_STORAGE_KEY, DOWNLOAD_QUEUE_FILE_URI, []);
    const queueArray = Array.isArray(existingQueue) ? existingQueue : [];
    const newIdSet = new Set(newRecords.map(r => r.id));
    const filteredQueue = queueArray.filter(item => !newIdSet.has(item.id));
    const updatedQueue = [...newRecords, ...filteredQueue];
    await writeLocalJson(DOWNLOAD_QUEUE_STORAGE_KEY, DOWNLOAD_QUEUE_FILE_URI, updatedQueue);

    await updateLocalPreferences({
      preferredDownloadType: selectedDownloadType,
      preferredSubtitleLang: selectedSubTrack?.label || selectedSubTrack?.lang || 'No Subtitles / Off',
      preferredDownloadQuality: finalQuality.label,
      lastDownload: newRecords[0],
    });

    if (resolvedUid && resolvedProfileId) {
      const profileDlRef = firestore()
        .collection('users')
        .doc(String(resolvedUid))
        .collection('profiles')
        .doc(String(resolvedProfileId))
        .collection('downloads');

      newRecords.forEach(record => {
        profileDlRef
          .doc(`${animeDocId}_ep_${record.episodeNum}`)
          .set(record, { merge: true })
          .catch(() => {});
      });
    }
  };

  // Open Share Component (`../components/share`) or fallback
  const handleOpenShare = () => {
    setTopMenuVisible(false);
    if (ShareComponent) {
      setShareOverlayVisible(true);
    } else if (navigation?.navigate) {
      try {
        navigation.navigate('Share', {
          anime: currentAnime,
          user: resolvedUser,
          activeProfile: resolvedProfile,
        });
      } catch (_) {
        NativeShare.share({ message: `Watch ${resolvedTitle} on Kameko!` });
      }
    } else {
      NativeShare.share({ message: `Watch ${resolvedTitle} on Kameko!` });
    }
  };

  // Open Room Component (`../components/room`) or navigate
  const handleOpenRoom = () => {
    setTopMenuVisible(false);
    if (RoomComponent) {
      setRoomOverlayVisible(true);
    } else if (navigation?.navigate) {
      try {
        navigation.navigate('Room', {
          anime: currentAnime,
          episode: targetEpToPlay || episodes[0] || null,
          user: resolvedUser,
          activeProfile: resolvedProfile,
          activeProfileId: resolvedProfileId,
        });
      } catch (_) {
        setRoomOverlayVisible(true);
      }
    } else {
      setRoomOverlayVisible(true);
    }
  };

  // 2. Fetch TMDB Data, Sequels/Related Slider (for Episodes Tab bottom), and "More Like This" Grid
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

    const loadRelationsAndMoreLikeThis = async () => {
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
                    episodes
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
                    type
                    title { romaji english }
                    bannerImage
                    coverImage { extraLarge large }
                    format
                    episodes
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

        const relationEdges = (media?.relations?.edges || []).filter(
          e => e?.node && (!e.node.type || e.node.type === 'ANIME')
        );

        const relationPriority = {
          SEQUEL: 1,
          PREQUEL: 2,
          PARENT: 3,
          SIDE_STORY: 4,
          SPIN_OFF: 5,
          ALTERNATIVE: 6,
          SUMMARY: 7,
          OTHER: 8,
        };

        const formattedRelations = relationEdges
          .map(edge => {
            const node = edge.node;
            const relType = edge.relationType || 'RELATED';
            const cover = node.coverImage?.extraLarge || node.coverImage?.large || '';
            return {
              id: String(node.id),
              animeId: String(node.id),
              title: node.title?.english || node.title?.romaji || 'Untitled',
              image: cover,
              coverImage: cover,
              backdrop: node.bannerImage || cover,
              episode: node.episodes || null,
              sub: node.episodes || '?',
              format: node.format || 'TV',
              score: node.averageScore || 85,
              year: node.seasonYear || '',
              status: node.status || 'FINISHED',
              relationType: relType.replace(/_/g, ' '),
              priority: relationPriority[relType] || 99,
              description: node.description ? node.description.replace(/<[^>]*>/g, '') : '',
            };
          })
          .sort((a, b) => a.priority - b.priority);

        const recNodes = (media?.recommendations?.nodes || [])
          .map(n => n?.mediaRecommendation)
          .filter(Boolean);

        const combinedMore = [
          ...recNodes.map(node => {
            const cover = node.coverImage?.extraLarge || node.coverImage?.large || '';
            return {
              id: String(node.id),
              animeId: String(node.id),
              title: node.title?.english || node.title?.romaji || 'Untitled',
              image: cover,
              coverImage: cover,
              backdrop: node.bannerImage || cover,
              episode: node.episodes || null,
              sub: node.episodes || '?',
              format: node.format || 'TV',
              score: node.averageScore || 85,
              year: node.seasonYear || '',
              status: node.status || 'FINISHED',
              relationType: 'RECOMMENDED',
              description: node.description ? node.description.replace(/<[^>]*>/g, '') : '',
            };
          }),
          ...formattedRelations,
        ];

        const uniqueMore = [];
        const seenMoreIds = new Set();
        for (const item of combinedMore) {
          if (!seenMoreIds.has(item.id)) {
            seenMoreIds.add(item.id);
            uniqueMore.push(item);
          }
        }

        const sequelSliderItems =
          formattedRelations.length > 0 ? formattedRelations : uniqueMore.slice(0, 12);

        if (isMounted) {
          setSequelsAndRelated(sequelSliderItems);
          setMoreLikeThis(uniqueMore);
        }
      } catch (_) {}
    };

    loadTMDB();
    loadRelationsAndMoreLikeThis();
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
          
          if (!hasRestoredLocalChunkRef.current) {
            const targetEpNum = latestWatched?.episodeNum || latestWatched?.lastWatchedEp || currentAnime?.episodeNum;
            if (targetEpNum) {
              const epIndex = formatted.findIndex(e => String(e.num) === String(targetEpNum));
              if (epIndex !== -1) {
                const autoChunk = Math.floor(epIndex / EPISODE_CHUNK_SIZE);
                setCurrentChunkIndex(autoChunk);
                setDownloadChunkIndex(autoChunk);
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
  const downloadChunkEpisodes = episodeChunks[downloadChunkIndex] || episodeChunks[0] || [];

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
    } catch (_) {
    } finally {
      setLoadingEpisode(null);
    }
  };

  // Switch to a related / sequel anime when tapped
  const handleSelectRelatedAnime = useCallback((item) => {
    if (!item) return;
    const enrichedTarget = {
      ...item,
      id: item.id,
      animeId: item.id,
      title: item.title,
      coverImage: item.image || item.coverImage,
      backdrop: item.backdrop || item.image || item.coverImage,
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
      setTmdbSynopsis(item.description || 'Latest episode released.');
      setCurrentAnime(enrichedTarget);
      setActiveTab('episodes');
    }
  }, [resolvedUid, resolvedProfileId, resolvedProfile, resolvedUser, navigation]);

  // 5. Smart Target Episode Resolution
  const targetEpToPlay = (() => {
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
    targetEpToPlay &&
    latestWatched &&
    latestWatched.duration > 0 &&
    (String(latestWatched.slug) === String(targetEpToPlay.slug) ||
      String(latestWatched.episodeNum || latestWatched.lastWatchedEp) === String(targetEpToPlay.num))
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
          onPress={() => targetEpToPlay && handlePlayEpisode(targetEpToPlay)}
          disabled={episodes.length === 0 || isUpcoming}
        >
          <View style={styles.resumeContentRow}>
            <Text style={styles.resumeBtnText}>
              {isUpcoming ? 'Not Yet Released' : (
                latestWatched?.finishedEp && targetEpToPlay?.slug !== latestWatched?.slug 
                  ? `Play Next: Episode ${targetEpToPlay?.num}` 
                  : resumePct > 0 
                    ? `Resume Episode ${targetEpToPlay?.num || 1}` 
                    : `Watch Episode ${targetEpToPlay?.num || 1}`
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

        {/* Hero Actions Bar (Main Download Button Opens Multi-Episode Selector!) */}
        <View style={styles.actionsBar}>
          <TouchableOpacity style={styles.actionTab} onPress={() => toggleLibraryItem()} activeOpacity={0.7}>
            {inLibrary ? <IconCheck /> : <IconPlus />}
            <Text style={styles.actionTabText}>Watchlist</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionTab} onPress={() => handleOpenDownload(targetEpToPlay)} activeOpacity={0.7}>
            <IconDownload />
            <Text style={styles.actionTabText}>Download</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionTab} onPress={handleOpenShare} activeOpacity={0.7}>
            <IconShare />
            <Text style={styles.actionTabText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionTab} onPress={handleOpenRoom} activeOpacity={0.7}>
            <IconRoom />
            <Text style={styles.actionTabText}>Room</Text>
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

        {/* RECTANGULAR EPISODE SELECTOR PILLS (1 - 50, Pure Red with White Text when selected) */}
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

  // Bottom Slider in Episodes Tab using exact RecentSlider Card UI
  const renderEpisodesFooter = () => {
    if (activeTab !== 'episodes' || sequelsAndRelated.length === 0) return null;

    return (
      <View style={styles.recentStyleSectionContainer}>
        <View style={styles.recentStyleHeaderRow}>
          <Text style={styles.recentStyleSectionTitle}>Sequels & Related Anime</Text>
        </View>

        <FlatList
          horizontal
          data={sequelsAndRelated}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => `seq-${item.id}`}
          contentContainerStyle={styles.recentStyleListPadding}
          snapToInterval={155}
          decelerationRate="fast"
          renderItem={({ item }) => {
            const isAdded = librarySet.has(String(item.id));
            return (
              <TouchableOpacity
                style={styles.recentCardContainer}
                activeOpacity={0.85}
                onPress={() => handleSelectRelatedAnime(item)}
              >
                <View style={styles.recentImageWrapper}>
                  <ProxyImage
                    source={{ uri: item.image || item.coverImage }}
                    style={styles.recentCoverImage}
                    resizeMode="cover"
                  />

                  <View style={styles.recentBadgeContainer}>
                    {item.episode && (
                      <View style={styles.recentEpBadge}>
                        <Text style={styles.recentEpBadgeText}>EP {item.episode}</Text>
                      </View>
                    )}
                    <View style={styles.recentCcBadge}>
                      <Text style={styles.recentCcBadgeText}>CC {item.sub || '?'}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.recentSaveBtn, isAdded && styles.recentSaveBtnActive]}
                    onPress={() => toggleLibraryItem(item)}
                    activeOpacity={0.8}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <BookmarkIcon filled={isAdded} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.recentAnimeTitle} numberOfLines={1}>
                  {item.title}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );
  };

  const isEpisodesTab = activeTab === 'episodes';

  return (
    <View style={styles.screenContainer}>
      {/* Keep top notification bar hidden */}
      <StatusBar hidden={true} translucent={true} backgroundColor="transparent" />

      {/* Top Left Back Button */}
      <View style={styles.topNavFloat}>
        <TouchableOpacity style={styles.navBackCircle} onPress={onBack || (() => navigation?.goBack?.())}>
          <IconBack />
        </TouchableOpacity>
      </View>

      {/* Top Right Vertical "..." Menu Button */}
      <View style={styles.topRightFloat}>
        <TouchableOpacity
          style={styles.navBackCircle}
          activeOpacity={0.8}
          onPress={() => setTopMenuVisible(true)}
        >
          <IconVerticalDots size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      <FlatList
        key={isEpisodesTab ? 'episodes-list' : 'more-like-this-grid'}
        numColumns={isEpisodesTab ? 1 : GRID_COLUMNS}
        data={isEpisodesTab ? currentEpisodesToRender : moreLikeThis}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderEpisodesFooter}
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
                  
                  {epProgress && epProgress.duration > 0 && (
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

          // "MORE LIKE THIS" GRID CARD USING EXACT RECENT_SLIDER UI
          const isAdded = librarySet.has(String(item.id));
          return (
            <TouchableOpacity
              style={styles.gridRecentCardContainer}
              activeOpacity={0.85}
              onPress={() => handleSelectRelatedAnime(item)}
            >
              <View style={styles.gridRecentImageWrapper}>
                <ProxyImage
                  source={{ uri: item.image || item.coverImage }}
                  style={styles.recentCoverImage}
                  resizeMode="cover"
                />

                <View style={styles.recentBadgeContainer}>
                  {item.episode && (
                    <View style={styles.recentEpBadge}>
                      <Text style={styles.recentEpBadgeText}>EP {item.episode}</Text>
                    </View>
                  )}
                  <View style={styles.recentCcBadge}>
                    <Text style={styles.recentCcBadgeText}>CC {item.sub || '?'}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.recentSaveBtn, isAdded && styles.recentSaveBtnActive]}
                  onPress={() => toggleLibraryItem(item)}
                  activeOpacity={0.8}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <BookmarkIcon filled={isAdded} />
                </TouchableOpacity>
              </View>

              <Text style={styles.recentAnimeTitle} numberOfLines={1}>
                {item.title}
              </Text>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.listPadding}
        showsVerticalScrollIndicator={false}
      />

      {/* --- TOP-RIGHT VERTICAL "..." DROPDOWN MENU MODAL --- */}
      <Modal
        visible={topMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setTopMenuVisible(false)}
      >
        <View style={styles.topMenuBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setTopMenuVisible(false)}
          />

          <View style={styles.topDropdownMenuBox}>
            {/* 1. Add to List */}
            <TouchableOpacity
              style={styles.topDropdownItem}
              activeOpacity={0.8}
              onPress={() => {
                toggleLibraryItem();
                setTopMenuVisible(false);
              }}
            >
              {inLibrary ? <IconCheck size={18} color={PURE_RED} /> : <IconPlus size={18} color="#FFF" />}
              <Text style={styles.topDropdownText}>
                {inLibrary ? 'Remove from List' : 'Add to List'}
              </Text>
            </TouchableOpacity>

            <View style={styles.topDropdownDivider} />

            {/* 2. Download (Opens Multi-Episode Selector Sheet) */}
            <TouchableOpacity
              style={styles.topDropdownItem}
              activeOpacity={0.8}
              onPress={() => handleOpenDownload(targetEpToPlay)}
            >
              <IconDownload size={18} color="#FFF" />
              <Text style={styles.topDropdownText}>Download</Text>
            </TouchableOpacity>

            <View style={styles.topDropdownDivider} />

            {/* 3. Share (Opens share.js from components) */}
            <TouchableOpacity
              style={styles.topDropdownItem}
              activeOpacity={0.8}
              onPress={handleOpenShare}
            >
              <IconShare size={18} color="#FFF" />
              <Text style={styles.topDropdownText}>Share</Text>
            </TouchableOpacity>

            <View style={styles.topDropdownDivider} />

            {/* 4. Room (Opens room.js) */}
            <TouchableOpacity
              style={styles.topDropdownItem}
              activeOpacity={0.8}
              onPress={handleOpenRoom}
            >
              <IconRoom size={18} color="#FFF" />
              <Text style={styles.topDropdownText}>Room</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- MULTI-EPISODE DOWNLOAD BOTTOM SHEET (Shows Phone Bottom Nav, Hides Notification Bar) --- */}
      <Modal
        visible={downloadModalVisible}
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        onShow={async () => {
          try {
            StatusBar.setHidden(true, 'none');
            await NavigationBar.setVisibilityAsync('visible');
          } catch (_) {}
        }}
        onRequestClose={() => setDownloadModalVisible(false)}
      >
        <View style={styles.bottomSheetOverlay}>
          <StatusBar hidden={true} translucent={true} backgroundColor="transparent" />
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setDownloadModalVisible(false)}
          />

          <View style={styles.multiDownloadSheet}>
            <View style={styles.sheetGrabHandle} />

            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  Download Episodes ({selectedEpSlugs.length} Selected)
                </Text>
                <Text style={styles.modalSubHeader} numberOfLines={1}>
                  {resolvedTitle}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDownloadModalVisible(false)} style={styles.modalCloseBtn}>
                <IconClose size={18} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.sheetScrollArea}
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled={true}
            >
              {/* 1. EPISODE MULTI-SELECTOR WITH 1-50 RECTANGLE PILLS FOR LONGER SERIES */}
              <View style={styles.sheetSectionHeaderRow}>
                <Text style={styles.sheetSectionLabel}>Select Episodes</Text>
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  <TouchableOpacity
                    onPress={() => handleSelectAllInDownloadChunk(downloadChunkEpisodes)}
                  >
                    <Text style={styles.selectAllLinkText}>
                      {downloadChunkEpisodes.length > 0 &&
                      downloadChunkEpisodes.every(e => selectedEpSlugs.includes(String(e.slug)))
                        ? 'Unselect Range'
                        : 'Select All'}
                    </Text>
                  </TouchableOpacity>
                  {selectedEpSlugs.length > 0 && (
                    <TouchableOpacity onPress={() => setSelectedEpSlugs([])}>
                      <Text style={[styles.selectAllLinkText, { color: '#AAA' }]}>Clear</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* 1 to 50 Rectangle Range Selector for Longer Series */}
              {episodeChunks.length > 1 && (
                <FlatList
                  horizontal
                  data={episodeChunks}
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(_, idx) => `dl-chunk-${idx}`}
                  contentContainerStyle={{ gap: 8, paddingBottom: 10 }}
                  renderItem={({ item, index }) => {
                    const startEp = item[0].num;
                    const endEp = item[item.length - 1].num;
                    const isActive = downloadChunkIndex === index;
                    return (
                      <TouchableOpacity
                        style={[styles.chunkRectPill, isActive && styles.chunkRectPillActive]}
                        activeOpacity={0.85}
                        onPress={() => setDownloadChunkIndex(index)}
                      >
                        <Text style={[styles.chunkRectPillText, isActive && styles.chunkRectPillTextActive]}>
                          {startEp} - {endEp}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              )}

              {/* Multi-Select Episode Number Grid */}
              <View style={styles.multiEpGrid}>
                {downloadChunkEpisodes.map((epItem) => {
                  const isSelected = selectedEpSlugs.includes(String(epItem.slug));
                  return (
                    <TouchableOpacity
                      key={epItem.id}
                      style={[styles.multiEpBox, isSelected && styles.multiEpBoxActive]}
                      activeOpacity={0.8}
                      onPress={() => toggleEpisodeSelectionForDownload(epItem)}
                    >
                      <Text style={[styles.multiEpBoxText, isSelected && styles.multiEpBoxTextActive]}>
                        {epItem.num}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 2. LANGUAGE (SUB / DUB) */}
              <Text style={styles.sheetSectionLabel}>Language / Audio</Text>
              <View style={styles.sheetPillRow}>
                {['sub', 'dub'].map((type) => {
                  const isSelected = selectedDownloadType === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.sheetRectPill, isSelected && styles.sheetRectPillActive]}
                      activeOpacity={0.85}
                      onPress={() => handleSwitchDownloadAudioType(type)}
                    >
                      <Text style={[styles.sheetRectPillText, isSelected && styles.sheetRectPillTextActive]}>
                        {type === 'sub' ? 'SUB (Japanese)' : 'DUB (English)'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 3. SUBTITLES (AVAILABLE FOR BOTH SUB & DUB) */}
              <Text style={styles.sheetSectionLabel}>Subtitles</Text>
              {isFetchingDownloadData ? (
                <ActivityIndicator size="small" color={PURE_RED} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.sheetHorizontalPills}
                >
                  {downloadSubTracks.map((sub, idx) => {
                    const label = sub.label || sub.lang || `Subtitle ${idx + 1}`;
                    const isSelected =
                      selectedSubTrack?.lang !== 'none' &&
                      (selectedSubTrack?.label || selectedSubTrack?.lang) === label;
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.sheetRectPill, isSelected && styles.sheetRectPillActive]}
                        activeOpacity={0.85}
                        onPress={() => setSelectedSubTrack(sub)}
                      >
                        <Text style={[styles.sheetRectPillText, isSelected && styles.sheetRectPillTextActive]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}

                  <TouchableOpacity
                    style={[
                      styles.sheetRectPill,
                      selectedSubTrack?.lang === 'none' && styles.sheetRectPillActive,
                    ]}
                    activeOpacity={0.85}
                    onPress={() =>
                      setSelectedSubTrack({ label: 'No Subtitles / Off', file: null, lang: 'none' })
                    }
                  >
                    <Text
                      style={[
                        styles.sheetRectPillText,
                        selectedSubTrack?.lang === 'none' && styles.sheetRectPillTextActive,
                      ]}
                    >
                      Off
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              )}

              {/* 4. VIDEO QUALITY (NO AUTO OPTION) */}
              <Text style={styles.sheetSectionLabel}>Quality</Text>
              {isFetchingDownloadData ? (
                <ActivityIndicator size="small" color={PURE_RED} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
              ) : (
                <View style={styles.sheetPillRow}>
                  {downloadQualities
                    .filter(q => q.label && q.label.toLowerCase() !== 'auto')
                    .map((q, idx) => {
                      const isSelected = selectedDownloadQuality?.label === q.label;
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={[styles.sheetRectPill, isSelected && styles.sheetRectPillActive]}
                          activeOpacity={0.85}
                          onPress={() => setSelectedDownloadQuality(q)}
                        >
                          <Text style={[styles.sheetRectPillText, isSelected && styles.sheetRectPillTextActive]}>
                            {q.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                </View>
              )}
            </ScrollView>

            {/* INSTANT SILENT DOWNLOAD SUBMIT BUTTON */}
            <TouchableOpacity
              style={[
                styles.sheetDownloadSubmitBtn,
                (isFetchingDownloadData || !selectedDownloadQuality || selectedEpSlugs.length === 0) && {
                  opacity: 0.5,
                },
              ]}
              activeOpacity={0.85}
              disabled={isFetchingDownloadData || !selectedDownloadQuality || selectedEpSlugs.length === 0}
              onPress={handleConfirmBatchDownload}
            >
              <IconDownload size={18} color="#FFF" />
              <Text style={styles.sheetDownloadSubmitText}>
                {selectedEpSlugs.length > 1
                  ? `Download ${selectedEpSlugs.length} Episodes`
                  : 'Download Episode'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- SHARE.JS OVERLAY MODAL --- */}
      {shareOverlayVisible && ShareComponent && (
        <Modal
          visible={shareOverlayVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShareOverlayVisible(false)}
        >
          <View style={styles.fullOverlayModal}>
            <ShareComponent
              anime={currentAnime}
              user={resolvedUser}
              activeProfile={resolvedProfile}
              activeProfileId={resolvedProfileId}
              navigation={navigation}
              onBack={() => setShareOverlayVisible(false)}
              onClose={() => setShareOverlayVisible(false)}
            />
          </View>
        </Modal>
      )}

      {/* --- ROOM.JS OVERLAY MODAL --- */}
      {roomOverlayVisible && (
        <Modal
          visible={roomOverlayVisible}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setRoomOverlayVisible(false)}
        >
          <View style={styles.fullOverlayModal}>
            {RoomComponent ? (
              <RoomComponent
                anime={currentAnime}
                episode={targetEpToPlay || episodes[0] || null}
                episodes={episodes}
                user={resolvedUser}
                activeProfile={resolvedProfile}
                activeProfileId={resolvedProfileId}
                navigation={navigation}
                onBack={() => setRoomOverlayVisible(false)}
                onClose={() => setRoomOverlayVisible(false)}
              />
            ) : (
              <View style={styles.fallbackRoomScreen}>
                <TouchableOpacity
                  style={styles.fallbackRoomClose}
                  onPress={() => setRoomOverlayVisible(false)}
                >
                  <IconBack />
                </TouchableOpacity>
                <Text style={styles.fallbackRoomTitle}>Watch Party Room</Text>
                <Text style={styles.fallbackRoomSub}>{resolvedTitle}</Text>
              </View>
            )}
          </View>
        </Modal>
      )}

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
  fullOverlayModal: { flex: 1, backgroundColor: '#000000' },
  topNavFloat: { position: 'absolute', top: 38, left: 16, zIndex: 100 },
  topRightFloat: { position: 'absolute', top: 38, right: 16, zIndex: 100 },
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
  actionsBar: { flexDirection: 'row', justifyContent: 'center', gap: 36, marginBottom: 20 },
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
    fontSize: 13,
    fontWeight: '700',
  },
  chunkRectPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },

  listPadding: { paddingBottom: 70 },
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

  // --- RECENT_SLIDER MATCHED UI STYLES (For Bottom Sequel Slider & More Like This Grid) ---
  recentStyleSectionContainer: { marginTop: 20, marginBottom: 25 },
  recentStyleHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  recentStyleSectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', borderLeftWidth: 3, borderLeftColor: BRAND_RED, paddingLeft: 8 },
  recentStyleListPadding: { paddingHorizontal: 20 },
  recentCardContainer: { width: 140, marginRight: 15 },
  recentImageWrapper: {
    width: 140,
    height: 210,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  recentCoverImage: { width: '100%', height: '100%' },
  recentBadgeContainer: { position: 'absolute', top: 8, left: 8, alignItems: 'flex-start', gap: 4 },
  recentEpBadge: { backgroundColor: '#FFFFFF', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 3 },
  recentEpBadgeText: { color: '#000000', fontSize: 10, fontWeight: '900' },
  recentCcBadge: { backgroundColor: 'rgba(229,9,20,0.9)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  recentCcBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: 'bold' },
  recentSaveBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  recentSaveBtnActive: { backgroundColor: 'rgba(0,0,0,0.85)', borderColor: BRAND_RED },
  recentAnimeTitle: { color: '#E0E0E0', fontSize: 13, fontWeight: '700', marginTop: 8 },

  // "More Like This" 3-Column Grid using RecentSlider Card UI
  gridRowWrapper: {
    paddingHorizontal: 20,
    justifyContent: 'flex-start',
    gap: GRID_SPACING,
    marginBottom: 18,
  },
  gridRecentCardContainer: {
    width: GRID_CARD_WIDTH,
  },
  gridRecentImageWrapper: {
    width: GRID_CARD_WIDTH,
    height: GRID_CARD_HEIGHT,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  emptyContainer: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { color: '#777', fontSize: 13 },

  // Top-Right Vertical "..." Dropdown Menu
  topMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  topDropdownMenuBox: {
    position: 'absolute',
    top: 82,
    right: 16,
    width: 195,
    backgroundColor: '#141418',
    borderRadius: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    elevation: 20,
  },
  topDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  topDropdownText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  topDropdownDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  // Multi-Episode Download Bottom Sheet
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.74)',
    justifyContent: 'flex-end',
  },
  multiDownloadSheet: {
    width: '100%',
    height: Math.floor(height * 0.62),
    backgroundColor: '#111115',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.12)',
    elevation: 25,
  },
  sheetGrabHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: { color: '#FFF', fontSize: 17, fontWeight: '900' },
  modalSubHeader: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1C1C22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetScrollArea: {
    flex: 1,
  },
  sheetScrollContent: {
    paddingBottom: 16,
  },
  sheetSectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  sheetSectionLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 10,
    marginBottom: 8,
  },
  selectAllLinkText: {
    color: PURE_RED,
    fontSize: 12,
    fontWeight: '800',
  },
  multiEpGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  multiEpBox: {
    minWidth: 46,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: '#1B1B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiEpBoxActive: {
    backgroundColor: PURE_RED,
    borderColor: PURE_RED,
  },
  multiEpBoxText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '700',
  },
  multiEpBoxTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  sheetPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sheetHorizontalPills: {
    gap: 8,
    paddingRight: 12,
  },
  sheetRectPill: {
    backgroundColor: '#1B1B22',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  sheetRectPillActive: {
    backgroundColor: PURE_RED,
    borderColor: PURE_RED,
  },
  sheetRectPillText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '700',
  },
  sheetRectPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  sheetDownloadSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PURE_RED,
    paddingVertical: 14,
    borderRadius: 6,
    marginTop: 10,
  },
  sheetDownloadSubmitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  fallbackRoomScreen: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  fallbackRoomClose: {
    position: 'absolute',
    top: 40,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackRoomTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 6,
  },
  fallbackRoomSub: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '600',
  },
});
