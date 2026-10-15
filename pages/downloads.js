import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  FlatList, StatusBar, ActivityIndicator, Alert, 
  DeviceEventEmitter, Animated 
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import * as FileSystem from 'expo-file-system';
import Svg, { Path, Defs, LinearGradient, Stop, Rect, Circle } from 'react-native-svg';

import ProxyImage from '../components/ProxyImage';
import Player from './play/player';
import * as NotificationEngine from '../components/NotificationEngine';

let AsyncStorage = null;
try {
  const mod = require('@react-native-async-storage/async-storage');
  AsyncStorage = mod?.default || mod;
} catch (_) {}

const BRAND_RED = '#E50914';
const PURE_RED = '#FF0000';
const BRAND_ACCENT = '#38BDF8';
const EMERALD = '#10B981';
const AMBER = '#F59E0B';

const VERCEL_API_BASE = 'https://anikoto-api-lyart.vercel.app';
const PROXY_URL = 'https://icy-wave-30d8.prashant-yash69.workers.dev/proxy?url=';

const DOWNLOAD_QUEUE_STORAGE_KEY = '@kameko_downloads_queue_v1';
const DOWNLOAD_QUEUE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}kameko_downloads_queue.json`
  : null;
const VAULT_ROOT_DIR = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}kameko_vault/`
  : null;

// Helper to wrap any URL in your Cloudflare Worker proxy
const buildProxyUrl = (targetUrl, referer = 'https://vidwish.live/') => {
  if (!targetUrl) return '';
  if (targetUrl.startsWith('https://icy-wave-30d8.prashant-yash69.workers.dev')) {
    return targetUrl;
  }
  return `${PROXY_URL}${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer)}`;
};

const resolveRelativeUrl = (baseUrl, relativeOrAbsolute) => {
  const trimmed = (relativeOrAbsolute || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  try {
    const urlObj = new URL(baseUrl);
    if (trimmed.startsWith('/')) {
      return `${urlObj.origin}${trimmed}`;
    }
    const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
    return `${baseDir}${trimmed}`;
  } catch (_) {
    const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
    return `${baseDir}${trimmed}`;
  }
};

const formatBytes = (bytes) => {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
};

// --- LOCAL STORAGE READ / WRITE HELPERS ---
const readLocalQueue = async () => {
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

  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      const raw = globalThis.localStorage.getItem(DOWNLOAD_QUEUE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch (_) {}

  return [];
};

const writeLocalQueue = async (queueArray) => {
  const safeArray = Array.isArray(queueArray) ? queueArray : [];
  const serialized = JSON.stringify(safeArray);

  try {
    if (AsyncStorage?.setItem) {
      await AsyncStorage.setItem(DOWNLOAD_QUEUE_STORAGE_KEY, serialized);
    }
  } catch (_) {}

  try {
    if (DOWNLOAD_QUEUE_FILE_URI) {
      await FileSystem.writeAsStringAsync(DOWNLOAD_QUEUE_FILE_URI, serialized);
    }
  } catch (_) {}

  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      globalThis.localStorage.setItem(DOWNLOAD_QUEUE_STORAGE_KEY, serialized);
    }
  } catch (_) {}
};

// --- SAFE NOTIFICATION DISPATCHER (WITH PAUSE / RESUME & CANCEL ACTIONS) ---
const pushDownloadNotification = async (notifId, title, pct, isPaused, metaText) => {
  try {
    if (typeof NotificationEngine?.showProgressNotification === 'function') {
      await NotificationEngine.showProgressNotification(notifId, title, pct, {
        isPaused,
        subtitle: metaText,
        actions: [
          {
            id: isPaused ? 'RESUME_DOWNLOAD' : 'PAUSE_DOWNLOAD',
            title: isPaused ? 'Resume' : 'Pause',
          },
          {
            id: 'CANCEL_DOWNLOAD',
            title: 'Cancel',
          },
        ],
      });
    }
  } catch (_) {}
};

const pushCompleteNotification = async (notifId, title) => {
  try {
    if (typeof NotificationEngine?.showCompletionNotification === 'function') {
      await NotificationEngine.showCompletionNotification(notifId, title);
    }
  } catch (_) {}
};

const pushErrorNotification = async (notifId, title) => {
  try {
    if (typeof NotificationEngine?.showErrorNotification === 'function') {
      await NotificationEngine.showErrorNotification(notifId, title);
    }
  } catch (_) {}
};

const dismissDownloadNotification = async (notifId) => {
  try {
    if (typeof NotificationEngine?.clearNotification === 'function') {
      await NotificationEngine.clearNotification(notifId);
    }
  } catch (_) {}
};

