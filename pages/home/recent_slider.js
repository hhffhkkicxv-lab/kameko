import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, FlatList, 
  TouchableOpacity, Animated 
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Svg, { Path } from 'react-native-svg';
import ProxyImage from '../../components/ProxyImage';

const BRAND_RED = '#E50914';
const BLACK = '#000000';
const WHITE = '#FFFFFF';
const DARK_GREY = '#18181C';
const BORDER_GREY = '#26262C';

const BookmarkIcon = ({ filled }) => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? BRAND_RED : "none"} stroke={filled ? BRAND_RED : WHITE} strokeWidth="2.5">
    <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </Svg>
);

const RecentSkeleton = () => {
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
      <View style={styles.headerRow}><Text style={styles.sectionTitle}>Newest Releases</Text></View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 15 }}>
        {[1, 2, 3, 4].map((_, i) => (
          <Animated.View key={i} style={[styles.skeletonCard, { opacity: shimmer }]} />
        ))}
      </View>
    </View>
  );
};

export default function RecentSlider({ user, onSelectAnime }) {
  const [animeList, setAnimeList] = useState([]);
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
    const fetchRecentReleases = async () => {
      try {
        const baseUrl = 'https://anikoto-api-lyart.vercel.app';
        // 1. Fetch initial fast data
        const rawRes = await fetch(`${baseUrl}/api/latest-episodes`);
        const response = await rawRes.json();
        
        const recentEpisodes = response.data || response.results || [];
        const topRecent = recentEpisodes.slice(0, 15); // Limit to 15 to keep hydration fast

        // Map initial fast state so UI renders instantly
        const initialFastData = topRecent.map(slide => {
          const cleanTitle = (slide.title || '').replace(/\(Dub\)|\(Sub\)|Episode \d+/gi, '').trim();
          return {
            id: String(slide.id),
            rawTitle: cleanTitle,
            title: cleanTitle,
            image: slide.image || slide.poster || '',
            episode: slide.episodeNumber || slide.episode || null,
            sub: slide.tvInfo?.sub || slide.sub || '?',
            dub: slide.tvInfo?.dub || slide.dub || 0,
            status: 'RELEASING'
          };
        });

        if (isMounted) {
          setAnimeList(initialFastData);
          setLoading(false); // Instantly drop the skeleton loader
        }

        // 2. Background Hydration: Fetch high-quality AniList covers & verify exact Stream IDs
        initialFastData.forEach(async (item, index) => {
          try {
            let streamId = item.id;
            let finalImage = item.image;
            let finalStatus = item.status;

            // Resolve exact Vercel ID
            const vercelRes = await fetch(`${baseUrl}/api/search?keyword=${encodeURIComponent(item.rawTitle)}`);
            if (vercelRes.ok) {
              const vercelData = await vercelRes.json();
              const apiResults = vercelData.data || vercelData.results || vercelData || [];
              const exactMatch = apiResults.find(r => (r.title || '').toLowerCase() === item.rawTitle.toLowerCase()) || apiResults[0];
              if (exactMatch) streamId = exactMatch.id;
            }

            // Resolve HQ Image from AniList
            const query = `query ($search: String) { 
              Media (search: $search, type: ANIME, sort: SEARCH_MATCH) { 
                coverImage { extraLarge } 
                status
              } 
            }`;
            const aniRes = await fetch('https://graphql.anilist.co', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query, variables: { search: item.rawTitle } })
            });
            const aniData = await aniRes.json();
            
            if (aniData?.data?.Media) {
              if (aniData.data.Media.coverImage?.extraLarge) finalImage = aniData.data.Media.coverImage.extraLarge;
              if (aniData.data.Media.status) finalStatus = aniData.data.Media.status;
            }

            if (isMounted) {
              setAnimeList(prevList => {
                const updated = [...prevList];
                if (updated[index]) {
                  updated[index] = {
                    ...updated[index],
                    id: streamId,
                    image: finalImage,
                    status: finalStatus
                  };
                }
                return updated;
              });
            }
          } catch (e) {
            // Silently fail hydration for single items
          }
        });

      } catch (error) {
        if (isMounted) setLoading(false);
      }
    };

    fetchRecentReleases();
    return () => { isMounted = false; };
  }, []);

  const handleNavigateToPlay = (anime) => {
    if (onSelectAnime) {
      onSelectAnime({ 
        id: anime.id,
        animeId: anime.id,
        title: anime.title,
        coverImage: anime.image,
        backdrop: anime.image,
        description: "Latest episode released.",
        genres: ['Anime'],
        status: anime.status,
        score: 'N/A',
        rating: 'U/A 13+'
      });
    }
  };

  const toggleLibrary = async (anime) => {
    if (!user) return;
    const ref = firestore().collection('users').doc(user.uid).collection('library').doc(anime.id);
    if (librarySet.has(anime.id)) await ref.delete().catch(() => {});
    else await ref.set({ id: anime.id, title: anime.title, img: anime.image, addedAt: Date.now() }).catch(() => {});
  };

  if (loading) return <RecentSkeleton />;
  if (animeList.length === 0) return null;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}><Text style={styles.sectionTitle}>Newest Releases</Text></View>
      <FlatList
        data={animeList}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listPadding}
        snapToInterval={155} 
        decelerationRate="fast"
        renderItem={({ item }) => {
          const isAdded = librarySet.has(item.id);
          return (
            <TouchableOpacity style={styles.cardContainer} activeOpacity={0.85} onPress={() => handleNavigateToPlay(item)}>
              <View style={styles.imageWrapper}>
                <ProxyImage source={{ uri: item.image }} style={styles.coverImage} resizeMode="cover" />
                
                <View style={styles.badgeContainer}>
                  {item.episode && <View style={styles.epBadge}><Text style={styles.epBadgeText}>EP {item.episode}</Text></View>}
                  <View style={styles.ccBadge}><Text style={styles.ccBadgeText}>CC {item.sub}</Text></View>
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
  imageWrapper: { width: 140, height: 210, borderRadius: 8, overflow: 'hidden', backgroundColor: DARK_GREY, borderWidth: 1, borderColor: BORDER_GREY },
  coverImage: { width: '100%', height: '100%' },
  badgeContainer: { position: 'absolute', top: 8, left: 8, alignItems: 'flex-start', gap: 4 },
  epBadge: { backgroundColor: WHITE, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, shadowColor: BLACK, shadowOpacity: 0.5, shadowRadius: 3 },
  epBadgeText: { color: BLACK, fontSize: 10, fontWeight: '900' },
  ccBadge: { backgroundColor: DARK_GREY, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: BORDER_GREY },
  ccBadgeText: { color: WHITE, fontSize: 9, fontWeight: 'bold' },
  saveBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.65)', width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: BORDER_GREY },
  saveBtnActive: { backgroundColor: 'rgba(0,0,0,0.85)', borderColor: BRAND_RED },
  animeTitle: { color: '#E0E0E0', fontSize: 13, fontWeight: '700', marginTop: 8 },
  skeletonCard: { width: 140, height: 210, backgroundColor: DARK_GREY, borderRadius: 8, borderWidth: 1, borderColor: BORDER_GREY }
});
