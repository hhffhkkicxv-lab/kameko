import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  FlatList, StatusBar, Modal, Alert, DeviceEventEmitter 
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import * as FileSystem from 'expo-file-system';
import * as NavigationBar from 'expo-navigation-bar';
import Svg, { Path, Circle, Polyline } from 'react-native-svg';

import ProxyImage from '../components/ProxyImage';
import Player from './play/player';
import * as NotificationEngine from '../components/NotificationEngine';

let AsyncStorage = null;
try {
  const mod = require('@react-native-async-storage/async-storage');
  AsyncStorage = mod?.default || mod;
} catch (_) {}

// --- STRICT PALETTE ---
const BLACK = '#000000';
const CARD_BG = '#0B0B0E';
const DARK_GREY = '#18181C';
const BORDER_GREY = '#26262C';
const TEXT_GREY = '#8E8E93';
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

// --- HELPERS ---
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

const formatMbRatio = (downloadedBytes, totalEstimatedBytes) => {
  const dlMb = Math.max(0, Math.round((downloadedBytes || 0) / (1024 * 1024)));
  const totMb = Math.max(dlMb, Math.round((totalEstimatedBytes || 100 * 1024 * 1024) / (1024 * 1024)));
  return `${dlMb}mb/${totMb}mb`;
};

const formatDurationClock = (seconds) => {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '00:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = Math.floor(total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const stripNonAscii = (str) =>
  String(str || '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();

// --- ATOMIC SERIALIZED LOCAL STORAGE READ / WRITE (SAFE FOR PARALLEL DOWNLOADS) ---
let storageLockPromise = Promise.resolve();

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

const mutateQueueSafe = (mutatorFn) => {
  storageLockPromise = storageLockPromise
    .then(async () => {
      const current = await readLocalQueue();
      const updated = await mutatorFn(current);
      if (Array.isArray(updated)) {
        await writeLocalQueue(updated);
        return updated;
      }
      return current;
    })
    .catch(() => []);
  return storageLockPromise;
};

// --- EMOJI-FREE PLAIN TEXT NOTIFICATIONS WITH PORTRAIT POSTER ON LEFT ---
const pushPlainNotification = async (notifId, titleText, bodyText, pct, isPaused, posterUri) => {
  try {
    if (typeof NotificationEngine?.showProgressNotification === 'function') {
      await NotificationEngine.showProgressNotification(
        notifId,
        stripNonAscii(titleText),
        pct,
        {
          body: stripNonAscii(bodyText),
          subtitle: stripNonAscii(bodyText),
          plainText: true,
          isPaused: Boolean(isPaused),
          largeIcon: posterUri || null,
          posterUrl: posterUri || null,
          imageUrl: posterUri || null,
          ongoing: !isPaused,
          actions: [
            {
              id: isPaused ? 'RESUME_DOWNLOAD' : 'PAUSE_DOWNLOAD',
              title: isPaused ? 'resume' : 'pause',
            },
            {
              id: 'CANCEL_DOWNLOAD',
              title: 'Cancel',
            },
          ],
        }
      );
    }
  } catch (_) {}
};

const pushPlainDoneNotification = async (notifId, titleText, posterUri) => {
  try {
    if (typeof NotificationEngine?.showCompletionNotification === 'function') {
      await NotificationEngine.showCompletionNotification(
        notifId,
        stripNonAscii(titleText),
        {
          largeIcon: posterUri || null,
          posterUrl: posterUri || null,
          plainText: true,
        }
      );
    }
  } catch (_) {}
};

const dismissPlainNotification = async (notifId) => {
  try {
    if (typeof NotificationEngine?.clearNotification === 'function') {
      await NotificationEngine.clearNotification(notifId);
    }
  } catch (_) {}
};

// --- FETCH ANIME SYNOPSIS, GENRES & PORTRAIT COVER FROM ANILIST ---
const fetchAnimeDetailsForOffline = async (animeTitle) => {
  try {
    const query = `
      query ($search: String) {
        Media (search: $search, type: ANIME) {
          description
          genres
          episodes
          bannerImage
          coverImage { extraLarge large }
        }
      }
    `;
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { search: animeTitle } }),
    });
    const json = await res.json();
    const media = json?.data?.Media;
    if (!media) return null;

    const cleanSynopsis = (media.description || '')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      synopsis: cleanSynopsis,
      genres: Array.isArray(media.genres) ? media.genres.slice(0, 3) : ['Action', 'Adventure'],
      totalEpisodes: media.episodes || null,
      coverImage: media.coverImage?.extraLarge || media.coverImage?.large || null,
      backdrop: media.bannerImage || media.coverImage?.extraLarge || null,
    };
  } catch (_) {
    return null;
  }
};

// ============================================================================
// CONCURRENT MULTI-DOWNLOAD BACKGROUND ENGINE (DOWNLOADS ALL AT ONCE)
// ============================================================================
const BgManager = {
  jobs: new Map(), // taskId -> { isRunning, isPaused, isCanceled, task, pct, downloadedBytes, estimatedTotalBytes }
  listeners: new Set(),
  daemonInitialized: false,
};

const getJobsSnapshot = () => {
  const obj = {};
  BgManager.jobs.forEach((val, key) => {
    obj[key] = { ...val };
  });
  return obj;
};

const notifyListeners = () => {
  const snapshot = getJobsSnapshot();
  BgManager.listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (_) {}
  });
};

const updateQueueRecord = async (itemId, patch) => {
  let targetRecord = null;
  const updatedList = await mutateQueueSafe((list) =>
    list.map((item) => {
      if (item.id === itemId) {
        targetRecord = { ...item, ...patch, updatedAt: Date.now() };
        return targetRecord;
      }
      return item;
    })
  );

  if (targetRecord && targetRecord.userUid && targetRecord.profileId) {
    firestore()
      .collection('users')
      .doc(String(targetRecord.userUid))
      .collection('profiles')
      .doc(String(targetRecord.profileId))
      .collection('downloads')
      .doc(`${targetRecord.animeId}_ep_${targetRecord.episodeNum}`)
      .set(targetRecord, { merge: true })
      .catch(() => {});
  }
  notifyListeners();
  return updatedList;
};

