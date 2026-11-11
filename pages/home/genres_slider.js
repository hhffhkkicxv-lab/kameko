import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Animated } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import ProxyImage from '../../components/ProxyImage';

const WHITE = '#FFFFFF';
const DARK_GREY = '#18181C';
const BORDER_GREY = '#26262C';
const BRAND_RED = '#E50914';

const GENRES_CONFIG = [
  { name: 'Action', color: 'rgba(229, 9, 20, 0.65)' },    // Red
  { name: 'Romance', color: 'rgba(219, 39, 119, 0.65)' }, // Pink
  { name: 'Comedy', color: 'rgba(245, 158, 11, 0.65)' },  // Amber
  { name: 'Sci-Fi', color: 'rgba(37, 99, 235, 0.65)' },   // Blue
  { name: 'Fantasy', color: 'rgba(147, 51, 234, 0.65)' }, // Purple
  { name: 'Horror', color: 'rgba(0, 0, 0, 0.75)' },       // Black/Dark
  { name: 'Slice of Life', color: 'rgba(16, 185, 129, 0.65)' }, // Emerald
  { name: 'Sports', color: 'rgba(234, 88, 12, 0.65)' },   // Orange
  { name: 'Mystery', color: 'rgba(79, 70, 229, 0.65)' }   // Indigo
];

const GenresSkeleton = () => {
  const shimmer = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 0.6, duration: 800, useNativeDriver: true }),
      Animated.timing(shimmer, { toValue: 0.3, duration: 800, useNativeDriver: true })
    ])).start();
  }, [shimmer]);

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}><Text style={styles.sectionTitle}>Explore Genres</Text></View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 15 }}>
        {[1, 2, 3].map((_, i) => (
          <Animated.View key={i} style={[styles.skeletonCard, { opacity: shimmer }]} />
        ))}
      </View>
    </View>
  );
};

export default function GenresSlider({ onSelectGenre }) {
  const [genres, setGenres] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchGenreBackdrops = async () => {
      try {
        // Build a single GraphQL query to fetch the top 1 anime for each genre
        let queryBody = 'query { ';
        GENRES_CONFIG.forEach((g, idx) => {
          const safeName = g.name.replace(/[^a-zA-Z]/g, '');
          queryBody += `${safeName}: Page(page:1, perPage:1) { media(genre_in: ["${g.name}"], sort: POPULARITY_DESC) { bannerImage coverImage { extraLarge } } } `;
        });
        queryBody += '}';

        const response = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: queryBody })
        });
        
        const json = await response.json();
        const data = json?.data || {};

        const enrichedGenres = GENRES_CONFIG.map((g) => {
          const safeName = g.name.replace(/[^a-zA-Z]/g, '');
          const media = data[safeName]?.media?.[0];
          return {
            name: g.name,
            color: g.color,
            backdrop: media?.bannerImage || media?.coverImage?.extraLarge || null
          };
        });

        if (isMounted) {
          setGenres(enrichedGenres);
          setLoading(false);
        }
      } catch (error) {
        if (isMounted) setLoading(false);
      }
    };

    fetchGenreBackdrops();
    return () => { isMounted = false; };
  }, []);

  if (loading) return <GenresSkeleton />;
  if (genres.length === 0) return null;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Explore Genres</Text>
      </View>
      <FlatList
        data={genres}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.name}
        contentContainerStyle={styles.listPadding}
        snapToInterval={145} 
        decelerationRate="fast"
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.cardContainer} 
            activeOpacity={0.85} 
            onPress={() => onSelectGenre(item.name)}
          >
            <ProxyImage source={{ uri: item.backdrop }} style={styles.bgImage} resizeMode="cover" />
            
            {/* Color Overlay */}
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: item.color }]} />
            
            {/* Inner Border for style */}
            <View style={styles.innerBorder} />
            
            <Text style={styles.genreText}>{item.name}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: { marginTop: 15, marginBottom: 25 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { color: WHITE, fontSize: 18, fontWeight: '800', borderLeftWidth: 3, borderLeftColor: BRAND_RED, paddingLeft: 8 },
  listPadding: { paddingHorizontal: 20 },
  cardContainer: { 
    width: 135, 
    height: 75, 
    marginRight: 10,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: DARK_GREY,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER_GREY
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%'
  },
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
  },
  genreText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  skeletonCard: { width: 135, height: 75, backgroundColor: DARK_GREY, borderRadius: 8, borderWidth: 1, borderColor: BORDER_GREY }
});
