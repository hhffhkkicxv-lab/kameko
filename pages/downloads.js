import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  FlatList, StatusBar, DeviceEventEmitter, Platform, Switch,
  BackHandler
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import * as FileSystem from 'expo-file-system';
import * as NavigationBar from 'expo-navigation-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import Svg, { Path, Circle, Polyline, Rect } from 'react-native-svg';

import ProxyImage from '../components/ProxyImage';
import Player from './play/player';
import PlayScreen from './play';
import * as NotificationEngine from '../components/NotificationEngine';

// --- STRICT PALETTE ---
const BLACK = '#000000';
const WHITE = '#FFFFFF';
const PURE_RED = '#FF0000';
const DARK_GREY = '#18181C';
const BORDER_GREY = '#26262C';
const TEXT_GREY = '#8E8E93';

const VERCEL_API_BASE = 'https://anikoto-api-lyart.vercel.app';
const PROXY_URL = 'https://icy-wave-30d8.prashant-yash69.workers.dev/proxy?url=';

const DOWNLOAD_QUEUE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}kameko_downloads_queue.json`
  : null;
const VAULT_ROOT_DIR = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}kameko_vault/`
  : null;

// --- HELPERS ---
const buildProxyUrl = (targetUrl, referer = 'https://vidwish.live/') => {
  if (!targetUrl) return '';
  if (targetUrl.startsWith('https://icy-wave-30d8.prashant-yash69.workers.dev')) return targetUrl;
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

const stripNonAscii = (str) => String(str || '').replace(/[^\x20-\x7E]/g, '').trim();

// --- ATOMIC SERIALIZED LOCAL STORAGE ---
let storageLockPromise = Promise.resolve();

const readLocalQueue = async () => {
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

const writeLocalQueue = async (queueArray) => {
  const safeArray = Array.isArray(queueArray) ? queueArray : [];
  try {
    if (DOWNLOAD_QUEUE_FILE_URI) {
      await FileSystem.writeAsStringAsync(DOWNLOAD_QUEUE_FILE_URI, JSON.stringify(safeArray));
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

// --- EMOJI-FREE PLAIN TEXT NOTIFICATIONS ---
const pushPlainNotification = async (notifId, titleText, bodyText, pct, isPaused, posterUri) => {
  try {
    if (typeof NotificationEngine?.showProgressNotification === 'function') {
      await NotificationEngine.showProgressNotification(notifId, stripNonAscii(titleText), pct, {
        body: stripNonAscii(bodyText), subtitle: stripNonAscii(bodyText), plainText: true,
        isPaused: Boolean(isPaused), largeIcon: posterUri || null, posterUrl: posterUri || null, imageUrl: posterUri || null,
        ongoing: !isPaused, actions: [{ id: isPaused ? 'RESUME_DOWNLOAD' : 'PAUSE_DOWNLOAD', title: isPaused ? 'resume' : 'pause' }, { id: 'CANCEL_DOWNLOAD', title: 'Cancel' }],
      });
    }
  } catch (_) {}
};

const pushPlainDoneNotification = async (notifId, titleText, posterUri) => {
  try {
    if (typeof NotificationEngine?.showCompletionNotification === 'function') {
      await NotificationEngine.showCompletionNotification(notifId, stripNonAscii(titleText), { largeIcon: posterUri || null, posterUrl: posterUri || null, plainText: true });
    }
  } catch (_) {}
};

const dismissPlainNotification = async (notifId) => {
  try {
    if (typeof NotificationEngine?.clearNotification === 'function') await NotificationEngine.clearNotification(notifId);
  } catch (_) {}
};

// --- FETCH ANIME SYNOPSIS FOR OFFLINE ---
const fetchAnimeDetailsForOffline = async (animeTitle) => {
  try {
    const query = `query ($search: String) { Media (search: $search, type: ANIME) { description genres episodes bannerImage coverImage { extraLarge large } } }`;
    const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables: { search: animeTitle } }) });
    const json = await res.json();
    const media = json?.data?.Media;
    if (!media) return null;
    const cleanSynopsis = (media.description || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    return { synopsis: cleanSynopsis, genres: Array.isArray(media.genres) ? media.genres.slice(0, 3) : ['Action', 'Adventure'], totalEpisodes: media.episodes || null, coverImage: media.coverImage?.extraLarge || media.coverImage?.large || null, backdrop: media.bannerImage || media.coverImage?.extraLarge || null };
  } catch (_) { return null; }
};

// ============================================================================
// CONCURRENT MULTI-DOWNLOAD BACKGROUND ENGINE
// ============================================================================
const BgManager = { jobs: new Map(), listeners: new Set(), daemonInitialized: false };

const getJobsSnapshot = () => {
  const obj = {};
  BgManager.jobs.forEach((val, key) => { obj[key] = { ...val }; });
  return obj;
};

const notifyListeners = () => {
  const snapshot = getJobsSnapshot();
  BgManager.listeners.forEach((fn) => { try { fn(snapshot); } catch (_) {} });
};

const updateQueueRecord = async (itemId, patch) => {
  let targetRecord = null;
  const updatedList = await mutateQueueSafe((list) =>
    list.map((item) => {
      if (item.id === itemId) { targetRecord = { ...item, ...patch, updatedAt: Date.now() }; return targetRecord; }
      return item;
    })
  );
  if (targetRecord && targetRecord.userUid && targetRecord.profileId) {
    firestore().collection('users').doc(String(targetRecord.userUid)).collection('profiles').doc(String(targetRecord.profileId)).collection('downloads').doc(`${targetRecord.animeId}_ep_${targetRecord.episodeNum}`).set(targetRecord, { merge: true }).catch(() => {});
  }
  notifyListeners();
  return updatedList;
};

const executeConcurrentDownload = async (task) => {
  if (!VAULT_ROOT_DIR || !task?.id) return;
  const existingJob = BgManager.jobs.get(task.id);
  if (existingJob?.isRunning) return;

  const jobState = { isRunning: true, isPaused: task.status === 'paused', isCanceled: false, task, pct: task.progressPct || 0, downloadedBytes: task.sizeBytes || 0, estimatedTotalBytes: task.estimatedTotalBytes || 100 * 1024 * 1024 };
  BgManager.jobs.set(task.id, jobState);
  notifyListeners();

  const safeFolderId = String(task.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const epFolderUri = `${VAULT_ROOT_DIR}${safeFolderId}/`;
  const notifId = `dl-${task.id}`;
  const notifTitle = `${task.animeTitle} - Episode ${task.episodeNum}`;

  try {
    await FileSystem.makeDirectoryAsync(epFolderUri, { intermediates: true });

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
    if (!synopsis) synopsis = `${task.animeTitle} offline episode saved in ${task.quality || '1080p'}.`;
    if (!epSynopsis) epSynopsis = task.episodeTitle ? `${task.episodeTitle} - ${synopsis.slice(0, 95)}` : synopsis.slice(0, 110);
    if (!genres || genres.length === 0) genres = ['Action', 'Adventure'];

    let localPosterUri = task.localPosterUri || remoteCover;
    if (remoteCover && remoteCover.startsWith('http')) {
      try {
        const posterPath = `${epFolderUri}poster.jpg`;
        const info = await FileSystem.getInfoAsync(posterPath);
        if (!info.exists) await FileSystem.downloadAsync(remoteCover, posterPath);
        localPosterUri = posterPath;
      } catch (_) {}
    }

    let localThumbUri = task.localThumbUri || remoteBackdrop || localPosterUri;
    if (remoteBackdrop && remoteBackdrop.startsWith('http')) {
      try {
        const thumbPath = `${epFolderUri}thumb.jpg`;
        const info = await FileSystem.getInfoAsync(thumbPath);
        if (!info.exists) await FileSystem.downloadAsync(remoteBackdrop, thumbPath);
        localThumbUri = thumbPath;
      } catch (_) {}
    }

    const updatedTaskMeta = { ...task, status: jobState.isPaused ? 'paused' : 'downloading', targetFolder: epFolderUri, localPosterUri, localThumbUri, synopsis, episodeSynopsis: epSynopsis, genres, totalEpisodes: totalEpCount };
    jobState.task = updatedTaskMeta;
    await updateQueueRecord(task.id, updatedTaskMeta);
    await pushPlainNotification(notifId, notifTitle, jobState.isPaused ? `Paused - ${formatMbRatio(jobState.downloadedBytes, jobState.estimatedTotalBytes)}` : `${jobState.pct}% - ${formatMbRatio(jobState.downloadedBytes, jobState.estimatedTotalBytes)}`, jobState.pct, jobState.isPaused, localPosterUri);

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
          const apiRes = await fetch(`${VERCEL_API_BASE}/api/stream?id=${safeAnimeId}&ep=${safeSlug}&server=${srv}&type=${requestedAudio}`);
          const apiJson = await apiRes.json();
          const payload = apiJson?.data || apiJson?.results;
          if (payload?.m3u8 || payload?.streamingLink) {
            streamUri = payload.m3u8 || payload.streamingLink;
            if (payload.referer) referer = payload.referer;
            if (!subtitleFileUrl && Array.isArray(payload.subtitles) && payload.subtitles.length > 0) {
              const matchedSub = payload.subtitles.find((s) => (s.label || s.lang) === task.subtitle?.label) || payload.subtitles[0];
              subtitleFileUrl = matchedSub?.file || null;
            }
            break;
          }
        } catch (_) {}
      }
    }

    if (!streamUri) throw new Error('Episode unavailable');

    let localSubtitleUri = null;
    if (subtitleFileUrl && task.subtitle?.lang !== 'none') {
      try {
        const subRes = await fetch(buildProxyUrl(subtitleFileUrl, referer));
        if (subRes.ok) {
          const subText = await subRes.text();
          if (subText && !subText.trim().toLowerCase().startsWith('<!doctype') && !subText.trim().toLowerCase().startsWith('<html')) {
            localSubtitleUri = `${epFolderUri}subtitle.vtt`;
            await FileSystem.writeAsStringAsync(localSubtitleUri, subText);
          }
        }
      } catch (_) {}
    }

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
            variants.push({ label: label.toLowerCase(), height: heightNum, url: resolveRelativeUrl(activePlaylistUrl, nextLine) });
          }
        }
      }
      if (variants.length > 0) {
        const exactMatch = variants.find((v) => v.label === requestedQuality) || variants.sort((a, b) => b.height - a.height)[0];
        activePlaylistUrl = exactMatch.url;
        const variantRes = await fetch(buildProxyUrl(activePlaylistUrl, referer));
        if (!variantRes.ok) throw new Error('Quality unavailable');
        playlistText = await variantRes.text();
      }
    }

    const rawLines = playlistText.replace(/\r\n/g, '\n').split('\n');
    const segmentEntries = [];
    const rewrittenLines = [];
    let segCounter = 0;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i].trim();
      if (!line) { rewrittenLines.push(''); continue; }

      if (line.startsWith('#') && line.includes('URI="')) {
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (uriMatch && uriMatch[1]) {
          const absKeyUrl = resolveRelativeUrl(activePlaylistUrl, uriMatch[1]);
          const keyFileName = `key_${segCounter}.bin`;
          const localKeyUri = `${epFolderUri}${keyFileName}`;
          segmentEntries.push({ remoteUrl: absKeyUrl, localUri: localKeyUri });
          rewrittenLines.push(line.replace(uriMatch[0], `URI="${localKeyUri}"`));
          continue;
        }
      }
      if (line.startsWith('#')) { rewrittenLines.push(line); continue; }

      const absSegUrl = resolveRelativeUrl(activePlaylistUrl, line);
      const segFileName = `seg_${String(segCounter).padStart(5, '0')}.ts`;
      const localSegUri = `${epFolderUri}${segFileName}`;
      segCounter++;
      segmentEntries.push({ remoteUrl: absSegUrl, localUri: localSegUri });
      rewrittenLines.push(localSegUri);
    }

    if (segmentEntries.length === 0) throw new Error('No video data');

    const totalSegs = segmentEntries.length;
    let completedSegs = 0;
    let accumulatedBytes = task.sizeBytes || 0;
    const BATCH_SIZE = 4;

    for (let i = 0; i < totalSegs; i += BATCH_SIZE) {
      if (jobState.isCanceled) throw new Error('Canceled');
      while (jobState.isPaused && !jobState.isCanceled) { await new Promise((resolve) => setTimeout(resolve, 400)); }
      if (jobState.isCanceled) throw new Error('Canceled');

      const batch = segmentEntries.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (seg) => {
          if (jobState.isCanceled) return;
          const existingInfo = await FileSystem.getInfoAsync(seg.localUri);
          if (existingInfo.exists && (existingInfo.size || 0) > 0) { completedSegs++; return; }
          const proxiedUrl = buildProxyUrl(seg.remoteUrl, referer);
          const resumable = FileSystem.createDownloadResumable(proxiedUrl, seg.localUri, { sessionType: FileSystem.FileSystemSessionType?.BACKGROUND || 0 });
          const dlRes = await resumable.downloadAsync();
          if (dlRes && dlRes.status >= 200 && dlRes.status < 300) {
            const fileStat = await FileSystem.getInfoAsync(seg.localUri);
            accumulatedBytes += fileStat?.size || 0;
            completedSegs++;
          } else { throw new Error('Network interrupted'); }
        })
      );

      const pct = Math.min(100, Math.round((completedSegs / totalSegs) * 100));
      const dynamicTotalBytes = completedSegs > 4 ? Math.round((accumulatedBytes / completedSegs) * totalSegs) : 100 * 1024 * 1024;
      jobState.pct = pct; jobState.downloadedBytes = accumulatedBytes; jobState.estimatedTotalBytes = dynamicTotalBytes;
      notifyListeners();

      if (pct % 5 === 0 || pct === 100 || completedSegs === totalSegs) {
        const mbRatioStr = formatMbRatio(accumulatedBytes, dynamicTotalBytes);
        await pushPlainNotification(notifId, notifTitle, `${pct}% - ${mbRatioStr}`, pct, jobState.isPaused, localPosterUri);
        await updateQueueRecord(task.id, { status: jobState.isPaused ? 'paused' : 'downloading', progressPct: pct, sizeBytes: accumulatedBytes, estimatedTotalBytes: dynamicTotalBytes });
      }
    }

    const localM3u8Uri = `${epFolderUri}index.m3u8`;
    await FileSystem.writeAsStringAsync(localM3u8Uri, rewrittenLines.join('\n'));

    const localMetaUri = `${epFolderUri}metadata.json`;
    const fullOfflineMetadata = {
      id: task.id, animeId: task.animeId, animeTitle: task.animeTitle, episodeNum: task.episodeNum,
      episodeTitle: task.episodeTitle, synopsis, episodeSynopsis: epSynopsis, genres, totalEpisodes: totalEpCount,
      audioType: task.audioType, quality: task.quality, coverImage: localPosterUri, backdrop: localThumbUri,
      subtitle: { ...(task.subtitle || {}), localUri: localSubtitleUri }, localM3u8Uri, sizeBytes: accumulatedBytes, downloadedAt: Date.now(),
    };
    await FileSystem.writeAsStringAsync(localMetaUri, JSON.stringify(fullOfflineMetadata));

    await updateQueueRecord(task.id, {
      status: 'completed', progressPct: 100, sizeBytes: accumulatedBytes, estimatedTotalBytes: accumulatedBytes,
      localUri: localM3u8Uri, localMetaUri, localSubtitleUri, localPosterUri, localThumbUri, synopsis,
      episodeSynopsis: epSynopsis, genres, totalEpisodes: totalEpCount, targetFolder: epFolderUri, downloadedAt: Date.now(),
    });
    await pushPlainDoneNotification(notifId, `Downloaded ${notifTitle}`, localPosterUri);
  } catch (err) {
    if (jobState.isCanceled || (err?.message && err.message.includes('Canceled'))) {
      await dismissPlainNotification(notifId);
      try { await FileSystem.deleteAsync(epFolderUri, { idempotent: true }); } catch (_) {}
    } else {
      await dismissPlainNotification(notifId);
      await updateQueueRecord(task.id, { status: 'failed' });
    }
  } finally {
    BgManager.jobs.delete(task.id);
    notifyListeners();
  }
};