const executeConcurrentDownload = async (task) => {
  if (!VAULT_ROOT_DIR || !task?.id) return;
  const existingJob = BgManager.jobs.get(task.id);
  if (existingJob?.isRunning) return;

  const jobState = {
    isRunning: true,
    isPaused: false,
    isCanceled: false,
    task,
    pct: task.progressPct || 0,
    downloadedBytes: task.sizeBytes || 0,
    estimatedTotalBytes: task.estimatedTotalBytes || 100 * 1024 * 1024,
  };
  BgManager.jobs.set(task.id, jobState);
  notifyListeners();

  const safeFolderId = String(task.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const epFolderUri = `${VAULT_ROOT_DIR}${safeFolderId}/`;
  const notifId = `dl-${task.id}`;
  const notifTitle = `${task.animeTitle} - Episode ${task.episodeNum}`;

  try {
    await FileSystem.makeDirectoryAsync(epFolderUri, { intermediates: true });

    // 1. Fetch & Save Synopsis, Genres, Cover Image, and Episode Thumbnail for Offline Use
    let synopsis = task.synopsis || task.description || '';
    let epSynopsis = task.episodeSynopsis || task.episodeDescription || '';
    let genres = Array.isArray(task.genres) && task.genres.length > 0 ? task.genres : null;
    let remoteCover = task.coverImage || task.backdrop || '';
    let remoteBackdrop = task.backdrop || task.coverImage || '';
    let totalEpCount = task.totalEpisodes || 134;

    if (!synopsis || !genres || !remoteCover) {
      const details = await fetchAnimeDetailsForOffline(task.animeTitle);
      if (details) {
        if (!synopsis) synopsis = details.synopsis;
        if (!genres) genres = details.genres;
        if (!remoteCover && details.coverImage) remoteCover = details.coverImage;
        if (!remoteBackdrop && details.backdrop) remoteBackdrop = details.backdrop;
        if (details.totalEpisodes) totalEpCount = details.totalEpisodes;
      }
    }

    if (!synopsis) {
      synopsis = `${task.animeTitle} offline episode saved in ${task.quality || '1080p'}.`;
    }
    if (!epSynopsis) {
      epSynopsis = task.episodeTitle
        ? `${task.episodeTitle} - ${synopsis.slice(0, 95)}`
        : synopsis.slice(0, 110);
    }
    if (!genres || genres.length === 0) {
      genres = ['Action', 'Adventure'];
    }

    // Download Portrait Cover Image locally
    let localPosterUri = task.localPosterUri || remoteCover;
    if (remoteCover && remoteCover.startsWith('http')) {
      try {
        const posterPath = `${epFolderUri}poster.jpg`;
        const info = await FileSystem.getInfoAsync(posterPath);
        if (!info.exists) {
          await FileSystem.downloadAsync(remoteCover, posterPath);
        }
        localPosterUri = posterPath;
      } catch (_) {}
    }

    // Download Horizontal Episode Thumbnail / Backdrop locally
    let localThumbUri = task.localThumbUri || remoteBackdrop || localPosterUri;
    if (remoteBackdrop && remoteBackdrop.startsWith('http')) {
      try {
        const thumbPath = `${epFolderUri}thumb.jpg`;
        const info = await FileSystem.getInfoAsync(thumbPath);
        if (!info.exists) {
          await FileSystem.downloadAsync(remoteBackdrop, thumbPath);
        }
        localThumbUri = thumbPath;
      } catch (_) {}
    }

    const updatedTaskMeta = {
      ...task,
      status: 'downloading',
      targetFolder: epFolderUri,
      localPosterUri,
      localThumbUri,
      synopsis,
      episodeSynopsis: epSynopsis,
      genres,
      totalEpisodes: totalEpCount,
    };
    jobState.task = updatedTaskMeta;
    await updateQueueRecord(task.id, updatedTaskMeta);

    await pushPlainNotification(
      notifId,
      notifTitle,
      `0% - ${formatMbRatio(0, jobState.estimatedTotalBytes)}`,
      0,
      false,
      localPosterUri
    );

    // 2. Resolve Stream & Subtitle URLs
    let streamUri = task.streamUri;
    let referer = task.referer || 'https://vidwish.live/';
    let subtitleFileUrl = task.subtitle?.file || null;
    const requestedQuality = String(task.quality || '1080p').toLowerCase();
    const requestedAudio = String(task.audioType || 'sub').toLowerCase();

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

    // Ensure DUB also fetches SUB subtitles if none were attached
    if (!subtitleFileUrl && task.subtitle?.lang !== 'none') {
      const safeAnimeId = encodeURIComponent(task.animeId);
      const safeSlug = encodeURIComponent(task.slug || task.episodeNum);
      try {
        const subApiRes = await fetch(
          `${VERCEL_API_BASE}/api/stream?id=${safeAnimeId}&ep=${safeSlug}&server=hd-1&type=sub`
        );
        const subApiJson = await subApiRes.json();
        const subPayload = subApiJson?.data || subApiJson?.results;
        if (Array.isArray(subPayload?.subtitles) && subPayload.subtitles.length > 0) {
          const matchedSub =
            subPayload.subtitles.find((s) => (s.label || s.lang) === task.subtitle?.label) ||
            subPayload.subtitles[0];
          subtitleFileUrl = matchedSub?.file || null;
        }
      } catch (_) {}
    }

    if (!streamUri) {
      throw new Error('Episode unavailable');
    }

    // 3. Download Subtitle (.vtt) to Local Storage
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

    // 4. Resolve Variant Playlist for Requested Quality
    let activePlaylistUrl = streamUri;
    const masterRes = await fetch(buildProxyUrl(activePlaylistUrl, referer));
    if (!masterRes.ok) throw new Error('Stream unavailable');
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
        if (!variantRes.ok) throw new Error('Quality unavailable');
        playlistText = await variantRes.text();
      }
    }

    // 5. Parse Media Segments & Keys
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
      throw new Error('No video data');
    }

    const totalSegs = segmentEntries.length;
    let completedSegs = 0;
    let accumulatedBytes = task.sizeBytes || 0;
    const BATCH_SIZE = 4;

    // 6. Download Video Data in Background-Capable Batches
    for (let i = 0; i < totalSegs; i += BATCH_SIZE) {
      if (jobState.isCanceled) throw new Error('Canceled');

      while (jobState.isPaused && !jobState.isCanceled) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }

      if (jobState.isCanceled) throw new Error('Canceled');

      const batch = segmentEntries.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (seg) => {
          if (jobState.isCanceled) return;

          const existingInfo = await FileSystem.getInfoAsync(seg.localUri);
          if (existingInfo.exists && (existingInfo.size || 0) > 0) {
            completedSegs++;
            return;
          }

          const proxiedUrl = buildProxyUrl(seg.remoteUrl, referer);
          const resumable = FileSystem.createDownloadResumable(
            proxiedUrl,
            seg.localUri,
            { sessionType: FileSystem.FileSystemSessionType?.BACKGROUND || 0 }
          );

          const dlRes = await resumable.downloadAsync();
          if (dlRes && dlRes.status >= 200 && dlRes.status < 300) {
            const fileStat = await FileSystem.getInfoAsync(seg.localUri);
            accumulatedBytes += fileStat?.size || 0;
            completedSegs++;
          } else {
            throw new Error('Network interrupted');
          }
        })
      );

      const pct = Math.min(100, Math.round((completedSegs / totalSegs) * 100));
      const dynamicTotalBytes =
        completedSegs > 4
          ? Math.round((accumulatedBytes / completedSegs) * totalSegs)
          : 100 * 1024 * 1024;

      jobState.pct = pct;
      jobState.downloadedBytes = accumulatedBytes;
      jobState.estimatedTotalBytes = dynamicTotalBytes;
      notifyListeners();

      if (pct % 5 === 0 || pct === 100 || completedSegs === totalSegs) {
        const mbRatioStr = formatMbRatio(accumulatedBytes, dynamicTotalBytes);
        await pushPlainNotification(
          notifId,
          notifTitle,
          `${pct}% - ${mbRatioStr}`,
          pct,
          jobState.isPaused,
          localPosterUri
        );

        await updateQueueRecord(task.id, {
          status: jobState.isPaused ? 'paused' : 'downloading',
          progressPct: pct,
          sizeBytes: accumulatedBytes,
          estimatedTotalBytes: dynamicTotalBytes,
        });
      }
    }

    // 7. Save Offline Video Index & Metadata JSON
    const localM3u8Uri = `${epFolderUri}index.m3u8`;
    await FileSystem.writeAsStringAsync(localM3u8Uri, rewrittenLines.join('\n'));

    const localMetaUri = `${epFolderUri}metadata.json`;
    const fullOfflineMetadata = {
      id: task.id,
      animeId: task.animeId,
      animeTitle: task.animeTitle,
      episodeNum: task.episodeNum,
      episodeTitle: task.episodeTitle,
      synopsis,
      episodeSynopsis: epSynopsis,
      genres,
      totalEpisodes: totalEpCount,
      audioType: task.audioType,
      quality: task.quality,
      coverImage: localPosterUri,
      backdrop: localThumbUri,
      subtitle: {
        ...(task.subtitle || {}),
        localUri: localSubtitleUri,
      },
      localM3u8Uri,
      sizeBytes: accumulatedBytes,
      downloadedAt: Date.now(),
    };
    await FileSystem.writeAsStringAsync(localMetaUri, JSON.stringify(fullOfflineMetadata));

    await updateQueueRecord(task.id, {
      status: 'completed',
      progressPct: 100,
      sizeBytes: accumulatedBytes,
      estimatedTotalBytes: accumulatedBytes,
      localUri: localM3u8Uri,
      localMetaUri,
      localSubtitleUri,
      localPosterUri,
      localThumbUri,
      synopsis,
      episodeSynopsis: epSynopsis,
      genres,
      totalEpisodes: totalEpCount,
      targetFolder: epFolderUri,
      downloadedAt: Date.now(),
    });

    await pushPlainDoneNotification(notifId, `Downloaded ${notifTitle}`, localPosterUri);
  } catch (err) {
    if (jobState.isCanceled || (err?.message && err.message.includes('Canceled'))) {
      await dismissPlainNotification(notifId);
      try {
        await FileSystem.deleteAsync(epFolderUri, { idempotent: true });
      } catch (_) {}
    } else {
      await dismissPlainNotification(notifId);
      await updateQueueRecord(task.id, {
        status: 'failed',
      });
    }
  } finally {
    BgManager.jobs.delete(task.id);
    notifyListeners();
  }
};

