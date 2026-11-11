import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Animated } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Svg, { Path } from 'react-native-svg';
import ProxyImage from '../../components/ProxyImage';

const BRAND_RED = '#E50914'; const BLACK = '#000000'; const WHITE = '#FFFFFF'; const DARK_GREY = '#18181C'; const BORDER_GREY = '#26262C';

const BookmarkIcon = ({ filled }) => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? BRAND_RED : "none"} stroke={filled ? BRAND_RED : WHITE} strokeWidth="2.5"><Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></Svg>
);

const SliderSkeleton = () => {
  const shimmer = useRef(new Animated.Value(0.3)).current;
  useEffect(() => { Animated.loop(Animated.sequence([Animated.timing(shimmer, { toValue: 0.6, duration: 800, useNativeDriver: true }), Animated.timing(shimmer, { toValue: 0.3, duration: 800, useNativeDriver: true })])).start(); }, [shimmer]);
  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}><Text style={styles.sectionTitle}>Because you liked...</Text></View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 15 }}>{[1, 2, 3, 4].map((_, i) => <Animated.View key={i} style={[styles.skeletonCard, { opacity: shimmer }]} />)}</View>
    </View>
  );
};

export default function BecauseYouLikedSlider({ user, activeProfileId, onSelectAnime }) {
  const [animeList, setAnimeList] = useState([]);
  const [targetAnimeName, setTargetAnimeName] = useState(null);
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
    if (!user || !activeProfileId) return;
    let isMounted = true;
    
    const fetchData = async () => {
      try {
        // Find most watched anime in history
        const histSnap = await firestore().collection('users').doc(user.uid).collection('profiles').doc(String(activeProfileId)).collection('watch_history').get();
        let topAnimeTitle = null;
        let maxEps = -1;
        
        histSnap.forEach(doc => {
          const data = doc.data();
          const epCount = data.episodeNum || Object.keys(data.episodes || {}).length || 0;
          if (epCount > maxEps && data.animeTitle) {
            maxEps = epCount;
            topAnimeTitle = data.animeTitle;
          }
        });

        if (!topAnimeTitle) {
          if (isMounted) setLoading(false);
          return;
        }

        if (isMounted) setTargetAnimeName(topAnimeTitle);

        // Fetch Recommendations based on that specific title
        const query = `query ($search: String) { Media (search: $search, type: ANIME) { recommendations (sort: RATING_DESC, perPage: 15) { nodes { mediaRecommendation { title { romaji english } coverImage { extraLarge } bannerImage description genres status format episodes } } } } }`;
        const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables: { search: topAnimeTitle } }) });
        const dataNodes = (await res.json())?.data?.Media?.recommendations?.nodes || [];
        
        const rawRecs = [];
        dataNodes.forEach(n => { if (n.mediaRecommendation) rawRecs.push(n.mediaRecommendation); });

        const verified = await Promise.all(rawRecs.map(async (anime) => {
          const title = anime.title.english || anime.title.romaji;
          try {
            const vRes = await fetch(`https://anikoto-api-lyart.vercel.app/api/search?keyword=${encodeURIComponent(title)}`);
            if (!vRes.ok) return null;
            const exactMatch = (await vRes.json())?.data?.[0];
            if (!exactMatch) return null;

            return {
              id: exactMatch.id, title, image: anime.coverImage?.extraLarge, backdrop: anime.bannerImage || anime.coverImage?.extraLarge,
              description: anime.description?.replace(/<[^>]*>?/gm, '').trim() || '', genres: anime.genres || ['Anime'],
              status: anime.status, format: anime.format, sub: exactMatch.sub || anime.episodes || '?'
            };
          } catch(e) { return null; }
        }));
        if (isMounted) { setAnimeList(verified.filter(i => i !== null).slice(0, 15)); setLoading(false); }
      } catch (err) { if (isMounted) setLoading(false); }
    };
    fetchData();
    return () => { isMounted = false; };
  }, [user, activeProfileId]);

  const handleSelect = (anime) => { if (onSelectAnime) onSelectAnime(anime); };
  const toggleLib = async (anime) => {
    if (!user) return;
    const ref = firestore().collection('users').doc(user.uid).collection('library').doc(anime.id);
    if (librarySet.has(anime.id)) await ref.delete().catch(() => {});
    else await ref.set({ id: anime.id, title: anime.title, img: anime.image, addedAt: Date.now() }).catch(() => {});
  };

  if (loading) return <SliderSkeleton />;
  if (animeList.length === 0 || !targetAnimeName) return null;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Because you liked</Text>
        <Text style={styles.highlightTitle}> {targetAnimeName}</Text>
      </View>
      <FlatList data={animeList} horizontal showsHorizontalScrollIndicator={false} keyExtractor={i => i.id} contentContainerStyle={styles.listPadding} snapToInterval={155} decelerationRate="fast" renderItem={({ item }) => {
        const isAdded = librarySet.has(item.id);
        return (
          <TouchableOpacity style={styles.cardContainer} activeOpacity={0.85} onPress={() => handleSelect(item)}>
            <View style={styles.imageWrapper}>
              <ProxyImage source={{ uri: item.image }} style={styles.coverImage} resizeMode="cover" />
              <TouchableOpacity style={[styles.saveBtn, isAdded && styles.saveBtnActive]} onPress={() => toggleLib(item)}><BookmarkIcon filled={isAdded} /></TouchableOpacity>
            </View>
            <Text style={styles.animeTitle} numberOfLines={1}>{item.title}</Text>
          </TouchableOpacity>
        );
      }} />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: { marginTop: 15, marginBottom: 25 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12, flexWrap: 'wrap' },
  sectionTitle: { color: WHITE, fontSize: 18, fontWeight: '800', borderLeftWidth: 3, borderLeftColor: BRAND_RED, paddingLeft: 8 },
  highlightTitle: { color: TEXT_GREY, fontSize: 18, fontWeight: '600' },
  listPadding: { paddingHorizontal: 20 },
  cardContainer: { width: 140, marginRight: 15 },
  imageWrapper: { width: 140, height: 210, borderRadius: 8, overflow: 'hidden', backgroundColor: DARK_GREY, borderWidth: 1, borderColor: BORDER_GREY },
  coverImage: { width: '100%', height: '100%' },
  saveBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.65)', width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: BORDER_GREY },
  saveBtnActive: { backgroundColor: 'rgba(0,0,0,0.85)', borderColor: BRAND_RED },
  animeTitle: { color: '#E0E0E0', fontSize: 13, fontWeight: '700', marginTop: 8 },
  skeletonCard: { width: 140, height: 210, backgroundColor: DARK_GREY, borderRadius: 8, borderWidth: 1, borderColor: BORDER_GREY }
});
