import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Animated } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Svg, { Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import ProxyImage from '../../components/ProxyImage';

const BRAND_RED = '#E50914'; const BLACK = '#000000'; const WHITE = '#FFFFFF'; const DARK_GREY = '#18181C'; const BORDER_GREY = '#26262C'; const TEXT_GREY = '#8E8E93';
const TMDB_API_KEY = 'f39f02a34ded84924626dd5ec7de1f29';

const BookmarkIcon = ({ filled }) => (
  <Svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? BRAND_RED : "none"} stroke={filled ? BRAND_RED : WHITE} strokeWidth="2.5"><Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></Svg>
);

const SliderSkeleton = () => {
  const shimmer = useRef(new Animated.Value(0.3)).current;
  useEffect(() => { Animated.loop(Animated.sequence([Animated.timing(shimmer, { toValue: 0.6, duration: 800, useNativeDriver: true }), Animated.timing(shimmer, { toValue: 0.3, duration: 800, useNativeDriver: true })])).start(); }, [shimmer]);
  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}><Text style={styles.sectionTitle}>All-Time Popular</Text></View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 15 }}>{[1, 2, 3].map((_, i) => <Animated.View key={i} style={[styles.skeletonCard, { opacity: shimmer }]} />)}</View>
    </View>
  );
};

