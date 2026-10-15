import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  FlatList, StatusBar, Modal, Alert, 
  DeviceEventEmitter, Animated 
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import * as FileSystem from 'expo-file-system';
import Svg, { Path, Rect, Circle, G, Line, Polyline } from 'react-native-svg';

import ProxyImage from '../components/ProxyImage';
import Player from './play/player';
import * as NotificationEngine from '../components/NotificationEngine';

let AsyncStorage = null;
try {
  const mod = require('@react-native-async-storage/async-storage');
  AsyncStorage = mod?.default || mod;
} catch (_) {}

// --- STRICT 4-COLOR MONOCHROME + PURE RED PALETTE ---
const BLACK = '#000000';
const DARK_GREY = '#161616';
const WHITE = '#FFFFFF';
const PURE_RED = '#FF0000';

const VERCEL_API_BASE = 'https://anikoto-api-lyart.vercel.app';
const PROXY_URL = 'https://icy-wave-30d8.prashant-yash69.workers.dev/proxy?url=';

const DOWNLOAD_QUEUE_STORAGE_KEY = '@kameko_downloads_queue_v1';
const DOWNLOAD_QUEUE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}kameko_downloads_queue.json`
  : null;
const VAULT_ROOT_DIR = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}kameko_vault/`
  : null;

// --- PROXY & URL HELPERS ---
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
    if (trimmed.startsWith('/')) return `${urlObj.origin}${trimmed}`;
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

// --- LOCAL STORAGE READ / WRITE ---
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
};

