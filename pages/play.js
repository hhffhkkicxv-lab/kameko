import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  View, Text, StyleSheet, Dimensions, 
  TouchableOpacity, Share, StatusBar, 
  ActivityIndicator, FlatList, Modal, ScrollView, BackHandler 
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle } from 'react-native-svg';
import * as FileSystem from 'expo-file-system';
import * as NavigationBar from 'expo-navigation-bar';
import ProxyImage from '../components/ProxyImage';

import Player from './play/player';
import * as ShareSheetModule from '../components/ShareSheet';
import * as RoomModule from '../components/room';

const { width, height } = Dimensions.get('window');
const BRAND_RED = '#E50914';
const PURE_RED = '#FF0000';
const TMDB_API_KEY = 'f39f02a34ded84924626dd5ec7de1f29';
const VERCEL_API_BASE = 'https://anikoto-api-lyart.vercel.app';
const EPISODE_CHUNK_SIZE = 50;
const WATCH_HISTORY_COLLECTION = 'watch_history';

// Local Storage File Paths via expo-file-system
const PLAY_PREFS_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}kameko_play_prefs.json`
  : null;
const DOWNLOAD_QUEUE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}kameko_downloads_queue.json`
  : null;

const GRID_COLUMNS = 3;
const GRID_SPACING = 12;
const GRID_CARD_WIDTH = Math.floor((width - 40 - GRID_SPACING * (GRID_COLUMNS - 1)) / GRID_COLUMNS);

// Safely extract a valid React component from a module import (prevents "Element type is invalid" crash)
const resolveValidComponent = (mod) => {
  if (!mod) return null;
  if (typeof mod === 'function') return mod;
  if (typeof mod.default === 'function') return mod.default;
  if (typeof mod.ShareSheet === 'function') return mod.ShareSheet;
  if (typeof mod.Room === 'function') return mod.Room;
  return null;
};

const ResolvedShareComp = resolveValidComponent(ShareSheetModule);
const ResolvedRoomComp = resolveValidComponent(RoomModule);

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

// --- BUILD-SAFE LOCAL STORAGE HELPERS ---
const readLocalJson = async (fileUri, fallback = {}) => {
  try {
    if (fileUri) {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info?.exists) {
        const raw = await FileSystem.readAsStringAsync(fileUri);
        if (raw) return JSON.parse(raw);
      }
    }
  } catch (_) {}
  return fallback;
};

