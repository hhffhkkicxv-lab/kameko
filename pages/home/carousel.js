import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, Dimensions, 
  TouchableOpacity, Animated 
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Svg, { Defs, LinearGradient, Stop, Rect, Path } from 'react-native-svg';

import ProxyImage from '../../components/ProxyImage';
import ShareSheet from '../../components/ShareSheet';

const { width } = Dimensions.get('window');
const HEIGHT = 520;
const TMDB_API_KEY = 'f39f02a34ded84924626dd5ec7de1f29';
const VERCEL_API_BASE = 'https://anikoto-api-lyart.vercel.app';
const BRAND_RED = '#E50914';

// --- Safe Fetch Helper ---
const fetchWithTimeout = async (url, options = {}, timeoutMs = 4000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
};

// --- CUSTOM SVG ICONS ---
const IconPlay = ({ size = 15, color = "#FFFFFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M8 5v14l11-7z" />
  </Svg>
);

const IconPlus = ({ size = 16, color = "#FFFFFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);

const IconCheck = ({ size = 16, color = "#000000" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 6L9 17l-5-5" />
  </Svg>
);

const IconShare = ({ size = 16, color = "#FFFFFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
  </Svg>
);

// PRE-LOADED INSTANT HERO SLIDE to completely eliminate skeleton wait times
const INSTANT_SLIDES = [
  {
    id: 'solo-leveling',
    rawTitle: 'Solo Leveling',
    title: 'Solo Leveling',
    description: 'They say whatever doesn’t kill you makes you stronger, but that’s not the case for the world’s weakest hunter Sung Jinwoo.',
    score: 85,
    genres: ['Action', 'Adventure', 'Fantasy'],
    format: 'TV',
    episodes: 12,
    status: 'FINISHED',
    coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151807-m1gX3iqITmI6.png',
    backdrop: 'https://image.tmdb.org/t/p/original/vIgyYkXkg6NC2whRbYjBD7eb3Er.jpg',
    logo: 'https://image.tmdb.org/t/p/w500/y6L4o67x0X7UvWdE2p4d3j0B2G3.png',
    contentRating: 'U/A 13+'
  }
];

export default function Carousel({ user, onSelectAnime }) {
  // Initialize with fast hardcoded slide so it renders instantly
  const [slides, setSlides] = useState(INSTANT_SLIDES);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Set loading to FALSE immediately so it renders without skeleton
  const [loading, setLoading] = useState(false); 
  const [isNavigating, setIsNavigating] = useState(false);
  const [librarySet, setLibrarySet] = useState(new Set());
  const [shareData, setShareData] = useState({ visible: false, title: '', id: '' });

  const fadeAnims = useRef([new Animated.Value(1)]).current;
  const scaleAnims = useRef([new Animated.Value(1.05)]).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // 1. Navigation Progress Bar
  useEffect(() => {
    if (isNavigating) {
      progressAnim.setValue(0);
      Animated.loop(
        Animated.sequence([
          Animated.timing(progressAnim, { toValue: 1, duration: 900, useNativeDriver: false }),
          Animated.timing(progressAnim, { toValue: 0, duration: 0, useNativeDriver: false }),
        ])
      ).start();
    } else {
      progressAnim.stopAnimation();
      progressAnim.setValue(0);
    }
  }, [isNavigating, progressAnim]);

  const progressBarWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // 2. Firebase Library Sync
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
      }, () => {});
    return () => unsubscribe();
  }, [user]);

  // 3. Fast Metadata Engine (Background Hydration)
  useEffect(() => {
    let isMounted = true;

    const fetchCarouselData = async () => {
      try {
        const aniQuery = `
          query { 
            Page(page: 1, perPage: 10) { 
              media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { 
                id
                idMal
                title { romaji english native }
                description
                averageScore
                genres
                format
                episodes
                status
                bannerImage
                coverImage { extraLarge large }
              } 
            } 
          }
        `;

        const aniRes = await fetchWithTimeout('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: aniQuery })
        }, 5000);
        
        const aniData = await aniRes.json();
        const aniListMedia = aniData?.data?.Page?.media || [];

        const fastSlides = aniListMedia.map((anime) => {
          const primaryTitle = anime.title.english || anime.title.romaji || 'Unknown Anime';
          return {
            id: String(anime.id),
            rawTitle: primaryTitle,
            malId: anime.idMal,
            title: primaryTitle,
            description: anime.description?.replace(/<[^>]*>?/gm, '').trim() || 'No synopsis available.',
            score: anime.averageScore,
            genres: anime.genres?.slice(0, 3) || ['Action', 'Anime'],
            format: anime.format || 'TV',
            episodes: anime.episodes || 0,
            status: anime.status,
            coverImage: anime.coverImage?.extraLarge || anime.coverImage?.large,
            backdrop: anime.bannerImage || anime.coverImage?.extraLarge,
            logo: null,
            contentRating: 'U/A 13+'
          };
        }).slice(0, 7);

        if (!isMounted || fastSlides.length === 0) return;

        // --- BACKGROUND RESOLUTION FOR LOGOS & VERCEL IDs ---
        const resolvedSlides = await Promise.all(
          fastSlides.map(async (slide) => {
            let streamId = slide.id;
            let tmdbLogo = slide.logo;
            let tmdbBackdrop = slide.backdrop;
            let rating = slide.contentRating;

            try {
              const vRes = await fetchWithTimeout(`${VERCEL_API_BASE}/api/search?keyword=${encodeURIComponent(slide.rawTitle)}`, {}, 3000);
              if (vRes.ok) {
                const vJson = await vRes.json();
                const matches = vJson.data || vJson.results || [];
                if (matches.length > 0) {
                  const exact = matches.find(r => (r.title || '').toLowerCase() === slide.rawTitle.toLowerCase()) || matches[0];
                  streamId = exact.id;
                }
              }

              const searchType = slide.format === 'MOVIE' ? 'movie' : 'tv';
              const tSearch = await fetchWithTimeout(`https://api.themoviedb.org/3/search/${searchType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(slide.rawTitle)}`, {}, 3000);
              if (tSearch.ok) {
                const tJson = await tSearch.json();
                const tmdbItem = tJson.results?.[0];
                
                if (tmdbItem) {
                  if (tmdbItem.backdrop_path) tmdbBackdrop = `https://image.tmdb.org/t/p/original${tmdbItem.backdrop_path}`;
                  
                  const imgRes = await fetchWithTimeout(`https://api.themoviedb.org/3/${searchType}/${tmdbItem.id}/images?api_key=${TMDB_API_KEY}`, {}, 3000);
                  if (imgRes.ok) {
                    const imgJson = await imgRes.json();
                    const logoObj = imgJson.logos?.find(l => l.iso_639_1 === 'en' || l.iso_639_1 === 'ja');
                    if (logoObj) tmdbLogo = `https://image.tmdb.org/t/p/w500${logoObj.file_path}`;
                  }

                  if (searchType === 'tv') {
                    const rateRes = await fetchWithTimeout(`https://api.themoviedb.org/3/tv/${tmdbItem.id}/content_ratings?api_key=${TMDB_API_KEY}`, {}, 3000);
                    if (rateRes.ok) {
                      const rateJson = await rateRes.json();
                      const inRating = rateJson.results?.find(r => r.iso_3166_1 === 'IN' || r.iso_3166_1 === 'US');
                      if (inRating?.rating) rating = inRating.rating.toUpperCase();
                    }
                  }
                }
              }
            } catch (_) {}

            return {
              ...slide,
              id: streamId,
              backdrop: tmdbBackdrop,
              logo: tmdbLogo,
              contentRating: rating
            };
          })
        );
        
        if (isMounted) {
          // Add animation nodes for the new slides
          resolvedSlides.forEach((_, i) => {
            if (!fadeAnims[i]) fadeAnims[i] = new Animated.Value(i === 0 ? 1 : 0);
            if (!scaleAnims[i]) scaleAnims[i] = new Animated.Value(i === 0 ? 1.05 : 1);
          });
          
          setSlides(resolvedSlides);
        }

      } catch (err) {
        console.error('Carousel network error:', err);
      }
    };

    fetchCarouselData();
    return () => { isMounted = false; };
  }, [fadeAnims, scaleAnims]);

  // 4. Auto-Rotation
  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      const nextIndex = (currentIndex + 1) % slides.length;
      transitionSlide(currentIndex, nextIndex);
      setCurrentIndex(nextIndex);
    }, 6000);
    return () => clearInterval(interval);
  }, [currentIndex, slides]);

  const transitionSlide = (fromIdx, toIdx) => {
    if (!scaleAnims[toIdx] || !fadeAnims[fromIdx]) return;
    scaleAnims[toIdx].setValue(1);
    Animated.parallel([
      Animated.timing(fadeAnims[fromIdx], { toValue: 0, duration: 750, useNativeDriver: true }),
      Animated.timing(fadeAnims[toIdx], { toValue: 1, duration: 750, useNativeDriver: true }),
      Animated.timing(scaleAnims[toIdx], { toValue: 1.05, duration: 6000, useNativeDriver: true })
    ]).start();
  };

  const handleNavigateToPlay = (animeData) => {
    setIsNavigating(true);
    setTimeout(() => {
      if (onSelectAnime) {
        onSelectAnime({
          id: animeData.id,
          malId: animeData.malId,
          title: animeData.title,
          coverImage: animeData.coverImage,
          backdrop: animeData.backdrop,
          description: animeData.description,
          genres: animeData.genres,
          status: animeData.status,
          score: animeData.score || 'N/A',
          rating: animeData.contentRating
        });
      }
      setIsNavigating(false);
    }, 350);
  };

  const toggleLibrary = async (anime) => {
    if (!user) return;
    const ref = firestore().collection('users').doc(user.uid).collection('library').doc(anime.id);
    if (librarySet.has(anime.id)) {
      await ref.delete().catch(()=>console.log("Delete failed"));
    } else {
      await ref.set({
        id: anime.id,
        malId: anime.malId || null,
        title: anime.title,
        img: anime.coverImage || anime.backdrop,
        addedAt: firestore.FieldValue.serverTimestamp()
      }).catch(()=>console.log("Save failed"));
    }
  };

  const activeSlide = slides[currentIndex] || slides[0];

  return (
    <View style={styles.container}>
      {/* Top Routing Loading Indicator */}
      {isNavigating && (
        <View style={styles.progressBarBg}>
          <Animated.View style={[styles.progressBarFill, { width: progressBarWidth }]} />
        </View>
      )}

      {/* Share Modal */}
      <ShareSheet 
        visible={shareData.visible} 
        animeTitle={shareData.title} 
        animeId={shareData.id}
        onClose={() => setShareData({ ...shareData, visible: false })} 
      />

      {/* Layered Rotating Backdrops */}
      <View style={StyleSheet.absoluteFillObject}>
        {slides.map((slide, i) => (
          <Animated.View
            key={`slide-bg-${slide.id}-${i}`}
            style={[
              styles.slideWrapper,
              { opacity: fadeAnims[i], zIndex: currentIndex === i ? 2 : 1 }
            ]}
          >
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1A1A1A' }]} />
            <ProxyImage
              isAnimated={true}
              source={{ uri: slide.backdrop }}
              style={[styles.backdrop, { transform: [{ scale: scaleAnims[i] || 1 }] }]}
              resizeMode="cover"
              fadeDuration={0}
            />
          </Animated.View>
        ))}
      </View>

      {/* Hero Bottom Gradient */}
      <Svg height="100%" width="100%" style={styles.permanentGradient} pointerEvents="none">
        <Defs>
          <LinearGradient id="heroGradient" x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor="#000000" stopOpacity="1" />
            <Stop offset="0.32" stopColor="#000000" stopOpacity="0.9" />
            <Stop offset="0.65" stopColor="#000000" stopOpacity="0.5" />
            <Stop offset="1" stopColor="#000000" stopOpacity="0.08" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#heroGradient)" />
      </Svg>

      {/* Backdrop Tap Target */}
      <TouchableOpacity
        style={StyleSheet.absoluteFillObject}
        activeOpacity={1}
        onPress={() => handleNavigateToPlay(activeSlide)}
      />

      {/* Foreground Content */}
      {slides.map((slide, i) => (
        <Animated.View
          key={`slide-meta-${slide.id}-${i}`}
          pointerEvents={currentIndex === i ? 'box-none' : 'none'}
          style={[
            styles.uiContainer,
            { opacity: fadeAnims[i], zIndex: currentIndex === i ? 10 : 0 }
          ]}
        >
          <View style={styles.titleWrapper}>
            {slide.logo ? (
              <View style={styles.logoShadowWrapper}>
                <ProxyImage
                  source={{ uri: slide.logo }}
                  style={styles.titleLogo}
                  resizeMode="contain"
                  fadeDuration={0}
                />
              </View>
            ) : (
              <Text style={styles.titleText}>{slide.title}</Text>
            )}

            <View style={styles.metaRow}>
              <View style={styles.trendingBadge}>
                <Text style={styles.trendingBadgeText}>TOP #{i + 1}</Text>
              </View>
              <View style={styles.ratingBadge}>
                <Text style={styles.ratingText}>{slide.contentRating}</Text>
              </View>
              {slide.score ? (
                <Text style={styles.scoreText}>★ {slide.score}%</Text>
              ) : null}
              {slide.episodes ? (
                <Text style={styles.metaText}>{slide.episodes} EPS</Text>
              ) : null}
            </View>

            <View style={styles.genreRow}>
              {slide.genres.map((g, idx) => (
                <View key={idx} style={styles.genrePill}>
                  <Text style={styles.genreText}>{g}</Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={styles.descriptionText} numberOfLines={3}>
            {slide.description}
          </Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.playButton}
              activeOpacity={0.8}
              onPress={() => handleNavigateToPlay(slide)}
            >
              <IconPlay />
              <Text style={styles.playButtonText}>Play</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.libButton,
                librarySet.has(slide.id) && styles.libButtonActive
              ]}
              onPress={() => toggleLibrary(slide)}
              activeOpacity={0.8}
            >
              {librarySet.has(slide.id) ? <IconCheck /> : <IconPlus />}
              <Text
                style={[
                  styles.libButtonText,
                  librarySet.has(slide.id) && styles.libTextActive
                ]}
              >
                {librarySet.has(slide.id) ? 'In My List' : 'My List'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShareData({ visible: true, title: slide.title, id: slide.id })}
              activeOpacity={0.8}
            >
              <IconShare />
            </TouchableOpacity>
          </View>
        </Animated.View>
      ))}

      {/* Right Vertical Pagination Indicators */}
      {slides.length > 1 && (
        <View style={styles.paginationContainer}>
          {slides.map((_, i) => (
            <TouchableOpacity
              key={`page-dot-${i}`}
              onPress={() => {
                transitionSlide(currentIndex, i);
                setCurrentIndex(i);
              }}
              style={[styles.dot, currentIndex === i && styles.dotActive]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width, height: HEIGHT, backgroundColor: '#000000', overflow: 'hidden' },
  progressBarBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: '#222222', zIndex: 9999 },
  progressBarFill: { height: '100%', backgroundColor: BRAND_RED },
  slideWrapper: { ...StyleSheet.absoluteFillObject },
  backdrop: { width: '100%', height: '100%' },
  permanentGradient: { ...StyleSheet.absoluteFillObject, zIndex: 3 },
  uiContainer: { position: 'absolute', bottom: 25, left: 18, right: 40 },
  titleWrapper: { marginBottom: 10 },
  logoShadowWrapper: { 
    shadowColor: '#000000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.95, 
    shadowRadius: 8, 
    elevation: 10, 
    marginBottom: 8 
  },
  titleLogo: { width: 230, height: 80, alignSelf: 'flex-start' },
  titleText: { 
    color: '#FFFFFF', 
    fontSize: 28, 
    fontWeight: '900', 
    marginBottom: 8, 
    textShadowColor: 'rgba(0,0,0,0.9)', 
    textShadowOffset: { width: 0, height: 2 }, 
    textShadowRadius: 6 
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  trendingBadge: { backgroundColor: BRAND_RED, paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 4 },
  trendingBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  ratingBadge: { 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.4)', 
    paddingHorizontal: 6, 
    paddingVertical: 1.5, 
    borderRadius: 4, 
    backgroundColor: 'rgba(0,0,0,0.4)' 
  },
  ratingText: { color: '#E0E0E0', fontSize: 10, fontWeight: '700' },
  scoreText: { color: '#46D369', fontSize: 11, fontWeight: '800' },
  metaText: { color: '#AAAAAA', fontSize: 11, fontWeight: '600' },
  genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  genrePill: { 
    backgroundColor: 'rgba(255,255,255,0.1)', 
    paddingHorizontal: 8, 
    paddingVertical: 2.5, 
    borderRadius: 12, 
    borderWidth: 0.5, 
    borderColor: 'rgba(255,255,255,0.2)' 
  },
  genreText: { color: '#CCCCCC', fontSize: 10, fontWeight: '600' },
  descriptionText: { 
    color: '#CCCCCC', 
    fontSize: 12, 
    lineHeight: 17, 
    marginBottom: 16, 
    fontWeight: '500', 
    textShadowColor: 'rgba(0,0,0,0.9)', 
    textShadowOffset: { width: 0, height: 1 }, 
    textShadowRadius: 3 
  },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    backgroundColor: BRAND_RED, 
    paddingVertical: 10, 
    paddingHorizontal: 22, 
    borderRadius: 6, 
    shadowColor: BRAND_RED, 
    shadowOpacity: 0.45, 
    shadowRadius: 10, 
    shadowOffset: { width: 0, height: 2 } 
  },
  playButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  libButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    backgroundColor: 'rgba(255,255,255,0.12)', 
    paddingVertical: 10, 
    paddingHorizontal: 16, 
    borderRadius: 6, 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.25)' 
  },
  libButtonActive: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  libButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  libTextActive: { color: '#000000' },
  iconButton: { 
    backgroundColor: 'rgba(255,255,255,0.12)', 
    padding: 10, 
    borderRadius: 6, 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.25)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  paginationContainer: { 
    position: 'absolute', 
    right: 14, 
    top: '45%', 
    transform: [{ translateY: -40 }], 
    alignItems: 'center', 
    gap: 8, 
    zIndex: 20 
  },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotActive: { height: 20, backgroundColor: BRAND_RED }
});
