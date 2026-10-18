import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, FlatList, 
  TouchableOpacity, Animated, Modal 
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Svg, { Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import ProxyImage from '../../components/ProxyImage';

const BRAND_RED = '#E50914';
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
const IconClose = ({ size = 16, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

const IconTrash = ({ size = 18, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </Svg>
);

// --- Individual Animated Card Component ---
const ContinueCard = ({ item, user, activeProfile, onSelectAnime }) => {
  const [showConfirm, setShowConfirm] = useState(false);
  
  // Animation Values
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const confirmScale = useRef(new Animated.Value(0)).current;

  // Resolved fields from watch_history document
  const animeId = String(item.animeId || item.id || '');
  const displayTitle = item.animeTitle || item.title || `Anime ${animeId}`;
  const epNum = item.episodeNum ?? item.lastWatchedEp ?? 1;
  const rawEpTitle = item.episodeTitle || item.epTitle || '';
  const hasDistinctEpTitle = rawEpTitle && rawEpTitle.toLowerCase() !== `episode ${epNum}`;
  const displayEpLabel = hasDistinctEpTitle ? `Ep ${epNum} • ${rawEpTitle}` : `Episode ${epNum}`;
  const displayBackdrop = item.backdropUrl || item.backdrop || 'https://via.placeholder.com/640x360/1a1a1a/ffffff?text=Loading...';

  // Timestamps & Progress Calculation
  const progressSecs = Number(item.progress || 0);
  const durationSecs = Number(item.duration || 0);
  const progressPct = durationSecs > 0 ? Math.min((progressSecs / durationSecs) * 100, 100) : 0;
  const currentTimeStr = item.formattedTimestamp || formatSeconds(progressSecs);
  const totalTimeStr = item.formattedDuration || formatSeconds(durationSecs);

  // Show Confirmation Overlay
  const triggerConfirm = () => {
    setShowConfirm(true);
    Animated.spring(confirmScale, {
      toValue: 1,
      friction: 5,
      useNativeDriver: true,
    }).start();
  };

  // Hide Confirmation Overlay
  const cancelConfirm = () => {
    Animated.timing(confirmScale, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setShowConfirm(false));
  };

  // Execute Delete from Firebase watch_history with Shrink Animation
  const executeDelete = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: 0.8, duration: 300, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true })
    ]).start(async () => {
      try {
        await firestore()
          .collection('users')
          .doc(String(user.uid))
          .collection('profiles')
          .doc(String(activeProfile.id))
          .collection(WATCH_HISTORY_COLLECTION)
          .doc(animeId)
          .delete();
      } catch (err) {
        console.warn("Failed to delete watch history item:", err);
      }
    });
  };

  return (
    <Animated.View style={[styles.cardWrapper, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity 
        style={styles.cardContent} 
        activeOpacity={0.85} 
        onPress={() => onSelectAnime({ 
          id: animeId,
          animeId: animeId,
          title: displayTitle,
          animeTitle: displayTitle,
          backdrop: displayBackdrop,
          animeBackdrop: displayBackdrop,
          backdropUrl: displayBackdrop,
          episodeNum: epNum,
          episodeTitle: rawEpTitle || `Episode ${epNum}`,
          slug: item.slug || String(epNum),
          progress: progressSecs,
          duration: durationSecs,
          targetType: item.audioType || 'sub',
        })}
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
              <Stop offset="0" stopColor="#000000" stopOpacity="0.92" />
              <Stop offset="0.55" stopColor="#000000" stopOpacity="0.35" />
              <Stop offset="1" stopColor="#000000" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#botGrad)" />
        </Svg>
        
        {/* Top Right "X" Button */}
        <TouchableOpacity style={styles.cutBtn} activeOpacity={0.7} onPress={triggerConfirm}>
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

      {/* Delete Confirmation Overlay */}
      {showConfirm && (
        <Animated.View style={[styles.confirmOverlay, { transform: [{ scale: confirmScale }] }]}>
          <Text style={styles.confirmText}>Remove from watch history?</Text>
          <View style={styles.confirmActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelConfirm}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={executeDelete}>
              <IconTrash size={14} />
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
};

export default function ContinueWatching({ user, activeProfile, onSelectAnime }) {
  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteAllModalVisible, setDeleteAllModalVisible] = useState(false);

  useEffect(() => {
    if (!user?.uid || !activeProfile?.id) {
      setHistoryList([]);
      setLoading(false);
      return;
    }

    // Listen to Firebase Watch History Collection for the Active Profile
    const unsubscribe = firestore()
      .collection('users')
      .doc(String(user.uid))
      .collection('profiles')
      .doc(String(activeProfile.id))
      .collection(WATCH_HISTORY_COLLECTION)
      .orderBy('timestamp', 'desc')
      .limit(20)
      .onSnapshot(async (snap) => {
        if (!snap || snap.empty) {
          setHistoryList([]);
          setLoading(false);
          return;
        }

        // Deduplicate records by animeId using a Map (keeping the most recent entry)
        const historyMap = new Map();
        snap.forEach(doc => {
          const data = doc.data();
          if (!data.finishedEp) {
            const animeId = String(data.animeId || doc.id);
            if (!historyMap.has(animeId) || (data.timestamp || 0) > (historyMap.get(animeId).timestamp || 0)) {
              historyMap.set(animeId, {
                ...data,
                animeId,
              });
            }
          }
        });

        const rawHistory = Array.from(historyMap.values());

        // Enrich with AniList metadata if backdrop or title is missing
        const enriched = await Promise.all(rawHistory.map(async (item) => {
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
  }, [user, activeProfile]);

  const executeDeleteAll = async () => {
    setDeleteAllModalVisible(false);
    try {
      const ref = firestore()
        .collection('users')
        .doc(String(user.uid))
        .collection('profiles')
        .doc(String(activeProfile.id))
        .collection(WATCH_HISTORY_COLLECTION);

      const snap = await ref.get();
      const batch = firestore().batch();
      snap.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      setHistoryList([]);
    } catch (e) {
      console.warn("Failed to delete all watch history:", e);
    }
  };

  if (loading || historyList.length === 0) return null;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Continue Watching</Text>
        <TouchableOpacity 
          style={styles.deleteAllBtn} 
          activeOpacity={0.7} 
          onPress={() => setDeleteAllModalVisible(true)}
        >
          <Text style={styles.deleteAllText}>Delete All</Text>
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
            user={user} 
            activeProfile={activeProfile} 
            onSelectAnime={onSelectAnime} 
          />
        )}
      />

      {/* Delete All Confirmation Modal */}
      <Modal
        visible={deleteAllModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDeleteAllModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Clear Watch History</Text>
            <Text style={styles.modalMessage}>Are you sure you want to remove all items from your continue watching list?</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.modalCancelBtn} 
                onPress={() => setDeleteAllModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.modalConfirmBtn} 
                onPress={executeDeleteAll}
                activeOpacity={0.8}
              >
                <Text style={styles.modalConfirmText}>Delete All</Text>
              </TouchableOpacity>
            </View>
          </View>
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
    marginBottom: 12 
  },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', borderLeftWidth: 3, borderLeftColor: BRAND_RED, paddingLeft: 8 },
  deleteAllBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  deleteAllText: { color: '#888888', fontSize: 13, fontWeight: '700' },

  listPadding: { paddingHorizontal: 20 },

  cardWrapper: { width: 265, height: 150, marginRight: 15, borderRadius: 8, overflow: 'hidden' },
  cardContent: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  backdropImage: { width: '100%', height: '100%', opacity: 0.85 },

  cutBtn: { 
    position: 'absolute', 
    top: 8, 
    right: 8, 
    width: 28, 
    height: 28, 
    backgroundColor: 'rgba(0,0,0,0.6)', 
    borderRadius: 14, 
    justifyContent: 'center', 
    alignItems: 'center', 
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },

  bottomData: { position: 'absolute', bottom: 0, width: '100%', padding: 12, paddingTop: 30, zIndex: 6 },
  animeTitle: { color: '#FFF', fontSize: 13, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 4, marginBottom: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7, gap: 8 },
  epSubTitle: { flex: 1, color: '#CCC', fontSize: 11, fontWeight: '600' },
  timestampText: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontFamily: 'monospace', fontWeight: '700' },

  progressBarBg: { width: '100%', height: 3, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: BRAND_RED, borderRadius: 2 },

  // Confirmation Overlay (Individual Card)
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,15,15,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    padding: 15,
  },
  confirmText: { color: '#FFF', fontSize: 14, fontWeight: '700', marginBottom: 15 },
  confirmActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#333', borderRadius: 6 },
  cancelText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: BRAND_RED, borderRadius: 6 },
  deleteText: { color: '#FFF', fontSize: 12, fontWeight: '800' },

  // Delete All Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox: { width: '85%', maxWidth: 360, backgroundColor: '#1C1C1C', borderRadius: 12, padding: 22, borderWidth: 1, borderColor: '#303030' },
  modalTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  modalMessage: { color: '#AAAAAA', fontSize: 13, lineHeight: 19, marginBottom: 22 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalCancelBtn: { paddingVertical: 9, paddingHorizontal: 14, backgroundColor: '#333', borderRadius: 6 },
  modalCancelText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  modalConfirmBtn: { backgroundColor: BRAND_RED, paddingVertical: 9, paddingHorizontal: 18, borderRadius: 6 },
  modalConfirmText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' }
});
