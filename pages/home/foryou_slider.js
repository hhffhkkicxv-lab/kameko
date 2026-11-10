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
const DARK_GREY = '#18181C';
const BORDER_GREY = '#26262C';
const WHITE = '#FFFFFF';
const TEXT_GREY = '#8E8E93';

const BookmarkIcon = ({ filled }) => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? BRAND_RED : "none"} stroke={filled ? BRAND_RED : WHITE} strokeWidth="2.5">
    <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </Svg>
);

const ForYouSkeleton = () => {
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
        <Text style={styles.sectionTitle}>For You</Text>
      </View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 15 }}>
        {[1, 2, 3, 4].map((_, i) => (
          <Animated.View key={i} style={[styles.skeletonCard, { opacity: shimmer }]} />
        ))}
      </View>
    </View>
  );
};

export default function ForYouSlider({ user, activeProfileId, onSelectAnime }) {
  const [animeList, setAnimeList] = useState([]);
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

  // Fetch Personalized Recommendations
  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const fetchRecommendations = async () => {
      try {
        const seeds = new Set();

        // 1. Gather seeds from Library
        const libSnap = await firestore()
          .collection('users')
          .doc(user.uid)
          .collection('library')
          .limit(3)
          .get();
        libSnap.forEach((doc) => {
          if (doc.data()?.title) seeds.add(doc.data().title);
        });

        // 2. Gather seeds from Downloads
        if (activeProfileId) {
          const dlSnap = await firestore()
            .collection('users')
            .doc(user.uid)
            .collection('profiles')
            .doc(String(activeProfileId))
            .collection('downloads')
            .limit(2)
            .get();
          dlSnap.forEach((doc) => {
            if (doc.data()?.animeTitle) seeds.add(doc.data().animeTitle);
          });
        }

        let searchTitles = Array.from(seeds);
        // Fallback to popular hits if user is brand new with empty history
        if (searchTitles.length === 0) {
          searchTitles = ["Solo Leveling", "Jujutsu Kaisen", "One Piece"];
        }

        const rawRecommendations = [];
        const query = `
          query ($search: String) {
            Media (search: $search, type: ANIME) {
              recommendations (sort: RATING_DESC, perPage: 4) {
                nodes {
                  mediaRecommendation {
                    title { romaji english }
                    coverImage { extraLarge large }
                    format
                    episodes
                    status
                    description
                  }
                }
              }
            }
          }
        `;

        // 3. Fetch from AniList based on seeds
        for (const title of searchTitles) {
          try {
            const aniRes = await fetch('https://graphql.anilist.co', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query, variables: { search: title } })
            });
            const aniData = await aniRes.json();
            const nodes = aniData?.data?.Media?.recommendations?.nodes || [];
            
            nodes.forEach((n) => {
              if (n.mediaRecommendation) {
                rawRecommendations.push(n.mediaRecommendation);
              }
            });
          } catch (_) {}
        }

        // Deduplicate raw recommendations
        const uniqueRecs = [];
        const seenTitles = new Set();
        for (const r of rawRecommendations) {
          const t = r.title?.english || r.title?.romaji;
          if (t && !seenTitles.has(t) && !seeds.has(t)) {
            seenTitles.add(t);
            uniqueRecs.push(r);
          }
        }

        // 4. Map to Vercel API to ensure Playability & get correct Stream IDs
        const baseUrl = 'https://anikoto-api-lyart.vercel.app';
        const topUnique = uniqueRecs.slice(0, 10); // Limit parallel requests

        const enrichedAnime = await Promise.all(topUnique.map(async (rec) => {
          const cleanTitle = (rec.title.english || rec.title.romaji).replace(/\(Dub\)|\(Sub\)/gi, '').trim();
          try {
            const vRes = await fetch(`${baseUrl}/api/search?keyword=${encodeURIComponent(cleanTitle)}`);
            if (!vRes.ok) return null;
            const vData = await vRes.json();
            const apiResults = vData.data || vData.results || [];
            
            const exactMatch = apiResults.find(r => (r.title || '').toLowerCase() === cleanTitle.toLowerCase()) || apiResults[0];
            if (!exactMatch) return null;

            return {
              id: exactMatch.id, // Playable Vercel ID
              title: cleanTitle,
              image: rec.coverImage?.extraLarge || rec.coverImage?.large || exactMatch.image,
              episodes: rec.episodes || exactMatch.sub || '?',
              sub: exactMatch.sub || rec.episodes || '?',
              format: rec.format || 'TV',
              status: rec.status || 'FINISHED',
              description: rec.description ? String(rec.description).replace(/<[^>]*>/g, '') : 'Highly recommended based on your watch history.',
            };
          } catch (_) {
            return null;
          }
        }));

        if (isMounted) {
          setAnimeList(enrichedAnime.filter(item => item !== null));
          setLoading(false);
        }

      } catch (error) {
        if (isMounted) setLoading(false);
      }
    };

    fetchRecommendations();
    return () => { isMounted = false; };
  }, [user, activeProfileId]);

  const handleNavigateToPlay = (anime) => {
    if (onSelectAnime) {
      onSelectAnime({ 
        id: anime.id,
        animeId: anime.id,
        title: anime.title,
        coverImage: anime.image,
        backdrop: anime.image,
        description: anime.description,
        genres: ['Action', 'Adventure'], // Fallback generic genres
        status: anime.status,
        score: 'N/A',
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
        backdrop: anime.image,
        addedAt: Date.now() 
      }).catch(() => {});
    }
  };

  if (loading) return <ForYouSkeleton />;
  if (animeList.length === 0) return null;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>For You</Text>
      </View>
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
                  <View style={styles.epBadge}>
                    <Text style={styles.epBadgeText}>{item.format === 'TV' ? 'SERIES' : item.format}</Text>
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
  epBadge: { backgroundColor: WHITE, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, shadowColor: BLACK, shadowOpacity: 0.5, shadowRadius: 3 },
  epBadgeText: { color: BLACK, fontSize: 10, fontWeight: '900' },
  ccBadge: { backgroundColor: DARK_GREY, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: BORDER_GREY },
  ccBadgeText: { color: WHITE, fontSize: 9, fontWeight: 'bold' },
  saveBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.65)', width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: BORDER_GREY },
  saveBtnActive: { backgroundColor: 'rgba(0,0,0,0.85)', borderColor: BRAND_RED },
  animeTitle: { color: '#E0E0E0', fontSize: 13, fontWeight: '700', marginTop: 8 },
  skeletonCard: { width: 140, height: 210, backgroundColor: DARK_GREY, borderRadius: 8, borderWidth: 1, borderColor: BORDER_GREY }
});