const handleTogglePauseJob = async (taskId, forcePauseState = null) => {
  const job = BgManager.jobs.get(taskId);
  if (!job) {
    const queue = await readLocalQueue();
    const targetItem = queue.find((i) => i.id === taskId);
    if (!targetItem) return;
    const nextPaused = forcePauseState !== null ? forcePauseState : targetItem.status !== 'paused';
    await updateQueueRecord(taskId, { status: nextPaused ? 'paused' : 'queued' });
    return;
  }
  const nextPaused = forcePauseState !== null ? forcePauseState : !job.isPaused;
  job.isPaused = nextPaused;
  notifyListeners();
  const task = job.task;
  const notifId = `dl-${task.id}`;
  const mbRatioStr = formatMbRatio(job.downloadedBytes, job.estimatedTotalBytes);
  await pushPlainNotification(notifId, `${task.animeTitle} - Episode ${task.episodeNum}`, nextPaused ? `Paused - ${mbRatioStr}` : `${job.pct}% - ${mbRatioStr}`, job.pct, nextPaused, task.localPosterUri || task.coverImage || task.backdrop);
  await updateQueueRecord(task.id, { status: nextPaused ? 'paused' : 'downloading' });
};

const handleCancelJob = async (taskId) => {
  const job = BgManager.jobs.get(taskId);
  if (job) { job.isCanceled = true; job.isPaused = false; }
  await dismissPlainNotification(`dl-${taskId}`);

  let removedItem = null;
  await mutateQueueSafe((list) => {
    removedItem = list.find((i) => i.id === taskId);
    return list.filter((i) => i.id !== taskId);
  });

  if (removedItem?.targetFolder) FileSystem.deleteAsync(removedItem.targetFolder, { idempotent: true }).catch(() => {});
  if (removedItem?.userUid && removedItem?.profileId) {
    firestore().collection('users').doc(String(removedItem.userUid)).collection('profiles').doc(String(removedItem.profileId)).collection('downloads').doc(`${removedItem.animeId}_ep_${removedItem.episodeNum}`).delete().catch(() => {});
  }
  BgManager.jobs.delete(taskId);
  notifyListeners();
};

