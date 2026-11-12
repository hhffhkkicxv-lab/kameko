import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, FlatList, 
  TouchableOpacity, Animated, StatusBar, Platform, BackHandler
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import * as NavigationBar from 'expo-navigation-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import Svg, { Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import ProxyImage from '../../components/ProxyImage';

// Safely resolve Player from pages/play/player.js regardless of folder depth
let PlayerComponent = null;
try {
  const mod = require('../play/player');
  PlayerComponent = mod?.default || mod;
} catch (_) {
  try {
    const fallbackMod = require('../../pages/play/player');
    PlayerComponent = fallbackMod?.default || fallbackMod;
  } catch (__) {}
}

// --- STRICT PALETTE ---
const BRAND_RED = '#E50914';
const BLACK = '#000000';
const WHITE = '#FFFFFF';
const DARK_GREY = '#18181C';
const BORDER_GREY = '#26262C';
const TEXT_GREY = '#8E8E93';
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

// --- Premium SVGs ---
const IconClose = ({ size = 16, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

const IconTrash = ({ size = 18, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </Svg>
);

// --- Individual Animated Card Component ---
const ContinueCard = ({ item, isBulkDeleteMode, isSelectedForDelete, toggleBulkDeleteSelection, handleLongPressCard, onPlayDirect }) => {
  const animeId = String(item.animeId || item.id || '');
  const displayTitle = item.animeTitle || item.title || `Anime ${animeId}`;
  const epNum = item.episodeNum ?? item.lastWatchedEp ?? 1;
  const rawEpTitle = item.episodeTitle || item.epTitle || '';
  const hasDistinctEpTitle = rawEpTitle && rawEpTitle.toLowerCase() !== `episode ${epNum}`;
  const displayEpLabel = hasDistinctEpTitle ? `Ep ${epNum} • ${rawEpTitle}` : `Episode ${epNum}`;
  const displayBackdrop = item.backdropUrl || item.backdrop || 'https://via.placeholder.com/640x360/1a1a1a/ffffff?text=Loading...';

  const progressSecs = Number(item.progress || 0);
  const durationSecs = Number(item.duration || 0);
  const progressPct = durationSecs > 0 ? Math.min((progressSecs / durationSecs) * 100, 100) : 0;
  const currentTimeStr = item.formattedTimestamp || formatSeconds(progressSecs);
  const totalTimeStr = item.formattedDuration || formatSeconds(durationSecs);

  return (
    <View style={styles.cardWrapper}>
      <TouchableOpacity 
        style={[styles.cardContent, isBulkDeleteMode && isSelectedForDelete && styles.cardSelectedDelete]} 
        activeOpacity={0.85}
        delayLongPress={320}
        onLongPress={() => handleLongPressCard(animeId)}
        onPress={() => {
          if (isBulkDeleteMode) {
            toggleBulkDeleteSelection(animeId);
          } else {
            onPlayDirect({
              animeId: animeId,
              id: animeId,
              providerId: item.providerId || animeId,
              animeTitle: displayTitle,
              title: displayTitle,
              animeBackdrop: displayBackdrop,
              backdropUrl: displayBackdrop,
              backdrop: displayBackdrop,
              coverImage: displayBackdrop,
              episodeNum: Number(epNum),
              episodeTitle: rawEpTitle || `Episode ${epNum}`,
              epTitle: rawEpTitle || `Episode ${epNum}`,
              slug: String(item.slug || epNum),
              progress: progressSecs,
              duration: durationSecs,
              targetType: item.audioType || 'sub',
            });
          }
        }}
      >
        <ProxyImage 
          source={{ uri: displayBackdrop }} 
          style={styles.backdropImage} 
          resizeMode="cover" 
        />

        <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Defs>
            <LinearGradient id="botGrad" x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0" stopColor="#000000" stopOpacity="0.92" />
              <Stop offset="0.55" stopColor="#000000" stopOpacity="0.35" />
              <Stop offset="1" stopColor="#000000" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#botGrad)" />
        </Svg>

        {isBulkDeleteMode && (
          <View style={[styles.bulkCheckCircle, isSelectedForDelete && styles.bulkCheckCircleActive]}>
            {isSelectedForDelete && (
              <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth="3">
                <Path d="M20 6L9 17l-5-5" />
              </Svg>
            )}
          </View>
        )}

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
    </View>
  );
};

export default function ContinueWatching({ user, activeProfile, onSelectAnime }) {
  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Bulk Delete State
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false);
  const [bulkDeleteSelectedMap, setBulkDeleteSelectedMap] = useState({});
  const [deleteAllModalVisible, setDeleteAllModalVisible] = useState(false); // Used as "confirm dialog" for both delete all & delete selected

  // Direct Fullscreen Player State
  const [directPlaybackParams, setDirectPlaybackParams] = useState(null);

  const deletedIdsRef = useRef(new Set());
  const backdropCacheRef = useRef({});

  useEffect(() => {
    if (!user?.uid || !activeProfile?.id) {
      setHistoryList([]);
      setLoading(false);
      return;
    }

    const colRef = firestore()
      .collection('users')
      .doc(String(user.uid))
      .collection('profiles')
      .doc(String(activeProfile.id))
      .collection(WATCH_HISTORY_COLLECTION);

    const unsubscribe = colRef
      .orderBy('timestamp', 'desc')
      .limit(35)
      .onSnapshot(async (snap) => {
        if (!snap || snap.empty) {
          setHistoryList([]);
          setLoading(false);
          return;
        }

        const historyMap = new Map();

        snap.forEach((doc) => {
          const data = doc.data();
          if (!data) return;

          const rawAnimeId = String(
            data.animeId || String(doc.id).split('_ep_')[0] || doc.id
          );

          if (deletedIdsRef.current.has(rawAnimeId)) return;

          const existing = historyMap.get(rawAnimeId);
          const docIdsList = existing?._docIds
            ? [...existing._docIds, doc.id]
            : [doc.id];

          if (!existing || (data.timestamp || 0) > (existing.timestamp || 0)) {
            historyMap.set(rawAnimeId, {
              ...data,
              animeId: rawAnimeId,
              _docIds: docIdsList,
            });
          } else {
            existing._docIds = docIdsList;
          }
        });

        const activeItems = Array.from(historyMap.values()).filter(
          (item) => !item.finishedEp
        );

        const enriched = await Promise.all(
          activeItems.map(async (item) => {
            let backdropUrl =
              item.backdropUrl ||
              item.backdrop ||
              backdropCacheRef.current[item.animeId]?.backdropUrl;
            let animeTitle =
              item.animeTitle ||
              item.title ||
              backdropCacheRef.current[item.animeId]?.animeTitle;

            if (!backdropUrl) {
              try {
                const cleanSearch = String(item.animeId).replace(/-/g, ' ');
                const query = `query ($search: String) { Media (search: $search, type: ANIME) { title { romaji english } bannerImage coverImage { extraLarge } } }`;
                const aniRes = await fetch('https://graphql.anilist.co', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ query, variables: { search: cleanSearch } }),
                });
                const aniData = await aniRes.json();

                if (aniData?.data?.Media) {
                  backdropUrl =
                    aniData.data.Media.bannerImage ||
                    aniData.data.Media.coverImage?.extraLarge;
                  animeTitle =
                    animeTitle ||
                    aniData.data.Media.title?.english ||
                    aniData.data.Media.title?.romaji;
                  backdropCacheRef.current[item.animeId] = { backdropUrl, animeTitle };
                }
              } catch (_) {}
            }

            return {
              ...item,
              backdropUrl,
              backdrop: backdropUrl,
              animeTitle,
              title: animeTitle,
            };
          })
        );

        setHistoryList(
          enriched.filter((i) => !deletedIdsRef.current.has(String(i.animeId)))
        );
        setLoading(false);
      }, (err) => {
        console.warn("Continue Watching listener error:", err);
        setLoading(false);
      });

    return () => unsubscribe();
  }, [user?.uid, activeProfile?.id]);


  // --- BULK DELETE LOGIC ---
  const handleLongPressCard = (animeId) => {
    setIsBulkDeleteMode(true);
    setBulkDeleteSelectedMap((prev) => ({
      ...prev,
      [animeId]: true,
    }));
  };

  const toggleBulkDeleteSelection = (animeId) => {
    setBulkDeleteSelectedMap((prev) => {
      const next = { ...prev, [animeId]: !prev[animeId] };
      const anyLeft = Object.keys(next).some((k) => next[k]);
      if (!anyLeft) setIsBulkDeleteMode(false);
      return next;
    });
  };

  const executeDeleteSelected = async () => {
    const selectedIds = Object.keys(bulkDeleteSelectedMap).filter(k => bulkDeleteSelectedMap[k]);
    if (selectedIds.length === 0) {
      setDeleteAllModalVisible(false);
      return;
    }

    setDeleteAllModalVisible(false);

    // Collect all doc IDs to delete based on the selected animeIds
    const allDocIdsToDelete = new Set();
    historyList.forEach(item => {
      if (selectedIds.includes(String(item.animeId))) {
        deletedIdsRef.current.add(String(item.animeId)); // Block from snapshot
        (item._docIds || [item.animeId]).forEach(id => allDocIdsToDelete.add(id));
      }
    });

    // Optimistically update UI
    setHistoryList((prev) => prev.filter((item) => !selectedIds.includes(String(item.animeId))));
    setIsBulkDeleteMode(false);
    setBulkDeleteSelectedMap({});

    if (!user?.uid || !activeProfile?.id) return;

    try {
      const colRef = firestore()
        .collection('users')
        .doc(String(user.uid))
        .collection('profiles')
        .doc(String(activeProfile.id))
        .collection(WATCH_HISTORY_COLLECTION);

      const batch = firestore().batch();
      
      // Also query to catch any missed episode docs for these animeIds
      for (const cleanId of selectedIds) {
        allDocIdsToDelete.add(cleanId);
        const matchingSnap = await colRef.where('animeId', '==', cleanId).get().catch(() => null);
        if (matchingSnap && !matchingSnap.empty) {
          matchingSnap.forEach((d) => allDocIdsToDelete.add(d.id));
        }
      }

      allDocIdsToDelete.forEach((docId) => {
        if (docId) batch.delete(colRef.doc(String(docId)));
      });

      await batch.commit();
    } catch (err) {
      console.warn("Failed to delete watch history items:", err);
    } finally {
      setTimeout(() => {
        selectedIds.forEach(id => deletedIdsRef.current.delete(String(id)));
      }, 4000);
    }
  };

  const executeDeleteAll = async () => {
    setDeleteAllModalVisible(false);
    setHistoryList([]);
    setIsBulkDeleteMode(false);
    setBulkDeleteSelectedMap({});

    if (!user?.uid || !activeProfile?.id) return;
    try {
      const ref = firestore()
        .collection('users')
        .doc(String(user.uid))
        .collection('profiles')
        .doc(String(activeProfile.id))
        .collection(WATCH_HISTORY_COLLECTION);

      const snap = await ref.get();
      const batch = firestore().batch();
      snap.forEach((doc) => {
        deletedIdsRef.current.add(String(doc.data()?.animeId || doc.id));
        batch.delete(doc.ref);
      });
      await batch.commit();
    } catch (e) {
      console.warn("Failed to delete all watch history:", e);
    } finally {
      setTimeout(() => {
        deletedIdsRef.current.clear();
      }, 4000);
    }
  };


  // --- PLAYER MOUNTING / UNMOUNTING ---
  const handleLaunchDirectPlayer = async (episodePayload) => {
    if (!PlayerComponent) {
      if (onSelectAnime) onSelectAnime(episodePayload);
      return;
    }

    try {
      StatusBar.setHidden(true, 'none');
      if (Platform.OS === 'android' && NavigationBar?.setVisibilityAsync) {
        await NavigationBar.setVisibilityAsync('hidden');
        await NavigationBar.setBehaviorAsync('overlay-swipe');
      }
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } catch (_) {}

    setDirectPlaybackParams({
      ...episodePayload,
      userUid: user?.uid || null,
      uid: user?.uid || null,
      user: user || null,
      activeProfileId: activeProfile?.id || null,
      profileId: activeProfile?.id || null,
      activeProfile: activeProfile || null,
      currentProfile: activeProfile || null,
    });
  };

  const handleCloseDirectPlayer = async () => {
    setDirectPlaybackParams(null);
    try {
      StatusBar.setHidden(true, 'none');
      if (Platform.OS === 'android' && NavigationBar?.setVisibilityAsync) {
        await NavigationBar.setVisibilityAsync('hidden');
      }
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } catch (_) {}
  };

  // Hardware back intercepts Modals & Players
  useEffect(() => {
    const onHardwareBack = () => {
      if (directPlaybackParams) { handleCloseDirectPlayer(); return true; }
      if (deleteAllModalVisible) { setDeleteAllModalVisible(false); return true; }
      if (isBulkDeleteMode) { setIsBulkDeleteMode(false); setBulkDeleteSelectedMap({}); return true; }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [directPlaybackParams, deleteAllModalVisible, isBulkDeleteMode]);


  if (loading || (historyList.length === 0 && !directPlaybackParams)) return null;

  const selectedCount = Object.keys(bulkDeleteSelectedMap).filter(k => bulkDeleteSelectedMap[k]).length;
  const isAllSelected = historyList.length > 0 && selectedCount === historyList.length;

  return (
    <View style={styles.sectionContainer}>
      {historyList.length > 0 && (
        <>
          <View style={styles.headerRow}>
            <Text style={styles.sectionTitle}>Continue Watching</Text>
            <TouchableOpacity 
              style={styles.deleteAllBtn} 
              activeOpacity={0.7} 
              onPress={() => {
                if (isBulkDeleteMode) {
                  if (isAllSelected) setBulkDeleteSelectedMap({});
                  else {
                    const allMap = {};
                    historyList.forEach(item => { allMap[item.animeId] = true; });
                    setBulkDeleteSelectedMap(allMap);
                  }
                } else {
                  setDeleteAllModalVisible('all'); 
                }
              }}
            >
              <Text style={styles.deleteAllText}>
                {isBulkDeleteMode ? (isAllSelected ? 'Deselect All' : 'Select All') : 'Delete All'}
              </Text>
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
                isBulkDeleteMode={isBulkDeleteMode}
                isSelectedForDelete={Boolean(bulkDeleteSelectedMap[item.animeId])}
                toggleBulkDeleteSelection={toggleBulkDeleteSelection}
                handleLongPressCard={handleLongPressCard}
                onPlayDirect={handleLaunchDirectPlayer}
              />
            )}
          />

          {/* FLOATING BULK DELETE BAR (Appears when in select mode) */}
          {isBulkDeleteMode && (
            <View style={styles.bulkDeleteFloatingBar}>
              <View style={styles.bulkDeleteBarTopRow}>
                <Text style={styles.bulkDeleteCountText}>
                  {selectedCount} Selected
                </Text>
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

              <TouchableOpacity
                style={[
                  styles.bulkConfirmDeleteBtn,
                  selectedCount === 0 && { opacity: 0.45 },
                ]}
                disabled={selectedCount === 0}
                activeOpacity={0.85}
                onPress={() => setDeleteAllModalVisible('selected')}
              >
                <IconTrash size={18} color={WHITE} />
                <Text style={styles.bulkConfirmDeleteText}>
                  Delete Selected ({selectedCount})
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Reusable Absolute View Bottom Sheet Modal for Deletions */}
      {Boolean(deleteAllModalVisible) && (
        <View style={styles.absoluteOverlay}>
          <TouchableOpacity style={styles.overlayBackground} activeOpacity={1} onPress={() => setDeleteAllModalVisible(false)} />
          <View style={styles.bottomSheetWrapper}>
            <View style={styles.bottomSheetCard}>
              <View style={{ alignItems: 'center' }}>
                <View style={styles.confirmIconWrap}><IconTrash size={24} color={PURE_RED} /></View>
                <Text style={styles.confirmPopupTitle}>
                  {deleteAllModalVisible === 'all' ? 'Clear Watch History' : 'Delete Selected Anime'}
                </Text>
                <Text style={styles.confirmPopupMessage}>
                  {deleteAllModalVisible === 'all' 
                    ? 'Are you sure you want to completely clear your continue watching history?' 
                    : `Remove these ${selectedCount} items from your watch history?`}
                </Text>
                <View style={styles.confirmBtnsRow}>
                  <TouchableOpacity style={styles.confirmCancelBtn} activeOpacity={0.85} onPress={() => setDeleteAllModalVisible(false)}>
                    <Text style={styles.confirmCancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.confirmDangerBtn} 
                    activeOpacity={0.85} 
                    onPress={deleteAllModalVisible === 'all' ? executeDeleteAll : executeDeleteSelected}
                  >
                    <Text style={styles.confirmDangerBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* DIRECT FULLSCREEN PLAYER.JS (<View> instead of Modal) */}
      {PlayerComponent && directPlaybackParams && (
        <View style={styles.fullScreenPlayerOverlay}>
          <StatusBar hidden={true} translucent={true} backgroundColor="transparent" />
          <PlayerComponent
            route={{ params: directPlaybackParams }}
            navigation={{ goBack: handleCloseDirectPlayer }}
            user={user}
            activeProfile={activeProfile}
            activeProfileId={activeProfile?.id}
          />
        </View>
      )}
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
    marginBottom: 12 
  },
  sectionTitle: { color: WHITE, fontSize: 18, fontWeight: '800', borderLeftWidth: 3, borderLeftColor: BRAND_RED, paddingLeft: 8 },
  deleteAllBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  deleteAllText: { color: TEXT_GREY, fontSize: 13, fontWeight: '700' },
  listPadding: { paddingHorizontal: 20 },

  cardWrapper: { width: 265, height: 150, marginRight: 15 },
  cardContent: { flex: 1, backgroundColor: DARK_GREY, borderRadius: 8, borderWidth: 1, borderColor: BORDER_GREY, overflow: 'hidden' },
  cardSelectedDelete: { borderColor: PURE_RED, backgroundColor: DARK_GREY },
  backdropImage: { width: '100%', height: '100%', opacity: 0.85 },

  bulkCheckCircle: { 
    position: 'absolute', 
    top: 8, 
    right: 8, 
    width: 22, 
    height: 22, 
    borderRadius: 11, 
    borderWidth: 2, 
    borderColor: 'rgba(255,255,255,0.6)', 
    justifyContent: 'center', 
    alignItems: 'center',
    zIndex: 10
  },
  bulkCheckCircleActive: { backgroundColor: PURE_RED, borderColor: PURE_RED },

  bottomData: { position: 'absolute', bottom: 0, width: '100%', padding: 12, paddingTop: 30, zIndex: 6 },
  animeTitle: { color: WHITE, fontSize: 13, fontWeight: '800', textShadowColor: BLACK, textShadowRadius: 4, marginBottom: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7, gap: 8 },
  epSubTitle: { flex: 1, color: '#CCC', fontSize: 11, fontWeight: '600' },
  timestampText: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontFamily: 'monospace', fontWeight: '700' },

  progressBarBg: { width: '100%', height: 3, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: BRAND_RED, borderRadius: 2 },

  // Floating Bulk Delete Bar
  bulkDeleteFloatingBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: BLACK, borderTopWidth: 1.5, borderTopColor: BORDER_GREY, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18, zIndex: 900, elevation: 25 },
  bulkDeleteBarTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  bulkDeleteCountText: { color: WHITE, fontSize: 13, fontWeight: '800' },
  bulkCancelBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, backgroundColor: DARK_GREY },
  bulkCancelText: { color: WHITE, fontSize: 11, fontWeight: '700' },
  bulkConfirmDeleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: PURE_RED, paddingVertical: 13, borderRadius: 6 },
  bulkConfirmDeleteText: { color: WHITE, fontSize: 14, fontWeight: '900' },

  // Absolute Overlay (Bottom Sheet)
  absoluteOverlay: { position: 'absolute', top: -1000, left: -1000, right: -1000, bottom: -1000, zIndex: 9999, elevation: 9999, justifyContent: 'center', alignItems: 'center' },
  overlayBackground: { position: 'absolute', width: '300%', height: '300%', backgroundColor: 'rgba(0,0,0,0.85)' },
  bottomSheetWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  bottomSheetCard: { width: '100%', backgroundColor: BLACK, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 34, borderTopWidth: 1, borderColor: BORDER_GREY, alignItems: 'center' },
  confirmIconWrap: { width: 46, height: 46, borderRadius: 23, backgroundColor: DARK_GREY, borderWidth: 1, borderColor: BORDER_GREY, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  confirmPopupTitle: { color: WHITE, fontSize: 17, fontWeight: '800', textAlign: 'center', letterSpacing: 0.2 },
  confirmPopupMessage: { color: TEXT_GREY, fontSize: 13, lineHeight: 19, fontWeight: '500', textAlign: 'center', marginTop: 8, marginBottom: 20 },
  confirmBtnsRow: { flexDirection: 'row', width: '100%', gap: 12 },
  confirmCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 9, backgroundColor: DARK_GREY, borderWidth: 1, borderColor: BORDER_GREY, alignItems: 'center', justifyContent: 'center' },
  confirmCancelBtnText: { color: WHITE, fontSize: 13, fontWeight: '700' },
  confirmDangerBtn: { flex: 1, paddingVertical: 12, borderRadius: 9, backgroundColor: PURE_RED, alignItems: 'center', justifyContent: 'center' },
  confirmDangerBtnText: { color: WHITE, fontSize: 13, fontWeight: '800' },

  // Player Absolute Fullscreen
  fullScreenPlayerOverlay: { position: 'absolute', top: -1000, left: -1000, right: -1000, bottom: -1000, zIndex: 10000, elevation: 10000, backgroundColor: BLACK },
});