// --- PLAIN TEXT NOTIFICATION WITH LEFT PORTRAIT POSTER ---
const pushPlainTextNotification = async (notifId, plainTitle, plainBody, pct, isPaused, posterUri) => {
  try {
    if (typeof NotificationEngine?.showProgressNotification === 'function') {
      await NotificationEngine.showProgressNotification(notifId, plainTitle, pct, {
        body: plainBody,
        subtitle: plainBody,
        plainText: true,
        isPaused: Boolean(isPaused),
        largeIcon: posterUri || null,
        posterUrl: posterUri || null,
        imageUrl: posterUri || null,
        ongoing: !isPaused,
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

const pushPlainCompleteNotification = async (notifId, plainTitle, posterUri) => {
  try {
    if (typeof NotificationEngine?.showCompletionNotification === 'function') {
      await NotificationEngine.showCompletionNotification(notifId, plainTitle, {
        largeIcon: posterUri || null,
        posterUrl: posterUri || null,
        plainText: true,
      });
    }
  } catch (_) {}
};

const pushPlainErrorNotification = async (notifId, plainTitle, posterUri) => {
  try {
    if (typeof NotificationEngine?.showErrorNotification === 'function') {
      await NotificationEngine.showErrorNotification(notifId, plainTitle, {
        largeIcon: posterUri || null,
        posterUrl: posterUri || null,
        plainText: true,
      });
    }
  } catch (_) {}
};

const dismissNotification = async (notifId) => {
  try {
    if (typeof NotificationEngine?.clearNotification === 'function') {
      await NotificationEngine.clearNotification(notifId);
    }
  } catch (_) {}
};

// ============================================================================
// PERSISTENT MODULE-LEVEL BACKGROUND DOWNLOAD MANAGER
// Runs independently of component mount/unmount so downloads continue even
// when the Downloads page is closed or the app is in the background.
// ============================================================================
const BgDownloadState = {
  isRunning: false,
  isPaused: false,
  isCanceled: false,
  activeTask: null,
  pct: 0,
  downloadedChunks: 0,
  totalChunks: 0,
  sizeBytes: 0,
  listeners: new Set(),
  daemonStarted: false,
};

const notifyBgListeners = () => {
  const snapshot = {
    isRunning: BgDownloadState.isRunning,
    isPaused: BgDownloadState.isPaused,
    activeTask: BgDownloadState.activeTask,
    pct: BgDownloadState.pct,
    downloadedChunks: BgDownloadState.downloadedChunks,
    totalChunks: BgDownloadState.totalChunks,
    sizeBytes: BgDownloadState.sizeBytes,
  };
  BgDownloadState.listeners.forEach((cb) => {
    try {
      cb(snapshot);
    } catch (_) {}
  });
};

const updateQueueEntryBg = async (itemId, patch) => {
  const currentList = await readLocalQueue();
  const updatedList = currentList.map((item) =>
    item.id === itemId ? { ...item, ...patch, updatedAt: Date.now() } : item
  );
  await writeLocalQueue(updatedList);

  const target = updatedList.find((i) => i.id === itemId);
  if (target && target.userUid && target.profileId) {
    firestore()
      .collection('users')
      .doc(String(target.userUid))
      .collection('profiles')
      .doc(String(target.profileId))
      .collection('downloads')
      .doc(`${target.animeId}_ep_${target.episodeNum}`)
      .set(target, { merge: true })
      .catch(() => {});
  }
  notifyBgListeners();
  return updatedList;
};

const runBackgroundDownloadJob = async (task) => {
  if (!VAULT_ROOT_DIR || BgDownloadState.isRunning) return;

  BgDownloadState.isRunning = true;
  BgDownloadState.isPaused = false;
  BgDownloadState.isCanceled = false;
  BgDownloadState.activeTask = task;
  BgDownloadState.pct = task.progressPct || 0;
  BgDownloadState.downloadedChunks = task.downloadedChunks || 0;
  BgDownloadState.totalChunks = task.totalChunks || 0;
  BgDownloadState.sizeBytes = task.sizeBytes || 0;
  notifyBgListeners();

  const safeFolderId = String(task.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const epFolderUri = `${VAULT_ROOT_DIR}${safeFolderId}/`;
  const notifId = `dl-${task.id}`;

  const plainTitle = `${task.animeTitle} - Episode ${task.episodeNum}`;
  const audioLabel = String(task.audioType || 'sub').toUpperCase();
  const qualityLabel = String(task.quality || '1080p');
  let localPosterUri = task.coverImage || task.backdrop || null;

  try {
    await FileSystem.makeDirectoryAsync(epFolderUri, { intermediates: true });

    // Cache vertical portrait poster locally so the Android notification left icon always renders
    if (localPosterUri && localPosterUri.startsWith('http')) {
      try {
        const posterDest = `${epFolderUri}poster.jpg`;
        const pInfo = await FileSystem.getInfoAsync(posterDest);
        if (!pInfo.exists) {
          await FileSystem.downloadAsync(localPosterUri, posterDest);
        }
        localPosterUri = posterDest;
      } catch (_) {}
    }

    await updateQueueEntryBg(task.id, {
      status: 'downloading',
      targetFolder: epFolderUri,
      localPosterUri,
    });

    await pushPlainTextNotification(
      notifId,
      plainTitle,
      `Downloading ${audioLabel} ${qualityLabel} - 0%`,
      0,
      false,
      localPosterUri
    );

    let streamUri = task.streamUri;
    let referer = task.referer || 'https://vidwish.live/';
    let subtitleFileUrl = task.subtitle?.file || null;
    const requestedQuality = qualityLabel.toLowerCase();
    const requestedAudio = String(task.audioType || 'sub').toLowerCase();

    // 1. Resolve M3U8 URL if not already stored
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
                payload.subtitles.find((s) => (s.label || s.lang) === task.subtitle?.label) ||
                payload.subtitles[0];
              subtitleFileUrl = matchedSub?.file || null;
            }
            break;
          }
        } catch (_) {}
      }
    }

    if (!streamUri) {
      throw new Error('Could not resolve stream URL.');
    }

    // 2. Download Subtitle via Cloudflare Proxy
    let localSubtitleUri = null;
    if (subtitleFileUrl && task.subtitle?.lang !== 'none') {
      try {
        const subRes = await fetch(buildProxyUrl(subtitleFileUrl, referer));
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

    // 3. Fetch Master / Variant M3U8 via Cloudflare Proxy
    let activePlaylistUrl = streamUri;
    const masterRes = await fetch(buildProxyUrl(activePlaylistUrl, referer));
    if (!masterRes.ok) {
      throw new Error(`Playlist fetch failed (${masterRes.status})`);
    }
    let playlistText = await masterRes.text();

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
          variants.find((v) => v.label === requestedQuality) ||
          variants.sort((a, b) => b.height - a.height)[0];
        activePlaylistUrl = exactMatch.url;
        const variantRes = await fetch(buildProxyUrl(activePlaylistUrl, referer));
        if (!variantRes.ok) {
          throw new Error(`Variant playlist fetch failed (${variantRes.status})`);
        }
        playlistText = await variantRes.text();
      }
    }

    // 4. Parse Segment Chunks & Keys
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

      if (line.startsWith('#') && line.includes('URI="')) {
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (uriMatch && uriMatch[1]) {
          const absKeyUrl = resolveRelativeUrl(activePlaylistUrl, uriMatch[1]);
          const keyFileName = `key_${segCounter}.bin`;
          const localKeyUri = `${epFolderUri}${keyFileName}`;
          segmentEntries.push({
            remoteUrl: absKeyUrl,
            localUri: localKeyUri,
          });
          rewrittenLines.push(line.replace(uriMatch[0], `URI="${localKeyUri}"`));
          continue;
        }
      }

      if (line.startsWith('#')) {
        rewrittenLines.push(line);
        continue;
      }

      const absSegUrl = resolveRelativeUrl(activePlaylistUrl, line);
      const segFileName = `seg_${String(segCounter).padStart(5, '0')}.ts`;
      const localSegUri = `${epFolderUri}${segFileName}`;
      segCounter++;

      segmentEntries.push({
        remoteUrl: absSegUrl,
        localUri: localSegUri,
      });

      rewrittenLines.push(localSegUri);
    }

    if (segmentEntries.length === 0) {
      throw new Error('No video segments found in playlist.');
    }

    const totalSegs = segmentEntries.length;
    BgDownloadState.totalChunks = totalSegs;
    notifyBgListeners();

    // 5. Download Chunks using Background-Capable createDownloadResumable via Proxy
    let completedSegs = 0;
    let accumulatedBytes = task.sizeBytes || 0;
    const BATCH_SIZE = 4;

    for (let i = 0; i < totalSegs; i += BATCH_SIZE) {
      if (BgDownloadState.isCanceled) throw new Error('Canceled by user');

      while (BgDownloadState.isPaused && !BgDownloadState.isCanceled) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }

      if (BgDownloadState.isCanceled) throw new Error('Canceled by user');

      const batch = segmentEntries.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (seg) => {
          if (BgDownloadState.isCanceled) return;

          const existingInfo = await FileSystem.getInfoAsync(seg.localUri);
          if (existingInfo.exists && (existingInfo.size || 0) > 0) {
            completedSegs++;
            return;
          }

          const proxiedChunkUrl = buildProxyUrl(seg.remoteUrl, referer);
          const resumable = FileSystem.createDownloadResumable(
            proxiedChunkUrl,
            seg.localUri,
            { sessionType: FileSystem.FileSystemSessionType?.BACKGROUND || 0 }
          );

          const dlRes = await resumable.downloadAsync();
          if (dlRes && dlRes.status >= 200 && dlRes.status < 300) {
            const fileStat = await FileSystem.getInfoAsync(seg.localUri);
            accumulatedBytes += fileStat?.size || 0;
            completedSegs++;
          } else {
            throw new Error(`Segment download failed (${dlRes?.status})`);
          }
        })
      );

      const pct = Math.min(100, Math.round((completedSegs / totalSegs) * 100));
      BgDownloadState.downloadedChunks = completedSegs;
      BgDownloadState.pct = pct;
      BgDownloadState.sizeBytes = accumulatedBytes;
      notifyBgListeners();

      if (pct % 4 === 0 || pct === 100 || completedSegs === totalSegs) {
        const plainStatus = `${audioLabel} ${qualityLabel} - ${pct}% (${completedSegs}/${totalSegs}) - ${formatBytes(accumulatedBytes)}`;
        await pushPlainTextNotification(
          notifId,
          plainTitle,
          plainStatus,
          pct,
          BgDownloadState.isPaused,
          localPosterUri
        );

        await updateQueueEntryBg(task.id, {
          status: BgDownloadState.isPaused ? 'paused' : 'downloading',
          progressPct: pct,
          downloadedChunks: completedSegs,
          totalChunks: totalSegs,
          sizeBytes: accumulatedBytes,
        });
      }
    }

    // 6. Write Offline M3U8 & Metadata
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

    await updateQueueEntryBg(task.id, {
      status: 'completed',
      progressPct: 100,
      downloadedChunks: totalSegs,
      totalChunks: totalSegs,
      sizeBytes: accumulatedBytes,
      localUri: localM3u8Uri,
      localMetaUri,
      localSubtitleUri,
      localPosterUri,
      targetFolder: epFolderUri,
      downloadedAt: Date.now(),
    });

    await pushPlainCompleteNotification(
      notifId,
      `Download Complete: ${plainTitle} (${qualityLabel})`,
      localPosterUri
    );
  } catch (err) {
    if (BgDownloadState.isCanceled || (err?.message && err.message.includes('Canceled'))) {
      await dismissNotification(notifId);
      try {
        await FileSystem.deleteAsync(epFolderUri, { idempotent: true });
      } catch (_) {}
    } else {
      await pushPlainErrorNotification(notifId, `Download Failed: ${plainTitle}`, localPosterUri);
      await updateQueueEntryBg(task.id, {
        status: 'failed',
        errorMessage: err?.message || 'Download error',
      });
    }
  } finally {
    BgDownloadState.isRunning = false;
    BgDownloadState.isPaused = false;
    BgDownloadState.activeTask = null;
    BgDownloadState.pct = 0;
    notifyBgListeners();
  }
};

