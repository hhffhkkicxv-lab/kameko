import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, FlatList, 
  TouchableOpacity, Animated, Modal, StatusBar 
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import * as NavigationBar from 'expo-navigation-bar';
import Svg, { Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';

import ProxyImage from '../../components/ProxyImage';
import Player from '../pages/play/player';

const BRAND_RED = '#E50914';
const PURE_RED = '#FF0000';
const WATCH_HISTORY_COLLECTION = 'watch_history';

// --- Helper for Timestamp Formatting ---
const formatSeconds = (seconds) => {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const totalSecs = Math.floor(seconds);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSecs % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
};

// --- Helper to Enforce Immersive Fullscreen Bars ---
const hideSystemBarsForPlayer = async () => {
  try {
    StatusBar.setHidden(true, 'none');
    await NavigationBar.setVisibilityAsync('hidden');
    await NavigationBar.setBehaviorAsync('overlay-swipe');
  } catch (_) {}
};

// --- Premium SVGs (Play SVG Removed) ---
const IconClose = ({ size = 15, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

const IconTrash = ({ size = 15, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </Svg>
);

// --- Individual Animated Card Component (No Center Play SVG) ---
const ContinueCard = ({ item, onPlayCard, onRequestDeleteCard }) => {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const animeId = String(item.animeId || item.id || '');
  const displayTitle = item.animeTitle || item.title || `Anime ${animeId}`;
  const epNum = item.episodeNum ?? item.lastWatchedEp ?? 1;
  const rawEpTitle = item.episodeTitle || item.epTitle || '';
  const hasDistinctEpTitle = rawEpTitle && rawEpTitle.toLowerCase() !== `episode ${epNum}`;
  const displayEpLabel = hasDistinctEpTitle ? `Ep ${epNum} • ${rawEpTitle}` : `Episode ${epNum}`;
  const displayBackdrop =
    item.backdropUrl ||
    item.backdrop ||
    'https://via.placeholder.com/640x360/1a1a1a/ffffff?text=Loading...';

  const progressSecs = Number(item.progress || 0);
  const durationSecs = Number(item.duration || 0);
  const progressPct = durationSecs > 0 ? Math.min((progressSecs / durationSecs) * 100, 100) : 0;
  const currentTimeStr = item.formattedTimestamp || formatSeconds(progressSecs);
  const totalTimeStr = item.formattedDuration || formatSeconds(durationSecs);

  return (
    <Animated.View style={[styles.cardWrapper, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity 
        style={styles.cardContent} 
        activeOpacity={0.88} 
        onPress={() => onPlayCard(item)}
      >
        <ProxyImage 
          source={{ uri: displayBackdrop }} 
          style={styles.backdropImage} 
          resizeMode="cover" 
        />

        {/* Dark Gradient Overlay for Text Legibility */}
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Defs>
            <LinearGradient id="botGrad" x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0" stopColor="#000000" stopOpacity="0.94" />
              <Stop offset="0.55" stopColor="#000000" stopOpacity="0.38" />
              <Stop offset="1" stopColor="#000000" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#botGrad)" />
        </Svg>

        {/* Top Right "X" Button -> Opens Delete Confirmation Popup */}
        <TouchableOpacity
          style={styles.cutBtn}
          activeOpacity={0.75}
          onPress={() => onRequestDeleteCard(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconClose />
        </TouchableOpacity>

        {/* Bottom Details, Episode Title, Timestamps & Progress Bar */}
        <View style={styles.bottomData}>
          <Text style={styles.animeTitle} numberOfLines={1}>{displayTitle}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.epSubTitle} numberOfLines={1}>
              {displayEpLabel}
            </Text>
            <Text style={styles.timestampText}>
              {currentTimeStr}{durationSecs > 0 ? ` / ${totalTimeStr}` : ''}
            </Text>
          </View>

          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function ContinueWatching({
  user: propUser,
  activeProfile: propActiveProfile,
  currentProfile: propCurrentProfile,
  activeProfileId: propActiveProfileId,
}) {
  const resolvedUser = propUser || auth().currentUser || null;
  const resolvedProfile = propActiveProfile || propCurrentProfile || null;
  const resolvedUid = resolvedUser?.uid ? String(resolvedUser.uid) : null;
  const resolvedProfileId =
    propActiveProfileId ||
    resolvedProfile?.id ||
    resolvedProfile?.profileId ||
    null;

  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Confirmation Popup Modal State: { visible: boolean, mode: 'single' | 'all', targetItem: object | null }
  const [confirmPopup, setConfirmPopup] = useState({
    visible: false,
    mode: 'single',
    targetItem: null,
  });
  const [isDeleting, setIsDeleting] = useState(false);

  // Fullscreen Direct Player Modal State
  const [directPlayback, setDirectPlayback] = useState(null);

  // Keep notification bar and phone's bottom navigation bar hidden while Player is open
  useEffect(() => {
    if (directPlayback) {
      hideSystemBarsForPlayer();
    }
  }, [directPlayback]);

  // Listen to Firebase Watch History Collection & Deduplicate by animeId
  useEffect(() => {
    if (!resolvedUid || !resolvedProfileId) {
      setHistoryList([]);
      setLoading(false);
      return;
    }

    const unsubscribe = firestore()
      .collection('users')
      .doc(String(resolvedUid))
      .collection('profiles')
      .doc(String(resolvedProfileId))
      .collection(WATCH_HISTORY_COLLECTION)
      .orderBy('timestamp', 'desc')
      .limit(40)
      .onSnapshot(async (snap) => {
        if (!snap || snap.empty) {
          setHistoryList([]);
          setLoading(false);
          return;
        }

        // Deduplicate so series doc (`{animeId}`) and episode doc (`{animeId}_ep_{num}`) never create two cards
        const uniqueSeriesMap = new Map();

        snap.forEach(doc => {
          const data = doc.data();
          if (!data) return;

          // Extract canonical animeId (strip `_ep_...` suffix if doc.id was used as fallback)
          const rawId = String(data.animeId || doc.id || '');
          const canonicalAnimeId = rawId.includes('_ep_') ? rawId.split('_ep_')[0] : rawId;
          if (!canonicalAnimeId) return;

          const existing = uniqueSeriesMap.get(canonicalAnimeId);
          const itemTime = Number(data.timestamp || 0);

          if (!existing || itemTime > Number(existing.timestamp || 0)) {
            uniqueSeriesMap.set(canonicalAnimeId, {
              ...data,
              docId: doc.id,
              animeId: canonicalAnimeId,
            });
          }
        });

        // Filter out finished episodes and cap at 12 cards
        const deduplicated = Array.from(uniqueSeriesMap.values())
          .filter(item => !item.finishedEp && Number(item.progress || 0) > 0)
          .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
          .slice(0, 12);

        // Enrich with AniList metadata if backdrop or title is missing
        const enriched = await Promise.all(deduplicated.map(async (item) => {
          let backdropUrl = item.backdropUrl || item.backdrop;
          let animeTitle = item.animeTitle || item.title;

          if (!backdropUrl) {
            try {
              const cleanSearch = String(item.animeId).replace(/-/g, ' ');
              const query = `query ($search: String) { Media (search: $search, type: ANIME) { title { romaji english } bannerImage coverImage { extraLarge } } }`;
              const aniRes = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, variables: { search: cleanSearch } })
              });
              const aniData = await aniRes.json();

              if (aniData?.data?.Media) {
                backdropUrl = aniData.data.Media.bannerImage || aniData.data.Media.coverImage?.extraLarge;
                animeTitle = animeTitle || aniData.data.Media.title?.english || aniData.data.Media.title?.romaji;
              }
            } catch (_) {}
          }

          return { 
            ...item, 
            backdropUrl, 
            backdrop: backdropUrl, 
            animeTitle, 
            title: animeTitle 
          };
        }));

        setHistoryList(enriched);
        setLoading(false);
      }, (err) => {
        console.warn("Continue Watching listener error:", err);
        setLoading(false);
      });

    return () => unsubscribe();
  }, [resolvedUid, resolvedProfileId]);

  // --- DELETE SINGLE ANIME OR ALL CONTINUE WATCHING ITEMS ---
  const handleConfirmDelete = async () => {
    if (!resolvedUid || !resolvedProfileId || isDeleting) return;
    setIsDeleting(true);

    const profileRef = firestore()
      .collection('users')
      .doc(String(resolvedUid))
      .collection('profiles')
      .doc(String(resolvedProfileId));

    try {
      if (confirmPopup.mode === 'single' && confirmPopup.targetItem) {
        const targetAnimeId = String(confirmPopup.targetItem.animeId);

        // Optimistically remove from UI immediately
        setHistoryList(prev => prev.filter(i => String(i.animeId) !== targetAnimeId));

        const batch = firestore().batch();

        // 1. Delete root series documents (`{animeId}`)
        batch.delete(profileRef.collection(WATCH_HISTORY_COLLECTION).doc(targetAnimeId));
        batch.delete(profileRef.collection('progress').doc(targetAnimeId));

        // 2. Also delete all matching `{animeId}_ep_*` documents so the card never reappears
        const [whSnap, progSnap] = await Promise.all([
          profileRef
            .collection(WATCH_HISTORY_COLLECTION)
            .where('animeId', '==', targetAnimeId)
            .get(),
          profileRef
            .collection('progress')
            .where('animeId', '==', targetAnimeId)
            .get(),
        ]);

        whSnap?.forEach(doc => batch.delete(doc.ref));
        progSnap?.forEach(doc => batch.delete(doc.ref));

        await batch.commit();
      } else if (confirmPopup.mode === 'all') {
        // Optimistically clear UI list immediately
        setHistoryList([]);

        const [whAllSnap, progAllSnap] = await Promise.all([
          profileRef.collection(WATCH_HISTORY_COLLECTION).get(),
          profileRef.collection('progress').get(),
        ]);

        const allDocs = [
          ...(whAllSnap?.docs || []),
          ...(progAllSnap?.docs || []),
        ];

        // Commit in chunks of 400 to respect Firestore batch limits
        for (let i = 0; i < allDocs.length; i += 400) {
          const batch = firestore().batch();
          allDocs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }
    } catch (err) {
      console.warn('Error deleting watch history:', err);
    } finally {
      setIsDeleting(false);
      setConfirmPopup({ visible: false, mode: 'single', targetItem: null });
    }
  };

  // --- CLICKING A CARD OPENS PLAYER.JS DIRECTLY IN FULL IMMERSIVE MODE ---
  const handlePlayCardEpisode = async (item) => {
    if (!item) return;

    await hideSystemBarsForPlayer();

    const epNum = Number(item.episodeNum ?? item.lastWatchedEp ?? 1);
    const animeId = String(item.animeId || item.id || '');
    const displayTitle = item.animeTitle || item.title || 'Unknown';
    const displayBackdrop = item.backdropUrl || item.backdrop || '';
    const epTitle = item.episodeTitle || item.epTitle || `Episode ${epNum}`;

    setDirectPlayback({
      animeId: animeId,
      id: animeId,
      animeTitle: displayTitle,
      title: displayTitle,
      animeBackdrop: displayBackdrop,
      backdropUrl: displayBackdrop,
      backdrop: displayBackdrop,
      coverImage: displayBackdrop,
      episodeNum: epNum,
      episodeTitle: epTitle,
      epTitle: epTitle,
      slug: item.slug ? String(item.slug) : String(epNum),
      progress: Number(item.progress || 0),
      duration: Number(item.duration || 0),
      userUid: resolvedUid,
      activeProfileId: String(resolvedProfileId),
      activeProfile: resolvedProfile,
      currentProfile: resolvedProfile,
      targetType: item.audioType || 'sub',
    });
  };

  if (loading || historyList.length === 0) return null;

  return (
    <View style={styles.sectionContainer}>
      {/* Header Row with "Continue Watching" & "Delete All" Button */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Continue Watching</Text>

        <TouchableOpacity
          style={styles.deleteAllBtn}
          activeOpacity={0.75}
          onPress={() =>
            setConfirmPopup({ visible: true, mode: 'all', targetItem: null })
          }
        >
          <IconTrash size={13} color={PURE_RED} />
          <Text style={styles.deleteAllBtnText}>Delete All</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={historyList}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => String(item.animeId)}
        contentContainerStyle={styles.listPadding}
        snapToInterval={280} 
        decelerationRate="fast"
        renderItem={({ item }) => (
          <ContinueCard 
            item={item} 
            onPlayCard={handlePlayCardEpisode}
            onRequestDeleteCard={(target) =>
              setConfirmPopup({ visible: true, mode: 'single', targetItem: target })
            }
          />
        )}
      />

      {/* --- DELETE CONFIRMATION POPUP MODAL --- */}
      <Modal
        visible={confirmPopup.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() =>
          setConfirmPopup({ visible: false, mode: 'single', targetItem: null })
        }
      >
        <View style={styles.popupBackdrop}>
          <View style={styles.popupContainer}>
            <Text style={styles.popupTitle}>
              {confirmPopup.mode === 'all'
                ? 'Clear Watch History?'
                : 'Remove from Continue Watching?'}
            </Text>

            <Text style={styles.popupSubtitle}>
              {confirmPopup.mode === 'all'
                ? 'This will remove all anime episodes from your Continue Watching history for this profile.'
                : `Remove "${confirmPopup.targetItem?.animeTitle || confirmPopup.targetItem?.title || 'this anime'}" from your watch history?`}
            </Text>

            <View style={styles.popupActionsRow}>
              <TouchableOpacity
                style={styles.popupCancelBtn}
                activeOpacity={0.8}
                disabled={isDeleting}
                onPress={() =>
                  setConfirmPopup({ visible: false, mode: 'single', targetItem: null })
                }
              >
                <Text style={styles.popupCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.popupDeleteBtn}
                activeOpacity={0.85}
                disabled={isDeleting}
                onPress={handleConfirmDelete}
              >
                <IconTrash size={14} color="#FFF" />
                <Text style={styles.popupDeleteText}>
                  {isDeleting
                    ? 'Deleting...'
                    : confirmPopup.mode === 'all'
                      ? 'Delete All'
                      : 'Delete'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- DIRECT IMMERSIVE FULLSCREEN PLAYER MODAL (Hides Notification Bar & Bottom Nav) --- */}
      <Modal
        visible={Boolean(directPlayback)}
        animationType="fade"
        transparent={false}
        hardwareAccelerated={true}
        statusBarTranslucent={true}
        onShow={hideSystemBarsForPlayer}
        onRequestClose={() => setDirectPlayback(null)}
      >
        <View style={styles.fullscreenPlayerContainer}>
          <StatusBar hidden={true} translucent={true} backgroundColor="transparent" />
          {directPlayback && (
            <Player
              route={{ params: directPlayback }}
              navigation={{ goBack: () => setDirectPlayback(null) }}
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
  sectionContainer: { marginTop: 5, marginBottom: 25 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    borderLeftWidth: 3,
    borderLeftColor: BRAND_RED,
    paddingLeft: 8,
  },
  deleteAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 0, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 0, 0, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  deleteAllBtnText: {
    color: PURE_RED,
    fontSize: 12,
    fontWeight: '800',
  },
  listPadding: { paddingHorizontal: 20 },

  cardWrapper: { width: 265, height: 150, marginRight: 15, borderRadius: 8, overflow: 'hidden' },
  cardContent: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  backdropImage: { width: '100%', height: '100%', opacity: 0.9 },

  cutBtn: { 
    position: 'absolute', 
    top: 8, 
    right: 8, 
    width: 28, 
    height: 28, 
    backgroundColor: 'rgba(0,0,0,0.68)', 
    borderRadius: 14, 
    justifyContent: 'center', 
    alignItems: 'center', 
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)'
  },

  bottomData: { position: 'absolute', bottom: 0, width: '100%', padding: 12, paddingTop: 30, zIndex: 6 },
  animeTitle: { color: '#FFF', fontSize: 13, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 4, marginBottom: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7, gap: 8 },
  epSubTitle: { flex: 1, color: '#CCC', fontSize: 11, fontWeight: '600' },
  timestampText: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontFamily: 'monospace', fontWeight: '700' },

  progressBarBg: { width: '100%', height: 3, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: BRAND_RED, borderRadius: 2 },

  // Confirmation Popup Modal
  popupBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  popupContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#141418',
    borderRadius: 14,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    elevation: 24,
  },
  popupTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 8,
  },
  popupSubtitle: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 20,
  },
  popupActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  popupCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: '#26262E',
    borderRadius: 6,
  },
  popupCancelText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  popupDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: PURE_RED,
    borderRadius: 6,
  },
  popupDeleteText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },

  // Fullscreen Player Container
  fullscreenPlayerContainer: {
    flex: 1,
    backgroundColor: '#000000',
    width: '100%',
    height: '100%',
  },
});