export default function AllTimePopularSlider({ user, onSelectAnime }) {
  const [animeList, setAnimeList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [librarySet, setLibrarySet] = useState(new Set());

  useEffect(() => {
    if (!user) return;
    const unsub = firestore().collection('users').doc(user.uid).collection('library').onSnapshot(snap => {
      const lib = new Set(); snap?.forEach(doc => lib.add(doc.id)); setLibrarySet(lib);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    let isMounted = true;
    const fetchInstantData = async () => {
      try {
        // 1. FAST INITIAL LOAD: Fetch directly from AniList and show cards immediately
        const query = `query { Page(page: 1, perPage: 12) { media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { id title { romaji english } bannerImage coverImage { extraLarge } description genres status format episodes } } }`;
        const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
        const data = (await res.json())?.data?.Page?.media || [];

        const initialMapped = data.map(anime => {
          const title = anime.title.english || anime.title.romaji;
          return {
            id: String(anime.id),
            title,
            image: anime.coverImage?.extraLarge,
            backdrop: anime.bannerImage || anime.coverImage?.extraLarge,
            logo: null, // Will load lazily
            description: anime.description?.replace(/<[^>]*>?/gm, '').trim() || '',
            genres: anime.genres || ['Anime'],
            status: anime.status,
            format: anime.format,
            sub: anime.episodes || '?',
            dub: 0
          };
        });

        if (isMounted) {
          setAnimeList(initialMapped);
          setLoading(false); // UI is now fully rendered and responsive!
        }

        // 2. BACKGROUND HYDRATION: Fetch Vercel IDs and TMDB logos concurrently without blocking UI
        initialMapped.forEach(async (item, index) => {
          try {
            // Fetch Vercel Play ID
            const vRes = await fetch(`https://anikoto-api-lyart.vercel.app/api/search?keyword=${encodeURIComponent(item.title)}`);
            const vData = await vRes.json();
            const exactMatch = (vData?.data || vData?.results || [])[0];
            const resolvedId = exactMatch?.id || item.id;
            const resolvedSub = exactMatch?.sub || item.sub;
            const resolvedDub = exactMatch?.dub || 0;

            // Fetch TMDB Logo
            let tmdbLogo = null;
            const searchType = item.format === 'MOVIE' ? 'movie' : 'tv';
            const tRes = await fetch(`https://api.themoviedb.org/3/search/${searchType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(item.title)}`);
            const tData = await tRes.json();
            if (tData?.results?.[0]) {
              const imgRes = await fetch(`https://api.themoviedb.org/3/${searchType}/${tData.results[0].id}?api_key=${TMDB_API_KEY}&append_to_response=images`);
              const imgData = await imgRes.json();
              const logos = imgData?.images?.logos || [];
              const bestLogo = logos.find(l => l.iso_639_1 === 'en') || logos.find(l => l.iso_639_1 === 'ja') || logos[0];
              if (bestLogo) tmdbLogo = `https://image.tmdb.org/t/p/w300${bestLogo.file_path}`;
            }

            if (isMounted) {
              setAnimeList(prevList => {
                const updated = [...prevList];
                if (updated[index]) {
                  updated[index] = {
                    ...updated[index],
                    id: resolvedId,
                    logo: tmdbLogo,
                    sub: resolvedSub,
                    dub: resolvedDub
                  };
                }
                return updated;
              });
            }
          } catch (_) {}
        });

      } catch (err) {
        if (isMounted) setLoading(false);
      }
    };

    fetchInstantData();
    return () => { isMounted = false; };
  }, []);

  const handleSelect = (anime) => { if (onSelectAnime) onSelectAnime(anime); };
  const toggleLib = async (anime) => {
    if (!user) return;
    const ref = firestore().collection('users').doc(user.uid).collection('library').doc(anime.id);
    if (librarySet.has(anime.id)) await ref.delete().catch(() => {});
    else await ref.set({ id: anime.id, title: anime.title, img: anime.image, addedAt: Date.now() }).catch(() => {});
  };

  if (loading) return <SliderSkeleton />;
  if (animeList.length === 0) return null;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}><Text style={styles.sectionTitle}>All-Time Popular</Text></View>
      <FlatList 
        data={animeList} 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        keyExtractor={i => i.id} 
        contentContainerStyle={styles.listPadding} 
        snapToInterval={295} 
        decelerationRate="fast"
        windowSize={5}
        maxToRenderPerBatch={4}
        initialNumToRender={3}
        removeClippedSubviews={true}
        renderItem={({ item }) => {
          const isAdded = librarySet.has(item.id);
          return (
            <TouchableOpacity style={styles.cardContainer} activeOpacity={0.88} onPress={() => handleSelect(item)}>
              <ProxyImage source={{ uri: item.backdrop || item.image }} style={styles.bgImage} resizeMode="cover" />
              
              <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
                <Defs><LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#000" stopOpacity="0.1" /><Stop offset="0.5" stopColor="#000" stopOpacity="0.5" /><Stop offset="1" stopColor="#000" stopOpacity="0.95" /></LinearGradient></Defs>
                <Rect width="100%" height="100%" fill="url(#grad)" />
              </Svg>

              {/* Top Badges */}
              <View style={styles.topBadgesRow}>
                <View style={styles.ccBadge}><Text style={styles.ccBadgeText}>CC {item.sub}</Text></View>
                {item.dub > 0 && <View style={styles.dubBadge}><Text style={styles.dubBadgeText}>DUB {item.dub}</Text></View>}
              </View>

              {/* Save Button */}
              <TouchableOpacity style={[styles.saveBtn, isAdded && styles.saveBtnActive]} onPress={() => toggleLib(item)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><BookmarkIcon filled={isAdded} /></TouchableOpacity>

              {/* Bottom Content */}
              <View style={styles.bottomContent}>
                {item.logo ? (
                  <ProxyImage source={{ uri: item.logo }} style={styles.titleLogo} resizeMode="contain" />
                ) : (
                  <Text style={styles.titleText} numberOfLines={1}>{item.title}</Text>
                )}
                <Text style={styles.synopsisText} numberOfLines={2}>{item.description}</Text>
                <Text style={styles.genresText} numberOfLines={1}>{item.genres.join(' • ')}</Text>
              </View>
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
  cardContainer: { width: 280, height: 160, marginRight: 15, borderRadius: 10, overflow: 'hidden', backgroundColor: DARK_GREY, borderWidth: 1, borderColor: BORDER_GREY },
  bgImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  topBadgesRow: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', gap: 6 },
  ccBadge: { backgroundColor: DARK_GREY, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: BORDER_GREY },
  ccBadgeText: { color: WHITE, fontSize: 9, fontWeight: 'bold' },
  dubBadge: { backgroundColor: WHITE, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  dubBadgeText: { color: BLACK, fontSize: 9, fontWeight: '900' },
  saveBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  saveBtnActive: { backgroundColor: 'rgba(0,0,0,0.85)', borderColor: BRAND_RED },
  bottomContent: { position: 'absolute', bottom: 12, left: 12, right: 12 },
  titleLogo: { width: 140, height: 38, marginBottom: 4 },
  titleText: { color: WHITE, fontSize: 16, fontWeight: '900', marginBottom: 4, textShadowColor: BLACK, textShadowOffset: {width: 1, height: 1}, textShadowRadius: 3 },
  synopsisText: { color: '#E0E0E0', fontSize: 10, lineHeight: 14, fontWeight: '500', marginBottom: 4 },
  genresText: { color: BRAND_RED, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  skeletonCard: { width: 280, height: 160, backgroundColor: DARK_GREY, borderRadius: 10, borderWidth: 1, borderColor: BORDER_GREY }
});