const handleTogglePauseJob = async (taskId) => {
  const job = BgManager.jobs.get(taskId);
  if (!job) {
    // If job wasn't running in memory yet, mark it queued so the daemon starts it immediately
    await updateQueueRecord(taskId, { status: 'queued' });
    return;
  }

  const nextPaused = !job.isPaused;
  job.isPaused = nextPaused;
  notifyListeners();

  const task = job.task;
  const notifId = `dl-${task.id}`;
  const notifTitle = `${task.animeTitle} - Episode ${task.episodeNum}`;
  const mbRatioStr = formatMbRatio(job.downloadedBytes, job.estimatedTotalBytes);

  await pushPlainNotification(
    notifId,
    notifTitle,
    nextPaused ? `Paused - ${mbRatioStr}` : `${job.pct}% - ${mbRatioStr}`,
    job.pct,
    nextPaused,
    task.localPosterUri || task.coverImage || task.backdrop
  );

  await updateQueueRecord(task.id, {
    status: nextPaused ? 'paused' : 'downloading',
  });
};

const handleCancelJob = async (taskId) => {
  const job = BgManager.jobs.get(taskId);
  if (job) {
    job.isCanceled = true;
    job.isPaused = false;
  }
  await dismissPlainNotification(`dl-${taskId}`);

  let removedItem = null;
  await mutateQueueSafe((list) => {
    removedItem = list.find((i) => i.id === taskId);
    return list.filter((i) => i.id !== taskId);
  });

  if (removedItem?.targetFolder) {
    FileSystem.deleteAsync(removedItem.targetFolder, { idempotent: true }).catch(() => {});
  }
  if (removedItem?.userUid && removedItem?.profileId) {
    firestore()
      .collection('users')
      .doc(String(removedItem.userUid))
      .collection('profiles')
      .doc(String(removedItem.profileId))
      .collection('downloads')
      .doc(`${removedItem.animeId}_ep_${removedItem.episodeNum}`)
      .delete()
      .catch(() => {});
  }

  BgManager.jobs.delete(taskId);
  notifyListeners();
};