const writeLocalJson = async (fileUri, data) => {
  try {
    if (fileUri) {
      const serialized = JSON.stringify(data);
      await FileSystem.writeAsStringAsync(fileUri, serialized);
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
const IconTrash = ({ size = 20, color = PURE_RED }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
  </Svg>
);
const IconClose = ({ size = 18, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);
const IconVerticalDots = ({ size = 22, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Circle cx="12" cy="5" r="2" />
    <Circle cx="12" cy="12" r="2" />
    <Circle cx="12" cy="19" r="2" />
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
    if (propAnime && (propAnime.id || propAnime.animeId)) {
      setCurrentAnime(propAnime);
    } else if (routeParams.anime && (routeParams.anime.id || routeParams.anime.animeId)) {
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

  // Crash-safe string resolutions
  const animeDocId = String(currentAnime?.animeId || currentAnime?.id || 'solo-leveling');
  const resolvedTitle = String(currentAnime?.animeTitle || currentAnime?.title || 'Anime');
  const resolvedBackdrop = String(
    currentAnime?.backdropUrl ||
    currentAnime?.animeBackdrop ||
    currentAnime?.backdrop ||
    currentAnime?.coverImage ||
    currentAnime?.image ||
    ''
  );

  const [activeTab, setActiveTab] = useState('episodes'); 
  const [descExpanded, setDescExpanded] = useState(false);
  const [librarySet, setLibrarySet] = useState(new Set());
  const [moreLikeThis, setMoreLikeThis] = useState([]);
  const [sequelsAndRelated, setSequelsAndRelated] = useState([]);

  // Progress Tracking
  const [userProgressMap, setUserProgressMap] = useState({});
  const [latestWatched, setLatestWatched] = useState(null);

  // TMDB Metadata
  const [titleLogo, setTitleLogo] = useState(null);
  const [tmdbSynopsis, setTmdbSynopsis] = useState(
    String(currentAnime?.description || 'Watch all episodes in HD.')
  );
  const [isUpcoming, setIsUpcoming] = useState(
    String(currentAnime?.status || '').toUpperCase() === 'UPCOMING'
  );

  // Episodes List & Pagination
  const [vercelAnimeId, setVercelAnimeId] = useState(animeDocId);
  const [episodes, setEpisodes] = useState([]);
  const [episodesLoading, setEpisodesLoading] = useState(true);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const hasRestoredLocalChunkRef = useRef(false);

  // Player Overlay
  const [loadingEpisode, setLoadingEpisode] = useState(null);
  const [activePlayback, setActivePlayback] = useState(null);

  // Top Right Vertical "..." Menu & Fullscreen Overlays (Share & Room)
  const [topMenuVisible, setTopMenuVisible] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [roomModalVisible, setRoomModalVisible] = useState(false);

  // --- DOWNLOADED EPISODES & BULK DELETE STATES ---
  const [downloadedEpMap, setDownloadedEpMap] = useState({});
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false);
  const [bulkDeleteSelectedMap, setBulkDeleteSelectedMap] = useState({});

  // --- DOWNLOAD SHEET STATES ---
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [isSingleEpisodeDownload, setIsSingleEpisodeDownload] = useState(false);
  const [downloadTargetEp, setDownloadTargetEp] = useState(null);
  const [selectedEpNumsMap, setSelectedEpNumsMap] = useState({});
  const [downloadChunkIndex, setDownloadChunkIndex] = useState(0);
  const [downloadStep, setDownloadStep] = useState(1);
  const [selectedDownloadType, setSelectedDownloadType] = useState('sub');
  const [downloadSubTracks, setDownloadSubTracks] = useState([]);
  const [selectedSubTrack, setSelectedSubTrack] = useState(null);
  const [downloadQualities, setDownloadQualities] = useState([]);
  const [selectedDownloadQuality, setSelectedDownloadQuality] = useState(null);
  const [isFetchingDownloadData, setIsFetchingDownloadData] = useState(false);

  const inLibrary = librarySet.has(animeDocId);

  // Handle hardware back button for fullscreen overlays and bulk-delete mode
  useEffect(() => {
    const onHardwareBack = () => {
      if (activePlayback) {
        setActivePlayback(null);
        return true;
      }
      if (shareModalVisible) {
        setShareModalVisible(false);
        return true;
      }
      if (roomModalVisible) {
        setRoomModalVisible(false);
        return true;
      }
      if (isBulkDeleteMode) {
        setIsBulkDeleteMode(false);
        setBulkDeleteSelectedMap({});
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [activePlayback, shareModalVisible, roomModalVisible, isBulkDeleteMode]);

  // Sync downloaded episodes from local JSON queue + Firestore
  const syncLocalDownloads = useCallback(async () => {
    const queue = await readLocalJson(DOWNLOAD_QUEUE_FILE_URI, []);
    const list = Array.isArray(queue) ? queue : [];
    const map = {};
    list.forEach((item) => {
      if (String(item?.animeId) === animeDocId && item?.episodeNum != null) {
        map[Number(item.episodeNum)] = item;
      }
    });
    setDownloadedEpMap((prev) => ({ ...prev, ...map }));
  }, [animeDocId]);

  useEffect(() => {
    syncLocalDownloads();
  }, [syncLocalDownloads]);

  useEffect(() => {
    if (!resolvedUid || !resolvedProfileId || !animeDocId) return;
    const dlRef = firestore()
      .collection('users')
      .doc(String(resolvedUid))
      .collection('profiles')
      .doc(String(resolvedProfileId))
      .collection('downloads')
      .where('animeId', '==', animeDocId);

    const unsub = dlRef.onSnapshot(
      (snap) => {
        const fsMap = {};
        snap?.forEach((doc) => {
          const d = doc.data();
          if (d?.episodeNum != null) {
            fsMap[Number(d.episodeNum)] = d;
          }
        });
        setDownloadedEpMap((prev) => ({ ...prev, ...fsMap }));
      },
      () => {}
    );

    return () => unsub();
  }, [resolvedUid, resolvedProfileId, animeDocId]);

  // Delete single or multiple downloaded episodes
  const handleDeleteDownloadedEpisodes = useCallback(
    async (epNumbersArray) => {
      const numsToDelete = (epNumbersArray || []).map((n) => Number(n)).filter(Boolean);
      if (numsToDelete.length === 0) return;

      const deleteSet = new Set(numsToDelete);

      // 1. Update UI state immediately
      setDownloadedEpMap((prev) => {
        const next = { ...prev };
        numsToDelete.forEach((num) => {
          delete next[num];
        });
        return next;
      });

      // 2. Remove from local file storage queue and delete local media files if saved
      const existingQueue = await readLocalJson(DOWNLOAD_QUEUE_FILE_URI, []);
      if (Array.isArray(existingQueue)) {
        const toRemoveItems = existingQueue.filter(
          (item) => String(item?.animeId) === animeDocId && deleteSet.has(Number(item?.episodeNum))
        );
        for (const rem of toRemoveItems) {
          const localUri = rem?.localUri || rem?.fileUri;
          if (localUri && String(localUri).startsWith('file://')) {
            FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
          }
        }

        const updatedQueue = existingQueue.filter(
          (item) => !(String(item?.animeId) === animeDocId && deleteSet.has(Number(item?.episodeNum)))
        );
        await writeLocalJson(DOWNLOAD_QUEUE_FILE_URI, updatedQueue);
      }

      // 3. Remove from Firestore downloads collection
      if (resolvedUid && resolvedProfileId) {
        for (const epNum of numsToDelete) {
          firestore()
            .collection('users')
            .doc(String(resolvedUid))
            .collection('profiles')
            .doc(String(resolvedProfileId))
            .collection('downloads')
            .doc(`${animeDocId}_ep_${epNum}`)
            .delete()
            .catch(() => {});
        }
      }

      setIsBulkDeleteMode(false);
      setBulkDeleteSelectedMap({});
    },
    [animeDocId, resolvedUid, resolvedProfileId]
  );

  // Trigger long-press bulk selection for downloaded episodes
  const handleLongPressDownloadedEpisode = useCallback((epNum) => {
    setIsBulkDeleteMode(true);
    setBulkDeleteSelectedMap((prev) => ({
      ...prev,
      [epNum]: true,
    }));
  }, []);

  const toggleBulkDeleteEpisodeSelection = useCallback((epNum) => {
    setBulkDeleteSelectedMap((prev) => {
      const next = { ...prev, [epNum]: !prev[epNum] };
      const anyLeft = Object.keys(next).some((k) => next[k]);
      if (!anyLeft) {
        setIsBulkDeleteMode(false);
      }
      return next;
    });
  }, []);

  // Safe Share handler (uses ShareSheet component if valid, otherwise native Share)
  const handleTriggerShare = async () => {
    if (ResolvedShareComp) {
      setShareModalVisible(true);
      return;
    }
    try {
      await Share.share({
        message: `Watch ${resolvedTitle} on Kameko!`,
      });
    } catch (_) {}
  };

  // Show phone's bottom navigation bar while keeping top notification bar hidden when Download Menu is open
  useEffect(() => {
    const syncSystemBars = async () => {
      try {
        StatusBar.setHidden(true, 'none');
        if (downloadModalVisible && NavigationBar?.setVisibilityAsync) {
          await NavigationBar.setVisibilityAsync('visible');
        }
      } catch (_) {}
    };
    syncSystemBars();
  }, [downloadModalVisible]);

  // --- LOAD & SAVE PREFERENCES IN LOCAL STORAGE ---
  const updateLocalPreferences = useCallback(async (patch) => {
    const existing = await readLocalJson(PLAY_PREFS_FILE_URI, {});
    const merged = {
      ...existing,
      ...patch,
      selectedChunksByAnime: {
        ...(existing?.selectedChunksByAnime || {}),
        ...(patch?.selectedChunksByAnime || {}),
      },
      updatedAt: Date.now(),
    };
    await writeLocalJson(PLAY_PREFS_FILE_URI, merged);
    return merged;
  }, []);

  useEffect(() => {
    let isMounted = true;
    hasRestoredLocalChunkRef.current = false;

    const restoreSavedSelection = async () => {
      const savedPrefs = await readLocalJson(PLAY_PREFS_FILE_URI, {});
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
    if (!resolvedUid) return;

    const libColRef = firestore()
      .collection('users')
      .doc(String(resolvedUid))
      .collection('library');

    const libUnsub = libColRef.onSnapshot((snap) => {
      const nextSet = new Set();
      snap?.forEach((doc) => nextSet.add(String(doc.id)));
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
      
    const historyUnsub = historyRef.onSnapshot((snapshot) => {
      if (snapshot && !snapshot.empty) {
        const pMap = {};
        let latest = null;
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (!data) return;
          const epKey = String(data.slug || data.episodeNum || data.lastWatchedEp || '');
          if (epKey) pMap[epKey] = data;
          if (data.episodeNum) pMap[`ep_${data.episodeNum}`] = data;
          if (data.lastWatchedEp) pMap[`ep_${data.lastWatchedEp}`] = data;
          if (data.episodes && typeof data.episodes === 'object') {
            Object.keys(data.episodes).forEach((k) => {
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
        img: currentAnime?.coverImage || resolvedBackdrop,
        backdrop: resolvedBackdrop,
        profileId: resolvedProfileId,
        addedAt: Date.now(),
      }).catch(() => {});
    }
  };

  const toggleCardLibraryItem = async (cardItem) => {
    if (!resolvedUid || !cardItem?.id) return;
    const targetId = String(cardItem.id);
    const ref = firestore()
      .collection('users')
      .doc(String(resolvedUid))
      .collection('library')
      .doc(targetId);

    if (librarySet.has(targetId)) {
      await ref.delete().catch(() => {});
    } else {
      await ref.set({
        id: targetId,
        animeId: targetId,
        title: String(cardItem.title || 'Anime'),
        img: String(cardItem.coverImage || cardItem.image || cardItem.backdrop || ''),
        backdrop: String(cardItem.backdrop || cardItem.coverImage || cardItem.image || ''),
        profileId: resolvedProfileId,
        addedAt: Date.now(),
      }).catch(() => {});
    }
  };

  // --- UNIFIED DOWNLOAD OPTIONS RESOLVER ---
  const fetchUnifiedDownloadOptions = useCallback(async (epItem, audioType) => {
    if (!epItem) return;
    setIsFetchingDownloadData(true);

    try {
      const safeId = encodeURIComponent(vercelAnimeId || animeDocId);
      const safeEp = encodeURIComponent(String(epItem.slug || epItem.num || 1));
      const servers = ['hd-1', 'hd-2', 'vidstream-2'];

      let targetMasterUrl = null;
      let targetReferer = 'https://vidwish.live/';
      let collectedSubtitles = [];

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
              const seen = new Set(collectedSubtitles.map((s) => s.label || s.lang));
              for (const s of subPayload.subtitles) {
                const lbl = s.label || s.lang;
                if (lbl && !seen.has(lbl)) {
                  seen.add(lbl);
                  collectedSubtitles.push(s);
                }
              }
              break;
            }
          } catch (_) {}
        }
      }

      setDownloadSubTracks(collectedSubtitles);
      setSelectedSubTrack((prev) => {
        if (prev && prev.lang === 'none') return prev;
        if (prev) {
          const match = collectedSubtitles.find(
            (s) => (s.label || s.lang) === (prev.label || prev.lang)
          );
          if (match) return match;
        }
        if (collectedSubtitles.length > 0) {
          return (
            collectedSubtitles.find((s) =>
              String(s.label || s.lang || '').toLowerCase().includes('eng')
            ) ||
            collectedSubtitles.find((s) => s.default) ||
            collectedSubtitles[0]
          );
        }
        return { label: 'No Subtitles / Off', file: null, lang: 'none' };
      });

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
      setSelectedDownloadQuality((prev) => {
        if (prev) {
          const matchedQ = finalQualities.find((q) => q.label === prev.label);
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
  }, [vercelAnimeId, animeDocId]);

  // A. Single Episode Download (Skips Choose Episodes Module)
  const handleOpenSingleEpisodeDownload = async (episodeItem) => {
    if (!episodeItem) return;
    const savedPrefs = await readLocalJson(PLAY_PREFS_FILE_URI, {});
    const initialAudio = savedPrefs?.preferredDownloadType || 'sub';

    setIsSingleEpisodeDownload(true);
    setDownloadTargetEp(episodeItem);
    setSelectedEpNumsMap({ [episodeItem.num]: true });
    setSelectedDownloadType(initialAudio);
    setDownloadStep(2);
    setDownloadModalVisible(true);
    fetchUnifiedDownloadOptions(episodeItem, initialAudio);
  };

  // B. Multi-Episode Download (From Hero Button or Top Menu)
  const handleOpenMultiEpisodeDownload = async (defaultEp) => {
    const savedPrefs = await readLocalJson(PLAY_PREFS_FILE_URI, {});
    const initialAudio = savedPrefs?.preferredDownloadType || 'sub';
    const initialEp = defaultEp || episodes[0] || { num: 1, slug: '1', title: 'Episode 1' };

    setIsSingleEpisodeDownload(false);
    setDownloadTargetEp(initialEp);
    setSelectedEpNumsMap({ [initialEp.num]: true });
    setDownloadChunkIndex(currentChunkIndex);
    setSelectedDownloadType(initialAudio);
    setDownloadStep(1);
    setDownloadModalVisible(true);
  };

  const handleSwitchDownloadAudioType = (type) => {
    setSelectedDownloadType(type);
    updateLocalPreferences({ preferredDownloadType: type });
    const refEp =
      downloadTargetEp ||
      episodes.find((e) => selectedEpNumsMap[e.num]) ||
      episodes[0];
    if (refEp) {
      fetchUnifiedDownloadOptions(refEp, type);
    }
  };

  const handleConfirmDownloadFinal = async () => {
    const finalQuality = selectedDownloadQuality || downloadQualities[0];
    const selectedNums = isSingleEpisodeDownload && downloadTargetEp
      ? [String(downloadTargetEp.num)]
      : Object.keys(selectedEpNumsMap).filter((k) => selectedEpNumsMap[k]);

    if (!finalQuality || selectedNums.length === 0) return;

    setDownloadModalVisible(false);

    const existingQueue = await readLocalJson(DOWNLOAD_QUEUE_FILE_URI, []);
    const queueArray = Array.isArray(existingQueue) ? existingQueue : [];
    const newRecords = [];
    const newlyDownloadedMapPatch = {};

    for (const numStr of selectedNums) {
      const epNum = Number(numStr);
      const epObj =
        episodes.find((e) => Number(e.num) === epNum) ||
        downloadTargetEp || {
          num: epNum,
          slug: String(epNum),
          title: `Episode ${epNum}`,
        };

      const isSameAsFetchedTarget =
        downloadTargetEp && Number(downloadTargetEp.num) === epNum;

      const downloadRecord = {
        id: `${animeDocId}_ep_${epNum}_${selectedDownloadType}_${finalQuality.label}`,
        animeId: animeDocId,
        animeTitle: resolvedTitle,
        backdrop: resolvedBackdrop,
        coverImage: String(currentAnime?.coverImage || resolvedBackdrop || ''),
        synopsis: String(tmdbSynopsis || currentAnime?.description || ''),
        genres: Array.isArray(currentAnime?.genres) ? currentAnime.genres : ['Action', 'Adventure'],
        totalEpisodes: episodes.length || 12,
        episodeNum: epNum,
        episodeTitle: String(epObj.title || `Episode ${epNum}`),
        slug: String(epObj.slug || epNum),
        audioType: selectedDownloadType,
        subtitle: {
          label: String(selectedSubTrack?.label || selectedSubTrack?.lang || 'No Subtitles / Off'),
          file: isSameAsFetchedTarget ? selectedSubTrack?.file || null : null,
          lang: String(selectedSubTrack?.lang || 'none'),
        },
        quality: finalQuality.label,
        streamUri: isSameAsFetchedTarget ? finalQuality.uri || null : null,
        referer: finalQuality.referer || 'https://vidwish.live/',
        profileId: resolvedProfileId || 'default',
        userUid: resolvedUid || null,
        status: 'queued',
        savedAt: Date.now(),
      };

      newRecords.push(downloadRecord);
      newlyDownloadedMapPatch[epNum] = downloadRecord;

      if (resolvedUid && resolvedProfileId) {
        firestore()
          .collection('users')
          .doc(String(resolvedUid))
          .collection('profiles')
          .doc(String(resolvedProfileId))
          .collection('downloads')
          .doc(`${animeDocId}_ep_${epNum}`)
          .set(downloadRecord, { merge: true })
          .catch(() => {});
      }
    }

    setDownloadedEpMap((prev) => ({ ...prev, ...newlyDownloadedMapPatch }));

    const filteredQueue = queueArray.filter(
      (item) => !newRecords.some((n) => n.id === item.id)
    );
    const updatedQueue = [...newRecords, ...filteredQueue];
    await writeLocalJson(DOWNLOAD_QUEUE_FILE_URI, updatedQueue);

    await updateLocalPreferences({
      preferredDownloadType: selectedDownloadType,
      preferredSubtitleLang: selectedSubTrack?.label || selectedSubTrack?.lang || 'Off',
      preferredDownloadQuality: finalQuality.label,
      lastDownload: newRecords[0],
    });
  };

  // 2. Fetch TMDB Data, Sequels/Related Slider, and "More Like This" Grid
  useEffect(() => {
    let isMounted = true;
    const loadTMDB = async () => {
      try {
        const cleanTitle = String(resolvedTitle || '').replace(/\(Dub\)|\(Sub\)/gi, '').trim();
        if (!cleanTitle) return;
        const searchType = currentAnime?.format === 'MOVIE' ? 'movie' : 'tv';
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
          const bestLogo = logos.find((l) => l.iso_639_1 === 'en') || logos.find((l) => l.iso_639_1 === 'ja') || logos[0];
          if (bestLogo && isMounted) setTitleLogo(`https://image.tmdb.org/t/p/w500${bestLogo.file_path}`);
        }
      } catch (_) {}
    };

    const loadRelationsAndMoreLikeThis = async () => {
      try {
        if (!resolvedTitle) return;
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
          (e) => e?.node && (!e.node.type || e.node.type === 'ANIME')
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
          .map((edge) => {
            const node = edge.node;
            const relType = edge.relationType || 'RELATED';
            return {
              id: String(node.id),
              animeId: String(node.id),
              title: node.title?.english || node.title?.romaji || 'Untitled',
              image: node.coverImage?.extraLarge || node.coverImage?.large || '',
              coverImage: node.coverImage?.extraLarge || node.coverImage?.large || '',
              backdrop: node.bannerImage || node.coverImage?.extraLarge || node.coverImage?.large || '',
              format: node.format || 'TV',
              episodesCount: node.episodes || 12,
              sub: node.episodes || 12,
              score: node.averageScore || 85,
              year: node.seasonYear || '',
              status: node.status || 'FINISHED',
              relationType: String(relType).replace(/_/g, ' '),
              priority: relationPriority[relType] || 99,
              description: node.description ? String(node.description).replace(/<[^>]*>/g, '') : '',
            };
          })
          .sort((a, b) => a.priority - b.priority);

        const recNodes = (media?.recommendations?.nodes || [])
          .map((n) => n?.mediaRecommendation)
          .filter(Boolean);

        const combinedMore = [
          ...recNodes.map((node) => ({
            id: String(node.id),
            animeId: String(node.id),
            title: node.title?.english || node.title?.romaji || 'Untitled',
            image: node.coverImage?.extraLarge || node.coverImage?.large || '',
            coverImage: node.coverImage?.extraLarge || node.coverImage?.large || '',
            backdrop: node.bannerImage || node.coverImage?.extraLarge || node.coverImage?.large || '',
            format: node.format || 'TV',
            episodesCount: node.episodes || 12,
            sub: node.episodes || 12,
            score: node.averageScore || 85,
            year: node.seasonYear || '',
            status: node.status || 'FINISHED',
            relationType: node.format || 'TV',
            description: node.description ? String(node.description).replace(/<[^>]*>/g, '') : '',
          })),
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
          formattedRelations.length > 0 ? formattedRelations : uniqueMore.slice(0, 10);

        if (isMounted) {
          setSequelsAndRelated(sequelSliderItems);
          setMoreLikeThis(uniqueMore);
        }
      } catch (_) {}
    };

    loadTMDB();
    loadRelationsAndMoreLikeThis();
    return () => { isMounted = false; };
  }, [resolvedTitle, currentAnime?.format]);

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
          const exact = matches.find((m) => String(m.title || '').toLowerCase() === resolvedTitle.toLowerCase()) || matches[0];
          if (exact?.id) targetId = exact.id;
        }
        if (isMounted) setVercelAnimeId(targetId);

        const res = await fetchWithTimeout(`${VERCEL_API_BASE}/api/episodes/${encodeURIComponent(targetId)}`);
        const json = await res.json();
        const list = json?.data || [];

        if (isMounted && Array.isArray(list)) {
          const formatted = list.map((ep, idx) => ({
            id: String(ep.id || idx + 1),
            slug: String(ep.slug || ep.id || ep.num || idx + 1),
            num: Number(ep.num || idx + 1),
            title: ep.title || `Episode ${ep.num || idx + 1}`,
            isFiller: Boolean(ep.isFiller),
            isSub: ep.isSub ?? true,
            isDub: ep.isDub ?? false,
          }));
          setEpisodes(formatted);
          
          if (!hasRestoredLocalChunkRef.current) {
            const targetEpNum = latestWatched?.episodeNum || latestWatched?.lastWatchedEp || currentAnime?.episodeNum;
            if (targetEpNum) {
              const epIndex = formatted.findIndex((e) => String(e.num) === String(targetEpNum));
              if (epIndex !== -1) {
                setCurrentChunkIndex(Math.floor(epIndex / EPISODE_CHUNK_SIZE));
              }
            }
          }
        }
      } catch (_) {
        if (isMounted) setEpisodes([]);
      } finally {
        if (isMounted) setEpisodesLoading(false);
      }
    };

    fetchEpisodes();
    return () => { isMounted = false; };
  }, [animeDocId, resolvedTitle, isUpcoming, latestWatched?.episodeNum, latestWatched?.lastWatchedEp]);

  const episodeChunks = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < episodes.length; i += EPISODE_CHUNK_SIZE) {
      chunks.push(episodes.slice(i, i + EPISODE_CHUNK_SIZE));
    }
    return chunks;
  }, [episodes]);

  const currentEpisodesToRender = episodeChunks[currentChunkIndex] || episodeChunks[0] || [];
  const currentDownloadChunkEpisodes = episodeChunks[downloadChunkIndex] || episodeChunks[0] || episodes;

  // 4. Playback Navigation Handler
  const handlePlayEpisode = async (episodeItem) => {
    if (!episodeItem) return;

    try {
      setLoadingEpisode(episodeItem.num);
      const safeId = encodeURIComponent(vercelAnimeId || animeDocId);
      const safeEp = encodeURIComponent(String(episodeItem.slug));

      const downloadedRecord = downloadedEpMap[episodeItem.num] || null;
      const offlineFileUri =
        downloadedRecord?.localUri ||
        downloadedRecord?.fileUri ||
        downloadedRecord?.streamUri ||
        null;

      let streamManifest = null;
      if (!offlineFileUri || !String(offlineFileUri).startsWith('file://')) {
        try {
          const streamUrl = `${VERCEL_API_BASE}/api/stream?id=${safeId}&ep=${safeEp}&server=hd-1&type=sub`;
          const res = await fetchWithTimeout(streamUrl, {}, 8000);
          const json = await res.json();
          streamManifest = json?.data || json?.results || null;
        } catch (_) {}
      }

      const savedEpProgress =
        userProgressMap[String(episodeItem.slug)] ||
        userProgressMap[`ep_${episodeItem.num}`] ||
        null;

      const playbackPayload = {
        streamUrl:
          offlineFileUri ||
          streamManifest?.m3u8 ||
          streamManifest?.streamingLink ||
          null,
        localUri:
          offlineFileUri && String(offlineFileUri).startsWith('file://')
            ? offlineFileUri
            : null,
        localMetaUri: downloadedRecord?.localMetaUri || null,
        localSubtitleUri:
          downloadedRecord?.localSubtitleUri ||
          downloadedRecord?.subtitle?.file ||
          null,
        isOffline: Boolean(
          offlineFileUri && String(offlineFileUri).startsWith('file://')
        ),
        referer:
          downloadedRecord?.referer ||
          streamManifest?.referer ||
          'https://vidwish.live/',
        subtitles: streamManifest?.subtitles || [],
        animeTitle: resolvedTitle,
        title: resolvedTitle,
        animeBackdrop: resolvedBackdrop,
        backdropUrl: resolvedBackdrop,
        backdrop: resolvedBackdrop,
        coverImage: currentAnime?.coverImage || resolvedBackdrop,
        episodeNum: Number(episodeItem.num),
        episodeTitle: episodeItem.title || `Episode ${episodeItem.num}`,
        epTitle: episodeItem.title || `Episode ${episodeItem.num}`,
        animeId: animeDocId,
        providerId: vercelAnimeId || animeDocId,
        slug: String(episodeItem.slug),
        progress: savedEpProgress ? Number(savedEpProgress.progress || 0) : 0,
        duration: savedEpProgress ? Number(savedEpProgress.duration || 0) : 0,
        positionMillis: savedEpProgress ? Number(savedEpProgress.positionMillis || 0) : 0,
        durationMillis: savedEpProgress ? Number(savedEpProgress.durationMillis || 0) : 0,
        userUid: resolvedUid,
        uid: resolvedUid,
        user: resolvedUser,
        activeProfileId: resolvedProfileId,
        profileId: resolvedProfileId,
        activeProfile: resolvedProfile,
        currentProfile: resolvedProfile,
        targetType: downloadedRecord?.audioType || currentAnime?.targetType || 'sub',
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

  const handleSelectRelatedAnime = useCallback((item) => {
    if (!item) return;
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
  }, [resolvedUid, resolvedProfileId, resolvedProfile, resolvedUser, navigation]);

  const targetEp = (() => {
    if (episodes.length === 0) return null;
    if (latestWatched) {
      const lastEp = episodes.find(
        (e) =>
          String(e.slug) === String(latestWatched.slug) ||
          String(e.num) === String(latestWatched.episodeNum || latestWatched.lastWatchedEp)
      );
      if (lastEp) {
        if (latestWatched.finishedEp) {
          const nextEpIndex = episodes.findIndex((e) => e.slug === lastEp.slug) + 1;
          if (nextEpIndex < episodes.length) return episodes[nextEpIndex];
        }
        return lastEp;
      }
    }
    if (currentAnime?.episodeNum) {
      const matched = episodes.find((e) => String(e.num) === String(currentAnime.episodeNum));
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

  const renderHeader = () => (
    <View style={styles.heroSection}>
      <View style={styles.backdropBox}>
        <ProxyImage
          source={{ uri: resolvedBackdrop || currentAnime?.coverImage }}
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
          <View style={styles.ratingBadge}><Text style={styles.ratingBadgeText}>{currentAnime?.rating || 'U/A 13+'}</Text></View>
          <Text style={styles.scoreText}>★ {currentAnime?.score || 85}%</Text>
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
          <TouchableOpacity style={styles.actionTab} onPress={() => handleOpenMultiEpisodeDownload(targetEp)} activeOpacity={0.7}>
            <IconDownload />
            <Text style={styles.actionTabText}>Download</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionTab} onPress={handleTriggerShare} activeOpacity={0.7}>
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

  const renderEpisodesFooter = () => {
    if (activeTab !== 'episodes' || sequelsAndRelated.length === 0) return null;

    return (
      <View style={styles.recentStyleSection}>
        <View style={styles.recentHeaderRow}>
          <Text style={styles.recentSectionTitle}>Sequels & Related Anime</Text>
        </View>

        <FlatList
          horizontal
          data={sequelsAndRelated}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => `seq-${item.id}`}
          contentContainerStyle={styles.recentListPadding}
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
                    source={{ uri: item.coverImage || item.image }}
                    style={styles.recentCoverImage}
                    resizeMode="cover"
                  />

                  <View style={styles.recentBadgeContainer}>
                    <View style={styles.recentEpBadge}>
                      <Text style={styles.recentEpBadgeText}>
                        {item.relationType || item.format || 'SEQUEL'}
                      </Text>
                    </View>
                    <View style={styles.recentCcBadge}>
                      <Text style={styles.recentCcBadgeText}>
                        CC {item.sub || item.episodesCount || 12}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.recentSaveBtn, isAdded && styles.recentSaveBtnActive]}
                    onPress={() => toggleCardLibraryItem(item)}
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
  const selectedDownloadCount = Object.keys(selectedEpNumsMap).filter((k) => selectedEpNumsMap[k]).length;
  const isAllEpisodesSelected = episodes.length > 0 && selectedDownloadCount === episodes.length;

  const downloadedEpNumbersList = useMemo(
    () => Object.keys(downloadedEpMap).map((k) => Number(k)).filter(Boolean),
    [downloadedEpMap]
  );
  const selectedBulkDeleteNums = useMemo(
    () => Object.keys(bulkDeleteSelectedMap).filter((k) => bulkDeleteSelectedMap[k]).map((k) => Number(k)),
    [bulkDeleteSelectedMap]
  );
  const isAllDownloadedSelectedForDelete =
    downloadedEpNumbersList.length > 0 &&
    selectedBulkDeleteNums.length === downloadedEpNumbersList.length;

  return (
    <View style={styles.screenContainer}>
      <StatusBar hidden={true} translucent={true} backgroundColor="transparent" />

      {/* TOP FLOATING NAV BAR WITH VERTICAL "..." MENU */}
      <View style={styles.topNavFloatContainer} pointerEvents="box-none">
        <TouchableOpacity style={styles.navBackCircle} onPress={onBack || (() => navigation?.goBack?.())}>
          <IconBack />
        </TouchableOpacity>

        <TouchableOpacity style={styles.navVerticalDotsCircle} onPress={() => setTopMenuVisible(true)}>
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
            const isDownloaded = Boolean(downloadedEpMap[item.num]);
            const isSelectedForDelete = Boolean(bulkDeleteSelectedMap[item.num]);

            return (
              <View style={styles.episodeRow}>
                <Text style={[styles.bulletNumber, isFinished && styles.watchedText]}>•{item.num}</Text>

                <TouchableOpacity
                  style={[
                    styles.episodeCard,
                    isFinished && styles.watchedCardBg,
                    isBulkDeleteMode && isSelectedForDelete && styles.episodeCardSelectedDelete,
                  ]}
                  activeOpacity={0.8}
                  delayLongPress={320}
                  onLongPress={() => {
                    if (isDownloaded) {
                      handleLongPressDownloadedEpisode(item.num);
                    }
                  }}
                  onPress={() => {
                    if (isBulkDeleteMode) {
                      if (isDownloaded) {
                        toggleBulkDeleteEpisodeSelection(item.num);
                      }
                      return;
                    }
                    handlePlayEpisode(item);
                  }}
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

                {/* Show Delete Button (or Bulk Selection Checkbox) on Downloaded Episodes, otherwise Download Button */}
                {isDownloaded ? (
                  <TouchableOpacity
                    style={[
                      styles.deleteIconBtn,
                      isBulkDeleteMode && isSelectedForDelete && styles.deleteIconBtnSelected,
                    ]}
                    activeOpacity={0.75}
                    delayLongPress={320}
                    onLongPress={() => handleLongPressDownloadedEpisode(item.num)}
                    onPress={() => {
                      if (isBulkDeleteMode) {
                        toggleBulkDeleteEpisodeSelection(item.num);
                      } else {
                        handleDeleteDownloadedEpisodes([item.num]);
                      }
                    }}
                  >
                    {isBulkDeleteMode ? (
                      <View
                        style={[
                          styles.bulkCheckCircle,
                          isSelectedForDelete && styles.bulkCheckCircleActive,
                        ]}
                      >
                        {isSelectedForDelete && <IconCheck size={14} color="#FFF" />}
                      </View>
                    ) : (
                      <IconTrash size={20} color={PURE_RED} />
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.downloadIconBtn, isBulkDeleteMode && { opacity: 0.35 }]}
                    activeOpacity={0.7}
                    disabled={isBulkDeleteMode}
                    onPress={() => handleOpenSingleEpisodeDownload(item)}
                  >
                    <IconDownload size={22} color={isFinished ? "rgba(255,255,255,0.4)" : "#FFF"} />
                  </TouchableOpacity>
                )}
              </View>
            );
          }

          // GRID CARD FOR "MORE LIKE THIS"
          const isAdded = librarySet.has(String(item.id));
          return (
            <TouchableOpacity
              style={styles.gridAnimeCard}
              activeOpacity={0.85}
              onPress={() => handleSelectRelatedAnime(item)}
            >
              <View style={styles.gridPosterBox}>
                <ProxyImage
                  source={{ uri: item.coverImage || item.image }}
                  style={styles.recentCoverImage}
                  resizeMode="cover"
                />

                <View style={styles.recentBadgeContainer}>
                  <View style={styles.recentEpBadge}>
                    <Text style={styles.recentEpBadgeText}>{item.format || 'TV'}</Text>
                  </View>
                  <View style={styles.recentCcBadge}>
                    <Text style={styles.recentCcBadgeText}>CC {item.sub || item.episodesCount || 12}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.recentSaveBtn, isAdded && styles.recentSaveBtnActive]}
                  onPress={() => toggleCardLibraryItem(item)}
                  activeOpacity={0.8}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
        contentContainerStyle={[
          styles.listPadding,
          isBulkDeleteMode && { paddingBottom: 110 },
        ]}
        showsVerticalScrollIndicator={false}
      />

      {/* --- FLOATING BULK DELETE BAR (LONG-PRESS SELECTION MODE) --- */}
      {isBulkDeleteMode && (
        <View style={styles.bulkDeleteFloatingBar}>
          <View style={styles.bulkDeleteBarTopRow}>
            <Text style={styles.bulkDeleteCountText}>
              {selectedBulkDeleteNums.length} Downloaded {selectedBulkDeleteNums.length === 1 ? 'Episode' : 'Episodes'} Selected
            </Text>

            <View style={styles.bulkDeleteTopActions}>
              <TouchableOpacity
                style={styles.bulkSelectAllBtn}
                onPress={() => {
                  if (isAllDownloadedSelectedForDelete) {
                    setBulkDeleteSelectedMap({});
                  } else {
                    const allDl = {};
                    downloadedEpNumbersList.forEach((n) => {
                      allDl[n] = true;
                    });
                    setBulkDeleteSelectedMap(allDl);
                  }
                }}
              >
                <Text style={styles.bulkSelectAllText}>
                  {isAllDownloadedSelectedForDelete ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.bulkCancelBtn}
                onPress={() => {
                  setIsBulkDeleteMode(false);
                  setBulkDeleteSelectedMap({});
                }}
              >
                <Text style={styles.bulkCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.bulkConfirmDeleteBtn,
              selectedBulkDeleteNums.length === 0 && { opacity: 0.45 },
            ]}
            disabled={selectedBulkDeleteNums.length === 0}
            activeOpacity={0.85}
            onPress={() => handleDeleteDownloadedEpisodes(selectedBulkDeleteNums)}
          >
            <IconTrash size={18} color="#FFF" />
            <Text style={styles.bulkConfirmDeleteText}>
              Delete Selected ({selectedBulkDeleteNums.length})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* --- TOP VERTICAL "..." MENU MODAL (Add to List, Download, Share, Room) --- */}
      <Modal
        visible={topMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setTopMenuVisible(false)}
      >
        <View style={styles.topMenuOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setTopMenuVisible(false)}
          />
          <View style={styles.topMenuContainer}>
            <TouchableOpacity 
              style={styles.topMenuItem} 
              onPress={() => {
                setTopMenuVisible(false);
                toggleLibrary();
              }}
            >
              <Text style={styles.topMenuItemText}>
                {inLibrary ? 'Remove from List' : 'Add to List'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.topMenuItem} 
              onPress={() => {
                setTopMenuVisible(false);
                handleOpenMultiEpisodeDownload(targetEp);
              }}
            >
              <Text style={styles.topMenuItemText}>Download</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.topMenuItem} 
              onPress={() => {
                setTopMenuVisible(false);
                handleTriggerShare();
              }}
            >
              <Text style={styles.topMenuItemText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.topMenuItem} 
              onPress={() => {
                setTopMenuVisible(false);
                setRoomModalVisible(true);
              }}
            >
              <Text style={styles.topMenuItemText}>Room</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- DOWNLOAD BOTTOM HALF-SCREEN SHEET --- */}
      <Modal
        visible={downloadModalVisible}
        animationType="slide"
        transparent={true}
        statusBarTranslucent={false}
        onShow={async () => {
          try {
            StatusBar.setHidden(true, 'none');
            if (NavigationBar?.setVisibilityAsync) {
              await NavigationBar.setVisibilityAsync('visible');
            }
          } catch (_) {}
        }}
        onRequestClose={() => setDownloadModalVisible(false)}
      >
        <View style={styles.bottomSheetOverlay}>
          <StatusBar hidden={true} />
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setDownloadModalVisible(false)}
          />

          <View style={styles.halfScreenSheet}>
            <View style={styles.sheetGrabHandle} />

            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {isSingleEpisodeDownload
                    ? `Download Episode ${downloadTargetEp?.num || 1}`
                    : downloadStep === 1
                      ? 'Select Episodes to Download'
                      : `Download (${selectedDownloadCount} ${selectedDownloadCount === 1 ? 'Episode' : 'Episodes'})`}
                </Text>
                <Text style={styles.modalSubHeader} numberOfLines={1}>
                  {isSingleEpisodeDownload
                    ? downloadTargetEp?.title || resolvedTitle
                    : resolvedTitle}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDownloadModalVisible(false)} style={styles.modalCloseBtn}>
                <IconClose size={18} />
              </TouchableOpacity>
            </View>

            {/* STEP 1: MULTI-EPISODE SELECTOR (ONLY FOR MULTI-DOWNLOAD) */}
            {!isSingleEpisodeDownload && downloadStep === 1 && (
              <View style={{ flex: 1 }}>
                <View style={styles.multiEpSelectTopBar}>
                  <Text style={styles.sheetSectionLabel}>
                    Selected ({selectedDownloadCount}/{episodes.length})
                  </Text>
                  <TouchableOpacity
                    style={[styles.selectAllToggleBtn, isAllEpisodesSelected && { backgroundColor: PURE_RED }]}
                    onPress={() => {
                      if (isAllEpisodesSelected) {
                        setSelectedEpNumsMap({});
                      } else {
                        const allMap = {};
                        episodes.forEach((e) => { allMap[e.num] = true; });
                        setSelectedEpNumsMap(allMap);
                      }
                    }}
                  >
                    <Text style={[styles.selectAllToggleText, isAllEpisodesSelected && { color: '#FFF' }]}>
                      {isAllEpisodesSelected ? 'Deselect All' : 'Select All'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {episodeChunks.length > 1 && (
                  <View style={{ marginBottom: 10 }}>
                    <FlatList
                      horizontal
                      data={episodeChunks}
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={(_, index) => `dl-chunk-${index}`}
                      contentContainerStyle={{ gap: 8 }}
                      renderItem={({ item, index }) => {
                        const rangeLabel = `${item[0].num} - ${item[item.length - 1].num}`;
                        const isActive = downloadChunkIndex === index;
                        return (
                          <TouchableOpacity
                            style={[styles.chunkRectPill, isActive && styles.chunkRectPillActive]}
                            activeOpacity={0.85}
                            onPress={() => setDownloadChunkIndex(index)}
                          >
                            <Text style={[styles.chunkRectPillText, isActive && styles.chunkRectPillTextActive]}>
                              {rangeLabel}
                            </Text>
                          </TouchableOpacity>
                        );
                      }}
                    />
                  </View>
                )}

                <ScrollView
                  style={styles.sheetScrollArea}
                  contentContainerStyle={styles.multiEpGridContainer}
                  showsVerticalScrollIndicator={false}
                >
                  {currentDownloadChunkEpisodes.map((ep) => {
                    const isSelected = Boolean(selectedEpNumsMap[ep.num]);
                    return (
                      <TouchableOpacity
                        key={ep.num}
                        style={[styles.multiEpPill, isSelected && styles.multiEpPillActive]}
                        activeOpacity={0.8}
                        onPress={() => {
                          setSelectedEpNumsMap((prev) => ({
                            ...prev,
                            [ep.num]: !prev[ep.num],
                          }));
                        }}
                      >
                        <Text style={[styles.multiEpPillText, isSelected && styles.multiEpPillTextActive]}>
                          Ep {ep.num}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <TouchableOpacity
                  style={[
                    styles.sheetDownloadSubmitBtn,
                    selectedDownloadCount === 0 && { opacity: 0.5 },
                  ]}
                  activeOpacity={0.85}
                  disabled={selectedDownloadCount === 0}
                  onPress={() => {
                    const nums = Object.keys(selectedEpNumsMap).filter((k) => selectedEpNumsMap[k]);
                    if (nums.length === 0) return;
                    const firstEpObj =
                      episodes.find((e) => String(e.num) === String(nums[0])) ||
                      downloadTargetEp ||
                      episodes[0];
                    setDownloadTargetEp(firstEpObj);
                    setDownloadStep(2);
                    fetchUnifiedDownloadOptions(firstEpObj, selectedDownloadType);
                  }}
                >
                  <IconDownload size={18} color="#FFF" />
                  <Text style={styles.sheetDownloadSubmitText}>
                    Choose Quality & Subtitles ({selectedDownloadCount})
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* STEP 2: AUDIO, SUBTITLES & QUALITY */}
            {(isSingleEpisodeDownload || downloadStep === 2) && (
              <View style={{ flex: 1 }}>
                <ScrollView
                  style={styles.sheetScrollArea}
                  contentContainerStyle={styles.sheetScrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.sheetSectionLabel}>Audio</Text>
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

                  <Text style={styles.sheetSectionLabel}>Quality</Text>
                  {isFetchingDownloadData ? (
                    <ActivityIndicator size="small" color={PURE_RED} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
                  ) : (
                    <View style={styles.sheetPillRow}>
                      {downloadQualities
                        .filter((q) => q.label && q.label.toLowerCase() !== 'auto')
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

                <View style={styles.step2FooterRow}>
                  {!isSingleEpisodeDownload && (
                    <TouchableOpacity style={styles.step2BackBtn} onPress={() => setDownloadStep(1)}>
                      <Text style={styles.step2BackText}>← Episodes</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.sheetDownloadSubmitBtn,
                      { flex: 1, marginTop: 0 },
                      (isFetchingDownloadData || !selectedDownloadQuality) && { opacity: 0.5 },
                    ]}
                    activeOpacity={0.85}
                    disabled={isFetchingDownloadData || !selectedDownloadQuality}
                    onPress={handleConfirmDownloadFinal}
                  >
                    <IconDownload size={18} color="#FFF" />
                    <Text style={styles.sheetDownloadSubmitText}>
                      {isSingleEpisodeDownload
                        ? 'Download Episode'
                        : `Download ${selectedDownloadCount} ${selectedDownloadCount === 1 ? 'Episode' : 'Episodes'}`}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* DIRECT FULLSCREEN SHARE OVERLAY (NO MODAL / NO ANIMATION) */}
      {shareModalVisible && ResolvedShareComp && (
        <View style={styles.directFullscreenOverlay}>
          <ResolvedShareComp
            visible={shareModalVisible}
            anime={currentAnime}
            user={resolvedUser}
            activeProfile={resolvedProfile}
            activeProfileId={resolvedProfileId}
            onClose={() => setShareModalVisible(false)}
            onBack={() => setShareModalVisible(false)}
            navigation={{ goBack: () => setShareModalVisible(false) }}
          />
        </View>
      )}

      {/* DIRECT FULLSCREEN ROOM OVERLAY (NO MODAL / NO ANIMATION) */}
      {roomModalVisible && ResolvedRoomComp && (
        <View style={styles.directFullscreenOverlay}>
          <ResolvedRoomComp
            visible={roomModalVisible}
            anime={currentAnime}
            user={resolvedUser}
            activeProfile={resolvedProfile}
            activeProfileId={resolvedProfileId}
            onClose={() => setRoomModalVisible(false)}
            onBack={() => setRoomModalVisible(false)}
            navigation={{ goBack: () => setRoomModalVisible(false) }}
          />
        </View>
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
  directFullscreenOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 9998, backgroundColor: '#000000' },

  topNavFloatContainer: {
    position: 'absolute',
    top: 38,
    left: 16,
    right: 16,
    zIndex: 100,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navBackCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  navVerticalDotsCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },

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
  episodeCardSelectedDelete: { borderColor: PURE_RED, backgroundColor: 'rgba(229,9,20,0.14)' },
  episodeCardTitle: { color: '#FFF', fontSize: 14, fontWeight: '600', flex: 1 },
  cardRightGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fillerTag: { backgroundColor: 'rgba(255,165,0,0.2)', borderWidth: 1, borderColor: '#FFA500', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  fillerTagText: { color: '#FFA500', fontSize: 9, fontWeight: '900' },
  downloadIconBtn: { width: 44, height: 44, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 4, marginLeft: 8, justifyContent: 'center', alignItems: 'center' },
  deleteIconBtn: { width: 44, height: 44, borderWidth: 1, borderColor: 'rgba(255,0,0,0.45)', backgroundColor: 'rgba(229,9,20,0.1)', borderRadius: 4, marginLeft: 8, justifyContent: 'center', alignItems: 'center' },
  deleteIconBtnSelected: { borderColor: PURE_RED, backgroundColor: 'rgba(229,9,20,0.25)' },
  bulkCheckCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', justifyContent: 'center', alignItems: 'center' },
  bulkCheckCircleActive: { backgroundColor: PURE_RED, borderColor: PURE_RED },

  watchedText: { color: 'rgba(255,255,255,0.4)' },
  watchedCardBg: { backgroundColor: '#111', borderColor: 'rgba(255,255,255,0.05)' },
  epMiniProgressBg: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.1)' },
  epMiniProgressFill: { height: '100%', backgroundColor: PURE_RED },

  // Bulk Delete Floating Bar
  bulkDeleteFloatingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#121217',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,0,0,0.4)',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
    zIndex: 900,
    elevation: 25,
  },
  bulkDeleteBarTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  bulkDeleteCountText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  bulkDeleteTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bulkSelectAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: PURE_RED,
  },
  bulkSelectAllText: {
    color: PURE_RED,
    fontSize: 11,
    fontWeight: '800',
  },
  bulkCancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: '#23232B',
  },
  bulkCancelText: {
    color: '#DDD',
    fontSize: 11,
    fontWeight: '700',
  },
  bulkConfirmDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PURE_RED,
    paddingVertical: 13,
    borderRadius: 6,
  },
  bulkConfirmDeleteText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },

  // RecentSlider-matched UI for Bottom Sequel Slider
  recentStyleSection: { marginTop: 18, marginBottom: 25 },
  recentHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  recentSectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', borderLeftWidth: 3, borderLeftColor: BRAND_RED, paddingLeft: 8 },
  recentListPadding: { paddingHorizontal: 20 },
  recentCardContainer: { width: 140, marginRight: 15 },
  recentImageWrapper: { width: 140, height: 210, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2A2A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  recentCoverImage: { width: '100%', height: '100%' },
  recentBadgeContainer: { position: 'absolute', top: 8, left: 8, alignItems: 'flex-start', gap: 4 },
  recentEpBadge: { backgroundColor: '#FFFFFF', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 3 },
  recentEpBadgeText: { color: '#000000', fontSize: 10, fontWeight: '900' },
  recentCcBadge: { backgroundColor: 'rgba(229,9,20,0.9)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  recentCcBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: 'bold' },
  recentSaveBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.65)', width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  recentSaveBtnActive: { backgroundColor: 'rgba(0,0,0,0.85)', borderColor: BRAND_RED },
  recentAnimeTitle: { color: '#E0E0E0', fontSize: 13, fontWeight: '700', marginTop: 8 },

  gridRowWrapper: {
    paddingHorizontal: 20,
    justifyContent: 'flex-start',
    gap: GRID_SPACING,
    marginBottom: 18,
  },
  gridAnimeCard: {
    width: GRID_CARD_WIDTH,
  },
  gridPosterBox: {
    width: GRID_CARD_WIDTH,
    height: Math.floor(GRID_CARD_WIDTH * 1.5),
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  emptyContainer: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { color: '#777', fontSize: 13 },

  // Top Menu Modal
  topMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 82,
    paddingRight: 16,
  },
  topMenuContainer: {
    width: 195,
    backgroundColor: '#18181C',
    borderRadius: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    elevation: 20,
  },
  topMenuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  topMenuItemText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Bottom Half-Screen Download Sheet
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  halfScreenSheet: {
    width: '100%',
    height: Math.floor(height * 0.54),
    backgroundColor: '#111115',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
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
    marginBottom: 10,
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
  multiEpSelectTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  selectAllToggleBtn: {
    backgroundColor: '#1B1B22',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: PURE_RED,
  },
  selectAllToggleText: {
    color: PURE_RED,
    fontSize: 11,
    fontWeight: '900',
  },
  multiEpGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 14,
  },
  multiEpPill: {
    width: '23%',
    paddingVertical: 10,
    backgroundColor: '#1B1B22',
    borderRadius: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  multiEpPillActive: {
    backgroundColor: PURE_RED,
    borderColor: PURE_RED,
  },
  multiEpPillText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
  },
  multiEpPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  sheetScrollArea: {
    flex: 1,
  },
  sheetScrollContent: {
    paddingBottom: 14,
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
  step2FooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
  },
  step2BackBtn: {
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  step2BackText: {
    color: '#CCCCCC',
    fontSize: 13,
    fontWeight: '800',
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
});
