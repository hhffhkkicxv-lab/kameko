import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  ActivityIndicator, Dimensions, StatusBar, Platform 
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Svg, { Path } from 'react-native-svg';
import * as NavigationBar from 'expo-navigation-bar';
import ProxyImage from '../../components/ProxyImage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('screen');

// --- STRICT PALETTE ---
const BLACK = '#000000';
const WHITE = '#FFFFFF';
const PURE_RED = '#FF0000';
const DARK_GREY = '#18181C';
const BORDER_GREY = '#26262C';
const TEXT_GREY = '#8E8E93';

const GRID_COLUMNS = 3;
const GRID_SPACING = 12;
const CARD_WIDTH = Math.floor((SCREEN_WIDTH - 40 - (GRID_SPACING * (GRID_COLUMNS - 1))) / GRID_COLUMNS);

const IconBack = ({ size = 22, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);

const BookmarkIcon = ({ filled }) => (
  <Svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? PURE_RED : "none"} stroke={filled ? PURE_RED : WHITE} strokeWidth="2.5">
    <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </Svg>
);

export default function GenreGrid({ genre, user, onBack, onSelectAnime }) {
  const [animeList, setAnimeList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [librarySet, setLibrarySet] = useState(new Set());

  // Enforce Immersive Mode
  useEffect(() => {
    const enforceImmersive = async () => {
      try {
        StatusBar.setHidden(true, 'none');
        if (Platform.OS === 'android' && NavigationBar?.setVisibilityAsync) {
          await NavigationBar.setVisibilityAsync('hidden');
          await NavigationBar.setBehaviorAsync('overlay-swipe');
        }
      } catch (_) {}
    };
    enforceImmersive();
  }, []);

  // Sync Library for Bookmarks
  useEffect(() => {
    if (!user) return;
    const unsub = firestore()
      .collection('users')
      .doc(user.uid)
      .collection('library')
      .onSnapshot(snap => {
        const lib = new Set();
        snap?.forEach(doc => lib.add(doc.id));
        setLibrarySet(lib);
      });
    return () => unsub();
  }, [user]);

  // Infinite Scroll Fetch Logic
  const fetchGenreAnime = async (pageNum, isInitial = false) => {
    if (!hasNextPage && !isInitial) return;
    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      const query = `
        query($page: Int, $genre: String) {
          Page(page: $page, perPage: 18) {
            pageInfo { hasNextPage }
            media(type: ANIME, genre_in: [$genre], sort: POPULARITY_DESC, isAdult: false) {
              id title { romaji english } coverImage { extraLarge }
              bannerImage description genres episodes status format averageScore
            }
          }
        }
      `;

      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { page: pageNum, genre } })
      });
      
      const json = await response.json();
      const rawList = json?.data?.Page?.media || [];
      setHasNextPage(json?.data?.Page?.pageInfo?.hasNextPage ?? false);

      // Validate playability against Vercel API
      const verifiedAnime = await Promise.all(rawList.map(async (anime) => {
        const titleEng = anime.title.english || anime.title.romaji;
        let streamId = null;
        let ccCount = anime.episodes || '?';

        try {
          const baseUrl = 'https://anikoto-api-lyart.vercel.app';
          const vercelRes = await fetch(`${baseUrl}/api/search?keyword=${encodeURIComponent(titleEng)}`);
          if (!vercelRes.ok) return null;
          
          const vercelData = await vercelRes.json();
          const apiResults = vercelData.data || vercelData.results || [];
          const exactMatch = apiResults.find(r => (r.title || '').toLowerCase() === titleEng.toLowerCase()) || apiResults[0];
          if (!exactMatch) return null;

          streamId = exactMatch.id;
          ccCount = exactMatch.sub || ccCount;
        } catch(e) {
          return null;
        }

        return {
          id: streamId,
          title: titleEng,
          image: anime.coverImage?.extraLarge,
          backdrop: anime.bannerImage || anime.coverImage?.extraLarge,
          description: anime.description?.replace(/<[^>]*>?/gm, '').trim() || 'No synopsis available.',
          genres: anime.genres || [genre],
          status: anime.status,
          format: anime.format,
          sub: ccCount
        };
      }));

      const validResults = verifiedAnime.filter(item => item !== null);

      setAnimeList(prev => {
        if (isInitial) return validResults;
        // Filter out duplicates just in case AniList shifts pages
        const existingIds = new Set(prev.map(i => i.id));
        const novel = validResults.filter(i => !existingIds.has(i.id));
        return [...prev, ...novel];
      });
      setPage(pageNum);

    } catch (error) {
      console.warn(error);
    } finally {
      if (isInitial) setLoading(false);
      else setLoadingMore(false);
    }
  };

  // Initial Load
  useEffect(() => {
    fetchGenreAnime(1, true);
  }, [genre]);

  const handleLoadMore = () => {
    if (!loading && !loadingMore && hasNextPage) {
      fetchGenreAnime(page + 1, false);
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

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />
      
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <IconBack />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{genre} Anime</Text>
      </View>

      {/* Grid Content */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={PURE_RED} />
        </View>
      ) : (
        <FlatList
          data={animeList}
          numColumns={GRID_COLUMNS}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          contentContainerStyle={styles.listPadding}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={PURE_RED} />
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const isAdded = librarySet.has(item.id);
            return (
              <TouchableOpacity 
                style={styles.cardContainer} 
                activeOpacity={0.85} 
                onPress={() => onSelectAnime(item)}
              >
                <View style={styles.imageBox}>
                  <ProxyImage source={{ uri: item.image }} style={styles.coverImage} resizeMode="cover" />
                  
                  {/* Badges */}
                  <View style={styles.badgeContainer}>
                    <View style={styles.epBadge}>
                      <Text style={styles.epBadgeText}>{item.format === 'TV' ? 'SERIES' : item.format}</Text>
                    </View>
                    <View style={styles.ccBadge}>
                      <Text style={styles.ccBadgeText}>CC {item.sub}</Text>
                    </View>
                  </View>

                  {/* Bookmark Button */}
                  <TouchableOpacity 
                    style={[styles.saveBtn, isAdded && styles.saveBtnActive]}
                    onPress={() => toggleLibrary(item)}
                    activeOpacity={0.8}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <BookmarkIcon filled={isAdded} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.animeTitle} numberOfLines={2}>{item.title}</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BLACK,
    zIndex: 9000,
    elevation: 9000,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 40 : 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_GREY,
    backgroundColor: BLACK,
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    color: WHITE,
    fontSize: 20,
    fontWeight: '900',
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listPadding: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120, // Clear the bottom area
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    gap: GRID_SPACING,
    marginBottom: 20,
  },
  cardContainer: {
    width: CARD_WIDTH,
  },
  imageBox: {
    width: CARD_WIDTH,
    height: Math.floor(CARD_WIDTH * 1.5),
    backgroundColor: DARK_GREY,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER_GREY,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  badgeContainer: { 
    position: 'absolute', 
    top: 6, 
    left: 6, 
    alignItems: 'flex-start', 
    gap: 4 
  },
  epBadge: { 
    backgroundColor: WHITE, 
    paddingHorizontal: 5, 
    paddingVertical: 2, 
    borderRadius: 4, 
    shadowColor: BLACK, 
    shadowOpacity: 0.5, 
    shadowRadius: 3 
  },
  epBadgeText: { 
    color: BLACK, 
    fontSize: 9, 
    fontWeight: '900' 
  },
  ccBadge: { 
    backgroundColor: DARK_GREY, 
    paddingHorizontal: 5, 
    paddingVertical: 2, 
    borderRadius: 4, 
    borderWidth: 1, 
    borderColor: BORDER_GREY 
  },
  ccBadgeText: { 
    color: WHITE, 
    fontSize: 9, 
    fontWeight: 'bold' 
  },
  saveBtn: { 
    position: 'absolute', 
    top: 6, 
    right: 6, 
    backgroundColor: 'rgba(0,0,0,0.65)', 
    width: 28, 
    height: 28, 
    borderRadius: 8, 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: BORDER_GREY 
  },
  saveBtnActive: { 
    backgroundColor: 'rgba(0,0,0,0.85)', 
    borderColor: PURE_RED 
  },
  animeTitle: {
    color: TEXT_GREY,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
    lineHeight: 16,
  }
});