// Daemon launches ALL queued downloads simultaneously without waiting one by one
const initBackgroundDaemon = () => {
  if (BgManager.daemonInitialized) return;
  BgManager.daemonInitialized = true;

  const extractTaskId = (notifId) =>
    notifId && String(notifId).startsWith('dl-') ? String(notifId).slice(3) : null;

  DeviceEventEmitter.addListener('PAUSE_DOWNLOAD', (notifId) => {
    const tId = extractTaskId(notifId);
    if (tId) {
      handleTogglePauseJob(tId);
    } else {
      BgManager.jobs.forEach((job, id) => {
        if (!job.isPaused) handleTogglePauseJob(id);
      });
    }
  });

  DeviceEventEmitter.addListener('RESUME_DOWNLOAD', (notifId) => {
    const tId = extractTaskId(notifId);
    if (tId) {
      handleTogglePauseJob(tId);
    } else {
      BgManager.jobs.forEach((job, id) => {
        if (job.isPaused) handleTogglePauseJob(id);
      });
    }
  });

  DeviceEventEmitter.addListener('CANCEL_DOWNLOAD', (notifId) => {
    const tId = extractTaskId(notifId);
    if (tId) {
      handleCancelJob(tId);
    } else {
      const firstKey = BgManager.jobs.keys().next().value;
      if (firstKey) handleCancelJob(firstKey);
    }
  });

  setInterval(async () => {
    const queue = await readLocalQueue();
    const pendingItems = queue.filter(
      (item) => item.status === 'queued' || item.status === 'downloading'
    );

    // Start ALL pending downloads concurrently right away!
    for (const item of pendingItems) {
      const existing = BgManager.jobs.get(item.id);
      if (!existing || (!existing.isRunning && !existing.isPaused)) {
        executeConcurrentDownload(item);
      }
    }
  }, 1500);
};

initBackgroundDaemon();

