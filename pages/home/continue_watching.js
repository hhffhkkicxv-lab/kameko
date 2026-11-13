import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, FlatList, 
  TouchableOpacity, BackHandler 
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Svg, { Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import ProxyImage from '../../components/ProxyImage';

// --- STRICT PALETTE ---
const BRAND_RED = '#E50914';
const PURE_RED = '#FF0000';
const BLACK = '#000000';
const WHITE = '#FFFFFF';
const DARK_GREY = '#18181C';
const BORDER_GREY = '#26262C';
const TEXT_GREY = '#8E8E93';
const WATCH_HISTORY_COLLECTION = 'watch_history';

const formatSeconds = (seconds) => {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const totalSecs = Math.floor(seconds);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSecs % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
};

const IconClose = ({ size = 14, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

const IconTrash = ({ size = 16, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </Svg>
);

const ContinueCard = ({ 
  item, 
  isBulkDeleteMode, 
  isSelectedForDelete, 
  toggleBulkDeleteSelection, 
  handleLongPressCard, 
  onPlayDirect, 
  onRequestSingleDelete 
}) => {
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

        {isBulkDeleteMode ? (
          <View style={[styles.bulkCheckCircle, isSelectedForDelete && styles.bulkCheckCircleActive]}>
            {isSelectedForDelete && (
              <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth="3">
                <Path d="M20 6L9 17l-5-5" />
              </Svg>
            )}
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.cutBtn} 
            activeOpacity={0.75} 
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => onRequestSingleDelete(animeId, displayTitle, item._docIds || [animeId])}
          >
            <IconClose size={14} color={WHITE} />
          </TouchableOpacity>
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

export default function ContinueWatching({ 
  user, 
  activeProfile, 
  onSelectAnime, 
  onPlayDirect, 
  onRequestDeleteDialog 
}) {
  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false);
  const [bulkDeleteSelectedMap, setBulkDeleteSelectedMap] = useState({});

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
          const docIdsList = existing?._docIds ? [...existing._docIds, doc.id] : [doc.id];

          if (!existing || (data.timestamp || 0) > (existing.timestamp || 0)) {
            historyMap.set(rawAnimeId, { ...data, animeId: rawAnimeId, _docIds: docIdsList });
          } else {
            existing._docIds = docIdsList;
          }
        });

        const activeItems = Array.from(historyMap.values()).filter((item) => !item.finishedEp);

        const enriched = await Promise.all(
          activeItems.map(async (item) => {
            let backdropUrl = item.backdropUrl || item.backdrop || backdropCacheRef.current[item.animeId]?.backdropUrl;
            let animeTitle = item.animeTitle || item.title || backdropCacheRef.current[item.animeId]?.animeTitle;

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
                  backdropUrl = aniData.data.Media.bannerImage || aniData.data.Media.coverImage?.extraLarge;
                  animeTitle = animeTitle || aniData.data.Media.title?.english || aniData.data.Media.title?.romaji;
                  backdropCacheRef.current[item.animeId] = { backdropUrl, animeTitle };
                }
              } catch (_) {}
            }

            return { ...item, backdropUrl, backdrop: backdropUrl, animeTitle, title: animeTitle };
          })
        );

        setHistoryList(enriched.filter((i) => !deletedIdsRef.current.has(String(i.animeId))));
        setLoading(false);
      }, () => {
        setLoading(false);
      });

    return () => unsubscribe();
  }, [user?.uid, activeProfile?.id]);

  useEffect(() => {
    const onHardwareBack = () => {
      if (isBulkDeleteMode) {
        setIsBulkDeleteMode(false);
        setBulkDeleteSelectedMap({});
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [isBulkDeleteMode]);

  const handleLongPressCard = (animeId) => {
    setIsBulkDeleteMode(true);
    setBulkDeleteSelectedMap((prev) => ({ ...prev, [animeId]: true }));
  };

  const toggleBulkDeleteSelection = (animeId) => {
    setBulkDeleteSelectedMap((prev) => {
      const next = { ...prev, [animeId]: !prev[animeId] };
      const anyLeft = Object.keys(next).some((k) => next[k]);
      if (!anyLeft) setIsBulkDeleteMode(false);
      return next;
    });
  };

  const executeDeleteAnimeIds = async (targetIds) => {
    const cleanIds = (targetIds || []).map(String).filter(Boolean);
    if (cleanIds.length === 0) return;

    const allDocIdsToDelete = new Set();
    historyList.forEach(item => {
      if (cleanIds.includes(String(item.animeId))) {
        deletedIdsRef.current.add(String(item.animeId));
        (item._docIds || [item.animeId]).forEach(id => allDocIdsToDelete.add(id));
      }
    });

    setHistoryList((prev) => prev.filter((item) => !cleanIds.includes(String(item.animeId))));
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
      for (const cleanId of cleanIds) {
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
    } catch (_) {} finally {
      setTimeout(() => {
        cleanIds.forEach(id => deletedIdsRef.current.delete(String(id)));
      }, 4000);
    }
  };

  const executeDeleteAll = async () => {
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
    } catch (_) {} finally {
      setTimeout(() => {
        deletedIdsRef.current.clear();
      }, 4000);
    }
  };

  const triggerSingleDeletePopup = (animeId, title) => {
    if (onRequestDeleteDialog) {
      onRequestDeleteDialog({
        title: `Remove ${title}`,
        message: `Are you sure you want to remove "${title}" from your continue watching list?`,
        confirmText: 'Delete',
        onConfirm: () => executeDeleteAnimeIds([animeId]),
      });
    } else {
      executeDeleteAnimeIds([animeId]);
    }
  };

  const triggerSelectedDeletePopup = (selectedIds) => {
    if (selectedIds.length === 0) return;
    if (onRequestDeleteDialog) {
      onRequestDeleteDialog({
        title: selectedIds.length === 1 ? 'Delete Selected Anime' : `Delete ${selectedIds.length} Selected Anime`,
        message: `Are you sure you want to permanently remove ${selectedIds.length === 1 ? 'this item' : `these ${selectedIds.length} items`} from your watch history?`,
        confirmText: `Delete (${selectedIds.length})`,
        onConfirm: () => executeDeleteAnimeIds(selectedIds),
      });
    } else {
      executeDeleteAnimeIds(selectedIds);
    }
  };

  const triggerDeleteAllPopup = () => {
    if (onRequestDeleteDialog) {
      onRequestDeleteDialog({
        title: 'Clear Watch History',
        message: 'Are you sure you want to completely clear all items from your continue watching list?',
        confirmText: 'Delete All',
        onConfirm: executeDeleteAll,
      });
    } else {
      executeDeleteAll();
    }
  };

  if (loading || historyList.length === 0) return null;

  const selectedIds = Object.keys(bulkDeleteSelectedMap).filter(k => bulkDeleteSelectedMap[k]);
  const selectedCount = selectedIds.length;
  const isAllSelected = historyList.length > 0 && selectedCount === historyList.length;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Continue Watching</Text>

        <View style={styles.headerRightActions}>
          {isBulkDeleteMode ? (
            <>
              <TouchableOpacity 
                style={styles.headerActionPill} 
                activeOpacity={0.75}
                onPress={() => {
                  if (isAllSelected) setBulkDeleteSelectedMap({});
                  else {
                    const allMap = {};
                    historyList.forEach(item => { allMap[item.animeId] = true; });
                    setBulkDeleteSelectedMap(allMap);
                  }
                }}
              >
                <Text style={styles.headerActionPillText}>
                  {isAllSelected ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.headerDeleteConfirmPill, selectedCount === 0 && { opacity: 0.4 }]} 
                disabled={selectedCount === 0}
                activeOpacity={0.8}
                onPress={() => triggerSelectedDeletePopup(selectedIds)}
              >
                <IconTrash size={14} color={WHITE} />
                <Text style={styles.headerDeleteConfirmText}>Delete ({selectedCount})</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.headerCancelPill} 
                activeOpacity={0.75}
                onPress={() => {
                  setIsBulkDeleteMode(false);
                  setBulkDeleteSelectedMap({});
                }}
              >
                <Text style={styles.headerCancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity 
              style={styles.deleteAllBtn} 
              activeOpacity={0.7} 
              onPress={triggerDeleteAllPopup}
            >
              <Text style={styles.deleteAllText}>Delete All</Text>
            </TouchableOpacity>
          )}
        </View>
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
            onPlayDirect={(payload) => {
              if (onPlayDirect) onPlayDirect(payload);
              else if (onSelectAnime) onSelectAnime(payload);
            }}
            onRequestSingleDelete={triggerSingleDeletePopup}
          />
        )}
      />
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
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteAllBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  deleteAllText: { color: TEXT_GREY, fontSize: 13, fontWeight: '700' },

  headerActionPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, borderWidth: 1, borderColor: PURE_RED },
  headerActionPillText: { color: PURE_RED, fontSize: 11, fontWeight: '800' },
  headerDeleteConfirmPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, backgroundColor: PURE_RED },
  headerDeleteConfirmText: { color: WHITE, fontSize: 11, fontWeight: '900' },
  headerCancelPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, backgroundColor: DARK_GREY, borderWidth: 1, borderColor: BORDER_GREY },
  headerCancelText: { color: WHITE, fontSize: 11, fontWeight: '700' },

  listPadding: { paddingHorizontal: 20 },

  cardWrapper: { width: 265, height: 150, marginRight: 15 },
  cardContent: { flex: 1, backgroundColor: DARK_GREY, borderRadius: 8, borderWidth: 1, borderColor: BORDER_GREY, overflow: 'hidden' },
  cardSelectedDelete: { borderColor: PURE_RED, borderWidth: 1.5 },
  backdropImage: { width: '100%', height: '100%', opacity: 0.85 },

  cutBtn: { 
    position: 'absolute', 
    top: 8, 
    right: 8, 
    width: 28, 
    height: 28, 
    backgroundColor: 'rgba(0,0,0,0.65)', 
    borderRadius: 14, 
    justifyContent: 'center', 
    alignItems: 'center', 
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },

  bulkCheckCircle: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  bulkCheckCircleActive: { backgroundColor: PURE_RED, borderColor: PURE_RED },

  bottomData: { position: 'absolute', bottom: 0, width: '100%', padding: 12, paddingTop: 30, zIndex: 6 },
  animeTitle: { color: WHITE, fontSize: 13, fontWeight: '800', textShadowColor: BLACK, textShadowRadius: 4, marginBottom: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7, gap: 8 },
  epSubTitle: { flex: 1, color: '#CCC', fontSize: 11, fontWeight: '600' },
  timestampText: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontFamily: 'monospace', fontWeight: '700' },

  progressBarBg: { width: '100%', height: 3, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: BRAND_RED, borderRadius: 2 },
});