// --- SVG ICONS ---
const IconBack = ({ size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);
const IconPlay = ({ size = 15, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M8 5v14l11-7z" />
  </Svg>
);
const IconPause = ({ size = 15, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Rect x="6" y="4" width="4" height="16" rx="1" />
    <Rect x="14" y="4" width="4" height="16" rx="1" />
  </Svg>
);
const IconTrash = ({ size = 17, color = "#EF4444" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </Svg>
);
const IconCancel = ({ size = 15, color = "#EF4444" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);
const IconChevronDown = ({ size = 18, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M6 9l6 6 6-6" />
  </Svg>
);
const IconVault = ({ size = 22, color = PURE_RED }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </Svg>
);

export default function Downloads({
  user: propUser,
  activeProfile: propActiveProfile,
  currentProfile: propCurrentProfile,
  activeProfileId: propActiveProfileId,
  navigation,
  onBack,
}) {
  const resolvedUser = propUser || auth().currentUser || null;
  const resolvedProfile = propActiveProfile || propCurrentProfile || null;
  const resolvedProfileId =
    propActiveProfileId || resolvedProfile?.id || 'default';
  const resolvedUid = resolvedUser?.uid || null;

  const [queueItems, setQueueItems] = useState([]);
  const [activeTask, setActiveTask] = useState(null);
  const [downloadPct, setDownloadPct] = useState(0);
  const [downloadedChunks, setDownloadedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [expandedSeriesId, setExpandedSeriesId] = useState(null);
  const [offlinePlayback, setOfflinePlayback] = useState(null);

  const isRunningRef = useRef(false);
  const isPausedRef = useRef(false);
  const isCanceledRef = useRef(false);
  const activeTaskIdRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  // Subtle pulse animation for the active download indicator
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // Helper to update a single item in local storage & state
  const updateQueueItemInStorage = useCallback(async (itemId, patch) => {
    const currentList = await readLocalQueue();
    const updatedList = currentList.map(item =>
      item.id === itemId ? { ...item, ...patch, updatedAt: Date.now() } : item
    );
    await writeLocalQueue(updatedList);
    setQueueItems(updatedList);

    // Sync status to Firestore if user is authenticated
    const target = updatedList.find(i => i.id === itemId);
    if (target && resolvedUid && resolvedProfileId) {
      firestore()
        .collection('users')
        .doc(String(resolvedUid))
        .collection('profiles')
        .doc(String(resolvedProfileId))
        .collection('downloads')
        .doc(`${target.animeId}_ep_${target.episodeNum}`)
        .set(target, { merge: true })
        .catch(() => {});
    }
    return updatedList;
  }, [resolvedUid, resolvedProfileId]);

  // 1. Instantly Read Local Storage Queue & Firestore Queue
  const syncQueueFromStorage = useCallback(async () => {
    const localList = await readLocalQueue();
    setQueueItems(localList);

    // Auto-expand the first series if none is expanded yet
    if (localList.length > 0 && !expandedSeriesId) {
      setExpandedSeriesId(String(localList[0].animeId));
    }
  }, [expandedSeriesId]);

  useEffect(() => {
    syncQueueFromStorage();
    const pollInterval = setInterval(syncQueueFromStorage, 2000);
    return () => clearInterval(pollInterval);
  }, [syncQueueFromStorage]);

  // Also merge any remote Firestore downloads for this profile into local storage
  useEffect(() => {
    if (!resolvedUid || !resolvedProfileId) return;

    const unsub = firestore()
      .collection('users')
      .doc(String(resolvedUid))
      .collection('profiles')
      .doc(String(resolvedProfileId))
      .collection('downloads')
      .onSnapshot(async (snap) => {
        if (!snap || snap.empty) return;
        const localList = await readLocalQueue();
        const localMap = new Map(localList.map(i => [i.id, i]));
        let changed = false;

        snap.forEach(doc => {
          const data = doc.data();
          if (data?.id && !localMap.has(data.id)) {
            localMap.set(data.id, data);
            changed = true;
          }
        });

        if (changed) {
          const merged = Array.from(localMap.values()).sort(
            (a, b) => (b.savedAt || 0) - (a.savedAt || 0)
          );
          await writeLocalQueue(merged);
          setQueueItems(merged);
        }
      }, () => {});

    return () => unsub();
  }, [resolvedUid, resolvedProfileId]);

  // 2. Listen for Notification Bar Pause / Resume / Cancel Events
  useEffect(() => {
    const subCancel = DeviceEventEmitter.addListener('CANCEL_DOWNLOAD', (notifId) => {
      if (!activeTaskIdRef.current || notifId === `dl-${activeTaskIdRef.current}`) {
        handleCancelActiveDownload();
      }
    });

    const subPause = DeviceEventEmitter.addListener('PAUSE_DOWNLOAD', (notifId) => {
      if (!activeTaskIdRef.current || notifId === `dl-${activeTaskIdRef.current}`) {
        handleTogglePause();
      }
    });

    const subResume = DeviceEventEmitter.addListener('RESUME_DOWNLOAD', (notifId) => {
      if (!activeTaskIdRef.current || notifId === `dl-${activeTaskIdRef.current}`) {
        if (isPausedRef.current) handleTogglePause();
      }
    });

    return () => {
      subCancel.remove();
      subPause.remove();
      subResume.remove();
    };
  }, []);

  // 3. Auto-Trigger Download Pipeline Whenever a Queued Item Appears
  useEffect(() => {
    if (isRunningRef.current || isPausedRef.current) return;

    const nextQueued = queueItems.find(
      item => item.status === 'queued' || item.status === 'downloading'
    );

    if (nextQueued) {
      executeHlsChunkDownload(nextQueued);
    }
  }, [queueItems]);

  // --- CORE HLS M3U8 CHUNK & SUBTITLE DOWNLOAD ENGINE (VIA CLOUDFLARE WORKER PROXY) ---
  const executeHlsChunkDownload = async (task) => {
    if (!VAULT_ROOT_DIR || isRunningRef.current) return;

    isRunningRef.current = true;
    isPausedRef.current = false;
    isCanceledRef.current = false;
    setIsPaused(false);
    setActiveTask(task);
    activeTaskIdRef.current = task.id;
    setDownloadPct(task.progressPct || 0);
    setDownloadedChunks(task.downloadedChunks || 0);
    setTotalChunks(task.totalChunks || 0);
    setDownloadedBytes(task.sizeBytes || 0);

    const safeFolderId = String(task.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const epFolderUri = `${VAULT_ROOT_DIR}${safeFolderId}/`;
    const notifId = `dl-${task.id}`;
    const notifTitle = `${task.animeTitle} • Ep ${task.episodeNum}`;
    const notifMeta = `${(task.audioType || 'sub').toUpperCase()} • ${task.quality || '1080p'} • ${task.subtitle?.label || 'No Sub'}`;

    try {
      await FileSystem.makeDirectoryAsync(epFolderUri, { intermediates: true });
      await updateQueueItemInStorage(task.id, {
        status: 'downloading',
        targetFolder: epFolderUri,
      });

      await pushDownloadNotification(notifId, notifTitle, 0, false, notifMeta);

      let streamUri = task.streamUri;
      let referer = task.referer || 'https://vidwish.live/';
      let subtitleFileUrl = task.subtitle?.file || null;
      const requestedQuality = String(task.quality || '1080p').toLowerCase();
      const requestedAudio = String(task.audioType || 'sub').toLowerCase();

      // Step A: If streamUri wasn't pre-populated, resolve it from Vercel API for the requested Sub/Dub
      if (!streamUri) {
        const safeAnimeId = encodeURIComponent(task.animeId);
        const safeSlug = encodeURIComponent(task.slug || task.episodeNum);
        const servers = ['hd-1', 'hd-2', 'vidstream-2'];

        for (const srv of servers) {
          try {
            const apiRes = await fetch(
              `${VERCEL_API_BASE}/api/stream?id=${safeAnimeId}&ep=${safeSlug}&server=${srv}&type=${requestedAudio}`
            );
            const apiJson = await apiRes.json();
            const payload = apiJson?.data || apiJson?.results;
            if (payload?.m3u8 || payload?.streamingLink) {
              streamUri = payload.m3u8 || payload.streamingLink;
              if (payload.referer) referer = payload.referer;
              if (!subtitleFileUrl && Array.isArray(payload.subtitles) && payload.subtitles.length > 0) {
                const matchedSub =
                  payload.subtitles.find(
                    s => (s.label || s.lang) === task.subtitle?.label
                  ) || payload.subtitles[0];
                subtitleFileUrl = matchedSub?.file || null;
              }
              break;
            }
          } catch (_) {}
        }
      }

      if (!streamUri) {
        throw new Error('Could not resolve M3U8 stream URL for download.');
      }

      // Step B: Download Subtitle (.vtt) via Cloudflare Proxy into local storage
      let localSubtitleUri = null;
      if (subtitleFileUrl && task.subtitle?.lang !== 'none') {
        try {
          const proxiedSubUrl = buildProxyUrl(subtitleFileUrl, referer);
          const subRes = await fetch(proxiedSubUrl);
          if (subRes.ok) {
            const subText = await subRes.text();
            if (
              subText &&
              !subText.trim().toLowerCase().startsWith('<!doctype') &&
              !subText.trim().toLowerCase().startsWith('<html')
            ) {
              localSubtitleUri = `${epFolderUri}subtitle.vtt`;
              await FileSystem.writeAsStringAsync(localSubtitleUri, subText);
            }
          }
        } catch (_) {}
      }

      // Step C: Fetch Master / Variant M3U8 Playlist through Cloudflare Proxy
      let activePlaylistUrl = streamUri;
      const masterProxyUrl = buildProxyUrl(activePlaylistUrl, referer);
      const masterRes = await fetch(masterProxyUrl);
      if (!masterRes.ok) {
        throw new Error(`Proxy playlist fetch failed (${masterRes.status})`);
      }
      let playlistText = await masterRes.text();

      // If this is a Master M3U8 containing #EXT-X-STREAM-INF, pick the user's requested quality (never Auto)
      if (playlistText.includes('#EXT-X-STREAM-INF')) {
        const lines = playlistText.split(/\r?\n/);
        const variants = [];

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('#EXT-X-STREAM-INF')) {
            const resMatch = lines[i].match(/RESOLUTION=\d+x(\d+)/i);
            const heightNum = resMatch ? Number(resMatch[1]) : 0;
            const label = heightNum ? `${heightNum}p` : `variant_${i}`;
            const nextLine = (lines[i + 1] || '').trim();
            if (nextLine && !nextLine.startsWith('#')) {
              variants.push({
                label: label.toLowerCase(),
                height: heightNum,
                url: resolveRelativeUrl(activePlaylistUrl, nextLine),
              });
            }
          }
        }

        if (variants.length > 0) {
          const exactMatch =
            variants.find(v => v.label === requestedQuality) ||
            variants.sort((a, b) => b.height - a.height)[0];

          activePlaylistUrl = exactMatch.url;
          const variantRes = await fetch(buildProxyUrl(activePlaylistUrl, referer));
          if (!variantRes.ok) {
            throw new Error(`Variant playlist fetch failed (${variantRes.status})`);
          }
          playlistText = await variantRes.text();
        }
      }

      // Step D: Parse all Segment (.ts / .m4s) URLs & Encryption Keys from the Variant M3U8
      const rawLines = playlistText.replace(/\r\n/g, '\n').split('\n');
      const segmentEntries = [];
      const rewrittenLines = [];
      let segCounter = 0;

      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i].trim();

        if (!line) {
          rewrittenLines.push('');
          continue;
        }

        // Handle #EXT-X-KEY or #EXT-X-MAP URI="..." through proxy
        if (line.startsWith('#') && line.includes('URI="')) {
          const uriMatch = line.match(/URI="([^"]+)"/);
          if (uriMatch && uriMatch[1]) {
            const absKeyUrl = resolveRelativeUrl(activePlaylistUrl, uriMatch[1]);
            const keyFileName = `key_${segCounter}.bin`;
            const localKeyUri = `${epFolderUri}${keyFileName}`;
            segmentEntries.push({
              remoteUrl: absKeyUrl,
              localUri: localKeyUri,
              fileName: keyFileName,
              isKey: true,
            });
            rewrittenLines.push(line.replace(uriMatch[0], `URI="${localKeyUri}"`));
            continue;
          }
        }

        if (line.startsWith('#')) {
          rewrittenLines.push(line);
          continue;
        }

        // Standard media chunk line (.ts, .m4s, .aac, etc.)
        const absSegUrl = resolveRelativeUrl(activePlaylistUrl, line);
        const segFileName = `seg_${String(segCounter).padStart(5, '0')}.ts`;
        const localSegUri = `${epFolderUri}${segFileName}`;
        segCounter++;

        segmentEntries.push({
          remoteUrl: absSegUrl,
          localUri: localSegUri,
          fileName: segFileName,
          isKey: false,
        });

        // Point local M3U8 directly to the downloaded local file URI
        rewrittenLines.push(localSegUri);
      }

      if (segmentEntries.length === 0) {
        throw new Error('No downloadable HLS video segments found in playlist.');
      }

      const totalSegs = segmentEntries.length;
      setTotalChunks(totalSegs);

      // Step E: Download Chunks in Batches of 4 via Cloudflare Worker Proxy with Pause & Cancel Support
      let completedSegs = 0;
      let accumulatedBytes = task.sizeBytes || 0;
      const BATCH_SIZE = 4;

      for (let i = 0; i < totalSegs; i += BATCH_SIZE) {
        // Check Cancel Flag
        if (isCanceledRef.current) {
          throw new Error('Canceled by user');
        }

        // Wait while Paused
        while (isPausedRef.current && !isCanceledRef.current) {
          await new Promise(resolve => setTimeout(resolve, 350));
        }

        if (isCanceledRef.current) {
          throw new Error('Canceled by user');
        }

        const batch = segmentEntries.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async (seg) => {
            if (isCanceledRef.current) return;

            // Skip chunk if already downloaded (supports seamless resume!)
            const existingInfo = await FileSystem.getInfoAsync(seg.localUri);
            if (existingInfo.exists && (existingInfo.size || 0) > 0) {
              completedSegs++;
              return;
            }

            const proxiedChunkUrl = buildProxyUrl(seg.remoteUrl, referer);
            const dlRes = await FileSystem.downloadAsync(proxiedChunkUrl, seg.localUri);

            if (dlRes && dlRes.status >= 200 && dlRes.status < 300) {
              const fileStat = await FileSystem.getInfoAsync(seg.localUri);
              accumulatedBytes += fileStat?.size || 0;
              completedSegs++;
            } else {
              throw new Error(`Segment download failed with status ${dlRes?.status}`);
            }
          })
        );

        const pct = Math.min(100, Math.round((completedSegs / totalSegs) * 100));
        setDownloadedChunks(completedSegs);
        setDownloadPct(pct);
        setDownloadedBytes(accumulatedBytes);

        // Update Notification & Local Storage every ~4% or on completion
        if (pct % 4 === 0 || pct === 100 || completedSegs === totalSegs) {
          await pushDownloadNotification(
            notifId,
            notifTitle,
            pct,
            isPausedRef.current,
            `${completedSegs}/${totalSegs} chunks • ${formatBytes(accumulatedBytes)} • ${notifMeta}`
          );
          await updateQueueItemInStorage(task.id, {
            status: isPausedRef.current ? 'paused' : 'downloading',
            progressPct: pct,
            downloadedChunks: completedSegs,
            totalChunks: totalSegs,
            sizeBytes: accumulatedBytes,
          });
        }
      }

      // Step F: Write Local Master M3U8 & Metadata JSON for Offline Playback
      const localM3u8Uri = `${epFolderUri}index.m3u8`;
      await FileSystem.writeAsStringAsync(localM3u8Uri, rewrittenLines.join('\n'));

      const localMetaUri = `${epFolderUri}metadata.json`;
      const metaObject = {
        id: task.id,
        animeId: task.animeId,
        animeTitle: task.animeTitle,
        episodeNum: task.episodeNum,
        episodeTitle: task.episodeTitle,
        audioType: task.audioType,
        quality: task.quality,
        subtitle: {
          ...(task.subtitle || {}),
          localUri: localSubtitleUri,
        },
        localM3u8Uri,
        sizeBytes: accumulatedBytes,
        downloadedAt: Date.now(),
      };
      await FileSystem.writeAsStringAsync(localMetaUri, JSON.stringify(metaObject));

      await updateQueueItemInStorage(task.id, {
        status: 'completed',
        progressPct: 100,
        downloadedChunks: totalSegs,
        totalChunks: totalSegs,
        sizeBytes: accumulatedBytes,
        localUri: localM3u8Uri,
        localMetaUri,
        localSubtitleUri,
        targetFolder: epFolderUri,
        downloadedAt: Date.now(),
      });

      await pushCompleteNotification(notifId, `${notifTitle} (${task.quality})`);
    } catch (err) {
      if (isCanceledRef.current || (err?.message && err.message.includes('Canceled'))) {
        await dismissDownloadNotification(notifId);
        try {
          await FileSystem.deleteAsync(epFolderUri, { idempotent: true });
        } catch (_) {}
      } else {
        await pushErrorNotification(notifId, notifTitle);
        await updateQueueItemInStorage(task.id, {
          status: 'failed',
          errorMessage: err?.message || 'Download error',
        });
      }
    } finally {
      isRunningRef.current = false;
      isPausedRef.current = false;
      setIsPaused(false);
      setActiveTask(null);
      activeTaskIdRef.current = null;
      setDownloadPct(0);
    }
  };

  // --- PAUSE / RESUME / CANCEL CONTROLS ---
  const handleTogglePause = async () => {
    if (!activeTask) return;
    const nextPaused = !isPausedRef.current;
    isPausedRef.current = nextPaused;
    setIsPaused(nextPaused);

    const notifId = `dl-${activeTask.id}`;
    const notifTitle = `${activeTask.animeTitle} • Ep ${activeTask.episodeNum}`;
    const notifMeta = `${(activeTask.audioType || 'sub').toUpperCase()} • ${activeTask.quality || '1080p'}`;

    await pushDownloadNotification(notifId, notifTitle, downloadPct, nextPaused, notifMeta);
    await updateQueueItemInStorage(activeTask.id, {
      status: nextPaused ? 'paused' : 'downloading',
    });
  };

  const handleResumePausedItem = async (item) => {
    await updateQueueItemInStorage(item.id, { status: 'queued' });
  };

  const handleCancelActiveDownload = async () => {
    const currentId = activeTaskIdRef.current || activeTask?.id;
    isCanceledRef.current = true;
    isPausedRef.current = false;
    setIsPaused(false);

    if (currentId) {
      await dismissDownloadNotification(`dl-${currentId}`);
      const currentList = await readLocalQueue();
      const target = currentList.find(i => i.id === currentId);
      const filtered = currentList.filter(i => i.id !== currentId);
      await writeLocalQueue(filtered);
      setQueueItems(filtered);

      if (target?.targetFolder) {
        FileSystem.deleteAsync(target.targetFolder, { idempotent: true }).catch(() => {});
      }
      if (target && resolvedUid && resolvedProfileId) {
        firestore()
          .collection('users')
          .doc(String(resolvedUid))
          .collection('profiles')
          .doc(String(resolvedProfileId))
          .collection('downloads')
          .doc(`${target.animeId}_ep_${target.episodeNum}`)
          .delete()
          .catch(() => {});
      }
    }
    setActiveTask(null);
  };

  const handleDeleteEpisode = (item) => {
    Alert.alert(
      'Delete Offline Episode',
      `Remove ${item.animeTitle} - Episode ${item.episodeNum} (${item.quality}) from device storage?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (activeTaskIdRef.current === item.id) {
              await handleCancelActiveDownload();
              return;
            }
            if (item.targetFolder) {
              await FileSystem.deleteAsync(item.targetFolder, { idempotent: true }).catch(() => {});
            }
            const currentList = await readLocalQueue();
            const filtered = currentList.filter(i => i.id !== item.id);
            await writeLocalQueue(filtered);
            setQueueItems(filtered);

            if (resolvedUid && resolvedProfileId) {
              firestore()
                .collection('users')
                .doc(String(resolvedUid))
                .collection('profiles')
                .doc(String(resolvedProfileId))
                .collection('downloads')
                .doc(`${item.animeId}_ep_${item.episodeNum}`)
                .delete()
                .catch(() => {});
            }
          },
        },
      ]
    );
  };

  const handlePlayOffline = (item) => {
    const playbackParams = {
      activeUrl: item.localUri,
      streamUrl: item.localUri,
      localMetaUri: item.localMetaUri,
      localSubtitleUri: item.localSubtitleUri,
      animeTitle: item.animeTitle,
      animeBackdrop: item.backdrop || item.coverImage,
      episodeNum: item.episodeNum,
      episodeTitle: item.episodeTitle,
      animeId: item.animeId,
      slug: item.slug,
      userUid: resolvedUid,
      activeProfileId: resolvedProfileId,
      targetType: item.audioType || 'sub',
      isOffline: true,
    };

    if (navigation?.navigate) {
      navigation.navigate('Player', playbackParams);
    } else {
      setOfflinePlayback(playbackParams);
    }
  };

  // --- COMPUTED VAULT STATS & GROUPED SERIES ---
  const { groupedSeries, pendingList, totalVaultBytes, completedCount } = useMemo(() => {
    const seriesMap = new Map();
    const pending = [];
    let bytesSum = 0;
    let doneCount = 0;

    for (const item of queueItems) {
      bytesSum += Number(item.sizeBytes || 0);

      if (item.status === 'completed') {
        doneCount++;
      } else if (item.id !== activeTask?.id) {
        pending.push(item);
      }

      const key = String(item.animeId || item.animeTitle);
      if (!seriesMap.has(key)) {
        seriesMap.set(key, {
          animeId: key,
          animeTitle: item.animeTitle || 'Unknown Anime',
          posterUrl: item.coverImage || item.backdrop || '',
          backdropUrl: item.backdrop || item.coverImage || '',
          episodes: [],
          totalBytes: 0,
        });
      }
      const group = seriesMap.get(key);
      group.episodes.push(item);
      group.totalBytes += Number(item.sizeBytes || 0);
    }

    const grouped = Array.from(seriesMap.values()).map(g => ({
      ...g,
      episodes: g.episodes.sort((a, b) => Number(a.episodeNum) - Number(b.episodeNum)),
    }));

    return {
      groupedSeries: grouped,
      pendingList: pending,
      totalVaultBytes: bytesSum,
      completedCount: doneCount,
    };
  }, [queueItems, activeTask]);

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />

      {/* TOP CINEMATIC VAULT HEADER */}
      <View style={styles.headerWrapper}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={styles.backBtn}
              activeOpacity={0.75}
              onPress={onBack || (() => navigation?.goBack?.())}
            >
              <IconBack />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>OFFLINE VAULT</Text>
              <Text style={styles.headerSub}>
                Proxy-Accelerated HLS Engine • {resolvedProfile?.name || 'Active Profile'}
              </Text>
            </View>
          </View>

          <View style={styles.vaultBadge}>
            <IconVault size={16} color={PURE_RED} />
            <Text style={styles.vaultBadgeText}>{formatBytes(totalVaultBytes)}</Text>
          </View>
        </View>

        {/* Storage & Episode Telemetry Strip */}
        <View style={styles.telemetryStrip}>
          <View style={styles.telemetryPill}>
            <Text style={styles.telemetryValue}>{completedCount}</Text>
            <Text style={styles.telemetryLabel}>READY OFFLINE</Text>
          </View>
          <View style={styles.telemetryDivider} />
          <View style={styles.telemetryPill}>
            <Text style={[styles.telemetryValue, { color: BRAND_ACCENT }]}>
              {(activeTask ? 1 : 0) + pendingList.length}
            </Text>
            <Text style={styles.telemetryLabel}>IN QUEUE</Text>
          </View>
          <View style={styles.telemetryDivider} />
          <View style={styles.telemetryPill}>
            <Text style={[styles.telemetryValue, { color: EMERALD }]}>
              {groupedSeries.length}
            </Text>
            <Text style={styles.telemetryLabel}>SERIES</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={groupedSeries}
        keyExtractor={(item) => String(item.animeId)}
        contentContainerStyle={styles.listPadding}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* ACTIVE DOWNLOAD HERO CARD */}
            {activeTask && (
              <View style={styles.activeSection}>
                <View style={styles.sectionTitleRow}>
                  <Animated.View
                    style={[
                      styles.liveDot,
                      {
                        opacity: pulseAnim,
                        backgroundColor: isPaused ? AMBER : PURE_RED,
                      },
                    ]}
                  />
                  <Text style={styles.sectionHeader}>
                    {isPaused ? 'DOWNLOAD PAUSED' : 'DOWNLOADING M3U8 CHUNKS VIA PROXY'}
                  </Text>
                </View>

                <View style={styles.activeHeroCard}>
                  <ProxyImage
                    source={{ uri: activeTask.backdrop || activeTask.coverImage }}
                    style={styles.activeBackdropBg}
                    resizeMode="cover"
                  />
                  <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
                    <Defs>
                      <LinearGradient id="dlHeroGrad" x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0" stopColor="#09090B" stopOpacity="0.88" />
                        <Stop offset="1" stopColor="#09090B" stopOpacity="0.97" />
                      </LinearGradient>
                    </Defs>
                    <Rect width="100%" height="100%" fill="url(#dlHeroGrad)" />
                  </Svg>

                  <View style={styles.activeCardInner}>
                    <ProxyImage
                      source={{ uri: activeTask.coverImage || activeTask.backdrop }}
                      style={styles.activePoster}
                      resizeMode="cover"
                    />

                    <View style={styles.activeDetails}>
                      <Text style={styles.activeAnimeTitle} numberOfLines={1}>
                        {activeTask.animeTitle}
                      </Text>
                      <Text style={styles.activeEpTitle} numberOfLines={1}>
                        Ep {activeTask.episodeNum} • {activeTask.episodeTitle}
                      </Text>

                      {/* Requested Audio, Quality & Subtitle Spec Pills */}
                      <View style={styles.specBadgeRow}>
                        <View style={[styles.specChip, styles.specChipRed]}>
                          <Text style={styles.specChipText}>
                            {(activeTask.audioType || 'sub').toUpperCase()}
                          </Text>
                        </View>
                        <View style={[styles.specChip, styles.specChipBlue]}>
                          <Text style={styles.specChipText}>
                            {activeTask.quality || '1080p'}
                          </Text>
                        </View>
                        <View style={styles.specChip}>
                          <Text style={styles.specChipText} numberOfLines={1}>
                            CC: {activeTask.subtitle?.label || 'Off'}
                          </Text>
                        </View>
                      </View>

                      {/* Chunk & Byte Telemetry */}
                      <View style={styles.chunkStatsRow}>
                        <Text style={styles.chunkCounterText}>
                          {totalChunks > 0
                            ? `${downloadedChunks} / ${totalChunks} segments`
                            : 'Resolving M3U8 manifest...'}
                        </Text>
                        <Text style={styles.percentageBig}>{downloadPct}%</Text>
                      </View>

                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${downloadPct}%`,
                              backgroundColor: isPaused ? AMBER : PURE_RED,
                            },
                          ]}
                        />
                      </View>

                      {/* Pause / Resume & Cancel Buttons */}
                      <View style={styles.activeControlsRow}>
                        <TouchableOpacity
                          style={[
                            styles.controlBtnPrimary,
                            isPaused && { backgroundColor: AMBER },
                          ]}
                          activeOpacity={0.85}
                          onPress={handleTogglePause}
                        >
                          {isPaused ? (
                            <IconPlay size={14} color="#000" />
                          ) : (
                            <IconPause size={14} color="#FFF" />
                          )}
                          <Text
                            style={[
                              styles.controlBtnPrimaryText,
                              isPaused && { color: '#000' },
                            ]}
                          >
                            {isPaused ? 'Resume' : 'Pause'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.controlBtnCancel}
                          activeOpacity={0.8}
                          onPress={handleCancelActiveDownload}
                        >
                          <IconCancel size={14} color="#EF4444" />
                          <Text style={styles.controlBtnCancelText}>Cancel</Text>
                        </TouchableOpacity>

                        <Text style={styles.byteCounterText}>
                          {formatBytes(downloadedBytes)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {groupedSeries.length > 0 && (
              <Text style={[styles.sectionHeader, { marginBottom: 12 }]}>
                SERIES VAULT ({groupedSeries.length})
              </Text>
            )}
          </>
        }
        renderItem={({ item: series }) => {
          const isExpanded = expandedSeriesId === series.animeId;
          const completedEpsCount = series.episodes.filter(e => e.status === 'completed').length;

          return (
            <View style={styles.seriesAccordion}>
              <TouchableOpacity
                style={[styles.seriesCard, isExpanded && styles.seriesCardExpanded]}
                activeOpacity={0.85}
                onPress={() =>
                  setExpandedSeriesId(isExpanded ? null : series.animeId)
                }
              >
                <ProxyImage
                  source={{ uri: series.posterUrl }}
                  style={styles.seriesPoster}
                  resizeMode="cover"
                />

                <View style={styles.seriesMetaCol}>
                  <Text style={styles.seriesTitle} numberOfLines={1}>
                    {series.animeTitle}
                  </Text>
                  <View style={styles.seriesSubRow}>
                    <Text style={styles.seriesSubText}>
                      {completedEpsCount}/{series.episodes.length} Episodes Ready
                    </Text>
                    <Text style={styles.seriesDot}>•</Text>
                    <Text style={styles.seriesSizeText}>
                      {formatBytes(series.totalBytes)}
                    </Text>
                  </View>
                </View>

                <View style={[styles.chevronBox, isExpanded && styles.chevronRotated]}>
                  <IconChevronDown color="#FFF" />
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.episodesDrawer}>
                  {series.episodes.map((ep) => {
                    const isCompleted = ep.status === 'completed';
                    const isFailed = ep.status === 'failed';
                    const isQueued = ep.status === 'queued' || ep.status === 'paused';
                    const isCurrentlyActive = activeTask?.id === ep.id;

                    return (
                      <View key={ep.id} style={styles.episodeItemCard}>
                        <View style={styles.epIndexBox}>
                          <Text style={styles.epIndexText}>{ep.episodeNum}</Text>
                        </View>

                        <View style={styles.epCenterCol}>
                          <Text style={styles.epTitleText} numberOfLines={1}>
                            {ep.episodeTitle || `Episode ${ep.episodeNum}`}
                          </Text>

                          <View style={styles.epBadgesWrap}>
                            <View style={styles.miniTagRed}>
                              <Text style={styles.miniTagText}>
                                {(ep.audioType || 'sub').toUpperCase()}
                              </Text>
                            </View>
                            <View style={styles.miniTagDark}>
                              <Text style={styles.miniTagText}>
                                {ep.quality || '1080p'}
                              </Text>
                            </View>
                            <View style={styles.miniTagDark}>
                              <Text style={styles.miniTagText} numberOfLines={1}>
                                {ep.subtitle?.label || 'No Sub'}
                              </Text>
                            </View>
                            {ep.sizeBytes > 0 && (
                              <Text style={styles.epSizeLabel}>
                                {formatBytes(ep.sizeBytes)}
                              </Text>
                            )}
                          </View>

                          {!isCompleted && (
                            <Text
                              style={[
                                styles.epStatusSubtext,
                                isFailed && { color: '#EF4444' },
                              ]}
                            >
                              {isCurrentlyActive
                                ? `Downloading (${downloadPct}%)`
                                : isFailed
                                  ? `Failed: ${ep.errorMessage || 'Tap retry'}`
                                  : ep.status === 'paused'
                                    ? `Paused at ${ep.progressPct || 0}%`
                                    : 'Queued for download...'}
                            </Text>
                          )}
                        </View>

                        <View style={styles.epRightActions}>
                          {isCompleted ? (
                            <TouchableOpacity
                              style={styles.playEpBtn}
                              activeOpacity={0.85}
                              onPress={() => handlePlayOffline(ep)}
                            >
                              <IconPlay size={13} color="#FFF" />
                              <Text style={styles.playEpBtnText}>Play</Text>
                            </TouchableOpacity>
                          ) : (isQueued || isFailed) && !isCurrentlyActive ? (
                            <TouchableOpacity
                              style={styles.retryEpBtn}
                              activeOpacity={0.85}
                              onPress={() => handleResumePausedItem(ep)}
                            >
                              <Text style={styles.retryEpBtnText}>
                                {isFailed ? 'Retry' : 'Start'}
                              </Text>
                            </TouchableOpacity>
                          ) : null}

                          <TouchableOpacity
                            style={styles.trashEpBtn}
                            activeOpacity={0.75}
                            onPress={() => handleDeleteEpisode(ep)}
                          >
                            <IconTrash size={16} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          !activeTask && (
            <View style={styles.emptyVaultContainer}>
              <View style={styles.emptyIconCircle}>
                <IconVault size={36} color={PURE_RED} />
              </View>
              <Text style={styles.emptyVaultTitle}>Your Offline Vault is Empty</Text>
              <Text style={styles.emptyVaultSub}>
                Select any episode in Play and choose Sub/Dub, Subtitle, and Quality to save M3U8 streams for offline playback.
              </Text>
            </View>
          )
        }
      />

      {/* Embedded Offline Player Overlay when navigation prop isn't used */}
      {offlinePlayback && (
        <View style={styles.fullscreenPlayerOverlay}>
          <Player
            route={{ params: offlinePlayback }}
            navigation={{ goBack: () => setOfflinePlayback(null) }}
            user={resolvedUser}
            activeProfile={resolvedProfile}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050507' },
  fullscreenPlayerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: '#000',
  },

  // Header
  headerWrapper: {
    paddingTop: 34,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: '#0B0B0F',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  vaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,0,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,0,0,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  vaultBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },

  // Telemetry Strip
  telemetryStrip: {
    flexDirection: 'row',
    backgroundColor: '#121218',
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  telemetryPill: {
    flex: 1,
    alignItems: 'center',
  },
  telemetryValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  telemetryLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 2,
  },
  telemetryDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  listPadding: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 90,
  },

  // Active Download Section
  activeSection: {
    marginBottom: 24,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionHeader: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  activeHeroCard: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#111116',
    borderWidth: 1,
    borderColor: 'rgba(255,0,0,0.35)',
  },
  activeBackdropBg: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.35,
  },
  activeCardInner: {
    flexDirection: 'row',
    padding: 14,
  },
  activePoster: {
    width: 86,
    height: 126,
    borderRadius: 8,
    backgroundColor: '#1C1C24',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  activeDetails: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'space-between',
  },
  activeAnimeTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  activeEpTitle: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  specBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  specChip: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  specChipRed: {
    backgroundColor: PURE_RED,
  },
  specChipBlue: {
    backgroundColor: 'rgba(56,189,248,0.22)',
    borderWidth: 1,
    borderColor: BRAND_ACCENT,
  },
  specChipText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  chunkStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 10,
    marginBottom: 5,
  },
  chunkCounterText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '700',
  },
  percentageBig: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  activeControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  controlBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PURE_RED,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  },
  controlBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  controlBtnCancel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  controlBtnCancelText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '800',
  },
  byteCounterText: {
    marginLeft: 'auto',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
  },

  // Series Vault Accordion
  seriesAccordion: {
    marginBottom: 12,
  },
  seriesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#101016',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  seriesCardExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderColor: 'rgba(255,0,0,0.4)',
  },
  seriesPoster: {
    width: 52,
    height: 72,
    borderRadius: 6,
    backgroundColor: '#1A1A22',
  },
  seriesMetaCol: {
    flex: 1,
    marginLeft: 12,
  },
  seriesTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  seriesSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  seriesSubText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
  },
  seriesDot: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
  },
  seriesSizeText: {
    color: BRAND_ACCENT,
    fontSize: 12,
    fontWeight: '800',
  },
  chevronBox: {
    padding: 8,
  },
  chevronRotated: {
    transform: [{ rotate: '180deg' }],
  },
  episodesDrawer: {
    backgroundColor: '#0A0A0E',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: 'rgba(255,0,0,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  episodeItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  epIndexBox: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#16161F',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  epIndexText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  epCenterCol: {
    flex: 1,
    paddingRight: 8,
  },
  epTitleText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 5,
  },
  epBadgesWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  miniTagRed: {
    backgroundColor: PURE_RED,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  miniTagDark: {
    backgroundColor: '#1E1E2A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  miniTagText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  epSizeLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '700',
  },
  epStatusSubtext: {
    color: BRAND_ACCENT,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  epRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playEpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: PURE_RED,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 5,
  },
  playEpBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  retryEpBtn: {
    backgroundColor: '#222230',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  retryEpBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  trashEpBtn: {
    padding: 7,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 5,
  },

  // Empty State
  emptyVaultContainer: {
    paddingVertical: 70,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255,0,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyVaultTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 6,
  },
  emptyVaultSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