const togglePauseBackgroundDownload = async () => {
  const task = BgDownloadState.activeTask;
  if (!task) return;
  const nextPaused = !BgDownloadState.isPaused;
  BgDownloadState.isPaused = nextPaused;
  notifyBgListeners();

  const notifId = `dl-${task.id}`;
  const plainTitle = `${task.animeTitle} - Episode ${task.episodeNum}`;
  const audioLabel = String(task.audioType || 'sub').toUpperCase();
  const qualityLabel = String(task.quality || '1080p');
  const plainStatus = nextPaused
    ? `Paused at ${BgDownloadState.pct}% - ${audioLabel} ${qualityLabel}`
    : `Downloading ${audioLabel} ${qualityLabel} - ${BgDownloadState.pct}%`;

  await pushPlainTextNotification(
    notifId,
    plainTitle,
    plainStatus,
    BgDownloadState.pct,
    nextPaused,
    task.localPosterUri || task.coverImage || task.backdrop
  );

  await updateQueueEntryBg(task.id, {
    status: nextPaused ? 'paused' : 'downloading',
  });
};

const cancelBackgroundDownload = async () => {
  const task = BgDownloadState.activeTask;
  BgDownloadState.isCanceled = true;
  BgDownloadState.isPaused = false;
  notifyBgListeners();

  if (task) {
    await dismissNotification(`dl-${task.id}`);
    const currentList = await readLocalQueue();
    const filtered = currentList.filter((i) => i.id !== task.id);
    await writeLocalQueue(filtered);

    if (task.targetFolder) {
      FileSystem.deleteAsync(task.targetFolder, { idempotent: true }).catch(() => {});
    }
    if (task.userUid && task.profileId) {
      firestore()
        .collection('users')
        .doc(String(task.userUid))
        .collection('profiles')
        .doc(String(task.profileId))
        .collection('downloads')
        .doc(`${task.animeId}_ep_${task.episodeNum}`)
        .delete()
        .catch(() => {});
    }
  }
  BgDownloadState.activeTask = null;
  notifyBgListeners();
};

