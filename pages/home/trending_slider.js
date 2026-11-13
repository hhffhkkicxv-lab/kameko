import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, FlatList, 
  TouchableOpacity, Animated 
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Svg, { Path } from 'react-native-svg';
import ProxyImage from '../../components/ProxyImage';

// --- STRICT PALETTE ---
const BRAND_RED = '#E50914';
const PURE_RED = '#FF0000';
const BLACK = '#000000';
const WHITE = '#FFFFFF';
const DARK_GREY = '#18181C';
const BORDER_GREY = '#26262C';
const TEXT_GREY = '#8E8E93';

const BookmarkIcon = ({ filled }) => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? PURE_RED : "none"} stroke={filled ? PURE_RED : WHITE} strokeWidth="2.5">
    <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </Svg>
);

const TrendingSkeleton = () => {
  const shimmer = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.3, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, [shimmer]);

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}><Text style={styles.sectionTitle}>Trending Now</Text></View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 15 }}>
        {[1, 2, 3, 4].map((_, i) => (
          <Animated.View key={i} style={[styles.skeletonCard, { opacity: shimmer }]} />
        ))}
      </View>
    </View>
  );
};

export default function TrendingSlider({ user, onSelectAnime }) {
  const [trendingList, setTrendingList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [librarySet, setLibrarySet] = useState(new Set());

  useEffect(() => {
    if (!user) return;
    const unsubscribe = firestore()
      .collection('users')
      .doc(user.uid)
      .collection('library')
      .onSnapshot((snap) => {
        const currentLib = new Set();
        snap?.forEach((doc) => currentLib.add(doc.id));
        setLibrarySet(currentLib);
      });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    let isMounted = true;
    const fetchTrending = async () => {
      try {
        const query = `
          query { 
            Page(page: 1, perPage: 15) { 
              media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { 
                id title { romaji english } coverImage { extraLarge }
                bannerImage description genres episodes status format averageScore
              } 
            } 
          }
        `;

        const response = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        });
        
        const json = await response.json();
        const aniListMedia = json?.data?.Page?.media || [];

        // 1. FAST INITIAL LOAD: Render UI instantly using AniList data
        const initialFastData = aniListMedia.map(anime => {
          const titleEng = anime.title.english || anime.title.romaji;
          return {
            id: String(anime.id), // Temporary ID until Vercel resolves
            rawTitle: titleEng,
            title: titleEng,
            image: anime.coverImage?.extraLarge,
            backdrop: anime.bannerImage || anime.coverImage?.extraLarge,
            description: anime.description?.replace(/<[^>]*>?/gm, '').trim() || 'No synopsis available.',
            genres: anime.genres || ['Anime'],
            score: anime.averageScore,
            episode: anime.episodes || '?',
            status: anime.status,
            format: anime.format
          };
        });

        if (isMounted) {
          setTrendingList(initialFastData);
          setLoading(false); // Instantly drop skeleton loader
        }

        // 2. BACKGROUND HYDRATION: Fetch exact stream IDs from Vercel silently
        initialFastData.forEach(async (item, index) => {
          try {
            const baseUrl = 'https://anikoto-api-lyart.vercel.app';
            const vercelRes = await fetch(`${baseUrl}/api/search?keyword=${encodeURIComponent(item.rawTitle)}`);
            if (vercelRes.ok) {
              const vercelData = await vercelRes.json();
              const apiResults = vercelData.data || vercelData.results || vercelData || [];
              const exactMatch = apiResults.find(r => (r.title || '').toLowerCase() === item.rawTitle.toLowerCase()) || apiResults[0];
              
              if (exactMatch && isMounted) {
                setTrendingList(prevList => {
                  const updated = [...prevList];
                  if (updated[index]) {
                    updated[index] = { ...updated[index], id: exactMatch.id };
                  }
                  return updated;
                });
              }
            }
          } catch(e) {
            // Silently fail, card will use temporary ID
          }
        });

      } catch (error) {
        console.error("Trending Slider fetch error:", error);
        if (isMounted) setLoading(false);
      }
    };

    fetchTrending();
    return () => { isMounted = false; };
  }, []);

  const handleNavigateToPlay = (anime) => {
    if (onSelectAnime) {
      onSelectAnime({ 
        id: anime.id,
        animeId: anime.id,
        title: anime.title,
        coverImage: anime.image,
        backdrop: anime.backdrop,
        description: anime.description,
        genres: anime.genres,
        status: anime.status,
        score: anime.score,
        rating: 'U/A 13+'
      });
    }
  };

  const toggleLibrary = async (anime) => {
    if (!user) return;
    const ref = firestore().collection('users').doc(user.uid).collection('library').doc(anime.id);
    if (librarySet.has(anime.id)) {
      await ref.delete().catch(() => {});
    } else {
      await ref.set({ id: anime.id, title: anime.title, img: anime.image, addedAt: Date.now() }).catch(() => {});
    }
  };

  if (loading) return <TrendingSkeleton />;
  if (trendingList.length === 0) return null;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}><Text style={styles.sectionTitle}>Trending Now</Text></View>
      <FlatList
        data={trendingList}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        contentContainerStyle={styles.listPadding}
        snapToInterval={155} 
        decelerationRate="fast"
        windowSize={5}
        maxToRenderPerBatch={4}
        initialNumToRender={4}
        renderItem={({ item, index }) => {
          const isAdded = librarySet.has(item.id);
          return (
            <TouchableOpacity style={styles.cardContainer} activeOpacity={0.85} onPress={() => handleNavigateToPlay(item)}>
              <View style={styles.imageWrapper}>
                <ProxyImage source={{ uri: item.image }} style={styles.coverImage} resizeMode="cover" />
                
                <View style={styles.badgeContainer}>
                  <View style={styles.rankBadge}><Text style={styles.rankBadgeText}>#{index + 1}</Text></View>
                  {item.episode !== '?' && <View style={styles.epBadge}><Text style={styles.epBadgeText}>EP {item.episode}</Text></View>}
                </View>

                <TouchableOpacity 
                  style={[styles.saveBtn, isAdded && styles.saveBtnActive]}
                  onPress={() => toggleLibrary(item)}
                  activeOpacity={0.8}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <BookmarkIcon filled={isAdded} />
                </TouchableOpacity>
              </View>
              <Text style={styles.animeTitle} numberOfLines={1}>{item.title}</Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: { marginTop: 10, marginBottom: 25 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { color: WHITE, fontSize: 18, fontWeight: '800', borderLeftWidth: 3, borderLeftColor: BRAND_RED, paddingLeft: 8 },
  listPadding: { paddingHorizontal: 20 },
  cardContainer: { width: 140, marginRight: 15 },
  imageWrapper: { width: 140, height: 210, borderRadius: 8, overflow: 'hidden', backgroundColor: DARK_GREY, borderWidth: 1, borderColor: BORDER_GREY },
  coverImage: { width: '100%', height: '100%' },
  badgeContainer: { position: 'absolute', top: 8, left: 8, alignItems: 'flex-start', gap: 4 },
  rankBadge: { backgroundColor: BRAND_RED, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  rankBadgeText: { color: WHITE, fontSize: 10, fontWeight: '900' },
  epBadge: { backgroundColor: WHITE, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  epBadgeText: { color: BLACK, fontSize: 10, fontWeight: '900' },
  saveBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.65)', width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: BORDER_GREY },
  saveBtnActive: { backgroundColor: 'rgba(0,0,0,0.85)', borderColor: PURE_RED },
  animeTitle: { color: '#E0E0E0', fontSize: 13, fontWeight: '700', marginTop: 8 },
  skeletonCard: { width: 140, height: 210, backgroundColor: DARK_GREY, borderRadius: 8, borderWidth: 1, borderColor: BORDER_GREY }
});
