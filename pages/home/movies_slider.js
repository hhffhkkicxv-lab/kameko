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
const BLACK = '#000000';
const WHITE = '#FFFFFF';
const DARK_GREY = '#18181C';
const BORDER_GREY = '#26262C';
const TEXT_GREY = '#8E8E93';

const BookmarkIcon = ({ filled }) => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? BRAND_RED : "none"} stroke={filled ? BRAND_RED : WHITE} strokeWidth="2.5">
    <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </Svg>
);

const MoviesSkeleton = () => {
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
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Popular Movies</Text>
      </View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 15 }}>
        {[1, 2, 3, 4].map((_, i) => (
          <Animated.View key={i} style={[styles.skeletonCard, { opacity: shimmer }]} />
        ))}
      </View>
    </View>
  );
};

export default function MoviesSlider({ user, activeProfileId, onSelectAnime }) {
  const [movieList, setMovieList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [librarySet, setLibrarySet] = useState(new Set());

  // Keep library bookmarks synced for UI toggles
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
    const fetchMovies = async () => {
      try {
        const query = `
          query { 
            Page(page: 1, perPage: 25) { 
              media(type: ANIME, format: MOVIE, sort: POPULARITY_DESC, isAdult: false) { 
                id title { romaji english } coverImage { extraLarge }
                bannerImage description genres status format averageScore
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

        const verifiedMovies = await Promise.all(aniListMedia.map(async (anime) => {
          const titleEng = anime.title.english || anime.title.romaji;
          const titleRom = anime.title.romaji || titleEng;
          let streamId = null;
          let durationOrSub = '1'; 

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
            durationOrSub = exactMatch.sub || '1';
          } catch(e) {
            return null;
          }

          return {
            id: streamId,
            title: titleEng,
            image: anime.coverImage?.extraLarge,
            backdrop: anime.bannerImage || anime.coverImage?.extraLarge,
            description: anime.description?.replace(/<[^>]*>?/gm, '').trim() || 'No synopsis available.',
            genres: anime.genres || ['Movie'],
            score: anime.averageScore,
            sub: durationOrSub,
            status: anime.status,
            format: anime.format || 'MOVIE'
          };
        }));

        if (isMounted) {
          setMovieList(verifiedMovies.filter(item => item !== null).slice(0, 15));
          setLoading(false);
        }
      } catch (error) {
        if (isMounted) setLoading(false);
      }
    };

    fetchMovies();
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
        rating: 'U/A 13+',
        format: anime.format
      });
    }
  };

  const toggleLibrary = async (anime) => {
    if (!user) return;
    const ref = firestore().collection('users').doc(user.uid).collection('library').doc(anime.id);
    if (librarySet.has(anime.id)) {
      await ref.delete().catch(() => {});
    } else {
      await ref.set({ 
        id: anime.id, 
        animeId: anime.id,
        title: anime.title, 
        img: anime.image, 
        backdrop: anime.backdrop,
        addedAt: Date.now() 
      }).catch(() => {});
    }
  };

  if (loading) return <MoviesSkeleton />;
  if (movieList.length === 0) return null;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Popular Movies</Text>
      </View>
      <FlatList
        data={movieList}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listPadding}
        snapToInterval={155} 
        decelerationRate="fast"
        renderItem={({ item }) => {
          const isAdded = librarySet.has(item.id);
          return (
            <TouchableOpacity 
              style={styles.cardContainer} 
              activeOpacity={0.85} 
              onPress={() => handleNavigateToPlay(item)}
            >
              <View style={styles.imageWrapper}>
                <ProxyImage source={{ uri: item.image }} style={styles.coverImage} resizeMode="cover" />
                
                <View style={styles.badgeContainer}>
                  <View style={styles.formatBadge}>
                    <Text style={styles.formatBadgeText}>MOVIE</Text>
                  </View>
                  <View style={styles.ccBadge}>
                    <Text style={styles.ccBadgeText}>CC {item.sub}</Text>
                  </View>
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
  sectionContainer: { marginTop: 15, marginBottom: 25 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { color: WHITE, fontSize: 18, fontWeight: '800', borderLeftWidth: 3, borderLeftColor: BRAND_RED, paddingLeft: 8 },
  listPadding: { paddingHorizontal: 20 },
  cardContainer: { width: 140, marginRight: 15 },
  imageWrapper: { 
    width: 140, 
    height: 210, 
    borderRadius: 8, 
    overflow: 'hidden', 
    backgroundColor: DARK_GREY, 
    borderWidth: 1, 
    borderColor: BORDER_GREY 
  },
  coverImage: { width: '100%', height: '100%' },
  badgeContainer: { position: 'absolute', top: 8, left: 8, alignItems: 'flex-start', gap: 4 },
  formatBadge: { backgroundColor: WHITE, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, shadowColor: BLACK, shadowOpacity: 0.5, shadowRadius: 3 },
  formatBadgeText: { color: BLACK, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  ccBadge: { backgroundColor: DARK_GREY, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: BORDER_GREY },
  ccBadgeText: { color: WHITE, fontSize: 9, fontWeight: 'bold' },
  saveBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.65)', width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: BORDER_GREY },
  saveBtnActive: { backgroundColor: 'rgba(0,0,0,0.85)', borderColor: BRAND_RED },
  animeTitle: { color: '#E0E0E0', fontSize: 13, fontWeight: '700', marginTop: 8 },
  skeletonCard: { width: 140, height: 210, backgroundColor: DARK_GREY, borderRadius: 8, borderWidth: 1, borderColor: BORDER_GREY }
});
