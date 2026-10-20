import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, FlatList, 
  TouchableOpacity, ActivityIndicator, Animated 
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Svg, { Path } from 'react-native-svg';
import ProxyImage from '../../components/ProxyImage';

const BRAND_RED = '#E50914';

const BookmarkIcon = ({ filled }) => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? BRAND_RED : "none"} stroke={filled ? BRAND_RED : "#FFFFFF"} strokeWidth="2.5">
    <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </Svg>
);

const Top10Skeleton = () => {
  const shimmer = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.3, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, []);

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}><Text style={styles.sectionTitle}>Top 10 Anime</Text></View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 15 }}>
        {[1, 2, 3, 4].map((_, i) => (
          <Animated.View key={i} style={[styles.skeletonCard, { opacity: shimmer }]} />
        ))}
      </View>
    </View>
  );
};

export default function Top10Slider({ user, onSelectAnime }) {
  const [top10List, setTop10List] = useState([]);
  const [loading, setLoading] = useState(true);
  const [librarySet, setLibrarySet] = useState(new Set());
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (!user) return;
    const unsubscribe = firestore()
      .collection('users')
      .doc(user.uid)
      .collection('library')
      .onSnapshot((snap) => {
        const currentLib = new Set();
        snap.forEach((doc) => currentLib.add(doc.id));
        setLibrarySet(currentLib);
      });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const fetchTop10 = async () => {
      try {
        const query = `
          query($year: Int) { 
            Page(page: 1, perPage: 25) { 
              media(type: ANIME, seasonYear: $year, sort: POPULARITY_DESC, isAdult: false) { 
                id title { romaji english } coverImage { extraLarge }
                bannerImage description genres episodes status format averageScore
              } 
            } 
          }
        `;

        const response = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { year: currentYear } })
        });
        
        const json = await response.json();
        const aniListMedia = json?.data?.Page?.media || [];

        const verifiedTop10 = await Promise.all(aniListMedia.map(async (anime) => {
          const titleEng = anime.title.english || anime.title.romaji;
          const titleRom = anime.title.romaji || titleEng;
          let streamId = null;

          try {
            const baseUrl = 'https://anikoto-api-lyart.vercel.app';
            const vercelRes = await fetch(`${baseUrl}/api/search?keyword=${encodeURIComponent(titleEng)}`);
            if (!vercelRes.ok) return null;
            
            const vercelData = await vercelRes.json();
            const apiResults = vercelData.data || vercelData.results || vercelData || [];
            
            const exactMatch = apiResults.find(r => {
              const rTitle = (r.title || '').toLowerCase();
              return rTitle === titleEng.toLowerCase() || rTitle === titleRom.toLowerCase();
            }) || apiResults[0];

            if (!exactMatch) return null;

            streamId = exactMatch.id;
          } catch(e) {
            return null;
          }

          return {
            id: streamId,
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
        }));

        setTop10List(verifiedTop10.filter(item => item !== null).slice(0, 10));
      } catch (error) {
        console.error("Top 10 Slider fetch error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTop10();
  }, [currentYear]);

  const handleNavigateToPlay = (anime) => {
    if (onSelectAnime) {
      onSelectAnime({ 
        id: anime.id,
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
      await ref.delete();
    } else {
      await ref.set({ id: anime.id, title: anime.title, img: anime.image, addedAt: firestore.FieldValue.serverTimestamp() });
    }
  };

  if (loading) return <Top10Skeleton />;
  if (top10List.length === 0) return null;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Top 10 Anime of {currentYear}</Text>
      </View>
      <FlatList
        data={top10List}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listPadding}
        snapToInterval={155} 
        decelerationRate="fast"
        renderItem={({ item, index }) => {
          const isAdded = librarySet.has(item.id);
          const rank = index + 1;
          return (
            <TouchableOpacity style={styles.cardContainer} activeOpacity={0.85} onPress={() => handleNavigateToPlay(item)}>
              <View style={styles.imageWrapper}>
                <ProxyImage source={{ uri: item.image }} style={styles.coverImage} resizeMode="cover" />
                
                {/* Large overlapping numbers matching web styling context */}
                <View style={styles.badgeContainer}>
                  <View style={styles.rankBadge}><Text style={styles.rankBadgeText}>#{rank}</Text></View>
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
  loadingContainer: { height: 200, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', borderLeftWidth: 3, borderLeftColor: BRAND_RED, paddingLeft: 8 },
  listPadding: { paddingHorizontal: 20 },
  cardContainer: { width: 140, marginRight: 15 },
  imageWrapper: { width: 140, height: 210, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2A2A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  coverImage: { width: '100%', height: '100%' },
  badgeContainer: { position: 'absolute', top: 8, left: 8, alignItems: 'flex-start', gap: 4 },
  rankBadge: { backgroundColor: BRAND_RED, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  rankBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  epBadge: { backgroundColor: '#FFFFFF', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  epBadgeText: { color: '#000000', fontSize: 10, fontWeight: '900' },
  saveBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.65)', width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  saveBtnActive: { backgroundColor: 'rgba(0,0,0,0.85)', borderColor: BRAND_RED },
  animeTitle: { color: '#E0E0E0', fontSize: 13, fontWeight: '700', marginTop: 8 },
  skeletonCard: { width: 140, height: 210, backgroundColor: '#2A2A2A', borderRadius: 8 }
});