// Start the background queue watcher once at module load so downloads run even when the screen is closed
const startBackgroundDownloadDaemon = () => {
  if (BgDownloadState.daemonStarted) return;
  BgDownloadState.daemonStarted = true;

  DeviceEventEmitter.addListener('PAUSE_DOWNLOAD', () => {
    if (!BgDownloadState.isPaused) togglePauseBackgroundDownload();
  });
  DeviceEventEmitter.addListener('RESUME_DOWNLOAD', () => {
    if (BgDownloadState.isPaused) togglePauseBackgroundDownload();
  });
  DeviceEventEmitter.addListener('CANCEL_DOWNLOAD', () => {
    cancelBackgroundDownload();
  });

  setInterval(async () => {
    if (BgDownloadState.isRunning || BgDownloadState.isPaused) return;
    const queue = await readLocalQueue();
    const nextItem = queue.find(
      (item) => item.status === 'queued' || item.status === 'downloading'
    );
    if (nextItem) {
      runBackgroundDownloadJob(nextItem);
    }
  }, 2200);
};

startBackgroundDownloadDaemon();

// ============================================================================
// HIGH-CRAFT SVG ICON SUITE (PURE WHITE, PURE RED, BLACK)
// ============================================================================
const IconBackSvg = ({ size = 22, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);

const IconPlaySvg = ({ size = 18, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M7 4v16l13-8z" />
  </Svg>
);

const IconPauseSvg = ({ size = 18, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Rect x="6" y="4" width="4.5" height="16" rx="1" />
    <Rect x="13.5" y="4" width="4.5" height="16" rx="1" />
  </Svg>
);

const IconMoreDotsSvg = ({ size = 22, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Circle cx="5" cy="12" r="2.2" />
    <Circle cx="12" cy="12" r="2.2" />
    <Circle cx="19" cy="12" r="2.2" />
  </Svg>
);

const IconTrashSvg = ({ size = 20, color = PURE_RED }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="3 6 5 6 21 6" />
    <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <Line x1="10" y1="11" x2="10" y2="17" />
    <Line x1="14" y1="11" x2="14" y2="17" />
  </Svg>
);

const IconListAddSvg = ({ size = 20, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <Line x1="8" y1="6" x2="21" y2="6" />
    <Line x1="8" y1="12" x2="21" y2="12" />
    <Line x1="8" y1="18" x2="16" y2="18" />
    <Line x1="3" y1="6" x2="3.01" y2="6" />
    <Line x1="3" y1="12" x2="3.01" y2="12" />
    <Path d="M19 15v6M16 18h6" />
  </Svg>
);

const IconCheckSvg = ({ size = 20, color = PURE_RED }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="20 6 9 17 4 12" />
  </Svg>
);

const IconCloseSvg = ({ size = 18, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

const IconDownloadVaultSvg = ({ size = 24, color = PURE_RED }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <Polyline points="7 10 12 15 17 10" />
    <Line x1="12" y1="15" x2="12" y2="3" />
  </Svg>
);

const IconFilmSvg = ({ size = 14, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
    <Line x1="7" y1="2" x2="7" y2="22" />
    <Line x1="17" y1="2" x2="17" y2="22" />
    <Line x1="2" y1="12" x2="22" y2="12" />
  </Svg>
);

const IconSubtitlesSvg = ({ size = 14, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Rect x="2" y="4" width="20" height="16" rx="2" />
    <Path d="M6 15h4M14 15h4M6 11h8" />
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
  const resolvedProfileId = propActiveProfileId || resolvedProfile?.id || 'default';
  const resolvedUid = resolvedUser?.uid || null;

  const [queueItems, setQueueItems] = useState([]);
  const [bgState, setBgState] = useState({
    isRunning: BgDownloadState.isRunning,
    isPaused: BgDownloadState.isPaused,
    activeTask: BgDownloadState.activeTask,
    pct: BgDownloadState.pct,
    downloadedChunks: BgDownloadState.downloadedChunks,
    totalChunks: BgDownloadState.totalChunks,
    sizeBytes: BgDownloadState.sizeBytes,
  });

  // "..." Options Modal State
  const [menuTargetItem, setMenuTargetItem] = useState(null);
  const [watchlistMap, setWatchlistMap] = useState({});

  // Top-most Fullscreen Player Modal State (opens above everything including BottomNav)
  const [topLevelPlayback, setTopLevelPlayback] = useState(null);

  const pulseAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim]);

  // Subscribe to background download engine updates & local storage queue
  useEffect(() => {
    let isMounted = true;

    const loadQueue = async () => {
      const list = await readLocalQueue();
      if (isMounted) setQueueItems(list);
    };

    loadQueue();

    const listener = (snapshot) => {
      if (isMounted) {
        setBgState(snapshot);
        loadQueue();
      }
    };

    BgDownloadState.listeners.add(listener);
    const interval = setInterval(loadQueue, 1800);

    return () => {
      isMounted = false;
      BgDownloadState.listeners.delete(listener);
      clearInterval(interval);
    };
  }, []);

  // Listen to User Watchlist (`users/{uid}/library`) so "..." menu shows live status
  useEffect(() => {
    if (!resolvedUid) return;
    const unsub = firestore()
      .collection('users')
      .doc(String(resolvedUid))
      .collection('library')
      .onSnapshot(
        (snap) => {
          const map = {};
          snap?.forEach((doc) => {
            map[doc.id] = true;
          });
          setWatchlistMap(map);
        },
        () => {}
      );
    return () => unsub();
  }, [resolvedUid]);

  // Add or Remove Anime from User Watchlist
  const handleToggleUserList = async (item) => {
    if (!item) return;
    if (!resolvedUid) {
      Alert.alert('Sign In Required', 'Please sign in to save anime to your list.');
      return;
    }

    const animeDocId = String(item.animeId);
    const ref = firestore()
      .collection('users')
      .doc(String(resolvedUid))
      .collection('library')
      .doc(animeDocId);

    const isAlreadyInList = Boolean(watchlistMap[animeDocId]);

    try {
      if (isAlreadyInList) {
        await ref.delete();
      } else {
        await ref.set(
          {
            id: animeDocId,
            animeId: animeDocId,
            title: item.animeTitle,
            img: item.coverImage || item.backdrop || '',
            backdrop: item.backdrop || item.coverImage || '',
            profileId: resolvedProfileId,
            addedAt: firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      setMenuTargetItem(null);
    } catch (e) {
      Alert.alert('Error', 'Could not update your list.');
    }
  };

  // Delete Downloaded Video & Local Segments
  const handleDeleteVideo = (item) => {
    if (!item) return;
    setMenuTargetItem(null);

    Alert.alert(
      'Delete Video',
      `Remove ${item.animeTitle} - Episode ${item.episodeNum} from device storage?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (BgDownloadState.activeTask?.id === item.id) {
              await cancelBackgroundDownload();
              return;
            }
            if (item.targetFolder) {
              await FileSystem.deleteAsync(item.targetFolder, { idempotent: true }).catch(() => {});
            }
            const currentList = await readLocalQueue();
            const filtered = currentList.filter((i) => i.id !== item.id);
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

  // Retry or Resume a Paused / Failed Item
  const handleRetryOrStartItem = async (item) => {
    setMenuTargetItem(null);
    await updateQueueEntryBg(item.id, { status: 'queued' });
  };

  // Open Player on top of EVERYTHING (via full-screen Modal)
  const handleOpenPlayerTop = (item) => {
    if (!item) return;
    setMenuTargetItem(null);

    const streamTarget = item.localUri || item.streamUri;
    if (!streamTarget) {
      Alert.alert('Not Ready', 'This episode is still downloading.');
      return;
    }

    setTopLevelPlayback({
      activeUrl: streamTarget,
      streamUrl: streamTarget,
      localUri: item.localUri || null,
      localMetaUri: item.localMetaUri || null,
      localSubtitleUri: item.localSubtitleUri || null,
      animeTitle: item.animeTitle,
      animeBackdrop: item.backdrop || item.coverImage,
      coverImage: item.coverImage || item.backdrop,
      episodeNum: item.episodeNum,
      episodeTitle: item.episodeTitle,
      animeId: item.animeId,
      slug: item.slug,
      quality: item.quality || '1080p',
      userUid: resolvedUid,
      activeProfileId: resolvedProfileId,
      targetType: item.audioType || 'sub',
      isOffline: Boolean(item.localUri),
    });
  };

  const { activeTask, pct, downloadedChunks, totalChunks, sizeBytes, isPaused } = bgState;

  const { totalStorageBytes, completedTotal } = useMemo(() => {
    let bytes = 0;
    let count = 0;
    queueItems.forEach((i) => {
      bytes += Number(i.sizeBytes || 0);
      if (i.status === 'completed') count++;
    });
    return { totalStorageBytes: bytes, completedTotal: count };
  }, [queueItems]);

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />

      {/* TOP VAULT BAR */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeftGroup}>
          <TouchableOpacity
            style={styles.backBtnBox}
            activeOpacity={0.8}
            onPress={onBack || (() => navigation?.goBack?.())}
          >
            <IconBackSvg size={22} color={WHITE} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>DOWNLOADS</Text>
            <Text style={styles.headerSub}>
              {completedTotal} VIDEOS • {formatBytes(totalStorageBytes)}
            </Text>
          </View>
        </View>

        <View style={styles.headerRightBadge}>
          <IconDownloadVaultSvg size={18} color={PURE_RED} />
          <Text style={styles.headerRightBadgeText}>BACKGROUND ENGINE</Text>
        </View>
      </View>

      {/* THICK VERTICAL ANIME VIDEO CARDS LIST */}
      <FlatList
        data={queueItems}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          activeTask ? (
            <View style={styles.activeSectionWrap}>
              <View style={styles.activeSectionHeader}>
                <Animated.View style={[styles.redPulseDot, { opacity: pulseAnim }]} />
                <Text style={styles.activeSectionTitle}>
                  {isPaused ? 'BACKGROUND DOWNLOAD PAUSED' : 'ACTIVE BACKGROUND DOWNLOAD'}
                </Text>
              </View>

              {/* THICK ACTIVE DOWNLOAD CARD WITH VERTICAL PORTRAIT IMAGE */}
              <View style={styles.thickActiveCard}>
                <View style={styles.verticalPosterWrap}>
                  <ProxyImage
                    source={{ uri: activeTask.coverImage || activeTask.backdrop }}
                    style={styles.verticalPosterImg}
                    resizeMode="cover"
                  />
                  <View style={styles.posterAudioRibbon}>
                    <Text style={styles.posterAudioRibbonText}>
                      {(activeTask.audioType || 'sub').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.thickCardBody}>
                  <View style={styles.cardTopRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.cardAnimeTitle} numberOfLines={2}>
                        {activeTask.animeTitle}
                      </Text>
                      <Text style={styles.cardEpTitle} numberOfLines={1}>
                        EPISODE {activeTask.episodeNum} • {activeTask.episodeTitle}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.dotsMenuBtn}
                      activeOpacity={0.75}
                      onPress={() => setMenuTargetItem(activeTask)}
                    >
                      <IconMoreDotsSvg size={22} color={WHITE} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.svgMetaRow}>
                    <View style={styles.svgSpecTagRed}>
                      <IconFilmSvg size={12} color={WHITE} />
                      <Text style={styles.svgSpecTagText}>{activeTask.quality || '1080p'}</Text>
                    </View>
                    <View style={styles.svgSpecTagDark}>
                      <IconSubtitlesSvg size={12} color={WHITE} />
                      <Text style={styles.svgSpecTagText} numberOfLines={1}>
                        {activeTask.subtitle?.label || 'Off'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.progressTextRow}>
                    <Text style={styles.chunkInfoText}>
                      {totalChunks > 0
                        ? `${downloadedChunks}/${totalChunks} CHUNKS • ${formatBytes(sizeBytes)}`
                        : 'FETCHING M3U8 VIA PROXY...'}
                    </Text>
                    <Text style={styles.pctBigText}>{pct}%</Text>
                  </View>

                  <View style={styles.thickProgressBarBg}>
                    <View style={[styles.thickProgressBarFill, { width: `${pct}%` }]} />
                  </View>

                  <View style={styles.activeButtonsRow}>
                    <TouchableOpacity
                      style={styles.redActionBtn}
                      activeOpacity={0.85}
                      onPress={togglePauseBackgroundDownload}
                    >
                      {isPaused ? (
                        <IconPlaySvg size={15} color={WHITE} />
                      ) : (
                        <IconPauseSvg size={15} color={WHITE} />
                      )}
                      <Text style={styles.redActionBtnText}>
                        {isPaused ? 'RESUME' : 'PAUSE'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.blackCancelBtn}
                      activeOpacity={0.85}
                      onPress={cancelBackgroundDownload}
                    >
                      <IconCloseSvg size={15} color={PURE_RED} />
                      <Text style={styles.blackCancelBtnText}>CANCEL</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          if (activeTask?.id === item.id) return null;

          const isCompleted = item.status === 'completed';
          const isFailed = item.status === 'failed';
          const isInUserList = Boolean(watchlistMap[String(item.animeId)]);
          const itemPct = isCompleted ? 100 : item.progressPct || 0;

          return (
            <TouchableOpacity
              style={styles.thickVideoCard}
              activeOpacity={0.9}
              onPress={() =>
                isCompleted ? handleOpenPlayerTop(item) : setMenuTargetItem(item)
              }
            >
              {/* LEFT VERTICAL PORTRAIT ANIME POSTER */}
              <View style={styles.verticalPosterWrap}>
                <ProxyImage
                  source={{ uri: item.coverImage || item.backdrop }}
                  style={styles.verticalPosterImg}
                  resizeMode="cover"
                />
                <View style={styles.posterAudioRibbon}>
                  <Text style={styles.posterAudioRibbonText}>
                    {(item.audioType || 'sub').toUpperCase()}
                  </Text>
                </View>
                {isCompleted && (
                  <View style={styles.posterCenterPlayCircle}>
                    <IconPlaySvg size={20} color={WHITE} />
                  </View>
                )}
              </View>

              {/* RIGHT THICK VIDEO INFO COLUMN */}
              <View style={styles.thickCardBody}>
                <View style={styles.cardTopRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.cardAnimeTitle} numberOfLines={2}>
                      {item.animeTitle}
                    </Text>
                    <Text style={styles.cardEpTitle} numberOfLines={1}>
                      EPISODE {item.episodeNum} • {item.episodeTitle || `Episode ${item.episodeNum}`}
                    </Text>
                  </View>

                  {/* "..." THREE DOTS OPTIONS BUTTON */}
                  <TouchableOpacity
                    style={styles.dotsMenuBtn}
                    activeOpacity={0.75}
                    onPress={() => setMenuTargetItem(item)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <IconMoreDotsSvg size={22} color={WHITE} />
                  </TouchableOpacity>
                </View>

                <View style={styles.svgMetaRow}>
                  <View style={styles.svgSpecTagRed}>
                    <IconFilmSvg size={12} color={WHITE} />
                    <Text style={styles.svgSpecTagText}>{item.quality || '1080p'}</Text>
                  </View>
                  <View style={styles.svgSpecTagDark}>
                    <IconSubtitlesSvg size={12} color={WHITE} />
                    <Text style={styles.svgSpecTagText} numberOfLines={1}>
                      {item.subtitle?.label || 'Off'}
                    </Text>
                  </View>
                  {isInUserList && (
                    <View style={styles.svgSpecTagDark}>
                      <IconCheckSvg size={12} color={PURE_RED} />
                      <Text style={styles.svgSpecTagText}>IN LIST</Text>
                    </View>
                  )}
                </View>

                <View style={styles.thickProgressBarBg}>
                  <View
                    style={[
                      styles.thickProgressBarFill,
                      { width: `${itemPct}%` },
                    ]}
                  />
                </View>

                <View style={styles.cardFooterRow}>
                  <Text style={styles.cardStorageSizeText}>
                    {isCompleted
                      ? `OFFLINE READY • ${formatBytes(item.sizeBytes)}`
                      : isFailed
                        ? 'DOWNLOAD FAILED'
                        : `QUEUED (${itemPct}%)`}
                  </Text>

                  {isCompleted ? (
                    <TouchableOpacity
                      style={styles.watchNowBtn}
                      activeOpacity={0.85}
                      onPress={() => handleOpenPlayerTop(item)}
                    >
                      <IconPlaySvg size={14} color={WHITE} />
                      <Text style={styles.watchNowBtnText}>PLAY NOW</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.watchNowBtn}
                      activeOpacity={0.85}
                      onPress={() => handleRetryOrStartItem(item)}
                    >
                      <Text style={styles.watchNowBtnText}>
                        {isFailed ? 'RETRY' : 'START'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !activeTask && (
            <View style={styles.emptyBox}>
              <View style={styles.emptySvgCircle}>
                <IconDownloadVaultSvg size={42} color={PURE_RED} />
              </View>
              <Text style={styles.emptyTitle}>NO DOWNLOADED VIDEOS</Text>
              <Text style={styles.emptySubtitle}>
                Choose Sub or Dub, Subtitle, and Quality on any episode to download it in the background.
              </Text>
            </View>
          )
        }
      />

      {/* "..." OPTIONS ACTION SHEET MODAL (Delete, Add User List, Play) */}
      <Modal
        visible={Boolean(menuTargetItem)}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuTargetItem(null)}
      >
        <View style={styles.menuBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setMenuTargetItem(null)}
          />

          {menuTargetItem && (
            <View style={styles.menuSheet}>
              <View style={styles.menuHeaderRow}>
                <ProxyImage
                  source={{ uri: menuTargetItem.coverImage || menuTargetItem.backdrop }}
                  style={styles.menuMiniPoster}
                  resizeMode="cover"
                />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={styles.menuAnimeTitle} numberOfLines={1}>
                    {menuTargetItem.animeTitle}
                  </Text>
                  <Text style={styles.menuEpSub} numberOfLines={1}>
                    EPISODE {menuTargetItem.episodeNum} • {(menuTargetItem.audioType || 'sub').toUpperCase()} • {menuTargetItem.quality || '1080p'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.menuCloseIconBtn}
                  onPress={() => setMenuTargetItem(null)}
                >
                  <IconCloseSvg size={18} color={WHITE} />
                </TouchableOpacity>
              </View>

              <View style={styles.menuDivider} />

              {/* Option 1: Play Video on Top */}
              {menuTargetItem.status === 'completed' && (
                <TouchableOpacity
                  style={styles.menuOptionBtnRed}
                  activeOpacity={0.85}
                  onPress={() => handleOpenPlayerTop(menuTargetItem)}
                >
                  <IconPlaySvg size={20} color={WHITE} />
                  <Text style={styles.menuOptionTextWhite}>PLAY EPISODE NOW</Text>
                </TouchableOpacity>
              )}

              {/* Option 2: Add / Remove User List (Watchlist) */}
              <TouchableOpacity
                style={styles.menuOptionBtnDark}
                activeOpacity={0.85}
                onPress={() => handleToggleUserList(menuTargetItem)}
              >
                {watchlistMap[String(menuTargetItem.animeId)] ? (
                  <IconCheckSvg size={20} color={PURE_RED} />
                ) : (
                  <IconListAddSvg size={20} color={WHITE} />
                )}
                <Text style={styles.menuOptionTextWhite}>
                  {watchlistMap[String(menuTargetItem.animeId)]
                    ? 'REMOVE FROM USER LIST'
                    : 'ADD TO USER LIST'}
                </Text>
              </TouchableOpacity>

              {/* Option 3: Delete Video */}
              <TouchableOpacity
                style={styles.menuOptionBtnDelete}
                activeOpacity={0.85}
                onPress={() => handleDeleteVideo(menuTargetItem)}
              >
                <IconTrashSvg size={20} color={PURE_RED} />
                <Text style={styles.menuOptionTextRed}>DELETE DOWNLOAD</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* TOP-MOST FULLSCREEN PLAYER MODAL (Renders above BottomNav and all overlays) */}
      <Modal
        visible={Boolean(topLevelPlayback)}
        animationType="fade"
        transparent={false}
        hardwareAccelerated={true}
        statusBarTranslucent={true}
        onRequestClose={() => setTopLevelPlayback(null)}
      >
        <View style={styles.topMostPlayerContainer}>
          {topLevelPlayback && (
            <Player
              route={{ params: topLevelPlayback }}
              navigation={{ goBack: () => setTopLevelPlayback(null) }}
              user={resolvedUser}
              activeProfile={resolvedProfile}
              activeProfileId={resolvedProfileId}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BLACK,
  },
  topMostPlayerContainer: {
    flex: 1,
    backgroundColor: BLACK,
  },

  // Header
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 36,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: BLACK,
    borderBottomWidth: 2,
    borderBottomColor: DARK_GREY,
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtnBox: {
    width: 42,
    height: 42,
    borderRadius: 6,
    backgroundColor: DARK_GREY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: WHITE,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  headerSub: {
    color: PURE_RED,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  headerRightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: DARK_GREY,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: PURE_RED,
  },
  headerRightBadgeText: {
    color: WHITE,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  listContent: {
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 110,
  },

  // Active Download Section
  activeSectionWrap: {
    marginBottom: 22,
  },
  activeSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  redPulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: PURE_RED,
  },
  activeSectionTitle: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // Thick Vertical Video Cards
  thickActiveCard: {
    flexDirection: 'row',
    backgroundColor: DARK_GREY,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: PURE_RED,
    overflow: 'hidden',
    minHeight: 196,
  },
  thickVideoCard: {
    flexDirection: 'row',
    backgroundColor: DARK_GREY,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: BLACK,
    overflow: 'hidden',
    marginBottom: 16,
    minHeight: 188,
  },
  verticalPosterWrap: {
    width: 126,
    height: '100%',
    minHeight: 188,
    backgroundColor: BLACK,
    position: 'relative',
  },
  verticalPosterImg: {
    width: '100%',
    height: '100%',
  },
  posterAudioRibbon: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: PURE_RED,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  posterAudioRibbonText: {
    color: WHITE,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  posterCenterPlayCircle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -22,
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PURE_RED,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: WHITE,
  },

  // Right Card Body
  thickCardBody: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardAnimeTitle: {
    color: WHITE,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 21,
  },
  cardEpTitle: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  dotsMenuBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: BLACK,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // SVG Spec Tags
  svgMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 10,
  },
  svgSpecTagRed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: PURE_RED,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  svgSpecTagDark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: BLACK,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  svgSpecTagText: {
    color: WHITE,
    fontSize: 10,
    fontWeight: '900',
  },

  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  chunkInfoText: {
    color: WHITE,
    fontSize: 10,
    fontWeight: '800',
  },
  pctBigText: {
    color: PURE_RED,
    fontSize: 15,
    fontWeight: '900',
  },
  thickProgressBarBg: {
    width: '100%',
    height: 7,
    backgroundColor: BLACK,
    borderRadius: 3,
    overflow: 'hidden',
  },
  thickProgressBarFill: {
    height: '100%',
    backgroundColor: PURE_RED,
  },

  // Active Buttons
  activeButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  redActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: PURE_RED,
    paddingVertical: 10,
    borderRadius: 6,
  },
  redActionBtnText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  blackCancelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: BLACK,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: PURE_RED,
  },
  blackCancelBtnText: {
    color: PURE_RED,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  cardStorageSizeText: {
    color: WHITE,
    fontSize: 11,
    fontWeight: '800',
  },
  watchNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PURE_RED,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 5,
  },
  watchNowBtnText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // Empty State
  emptyBox: {
    paddingVertical: 80,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  emptySvgCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: DARK_GREY,
    borderWidth: 2,
    borderColor: PURE_RED,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    color: WHITE,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 8,
  },
  emptySubtitle: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },

  // "..." Options Action Sheet Modal
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    width: '100%',
    backgroundColor: DARK_GREY,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    borderTopWidth: 3,
    borderTopColor: PURE_RED,
  },
  menuHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuMiniPoster: {
    width: 52,
    height: 74,
    borderRadius: 6,
    backgroundColor: BLACK,
  },
  menuAnimeTitle: {
    color: WHITE,
    fontSize: 17,
    fontWeight: '900',
  },
  menuEpSub: {
    color: PURE_RED,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  menuCloseIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: BLACK,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuDivider: {
    height: 2,
    backgroundColor: BLACK,
    marginVertical: 16,
  },
  menuOptionBtnRed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: PURE_RED,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 8,
    marginBottom: 10,
  },
  menuOptionBtnDark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BLACK,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 8,
    marginBottom: 10,
  },
  menuOptionBtnDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BLACK,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: PURE_RED,
    marginBottom: 10,
  },
  menuOptionTextWhite: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  menuOptionTextRed: {
    color: PURE_RED,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
});
