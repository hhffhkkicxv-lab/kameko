import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Dimensions, StatusBar, Platform } from 'react-native';
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

export default function GenreGrid({ genre, onBack, onSelectAnime }) {
  const [animeList, setAnimeList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Enforce Immersive Mode rigorously
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

  useEffect(() => {
    let isMounted = true;
    const fetchGenreAnime = async () => {
      try {
        const query = `
          query {
            Page(page: 1, perPage: 18) {
              media(type: ANIME, genre_in: ["${genre}"], sort: POPULARITY_DESC, isAdult: false) {
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
        const rawList = json?.data?.Page?.media || [];

        // Validate playability against Vercel API
        const verifiedAnime = await Promise.all(rawList.map(async (anime) => {
          const titleEng = anime.title.english || anime.title.romaji;
          let streamId = null;

          try {
            const baseUrl = 'https://anikoto-api-lyart.vercel.app';
            const vercelRes = await fetch(`${baseUrl}/api/search?keyword=${encodeURIComponent(titleEng)}`);
            if (!vercelRes.ok) return null;
            
            const vercelData = await vercelRes.json();
            const apiResults = vercelData.data || vercelData.results || [];
            const exactMatch = apiResults.find(r => (r.title || '').toLowerCase() === titleEng.toLowerCase()) || apiResults[0];
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
            genres: anime.genres || [genre],
            status: anime.status,
            format: anime.format
          };
        }));

        if (isMounted) {
          setAnimeList(verifiedAnime.filter(item => item !== null));
          setLoading(false);
        }
      } catch (error) {
        if (isMounted) setLoading(false);
      }
    };

    fetchGenreAnime();
    return () => { isMounted = false; };
  }, [genre]);

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
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listPadding}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.cardContainer} 
              activeOpacity={0.85} 
              onPress={() => onSelectAnime(item)}
            >
              <View style={styles.imageBox}>
                <ProxyImage source={{ uri: item.image }} style={styles.coverImage} resizeMode="cover" />
                <View style={styles.epBadge}>
                  <Text style={styles.epBadgeText}>{item.format === 'TV' ? 'SERIES' : item.format}</Text>
                </View>
              </View>
              <Text style={styles.animeTitle} numberOfLines={2}>{item.title}</Text>
            </TouchableOpacity>
          )}
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
  epBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: WHITE,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  epBadgeText: {
    color: BLACK,
    fontSize: 9,
    fontWeight: '900',
  },
  animeTitle: {
    color: TEXT_GREY,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
    lineHeight: 16,
  }
});
