import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, FlatList, 
  TouchableOpacity, Animated, Dimensions 
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Svg, { Path, Rect } from 'react-native-svg';
import ProxyImage from '../../components/ProxyImage';

const BRAND_RED = '#E50914';
const { width } = Dimensions.get('window');

// --- Premium SVGs ---
const IconPlay = ({ size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="#FFF">
    <Path d="M8 5v14l11-7z" />
  </Svg>
);

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
const ContinueCard = ({ item, user, onSelectAnime }) => {
  const [showConfirm, setShowConfirm] = useState(false);
  
  // Animation Values
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const confirmScale = useRef(new Animated.Value(0)).current;

  // Calculate percentage for progress bar
  const progressPct = item.duration > 0 ? Math.min((item.progress / item.duration) * 100, 100) : 0;

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

  // Execute Delete from Firebase with Shrink Animation
  const executeDelete = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: 0.8, duration: 300, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true })
    ]).start(async () => {
      try {
        await firestore()
          .collection('users')
          .doc(user.uid)
          .collection('progress')
          .doc(item.animeId)
          .delete();
      } catch (err) {
        console.warn("Failed to delete history:", err);
      }
    });
  };

  return (
    <Animated.View style={[styles.cardWrapper, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity 
        style={styles.cardContent} 
        activeOpacity={0.85} 
        onPress={() => onSelectAnime({ id: item.animeId, title: item.title || 'Resume' })}
      >
        <ProxyImage 
          source={{ uri: item.backdrop || 'https://via.placeholder.com/640x360/1a1a1a/ffffff?text=Loading...' }} 
          style={styles.backdropImage} 
          resizeMode="cover" 
        />
        
        {/* Top Right "X" Button */}
        <TouchableOpacity style={styles.cutBtn} activeOpacity={0.7} onPress={triggerConfirm}>
          <IconClose />
        </TouchableOpacity>

        {/* Center Play Button Overlay */}
        <View style={styles.playOverlay}>
          <View style={styles.playIconBox}>
            <IconPlay />
          </View>
        </View>

        {/* Bottom Details & Progress Bar */}
        <View style={styles.bottomData}>
          <Text style={styles.animeTitle} numberOfLines={1}>{item.title || `Anime ${item.animeId}`}</Text>
          <Text style={styles.epSubTitle}>Episode {item.lastWatchedEp}</Text>
          
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
          </View>
        </View>
      </TouchableOpacity>

      {/* Delete Confirmation Overlay */}
      {showConfirm && (
        <Animated.View style={[styles.confirmOverlay, { transform: [{ scale: confirmScale }] }]}>
          <Text style={styles.confirmText}>Remove from history?</Text>
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

export default function ContinueWatching({ user, onSelectAnime }) {
  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // Listen to Firebase Progress Collection
    const unsubscribe = firestore()
      .collection('users')
      .doc(user.uid)
      .collection('progress')
      .orderBy('timestamp', 'desc')
      .limit(10)
      .onSnapshot(async (snap) => {
        if (!snap || snap.empty) {
          setHistoryList([]);
          setLoading(false);
          return;
        }

        const rawProgress = [];
        snap.forEach(doc => {
          const data = doc.data();
          // Filter out completely finished episodes if you don't want them in the slider
          if (!data.finishedEp) {
            rawProgress.push(data);
          }
        });

        // Optional: Fetch Anilist Metadata for HD Backdrops if not saved in Firestore
        const enriched = await Promise.all(rawProgress.map(async (item) => {
          let backdrop = null;
          let title = `Episode ${item.lastWatchedEp}`;
          
          try {
            // We use the ID to reverse-search Anilist for a clean landscape backdrop
            const cleanSearch = item.animeId.replace(/-/g, ' ');
            const query = `query ($search: String) { Media (search: $search, type: ANIME) { title { romaji english } bannerImage coverImage { extraLarge } } }`;
            const aniRes = await fetch('https://graphql.anilist.co', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query, variables: { search: cleanSearch } })
            });
            const aniData = await aniRes.json();
            
            if (aniData?.data?.Media) {
              backdrop = aniData.data.Media.bannerImage || aniData.data.Media.coverImage?.extraLarge;
              title = aniData.data.Media.title?.english || aniData.data.Media.title?.romaji;
            }
          } catch(e) {}

          return { ...item, backdrop, title };
        }));

        setHistoryList(enriched);
        setLoading(false);
      }, (err) => {
        console.warn("Continue Watching listener error:", err);
        setLoading(false);
      });

    return () => unsubscribe();
  }, [user]);

  if (loading || historyList.length === 0) return null;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Continue Watching</Text>
      </View>
      <FlatList
        data={historyList}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.animeId}
        contentContainerStyle={styles.listPadding}
        snapToInterval={280} 
        decelerationRate="fast"
        renderItem={({ item }) => (
          <ContinueCard item={item} user={user} onSelectAnime={onSelectAnime} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: { marginTop: 5, marginBottom: 25 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', borderLeftWidth: 3, borderLeftColor: BRAND_RED, paddingLeft: 8 },
  listPadding: { paddingHorizontal: 20 },
  
  cardWrapper: { width: 265, height: 150, marginRight: 15, borderRadius: 10, overflow: 'hidden' },
  cardContent: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  backdropImage: { width: '100%', height: '100%', opacity: 0.6 },
  
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
  
  playOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 5 },
  playIconBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)' },
  
  bottomData: { position: 'absolute', bottom: 0, width: '100%', padding: 10, paddingTop: 30, zIndex: 6, backgroundColor: 'rgba(0,0,0,0.5)' },
  animeTitle: { color: '#FFF', fontSize: 13, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 4 },
  epSubTitle: { color: '#CCC', fontSize: 11, fontWeight: '600', marginBottom: 8 },
  
  progressBarBg: { width: '100%', height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: BRAND_RED },

  // Confirmation Overlay
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,20,20,0.95)',
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
  deleteText: { color: '#FFF', fontSize: 12, fontWeight: '800' }
});