const initBackgroundDaemon = () => {
  if (BgManager.daemonInitialized) return;
  BgManager.daemonInitialized = true;
  const extractTaskId = (notifId) => notifId && String(notifId).startsWith('dl-') ? String(notifId).slice(3) : null;

  DeviceEventEmitter.addListener('PAUSE_DOWNLOAD', (notifId) => {
    const tId = extractTaskId(notifId);
    if (tId) handleTogglePauseJob(tId, true);
    else BgManager.jobs.forEach((job, id) => { if (!job.isPaused) handleTogglePauseJob(id, true); });
  });
  DeviceEventEmitter.addListener('RESUME_DOWNLOAD', (notifId) => {
    const tId = extractTaskId(notifId);
    if (tId) handleTogglePauseJob(tId, false);
    else BgManager.jobs.forEach((job, id) => { if (job.isPaused) handleTogglePauseJob(id, false); });
  });
  DeviceEventEmitter.addListener('CANCEL_DOWNLOAD', (notifId) => {
    const tId = extractTaskId(notifId);
    if (tId) handleCancelJob(tId);
    else { const firstKey = BgManager.jobs.keys().next().value; if (firstKey) handleCancelJob(firstKey); }
  });
  setInterval(async () => {
    const queue = await readLocalQueue();
    const pendingItems = queue.filter((item) => item.status === 'queued' || item.status === 'downloading');
    for (const item of pendingItems) {
      const existing = BgManager.jobs.get(item.id);
      if (!existing || (!existing.isRunning && !existing.isPaused)) executeConcurrentDownload(item);
    }
  }, 1500);
};

setTimeout(() => { initBackgroundDaemon(); }, 2500);