// ============================================================================
// SVG ICONS
// ============================================================================
const IconChevronLeft = ({ size = 22, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);

const IconChevronDown = ({ size = 18, color = TEXT_GREY }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M6 9l6 6 6-6" />
  </Svg>
);

const IconBookmark = ({ size = 18, color = WHITE, filled = false }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? PURE_RED : 'none'} stroke={filled ? PURE_RED : color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </Svg>
);

const IconDotsHorizontal = ({ size = 18, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Circle cx="5" cy="12" r="2" />
    <Circle cx="12" cy="12" r="2" />
    <Circle cx="19" cy="12" r="2" />
  </Svg>
);

const IconPlay = ({ size = 18, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M8 5v14l11-7z" />
  </Svg>
);

const IconTrash = ({ size = 18, color = PURE_RED }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="3 6 5 6 21 6" />
    <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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
  const [jobsMap, setJobsMap] = useState(() => getJobsSnapshot());

  // Dropdown states (Downloading section dropdown, per-downloading-series dropdown, and Downloaded series dropdown)
  const [downloadingDropdownOpen, setDownloadingDropdownOpen] = useState(true);
  const [downloadedDropdownOpen, setDownloadedDropdownOpen] = useState(true);
  const [expandedActiveMap, setExpandedActiveMap] = useState({});
  const [expandedSeriesMap, setExpandedSeriesMap] = useState({});

  const [watchlistMap, setWatchlistMap] = useState({});
  const [watchHistoryMap, setWatchHistoryMap] = useState({});
  const [menuTarget, setMenuTarget] = useState(null);
  const [topLevelPlayback, setTopLevelPlayback] = useState(null);

  // Enforce total immersive mode (hide notification bar & bottom system navigation bar) when Player opens
  useEffect(() => {
    const applyImmersiveBars = async () => {
      try {
        StatusBar.setHidden(true, 'none');
        if (topLevelPlayback) {
          await NavigationBar.setVisibilityAsync('hidden');
          await NavigationBar.setBehaviorAsync('overlay-swipe');
        }
      } catch (_) {}
    };
    applyImmersiveBars();
  }, [topLevelPlayback]);

  // Load local queue & subscribe to concurrent background downloader
  useEffect(() => {
    let isMounted = true;

    const loadQueue = async () => {
      const list = await readLocalQueue();
      if (isMounted) {
        setQueueItems(list);
        if (list.length > 0) {
          setExpandedSeriesMap((prev) => {
            if (Object.keys(prev).length > 0) return prev;
            return { [String(list[0].animeId)]: true };
          });
          setExpandedActiveMap((prev) => {
            if (Object.keys(prev).length > 0) return prev;
            const next = {};
            list.forEach((item) => {
              next[item.id] = true;
            });
            return next;
          });
        }
      }
    };

    loadQueue();

    const listener = (snapshot) => {
      if (isMounted) {
        setJobsMap(snapshot);
        loadQueue();
      }
    };

    BgManager.listeners.add(listener);
    const poll = setInterval(loadQueue, 1500);

    return () => {
      isMounted = false;
      BgManager.listeners.delete(listener);
      clearInterval(poll);
    };
  }, []);

  // Listen to user watchlist (`users/{uid}/library`) for the "..." menu
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

  // Listen to watch_history so episode thumbnail shows accurate timestamp
  useEffect(() => {
    if (!resolvedUid || !resolvedProfileId) return;
    const unsub = firestore()
      .collection('users')
      .doc(String(resolvedUid))
      .collection('profiles')
      .doc(String(resolvedProfileId))
      .collection('watch_history')
      .onSnapshot(
        (snap) => {
          const map = {};
          snap?.forEach((doc) => {
            map[doc.id] = doc.data();
          });
          setWatchHistoryMap(map);
        },
        () => {}
      );
    return () => unsub();
  }, [resolvedUid, resolvedProfileId]);

  const toggleBookmarkWatchlist = async (animeItem) => {
    if (!animeItem || !resolvedUid) return;
    const animeDocId = String(animeItem.animeId);
    const ref = firestore()
      .collection('users')
      .doc(String(resolvedUid))
      .collection('library')
      .doc(animeDocId);

    try {
      if (watchlistMap[animeDocId]) {
        await ref.delete();
      } else {
        await ref.set(
          {
            id: animeDocId,
            animeId: animeDocId,
            title: animeItem.animeTitle,
            img: animeItem.localPosterUri || animeItem.coverImage || animeItem.backdrop || '',
            backdrop: animeItem.localThumbUri || animeItem.backdrop || animeItem.coverImage || '',
            profileId: resolvedProfileId,
            addedAt: firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      setMenuTarget(null);
    } catch (_) {}
  };

  const handleDeleteEpisode = (epItem) => {
    if (!epItem) return;
    setMenuTarget(null);

    Alert.alert(
      'Delete Download',
      `Remove ${epItem.animeTitle} - Episode ${epItem.episodeNum}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await handleCancelJob(epItem.id);
            const updated = await readLocalQueue();
            setQueueItems(updated);
          },
        },
      ]
    );
  };

  const handleOpenPlayerOnTop = async (epItem) => {
    if (!epItem) return;
    setMenuTarget(null);

    const streamSource = epItem.localUri || epItem.streamUri;
    if (!streamSource) return;

    // Hide top notification bar & bottom system navigation bar before opening Player
    try {
      StatusBar.setHidden(true, 'none');
      await NavigationBar.setVisibilityAsync('hidden');
      await NavigationBar.setBehaviorAsync('overlay-swipe');
    } catch (_) {}

    const epHistId = `${epItem.animeId}_ep_${epItem.episodeNum}`;
    const savedEpHist = watchHistoryMap[epHistId] || watchHistoryMap[String(epItem.animeId)];
    const resumeProgress =
      savedEpHist && String(savedEpHist.episodeNum) === String(epItem.episodeNum)
        ? Number(savedEpHist.progress || 0)
        : 0;

    setTopLevelPlayback({
      activeUrl: streamSource,
      streamUrl: streamSource,
      localUri: epItem.localUri || null,
      localMetaUri: epItem.localMetaUri || null,
      localSubtitleUri: epItem.localSubtitleUri || null,
      animeTitle: epItem.animeTitle,
      animeBackdrop: epItem.localThumbUri || epItem.backdrop || epItem.coverImage,
      coverImage: epItem.localPosterUri || epItem.coverImage || epItem.backdrop,
      episodeNum: epItem.episodeNum,
      episodeTitle: epItem.episodeTitle,
      animeId: epItem.animeId,
      slug: epItem.slug,
      quality: epItem.quality || '1080p',
      progress: resumeProgress,
      userUid: resolvedUid,
      activeProfileId: resolvedProfileId,
      targetType: epItem.audioType || 'sub',
      isOffline: Boolean(epItem.localUri),
    });
  };

  // Compute Stats & Group Active Downloads + Completed Series
  const { activeDownloadList, downloadedSeriesGroups, readyCount, inQueueCount, seriesCount } = useMemo(() => {
    const activeItems = queueItems.filter(
      (i) => i.status === 'downloading' || i.status === 'paused' || i.status === 'queued'
    );
    const completedItems = queueItems.filter((i) => i.status === 'completed');

    const seriesMap = new Map();
    const allSeriesIds = new Set();

    queueItems.forEach((item) => {
      if (item.animeId) allSeriesIds.add(String(item.animeId));
    });

    completedItems.forEach((item) => {
      const sKey = String(item.animeId || item.animeTitle);
      if (!seriesMap.has(sKey)) {
        seriesMap.set(sKey, {
          animeId: sKey,
          animeTitle: item.animeTitle || 'Unknown',
          coverImage: item.localPosterUri || item.coverImage || item.backdrop || '',
          backdrop: item.localThumbUri || item.backdrop || item.coverImage || '',
          genres: Array.isArray(item.genres) && item.genres.length > 0 ? item.genres : ['Action', 'Adventure'],
          synopsis:
            item.synopsis ||
            `${item.animeTitle} offline episodes saved with subtitles and cover art.`,
          totalEpisodes: item.totalEpisodes || completedItems.length,
          episodes: [],
        });
      }
      seriesMap.get(sKey).episodes.push(item);
    });

    const groups = Array.from(seriesMap.values()).map((g) => ({
      ...g,
      episodes: g.episodes.sort((a, b) => Number(a.episodeNum) - Number(b.episodeNum)),
    }));

    return {
      activeDownloadList: activeItems,
      downloadedSeriesGroups: groups,
      readyCount: completedItems.length,
      inQueueCount: activeItems.length,
      seriesCount: allSeriesIds.size,
    };
  }, [queueItems]);

  const toggleExpandSeries = (animeId) => {
    setExpandedSeriesMap((prev) => ({
      ...prev,
      [String(animeId)]: !prev[String(animeId)],
    }));
  };

  const toggleExpandActiveItem = (itemId) => {
    setExpandedActiveMap((prev) => ({
      ...prev,
      [String(itemId)]: prev[String(itemId)] === false ? true : false,
    }));
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />

      {/* 1. HEADER: "< Downloads" */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backTouch}
          activeOpacity={0.75}
          onPress={onBack || (() => navigation?.goBack?.())}
        >
          <IconChevronLeft size={22} color={WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Downloads</Text>
      </View>

      {/* 2. TOP STATS BOX: READY OFFLINE | IN QUEUE | SERIES */}
      <View style={styles.statsContainer}>
        <View style={styles.statColumn}>
          <Text style={styles.statNumber}>{readyCount}</Text>
          <Text style={styles.statLabel}>READY OFFLINE</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statColumn}>
          <Text style={styles.statNumber}>{inQueueCount}</Text>
          <Text style={styles.statLabel}>IN QUEUE</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statColumn}>
          <Text style={styles.statNumber}>{seriesCount}</Text>
          <Text style={styles.statLabel}>SERIES</Text>
        </View>
      </View>

      <View style={styles.fullDividerLine} />

      <FlatList
        data={downloadedDropdownOpen ? downloadedSeriesGroups : []}
        keyExtractor={(item) => String(item.animeId)}
        contentContainerStyle={styles.scrollPadding}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* 3. "Downlaoding" DROPDOWN SECTION (ALL DOWNLOADING AT ONCE) */}
            {activeDownloadList.length > 0 && (
              <View style={styles.sectionBlock}>
                <TouchableOpacity
                  style={styles.dropdownHeaderRow}
                  activeOpacity={0.8}
                  onPress={() => setDownloadingDropdownOpen(!downloadingDropdownOpen)}
                >
                  <Text style={styles.sectionHeading}>
                    Downlaoding ({activeDownloadList.length})
                  </Text>
                  <View style={!downloadingDropdownOpen && { transform: [{ rotate: '-90deg' }] }}>
                    <IconChevronDown size={18} color={TEXT_GREY} />
                  </View>
                </TouchableOpacity>

                {downloadingDropdownOpen &&
                  activeDownloadList.map((dlItem) => {
                    const liveJob = jobsMap[dlItem.id];
                    const currentPct = liveJob ? liveJob.pct : dlItem.progressPct || 0;
                    const currentBytes = liveJob ? liveJob.downloadedBytes : dlItem.sizeBytes || 0;
                    const totalBytes = liveJob
                      ? liveJob.estimatedTotalBytes
                      : dlItem.estimatedTotalBytes || 100 * 1024 * 1024;
                    const isItemPaused = liveJob ? liveJob.isPaused : dlItem.status === 'paused';
                    const isCardOpen = expandedActiveMap[dlItem.id] !== false;

                    return (
                      <TouchableOpacity
                        key={dlItem.id}
                        style={[styles.mainCard, { marginBottom: 12 }]}
                        activeOpacity={0.92}
                        onPress={() => toggleExpandActiveItem(dlItem.id)}
                      >
                        {/* Left Vertical Portrait Poster (CLEAN - NO OVERLAYS) */}
                        <View style={styles.posterContainer}>
                          <ProxyImage
                            source={{
                              uri:
                                dlItem.localPosterUri ||
                                dlItem.coverImage ||
                                dlItem.backdrop,
                            }}
                            style={styles.posterImage}
                            resizeMode="cover"
                          />
                        </View>

                        {/* Right Details Column */}
                        <View style={styles.cardRightCol}>
                          <View style={styles.titleAndDotsRow}>
                            <Text style={styles.animeMainTitle} numberOfLines={1}>
                              {dlItem.animeTitle}
                            </Text>
                            <TouchableOpacity
                              style={styles.dotsBtn}
                              onPress={() => setMenuTarget(dlItem)}
                            >
                              <IconDotsHorizontal size={18} color={WHITE} />
                            </TouchableOpacity>
                          </View>

                          <Text style={styles.episodeSubLabel} numberOfLines={1}>
                            Episode {dlItem.episodeNum} : {dlItem.episodeTitle || `Episode ${dlItem.episodeNum}`}
                          </Text>

                          {/* Outlined Rectangular Spec Pills: 1080p | English | Sub */}
                          <View style={styles.outlinedPillsRow}>
                            <View style={styles.outlinedPill}>
                              <Text style={styles.outlinedPillText}>
                                {dlItem.quality || '1080p'}
                              </Text>
                            </View>
                            <View style={styles.outlinedPill}>
                              <Text style={styles.outlinedPillText} numberOfLines={1}>
                                {(dlItem.subtitle?.label || 'English').split(' ')[0]}
                              </Text>
                            </View>
                            <View style={styles.outlinedPill}>
                              <Text style={styles.outlinedPillText}>
                                {dlItem.audioType === 'dub' ? 'Dub' : 'Sub'}
                              </Text>
                            </View>
                          </View>

                          {/* Right-aligned MB ratio + Thin Red Progress Bar */}
                          <View style={styles.progressSection}>
                            <Text style={styles.mbRatioText}>
                              {formatMbRatio(currentBytes, totalBytes)}
                            </Text>
                            <View style={styles.thinProgressBg}>
                              <View
                                style={[
                                  styles.thinProgressFill,
                                  { width: `${currentPct}%` },
                                ]}
                              />
                            </View>
                          </View>

                          {/* Collapsible White Action Buttons ("pause" | "Cancel") */}
                          {isCardOpen && (
                            <View style={styles.whiteBtnsRow}>
                              <TouchableOpacity
                                style={styles.whiteActionBtn}
                                activeOpacity={0.85}
                                onPress={() => handleTogglePauseJob(dlItem.id)}
                              >
                                <Text style={styles.whiteActionBtnText}>
                                  {isItemPaused ? 'resume' : 'pause'}
                                </Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.whiteActionBtn}
                                activeOpacity={0.85}
                                onPress={() => handleCancelJob(dlItem.id)}
                              >
                                <Text style={styles.whiteActionBtnText}>Cancel</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
              </View>
            )}

            {/* 4. "Downlaoded" DROPDOWN SECTION HEADER */}
            {downloadedSeriesGroups.length > 0 && (
              <TouchableOpacity
                style={[styles.dropdownHeaderRow, { marginTop: 4, marginBottom: 12 }]}
                activeOpacity={0.8}
                onPress={() => setDownloadedDropdownOpen(!downloadedDropdownOpen)}
              >
                <Text style={styles.sectionHeading}>Downlaoded</Text>
                <View style={!downloadedDropdownOpen && { transform: [{ rotate: '-90deg' }] }}>
                  <IconChevronDown size={18} color={TEXT_GREY} />
                </View>
              </TouchableOpacity>
            )}
          </>
        }
        renderItem={({ item: series }) => {
          const isExpanded = Boolean(expandedSeriesMap[String(series.animeId)]);
          const firstEp = series.episodes[0];

          return (
            <View style={styles.downloadedSeriesBlock}>
              {/* Main Series Card (Dropdown Toggle) */}
              <TouchableOpacity
                style={styles.mainCard}
                activeOpacity={0.9}
                onPress={() => toggleExpandSeries(series.animeId)}
              >
                {/* Left Vertical Portrait Poster (CLEAN - NOTHING ON SERIES COVER) */}
                <View style={styles.posterContainer}>
                  <ProxyImage
                    source={{ uri: series.coverImage || series.backdrop }}
                    style={styles.posterImage}
                    resizeMode="cover"
                  />
                </View>

                {/* Right Series Info: Title, Outlined Genre Pills, Synopsis, Bottom-Right Dropdown Chevron */}
                <View style={styles.cardRightCol}>
                  <View style={styles.titleAndDotsRow}>
                    <Text style={styles.animeMainTitle} numberOfLines={1}>
                      {series.animeTitle}
                    </Text>
                    <TouchableOpacity
                      style={styles.dotsBtn}
                      onPress={() => setMenuTarget(firstEp || series)}
                    >
                      <IconDotsHorizontal size={18} color={WHITE} />
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.outlinedPillsRow, { marginTop: 8 }]}>
                    {series.genres.slice(0, 2).map((genre, idx) => (
                      <View key={idx} style={styles.outlinedPill}>
                        <Text style={styles.outlinedPillText}>{genre}</Text>
                      </View>
                    ))}
                  </View>

                  <Text style={styles.seriesSynopsisText} numberOfLines={3}>
                    {series.synopsis}
                  </Text>

                  <View style={styles.chevronBottomRightWrap}>
                    <View style={isExpanded && { transform: [{ rotate: '180deg' }] }}>
                      <IconChevronDown size={18} color={TEXT_GREY} />
                    </View>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Dropdown Episode Rows Underneath Series Card */}
              {isExpanded && (
                <View style={styles.expandedEpisodesList}>
                  {series.episodes.map((ep) => {
                    const epHistId = `${ep.animeId}_ep_${ep.episodeNum}`;
                    const hist = watchHistoryMap[epHistId] || watchHistoryMap[String(ep.animeId)];
                    const isSameEp =
                      hist && String(hist.episodeNum) === String(ep.episodeNum);
                    const watchedSecs = isSameEp ? Number(hist.progress || 126) : 126;
                    const totalSecs =
                      isSameEp && Number(hist.duration) > 0
                        ? Number(hist.duration)
                        : 1477;
                    const barPct = Math.min(100, Math.max(8, (watchedSecs / totalSecs) * 100));
                    const timeOverlayStr = `${formatDurationClock(watchedSecs)} / ${formatDurationClock(totalSecs)}`;

                    return (
                      <TouchableOpacity
                        key={ep.id}
                        style={styles.episodeItemRow}
                        activeOpacity={0.85}
                        onPress={() => handleOpenPlayerOnTop(ep)}
                      >
                        {/* Left Horizontal Episode Thumbnail with Timestamp & Red Progress Line */}
                        <View style={styles.epThumbBox}>
                          <ProxyImage
                            source={{
                              uri: ep.localThumbUri || ep.backdrop || ep.localPosterUri || ep.coverImage,
                            }}
                            style={styles.epThumbImg}
                            resizeMode="cover"
                          />
                          <View style={styles.epTimestampBadge}>
                            <Text style={styles.epTimestampText}>{timeOverlayStr}</Text>
                          </View>
                          <View style={styles.epBottomProgressTrack}>
                            <View style={[styles.epBottomProgressFill, { width: `${barPct}%` }]} />
                          </View>
                        </View>

                        {/* Right Episode Number, Synopsis & "..." Button */}
                        <View style={styles.epRowRightCol}>
                          <View style={styles.epHeaderRow}>
                            <Text style={styles.epRowTitle} numberOfLines={1}>
                              Episode {ep.episodeNum}
                            </Text>
                            <TouchableOpacity
                              style={styles.epDotsBtn}
                              onPress={() => setMenuTarget(ep)}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                              <IconDotsHorizontal size={16} color={TEXT_GREY} />
                            </TouchableOpacity>
                          </View>

                          <Text style={styles.epRowSynopsis} numberOfLines={2}>
                            {ep.episodeSynopsis || ep.episodeTitle || series.synopsis}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          activeDownloadList.length === 0 && (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No downloads yet</Text>
            </View>
          )
        }
      />

      {/* "..." OPTIONS BOTTOM SHEET MODAL (Play, Add to User List, Delete) */}
      <Modal
        visible={Boolean(menuTarget)}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setMenuTarget(null)}
          />

          {menuTarget && (
            <View style={styles.actionSheetBox}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {menuTarget.animeTitle} {menuTarget.episodeNum ? `• Episode ${menuTarget.episodeNum}` : ''}
              </Text>

              {menuTarget.status === 'completed' && (
                <TouchableOpacity
                  style={styles.sheetOptionRow}
                  activeOpacity={0.8}
                  onPress={() => handleOpenPlayerOnTop(menuTarget)}
                >
                  <IconPlay size={18} color={WHITE} />
                  <Text style={styles.sheetOptionText}>Play Episode</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.sheetOptionRow}
                activeOpacity={0.8}
                onPress={() => toggleBookmarkWatchlist(menuTarget)}
              >
                <IconBookmark
                  size={18}
                  color={WHITE}
                  filled={Boolean(watchlistMap[String(menuTarget.animeId)])}
                />
                <Text style={styles.sheetOptionText}>
                  {watchlistMap[String(menuTarget.animeId)]
                    ? 'Remove from User List'
                    : 'Add to User List'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetOptionRow}
                activeOpacity={0.8}
                onPress={() => handleDeleteEpisode(menuTarget)}
              >
                <IconTrash size={18} color={PURE_RED} />
                <Text style={[styles.sheetOptionText, { color: PURE_RED }]}>
                  Delete Download
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* TOP-MOST FULLSCREEN IMMERSIVE PLAYER MODAL (Hides notification bar & bottom bar completely) */}
      <Modal
        visible={Boolean(topLevelPlayback)}
        animationType="fade"
        transparent={false}
        hardwareAccelerated={true}
        statusBarTranslucent={true}
        onShow={async () => {
          try {
            StatusBar.setHidden(true, 'none');
            await NavigationBar.setVisibilityAsync('hidden');
            await NavigationBar.setBehaviorAsync('overlay-swipe');
          } catch (_) {}
        }}
        onRequestClose={() => setTopLevelPlayback(null)}
      >
        <View style={styles.topPlayerModalContainer}>
          <StatusBar hidden={true} translucent={true} backgroundColor="transparent" />
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
  topPlayerModalContainer: {
    flex: 1,
    backgroundColor: BLACK,
    width: '100%',
    height: '100%',
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 38,
    paddingBottom: 16,
    paddingHorizontal: 18,
  },
  backTouch: {
    paddingRight: 12,
    paddingVertical: 4,
  },
  headerTitleText: {
    color: WHITE,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // 3-Column Stats Strip
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111115',
    marginHorizontal: 16,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#1F1F26',
  },
  statColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNumber: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    color: TEXT_GREY,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#26262E',
  },
  fullDividerLine: {
    height: 1,
    backgroundColor: '#141418',
    marginTop: 18,
  },

  scrollPadding: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 110,
  },

  // Dropdown Section Headings
  sectionBlock: {
    marginBottom: 18,
  },
  dropdownHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingVertical: 4,
  },
  sectionHeading: {
    color: TEXT_GREY,
    fontSize: 14,
    fontWeight: '700',
  },

  // Main Rounded Card (Shared by Downloading & Downloaded)
  mainCard: {
    flexDirection: 'row',
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  posterContainer: {
    width: 105,
    height: 152,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: DARK_GREY,
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },

  // Right Card Column
  cardRightCol: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  titleAndDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  animeMainTitle: {
    color: WHITE,
    fontSize: 17,
    fontWeight: '800',
    flex: 1,
    paddingRight: 6,
  },
  dotsBtn: {
    padding: 4,
  },
  episodeSubLabel: {
    color: TEXT_GREY,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },

  // Outlined Rectangular Spec / Genre Pills
  outlinedPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  outlinedPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#2E2E36',
    backgroundColor: '#121216',
  },
  outlinedPillText: {
    color: TEXT_GREY,
    fontSize: 11,
    fontWeight: '600',
  },

  // Downloading Progress + MB Ratio
  progressSection: {
    marginTop: 8,
  },
  mbRatioText: {
    color: TEXT_GREY,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'right',
    marginBottom: 4,
  },
  thinProgressBg: {
    width: '100%',
    height: 3,
    backgroundColor: '#26262E',
    borderRadius: 2,
    overflow: 'hidden',
  },
  thinProgressFill: {
    height: '100%',
    backgroundColor: PURE_RED,
  },

  // White Buttons ("pause" | "Cancel")
  whiteBtnsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  whiteActionBtn: {
    backgroundColor: WHITE,
    paddingVertical: 6,
    paddingHorizontal: 18,
    borderRadius: 5,
    minWidth: 78,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whiteActionBtnText: {
    color: BLACK,
    fontSize: 13,
    fontWeight: '700',
  },

  // Downloaded Series Card Synopsis & Chevron
  downloadedSeriesBlock: {
    marginBottom: 18,
  },
  seriesSynopsisText: {
    color: TEXT_GREY,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '500',
    marginTop: 8,
  },
  chevronBottomRightWrap: {
    alignItems: 'flex-end',
    marginTop: 4,
  },

  // Expanded Episode Thumbnail Item Row
  expandedEpisodesList: {
    marginTop: 12,
    paddingLeft: 4,
    gap: 12,
  },
  episodeItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  epThumbBox: {
    width: 146,
    height: 84,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: DARK_GREY,
    position: 'relative',
  },
  epThumbImg: {
    width: '100%',
    height: '100%',
  },
  epTimestampBadge: {
    position: 'absolute',
    bottom: 7,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
  },
  epTimestampText: {
    color: WHITE,
    fontSize: 9,
    fontWeight: '700',
  },
  epBottomProgressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  epBottomProgressFill: {
    height: '100%',
    backgroundColor: PURE_RED,
  },
  epRowRightCol: {
    flex: 1,
    marginLeft: 12,
    paddingTop: 2,
  },
  epHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  epRowTitle: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '800',
  },
  epDotsBtn: {
    padding: 4,
  },
  epRowSynopsis: {
    color: TEXT_GREY,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
    fontWeight: '500',
  },

  // Empty State
  emptyWrap: {
    paddingVertical: 70,
    alignItems: 'center',
  },
  emptyText: {
    color: TEXT_GREY,
    fontSize: 14,
    fontWeight: '600',
  },

  // "..." Action Sheet Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  actionSheetBox: {
    backgroundColor: '#121216',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: BORDER_GREY,
  },
  sheetTitle: {
    color: WHITE,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 14,
  },
  sheetOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#1E1E24',
  },
  sheetOptionText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '700',
  },
});