// ============================================================================
// SVG ICONS
// ============================================================================
const IconChevronLeft = ({ size = 22, color = WHITE }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Path d="M15 18l-6-6 6-6" /></Svg>);
const IconBookmark = ({ size = 18, color = WHITE, filled = false }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? PURE_RED : 'none'} stroke={filled ? PURE_RED : color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></Svg>);
const IconDotsVertical = ({ size = 18, color = WHITE }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Circle cx="12" cy="5" r="2" /><Circle cx="12" cy="12" r="2" /><Circle cx="12" cy="19" r="2" /></Svg>);
const IconPlay = ({ size = 16, color = WHITE }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Path d="M8 5v14l11-7z" /></Svg>);
const IconPause = ({ size = 15, color = WHITE }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Rect x="6" y="4" width="4" height="16" rx="1" /><Rect x="14" y="4" width="4" height="16" rx="1" /></Svg>);
const IconTrash = ({ size = 16, color = PURE_RED }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><Polyline points="3 6 5 6 21 6" /><Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></Svg>);
const IconSettings = ({ size = 22, color = WHITE }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Circle cx="12" cy="12" r="3" /><Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></Svg>);

export default function Downloads({
  user: propUser,
  activeProfile: propActiveProfile,
  currentProfile: propCurrentProfile,
  activeProfileId: propActiveProfileId,
  navigation,
  onBack,
  onSelectAnime,
  onOpenPlay,
}) {
  const resolvedUser = propUser || auth().currentUser || null;
  const resolvedProfile = propActiveProfile || propCurrentProfile || null;
  const resolvedProfileId = propActiveProfileId || resolvedProfile?.id || 'default';
  const resolvedUid = resolvedUser?.uid || null;

  const [queueItems, setQueueItems] = useState([]);
  const [jobsMap, setJobsMap] = useState(() => getJobsSnapshot());
  const [activeTab, setActiveTab] = useState('downloaded');
  const hasSetInitialTab = useRef(false);
  const prevActiveDlCountRef = useRef(0);

  const [activePlaySeries, setActivePlaySeries] = useState(null); 
  const [watchlistMap, setWatchlistMap] = useState({});
  const [menuTarget, setMenuTarget] = useState(null);
  const [topLevelPlayback, setTopLevelPlayback] = useState(null); 

  const [confirmDialog, setConfirmDialog] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [wifiOnly, setWifiOnly] = useState(true);

  // --- RIGOROUS TAB BAR HIDER & EVENT EMITTER ---
  useEffect(() => {
    const isOverlayActive = showSettings || menuTarget || confirmDialog || activePlaySeries || topLevelPlayback;
    
    // Broadcast event so BottomNav.js unmounts completely
    DeviceEventEmitter.emit('TOGGLE_BOTTOM_NAV', !isOverlayActive);
    
    // Attempt system bar hide
    const enforceImmersive = async () => {
      try {
        StatusBar.setHidden(true, 'none');
        if (Platform.OS === 'android' && NavigationBar?.setVisibilityAsync) {
          await NavigationBar.setVisibilityAsync('hidden');
          await NavigationBar.setBehaviorAsync('overlay-swipe');
        }
      } catch (_) {}
    };
    enforceImmersive();
  }, [showSettings, menuTarget, confirmDialog, activePlaySeries, topLevelPlayback]);

  // Ensure bottom nav comes back when component unmounts
  useEffect(() => {
    return () => {
      DeviceEventEmitter.emit('TOGGLE_BOTTOM_NAV', true);
    };
  }, []);

  // --- HARDWARE BACK BUTTON INTERCEPTOR ---
  useEffect(() => {
    const onHardwareBack = () => {
      if (topLevelPlayback) { handleCloseTopPlayer(); return true; }
      if (activePlaySeries) { setActivePlaySeries(null); return true; }
      if (confirmDialog) { setConfirmDialog(null); return true; }
      if (menuTarget) { setMenuTarget(null); return true; }
      if (showSettings) { setShowSettings(false); return true; }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [topLevelPlayback, activePlaySeries, confirmDialog, menuTarget, showSettings]);

  useEffect(() => {
    let isMounted = true;
    const loadQueue = async () => {
      const list = await readLocalQueue();
      if (isMounted) {
        setQueueItems(list);
        const activeCount = list.filter((i) => i.status === 'downloading' || i.status === 'paused' || i.status === 'queued').length;
        if (!hasSetInitialTab.current) {
          hasSetInitialTab.current = true;
          setActiveTab(activeCount > 0 ? 'downloading' : 'downloaded');
        } else if (prevActiveDlCountRef.current === 0 && activeCount > 0) {
          setActiveTab('downloading');
        }
        prevActiveDlCountRef.current = activeCount;
      }
    };
    loadQueue();
    const listener = (snapshot) => { if (isMounted) { setJobsMap(snapshot); loadQueue(); } };
    BgManager.listeners.add(listener);
    const poll = setInterval(loadQueue, 1500);
    return () => { isMounted = false; BgManager.listeners.delete(listener); clearInterval(poll); };
  }, []);

  useEffect(() => {
    if (!resolvedUid) return;
    const unsub = firestore().collection('users').doc(String(resolvedUid)).collection('library').onSnapshot(
      (snap) => { const map = {}; snap?.forEach((doc) => { map[doc.id] = true; }); setWatchlistMap(map); }, () => {}
    );
    return () => unsub();
  }, [resolvedUid]);

  const { activeDownloadList, downloadedSeriesGroups, readyCount, inQueueCount, seriesCount, areAllActivePaused } = useMemo(() => {
    const activeItems = queueItems.filter((i) => i.status === 'downloading' || i.status === 'paused' || i.status === 'queued');
    const completedItems = queueItems.filter((i) => i.status === 'completed');

    const seriesMap = new Map();
    const allSeriesIds = new Set();
    queueItems.forEach((item) => { if (item.animeId) allSeriesIds.add(String(item.animeId)); });

    completedItems.forEach((item) => {
      const sKey = String(item.animeId || item.animeTitle);
      if (!seriesMap.has(sKey)) {
        seriesMap.set(sKey, {
          animeId: sKey, animeTitle: item.animeTitle || 'Unknown', coverImage: item.localPosterUri || item.coverImage || item.backdrop || '',
          backdrop: item.localThumbUri || item.backdrop || item.coverImage || '', genres: Array.isArray(item.genres) && item.genres.length > 0 ? item.genres : ['Action', 'Adventure'],
          synopsis: item.synopsis || `${item.animeTitle} offline episodes saved with subtitles and cover art.`,
          totalEpisodes: item.totalEpisodes || completedItems.length, episodes: [],
        });
      }
      seriesMap.get(sKey).episodes.push(item);
    });

    const groups = Array.from(seriesMap.values()).map((g) => ({ ...g, episodes: g.episodes.sort((a, b) => Number(a.episodeNum) - Number(b.episodeNum)) }));
    const allPaused = activeItems.length > 0 && activeItems.every((item) => {
      const liveJob = jobsMap[item.id];
      return liveJob ? liveJob.isPaused : item.status === 'paused';
    });

    return { activeDownloadList: activeItems, downloadedSeriesGroups: groups, readyCount: completedItems.length, inQueueCount: activeItems.length, seriesCount: allSeriesIds.size, areAllActivePaused: allPaused };
  }, [queueItems, jobsMap]);

  useEffect(() => {
    if (hasSetInitialTab.current && activeDownloadList.length === 0 && activeTab === 'downloading') setActiveTab('downloaded');
  }, [activeDownloadList.length]);

  // =========================================================
  // APP-STACK NAVIGATION (BREAKS OUT OF BOTTOM NAV)
  // =========================================================
  const handleOpenSeriesPlayScreen = (series) => {
    if (!series) return;
    setMenuTarget(null);

    const animePayload = {
      id: series.animeId, animeId: series.animeId, title: series.animeTitle, name: series.animeTitle, animeTitle: series.animeTitle,
      poster: series.coverImage, img: series.coverImage, image: series.coverImage, coverImage: series.coverImage,
      backdrop: series.backdrop || series.coverImage, bannerImage: series.backdrop || series.coverImage, synopsis: series.synopsis,
      description: series.synopsis, genres: series.genres, totalEpisodes: series.totalEpisodes, offlineEpisodes: series.episodes, isOffline: true,
    };

    if (navigation && navigation.navigate) {
      navigation.navigate('Play', { anime: animePayload, user: resolvedUser, activeProfile: resolvedProfile, activeProfileId: resolvedProfileId });
    } else if (typeof onOpenPlay === 'function') { 
      onOpenPlay(animePayload); 
    } else if (typeof onSelectAnime === 'function') { 
      onSelectAnime(animePayload); 
    } else {
      setActivePlaySeries(animePayload);
    }
  };

  const handleOpenPlayerOnTop = async (epItem) => {
    if (!epItem) return;
    setMenuTarget(null);
    const streamSource = epItem.localUri || epItem.streamUri;
    if (!streamSource) return;

    try {
      StatusBar.setHidden(true, 'none');
      if (Platform.OS === 'android' && NavigationBar?.setVisibilityAsync) {
        await NavigationBar.setVisibilityAsync('hidden');
        await NavigationBar.setBehaviorAsync('overlay-swipe');
      }
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } catch (_) {}

    const playbackPayload = {
      activeUrl: streamSource, streamUrl: streamSource, localUri: epItem.localUri || null, localMetaUri: epItem.localMetaUri || null,
      localSubtitleUri: epItem.localSubtitleUri || null, animeTitle: epItem.animeTitle, animeBackdrop: epItem.localThumbUri || epItem.backdrop || epItem.coverImage,
      coverImage: epItem.localPosterUri || epItem.coverImage || epItem.backdrop, episodeNum: Number(epItem.episodeNum), episodeTitle: epItem.episodeTitle,
      animeId: epItem.animeId, slug: epItem.slug, quality: epItem.quality || '1080p', progress: 0, userUid: resolvedUid, activeProfileId: resolvedProfileId,
      targetType: epItem.audioType || 'sub', isOffline: Boolean(epItem.localUri),
    };

    if (navigation && navigation.navigate) {
      navigation.navigate('Player', playbackPayload);
    } else {
      setTopLevelPlayback(playbackPayload); 
    }
  };

  const handleCloseTopPlayer = async () => {
    setTopLevelPlayback(null);
    try {
      StatusBar.setHidden(true, 'none');
      if (Platform.OS === 'android' && NavigationBar?.setVisibilityAsync) {
        await NavigationBar.setVisibilityAsync('hidden');
      }
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } catch (_) {}
  };

  const handlePauseOrResumeAllDownloading = async () => {
    if (activeDownloadList.length === 0) return;
    const shouldPauseAll = !areAllActivePaused;
    for (const item of activeDownloadList) await handleTogglePauseJob(item.id, shouldPauseAll);
    const updated = await readLocalQueue();
    setQueueItems(updated);
  };

  const handleDeleteAllDownloaded = () => {
    const completedItems = queueItems.filter((i) => i.status === 'completed');
    if (completedItems.length === 0) return;
    setConfirmDialog({
      title: 'Delete All Downloaded',
      message: `Are you sure you want to permanently delete all ${completedItems.length} downloaded ${completedItems.length === 1 ? 'episode' : 'episodes'} from your device?`,
      confirmText: 'Delete All',
      onConfirm: async () => {
        setConfirmDialog(null);
        for (const ep of completedItems) await handleCancelJob(ep.id);
        const remaining = await readLocalQueue();
        setQueueItems(remaining);
      },
    });
  };

  const handleDeleteEntireSeries = (series) => {
    if (!series || !Array.isArray(series.episodes)) return;
    setMenuTarget(null);
    setConfirmDialog({
      title: 'Delete Series',
      message: `Delete all ${series.episodes.length} downloaded ${series.episodes.length === 1 ? 'episode' : 'episodes'} of "${series.animeTitle}"?`,
      confirmText: 'Delete Series',
      onConfirm: async () => {
        setConfirmDialog(null);
        for (const ep of series.episodes) await handleCancelJob(ep.id);
        const remaining = await readLocalQueue();
        setQueueItems(remaining);
      },
    });
  };

  const handleDeleteEpisode = (epItem) => {
    if (!epItem) return;
    if (Array.isArray(epItem.episodes)) { handleDeleteEntireSeries(epItem); return; }
    setMenuTarget(null);
    const isCompleted = epItem.status === 'completed';
    setConfirmDialog({
      title: isCompleted ? 'Delete Download' : 'Cancel Download',
      message: isCompleted ? `Remove "${epItem.animeTitle} - Episode ${epItem.episodeNum}" from offline storage?` : `Stop downloading "${epItem.animeTitle} - Episode ${epItem.episodeNum}" and remove partial files?`,
      confirmText: isCompleted ? 'Delete' : 'Cancel Download',
      onConfirm: async () => {
        setConfirmDialog(null);
        await handleCancelJob(epItem.id);
        const updated = await readLocalQueue();
        setQueueItems(updated);
      },
    });
  };

  const toggleBookmarkWatchlist = async (animeItem) => {
    if (!animeItem || !resolvedUid) return;
    const animeDocId = String(animeItem.animeId);
    const ref = firestore().collection('users').doc(String(resolvedUid)).collection('library').doc(animeDocId);
    try {
      if (watchlistMap[animeDocId]) await ref.delete();
      else await ref.set({
        id: animeDocId, animeId: animeDocId, title: animeItem.animeTitle, img: animeItem.localPosterUri || animeItem.coverImage || animeItem.backdrop || '',
        backdrop: animeItem.localThumbUri || animeItem.backdrop || animeItem.coverImage || '', profileId: resolvedProfileId, addedAt: Date.now(),
      }, { merge: true });
      setMenuTarget(null);
    } catch (_) {}
  };


  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />

      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backTouch} activeOpacity={0.75} onPress={() => { if (onBack) onBack(); else navigation?.goBack?.(); }}>
          <IconChevronLeft size={22} color={WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitleText} numberOfLines={1}>Downloads</Text>
        <TouchableOpacity style={styles.settingsIconTouch} onPress={() => setShowSettings(true)} activeOpacity={0.7}>
          <IconSettings size={22} color={WHITE} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statColumn}><Text style={styles.statNumber}>{readyCount}</Text><Text style={styles.statLabel}>READY OFFLINE</Text></View>
        <View style={styles.statDivider} />
        <View style={styles.statColumn}><Text style={styles.statNumber}>{inQueueCount}</Text><Text style={styles.statLabel}>IN QUEUE</Text></View>
        <View style={styles.statDivider} />
        <View style={styles.statColumn}><Text style={styles.statNumber}>{seriesCount}</Text><Text style={styles.statLabel}>SERIES</Text></View>
      </View>

      <View style={styles.tabsBarContainer}>
        <TouchableOpacity style={[styles.tabPillBtn, activeTab === 'downloading' && styles.tabPillBtnActive]} activeOpacity={0.85} onPress={() => setActiveTab('downloading')}>
          <Text style={[styles.tabPillText, activeTab === 'downloading' && styles.tabPillTextActive]}>Downloading ({activeDownloadList.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabPillBtn, activeTab === 'downloaded' && styles.tabPillBtnActive]} activeOpacity={0.85} onPress={() => setActiveTab('downloaded')}>
          <Text style={[styles.tabPillText, activeTab === 'downloaded' && styles.tabPillTextActive]}>Downloaded ({readyCount})</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.fullDividerLine} />

      {activeTab === 'downloading' && (
        <View style={{ flex: 1 }}>
          {activeDownloadList.length > 0 && (
            <View style={styles.bulkActionBar}>
              <Text style={styles.bulkActionInfoText}>{activeDownloadList.length} {activeDownloadList.length === 1 ? 'Episode' : 'Episodes'} Active</Text>
              <TouchableOpacity style={styles.pauseAllBtn} activeOpacity={0.85} onPress={handlePauseOrResumeAllDownloading}>
                {areAllActivePaused ? <IconPlay size={14} color={WHITE} /> : <IconPause size={14} color={WHITE} />}
                <Text style={styles.pauseAllBtnText}>{areAllActivePaused ? 'Resume All' : 'Pause All'}</Text>
              </TouchableOpacity>
            </View>
          )}

          <FlatList
            data={activeDownloadList}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.scrollPadding}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<View style={styles.emptyWrap}><Text style={styles.emptyText}>No episodes currently downloading</Text></View>}
            renderItem={({ item: dlItem }) => {
              const liveJob = jobsMap[dlItem.id];
              const currentPct = liveJob ? liveJob.pct : dlItem.progressPct || 0;
              const currentBytes = liveJob ? liveJob.downloadedBytes : dlItem.sizeBytes || 0;
              const totalBytes = liveJob ? liveJob.estimatedTotalBytes : dlItem.estimatedTotalBytes || 100 * 1024 * 1024;
              const isItemPaused = liveJob ? liveJob.isPaused : dlItem.status === 'paused';

              return (
                <View style={[styles.mainCard, { marginBottom: 12 }]}>
                  <View style={styles.posterContainer}><ProxyImage source={{ uri: dlItem.localPosterUri || dlItem.coverImage || dlItem.backdrop }} style={styles.posterImage} resizeMode="cover" /></View>
                  <View style={styles.cardRightCol}>
                    <View style={styles.titleAndDotsRow}>
                      <Text style={styles.animeMainTitle} numberOfLines={1}>{dlItem.animeTitle}</Text>
                      <TouchableOpacity style={styles.dotsBtn} onPress={() => setMenuTarget(dlItem)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <IconDotsVertical size={18} color={WHITE} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.episodeSubLabel} numberOfLines={1}>Episode {dlItem.episodeNum} : {dlItem.episodeTitle || `Episode ${dlItem.episodeNum}`}</Text>
                    <View style={styles.outlinedPillsRow}>
                      <View style={styles.outlinedPill}><Text style={styles.outlinedPillText}>{dlItem.quality || '1080p'}</Text></View>
                      <View style={styles.outlinedPill}><Text style={styles.outlinedPillText} numberOfLines={1}>{(dlItem.subtitle?.label || 'English').split(' ')[0]}</Text></View>
                      <View style={styles.outlinedPill}><Text style={styles.outlinedPillText}>{dlItem.audioType === 'dub' ? 'Dub' : 'Sub'}</Text></View>
                    </View>
                    <View style={styles.progressSection}>
                      <View style={styles.progressLabelRow}>
                        <Text style={styles.statusMiniText}>{isItemPaused ? 'PAUSED' : `${currentPct}%`}</Text>
                        <Text style={styles.mbRatioText}>{formatMbRatio(currentBytes, totalBytes)}</Text>
                      </View>
                      <View style={styles.thinProgressBg}><View style={[styles.thinProgressFill, { width: `${currentPct}%` }]} /></View>
                    </View>
                    <View style={styles.whiteBtnsRow}>
                      <TouchableOpacity style={styles.whiteActionBtn} activeOpacity={0.85} onPress={() => handleTogglePauseJob(dlItem.id)}><Text style={styles.whiteActionBtnText}>{isItemPaused ? 'resume' : 'pause'}</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.whiteActionBtn} activeOpacity={0.85} onPress={() => handleDeleteEpisode(dlItem)}><Text style={styles.whiteActionBtnText}>Cancel</Text></TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        </View>
      )}

      {/* --- DOWNLOADED SERIES LIST ONLY --- */}
      {activeTab === 'downloaded' && (
        <View style={{ flex: 1 }}>
          {downloadedSeriesGroups.length > 0 && (
            <View style={styles.bulkActionBar}>
              <Text style={styles.bulkActionInfoText}>{downloadedSeriesGroups.length} {downloadedSeriesGroups.length === 1 ? 'Series' : 'Series'} • {readyCount} {readyCount === 1 ? 'Episode' : 'Episodes'}</Text>
              <TouchableOpacity style={styles.deleteAllDownloadedBtn} activeOpacity={0.85} onPress={handleDeleteAllDownloaded}>
                <IconTrash size={14} color={PURE_RED} />
                <Text style={styles.deleteAllDownloadedText}>Delete All</Text>
              </TouchableOpacity>
            </View>
          )}

          <FlatList
            data={downloadedSeriesGroups}
            keyExtractor={(item) => String(item.animeId)}
            contentContainerStyle={styles.scrollPadding}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<View style={styles.emptyWrap}><Text style={styles.emptyText}>No downloaded anime yet</Text></View>}
            renderItem={({ item: series }) => (
              <TouchableOpacity 
                style={[styles.mainCard, { marginBottom: 14 }]} 
                activeOpacity={0.88} 
                onPress={() => handleOpenSeriesPlayScreen(series)} 
                onLongPress={() => handleDeleteEntireSeries(series)}
              >
                <View style={styles.posterContainer}><ProxyImage source={{ uri: series.coverImage || series.backdrop }} style={styles.posterImage} resizeMode="cover" /></View>
                <View style={styles.cardRightCol}>
                  <View style={styles.titleAndDotsRow}>
                    <Text style={styles.animeMainTitle} numberOfLines={1}>{series.animeTitle}</Text>
                    <TouchableOpacity style={styles.dotsBtn} onPress={(e) => { e?.stopPropagation?.(); setMenuTarget(series); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconDotsVertical size={18} color={WHITE} />
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.outlinedPillsRow, { marginTop: 6 }]}>
                    {series.genres.slice(0, 3).map((genre, idx) => (
                      <View key={idx} style={styles.outlinedPill}><Text style={styles.outlinedPillText}>{genre}</Text></View>
                    ))}
                  </View>
                  <Text style={styles.seriesSynopsisText} numberOfLines={3}>{series.synopsis}</Text>
                  <View style={styles.viewEpisodesFooterRow}>
                    <Text style={styles.episodesCountBottomText}>{series.episodes.length} {series.episodes.length === 1 ? 'Episode' : 'Episodes'} Saved</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* --- SETTINGS BOTTOM SHEET --- */}
      {showSettings && (
        <View style={styles.absoluteOverlay}>
          <TouchableOpacity style={styles.overlayBackground} activeOpacity={1} onPress={() => setShowSettings(false)} />
          <View style={styles.bottomSheetWrapper}>
            <View style={styles.bottomSheetCard}>
              <Text style={styles.sheetTitle}>Download Settings</Text>
              <View style={styles.settingsRow}>
                <Text style={styles.settingsLabel}>Download over Wi-Fi only</Text>
                <Switch value={wifiOnly} onValueChange={setWifiOnly} trackColor={{ false: BORDER_GREY, true: PURE_RED }} thumbColor={WHITE} />
              </View>
              <View style={styles.settingsRow}>
                <Text style={styles.settingsLabel}>Total Download Storage</Text>
                <Text style={styles.settingsValue}>{((queueItems.reduce((acc, item) => acc + (item.sizeBytes || 0), 0)) / (1024 * 1024)).toFixed(2)} MB</Text>
              </View>
              <TouchableOpacity style={styles.settingsCloseBtn} activeOpacity={0.8} onPress={() => setShowSettings(false)}>
                <Text style={styles.settingsCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* --- "⋮" MENU ACTION SHEET --- */}
      {Boolean(menuTarget) && (
        <View style={styles.absoluteOverlay}>
          <TouchableOpacity style={styles.overlayBackground} activeOpacity={1} onPress={() => setMenuTarget(null)} />
          <View style={styles.bottomSheetWrapper}>
            <View style={styles.bottomSheetCard}>
              <Text style={styles.sheetTitle} numberOfLines={1}>{menuTarget.animeTitle} {menuTarget.episodeNum ? `• Episode ${menuTarget.episodeNum}` : ''}</Text>

              {Array.isArray(menuTarget.episodes) && (
                <TouchableOpacity style={styles.sheetOptionRow} activeOpacity={0.8} onPress={() => handleOpenSeriesPlayScreen(menuTarget)}>
                  <IconPlay size={18} color={WHITE} />
                  <Text style={styles.sheetOptionText}>See All Downloaded Episodes</Text>
                </TouchableOpacity>
              )}

              {menuTarget.status === 'completed' && !Array.isArray(menuTarget.episodes) && (
                <TouchableOpacity style={styles.sheetOptionRow} activeOpacity={0.8} onPress={() => handleOpenPlayerOnTop(menuTarget)}>
                  <IconPlay size={18} color={WHITE} />
                  <Text style={styles.sheetOptionText}>Play Episode</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.sheetOptionRow} activeOpacity={0.8} onPress={() => toggleBookmarkWatchlist(menuTarget)}>
                <IconBookmark size={18} color={WHITE} filled={Boolean(watchlistMap[String(menuTarget.animeId)])} />
                <Text style={styles.sheetOptionText}>{watchlistMap[String(menuTarget.animeId)] ? 'Remove from User List' : 'Add to User List'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetOptionRow} activeOpacity={0.8} onPress={() => handleDeleteEpisode(menuTarget)}>
                <View style={styles.binIconWrap}><IconTrash size={18} color={PURE_RED} /></View>
                <Text style={[styles.sheetOptionText, { color: PURE_RED, marginLeft: -8 }]}>
                  {Array.isArray(menuTarget.episodes) ? 'Delete Entire Series' : menuTarget.status === 'completed' ? 'Delete Download' : 'Cancel Download'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* --- CONFIRMATION POPUP --- */}
      {Boolean(confirmDialog) && (
        <View style={styles.absoluteOverlay}>
          <TouchableOpacity style={styles.overlayBackground} activeOpacity={1} onPress={() => setConfirmDialog(null)} />
          <View style={styles.bottomSheetWrapper}>
            <View style={styles.bottomSheetCard}>
              <View style={{ alignItems: 'center' }}>
                <View style={styles.confirmIconWrap}><IconTrash size={22} color={PURE_RED} /></View>
                <Text style={styles.confirmPopupTitle}>{confirmDialog.title}</Text>
                <Text style={styles.confirmPopupMessage}>{confirmDialog.message}</Text>
                <View style={styles.confirmBtnsRow}>
                  <TouchableOpacity style={styles.confirmCancelBtn} activeOpacity={0.85} onPress={() => setConfirmDialog(null)}>
                    <Text style={styles.confirmCancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmDangerBtn} activeOpacity={0.85} onPress={confirmDialog.onConfirm}>
                    <Text style={styles.confirmDangerBtnText}>{confirmDialog.confirmText || 'Delete'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* --- FALLBACK PLAY.JS --- */}
      {Boolean(activePlaySeries) && (
        <View style={styles.fullScreenPlayerOverlay}>
          <StatusBar hidden={true} translucent={true} backgroundColor="transparent" />
          <PlayScreen
            anime={activePlaySeries}
            route={{ params: { anime: activePlaySeries, ...activePlaySeries } }}
            navigation={{ ...(navigation || {}), goBack: () => setActivePlaySeries(null) }}
            user={resolvedUser}
            activeProfile={resolvedProfile}
            activeProfileId={resolvedProfileId}
          />
        </View>
      )}

      {/* --- FALLBACK VIDEO PLAYER --- */}
      {Boolean(topLevelPlayback) && (
        <View style={styles.fullScreenPlayerOverlay}>
          <StatusBar hidden={true} translucent={true} backgroundColor="transparent" />
          <Player
            route={{ params: topLevelPlayback }}
            navigation={{ goBack: handleCloseTopPlayer }}
            user={resolvedUser}
            activeProfile={resolvedProfile}
            activeProfileId={resolvedProfileId}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BLACK,
  },
  absoluteOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    justifyContent: 'flex-end',
  },
  overlayBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  bottomSheetWrapper: {
    width: '100%',
  },
  fullScreenPlayerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
    backgroundColor: BLACK,
  },
  bottomSheetCard: {
    width: '100%',
    backgroundColor: BLACK,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderColor: BORDER_GREY,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 36, paddingBottom: 14, paddingHorizontal: 18 },
  backTouch: { paddingRight: 12, paddingVertical: 4 },
  settingsIconTouch: { paddingLeft: 12, paddingVertical: 4 },
  headerTitleText: { color: WHITE, fontSize: 21, fontWeight: '800', letterSpacing: 0.3, flex: 1 },
  statsContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: DARK_GREY, marginHorizontal: 16, borderRadius: 12, paddingVertical: 13, borderWidth: 1, borderColor: BORDER_GREY },
  statColumn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statNumber: { color: WHITE, fontSize: 16, fontWeight: '800', marginBottom: 4 },
  statLabel: { color: TEXT_GREY, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  statDivider: { width: 1, height: 28, backgroundColor: BORDER_GREY },
  tabsBarContainer: { flexDirection: 'row', marginHorizontal: 16, marginTop: 14, backgroundColor: DARK_GREY, borderRadius: 10, padding: 4, borderWidth: 1, borderColor: BORDER_GREY },
  tabPillBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  tabPillBtnActive: { backgroundColor: PURE_RED },
  tabPillText: { color: TEXT_GREY, fontSize: 13, fontWeight: '800' },
  tabPillTextActive: { color: WHITE, fontWeight: '900' },
  fullDividerLine: { height: 1, backgroundColor: DARK_GREY, marginTop: 14 },
  bulkActionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  bulkActionInfoText: { color: TEXT_GREY, fontSize: 12, fontWeight: '700' },
  pauseAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DARK_GREY, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: BORDER_GREY },
  pauseAllBtnText: { color: WHITE, fontSize: 12, fontWeight: '800' },
  deleteAllDownloadedBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DARK_GREY, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: BORDER_GREY },
  deleteAllDownloadedText: { color: PURE_RED, fontSize: 12, fontWeight: '800' },
  scrollPadding: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 110 },
  mainCard: { flexDirection: 'row', backgroundColor: BLACK, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: BORDER_GREY },
  posterContainer: { width: 105, height: 152, borderRadius: 10, overflow: 'hidden', backgroundColor: DARK_GREY },
  posterImage: { width: '100%', height: '100%' },
  cardRightCol: { flex: 1, marginLeft: 14, justifyContent: 'space-between', paddingVertical: 2 },
  titleAndDotsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  animeMainTitle: { color: WHITE, fontSize: 17, fontWeight: '800', flex: 1, paddingRight: 6 },
  dotsBtn: { padding: 4 },
  episodeSubLabel: { color: TEXT_GREY, fontSize: 13, fontWeight: '600', marginTop: 2 },
  outlinedPillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  outlinedPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: BORDER_GREY, backgroundColor: DARK_GREY },
  outlinedPillText: { color: TEXT_GREY, fontSize: 11, fontWeight: '600' },
  progressSection: { marginTop: 8 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  statusMiniText: { color: PURE_RED, fontSize: 10, fontWeight: '800' },
  mbRatioText: { color: TEXT_GREY, fontSize: 10, fontWeight: '600' },
  thinProgressBg: { width: '100%', height: 3, backgroundColor: DARK_GREY, borderRadius: 2, overflow: 'hidden' },
  thinProgressFill: { height: '100%', backgroundColor: PURE_RED },
  whiteBtnsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  whiteActionBtn: { backgroundColor: WHITE, paddingVertical: 6, paddingHorizontal: 18, borderRadius: 5, minWidth: 78, alignItems: 'center', justifyContent: 'center' },
  whiteActionBtnText: { color: BLACK, fontSize: 13, fontWeight: '700' },
  seriesSynopsisText: { color: TEXT_GREY, fontSize: 11.5, lineHeight: 16, fontWeight: '500', marginTop: 8 },
  viewEpisodesFooterRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  episodesCountBottomText: { color: WHITE, fontSize: 12, fontWeight: '800' },
  emptyWrap: { paddingVertical: 70, alignItems: 'center' },
  emptyText: { color: TEXT_GREY, fontSize: 14, fontWeight: '600' },
  sheetTitle: { color: WHITE, fontSize: 16, fontWeight: '800', marginBottom: 20 },
  sheetOptionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: BORDER_GREY },
  sheetOptionText: { color: WHITE, fontSize: 14, fontWeight: '700' },
  binIconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: DARK_GREY, borderWidth: 1, borderColor: BORDER_GREY, alignItems: 'center', justifyContent: 'center' },
  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER_GREY },
  settingsLabel: { color: WHITE, fontSize: 14, fontWeight: '600' },
  settingsValue: { color: TEXT_GREY, fontSize: 14, fontWeight: '700' },
  settingsCloseBtn: { marginTop: 24, backgroundColor: PURE_RED, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  settingsCloseBtnText: { color: WHITE, fontSize: 14, fontWeight: '800' },
  confirmIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: DARK_GREY, borderWidth: 1, borderColor: BORDER_GREY, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  confirmPopupTitle: { color: WHITE, fontSize: 18, fontWeight: '800', textAlign: 'center', letterSpacing: 0.2 },
  confirmPopupMessage: { color: TEXT_GREY, fontSize: 13, lineHeight: 20, fontWeight: '500', textAlign: 'center', marginTop: 10, marginBottom: 24 },
  confirmBtnsRow: { flexDirection: 'row', width: '100%', gap: 12 },
  confirmCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 9, backgroundColor: DARK_GREY, borderWidth: 1, borderColor: BORDER_GREY, alignItems: 'center', justifyContent: 'center' },
  confirmCancelBtnText: { color: WHITE, fontSize: 13, fontWeight: '700' },
  confirmDangerBtn: { flex: 1, paddingVertical: 13, borderRadius: 9, backgroundColor: PURE_RED, alignItems: 'center', justifyContent: 'center' },
  confirmDangerBtnText: { color: WHITE, fontSize: 13, fontWeight: '800' },
});
