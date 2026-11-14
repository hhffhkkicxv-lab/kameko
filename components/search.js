import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
  Dimensions,
  StatusBar,
  Platform,
  BackHandler,
  Keyboard,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import * as NavigationBar from 'expo-navigation-bar';
import Svg, { Path, Circle, Polyline, Line } from 'react-native-svg';
import ProxyImage from '../components/ProxyImage';
import Play from './play';

const { width } = Dimensions.get('window');

// --- STRICT PALETTE (Identical to Library & BingeSlider) ---
const BRAND_RED = '#E50914';
const PURE_RED = '#FF0000';
const BLACK = '#000000';
const WHITE = '#FFFFFF';
const DARK_GREY = '#18181C';
const BORDER_GREY = '#26262C';
const TEXT_GREY = '#8E8E93';

const BOTTOM_NAV_CLEARANCE = 76;

const GRID_COLUMNS = 2;
const GRID_SPACING = 15;
const GRID_CARD_WIDTH = Math.floor((width - 40 - GRID_SPACING) / GRID_COLUMNS);

// --- SVG ICONS ---
const BookmarkIcon = ({ filled }) => (
  <Svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill={filled ? BRAND_RED : 'none'}
    stroke={filled ? BRAND_RED : WHITE}
    strokeWidth="2.5"
  >
    <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </Svg>
);

const IconSearch = ({ size = 18, color = TEXT_GREY }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Circle cx="11" cy="11" r="8" />
    <Path d="M21 21l-4.35-4.35" />
  </Svg>
);

const IconClose = ({ size = 16, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

const IconFilter = ({ size = 18, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Line x1="4" y1="21" x2="4" y2="14" />
    <Line x1="4" y1="10" x2="4" y2="3" />
    <Line x1="12" y1="21" x2="12" y2="12" />
    <Line x1="12" y1="8" x2="12" y2="3" />
    <Line x1="20" y1="21" x2="20" y2="16" />
    <Line x1="20" y1="12" x2="20" y2="3" />
    <Line x1="1" y1="14" x2="7" y2="14" />
    <Line x1="9" y1="8" x2="15" y2="8" />
    <Line x1="17" y1="16" x2="23" y2="16" />
  </Svg>
);

const IconClock = ({ size = 16, color = TEXT_GREY }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round">
    <Circle cx="12" cy="12" r="9" />
    <Polyline points="12 6 12 12 16 14" />
  </Svg>
);

const IconTrending = ({ size = 16, color = BRAND_RED }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round">
    <Polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <Polyline points="17 6 23 6 23 12" />
  </Svg>
);

const IconTrash = ({ size = 16, color = TEXT_GREY }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round">
    <Path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </Svg>
);

const IconBack = ({ size = 20, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);

// --- SKELETON LOADER ---
const SearchSkeleton = () => {
  const shimmer = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [shimmer]);

  return (
    <View style={styles.gridContentPadding}>
      {[1, 2, 3, 4].map((_, i) => (
        <Animated.View
          key={i}
          style={[styles.skeletonGridCard, { opacity: shimmer }]}
        />
      ))}
    </View>
  );
};

// --- ANIME GRID CARD (With Save SVG Button) ---
const SearchAnimeCard = ({
  item,
  isSaved,
  onPressCard,
  onToggleSave,
}) => {
  const posterUri =
    item.coverImage?.extraLarge ||
    item.image ||
    item.coverImage ||
    item.bannerImage ||
    'https://via.placeholder.com/300x450/18181C/FFFFFF?text=Anime';
  const badgeTopText = String(item.format || 'TV').toUpperCase();
  const badgeSubText = item.episodes || '12';

  return (
    <TouchableOpacity
      style={styles.gridCardContainer}
      activeOpacity={0.85}
      onPress={() => onPressCard(item)}
    >
      <View style={styles.gridImageWrapper}>
        <ProxyImage source={{ uri: posterUri }} style={styles.coverImage} resizeMode="cover" />

        <View style={styles.badgeContainer}>
          <View style={styles.epBadge}>
            <Text style={styles.epBadgeText}>{badgeTopText}</Text>
          </View>
          <View style={styles.ccBadge}>
            <Text style={styles.ccBadgeText}>CC {badgeSubText}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, isSaved && styles.saveBtnActive]}
          activeOpacity={0.8}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => onToggleSave(item)}
        >
          <BookmarkIcon filled={isSaved} />
        </TouchableOpacity>
      </View>
      <Text style={styles.animeTitle} numberOfLines={1}>
        {item.title?.english || item.title?.romaji || item.title || 'Untitled Anime'}
      </Text>
    </TouchableOpacity>
  );
};

export default function Search({
  user: propUser,
  activeProfile,
  currentProfile,
  activeProfileId,
  onBack,
  onToggleBottomNav,
  setShowBottomNav,
  setHideBottomNav,
  navigation,
}) {
  const resolvedUser = propUser || auth().currentUser || null;
  const resolvedProfile = activeProfile || currentProfile || null;
  const resolvedProfileId = activeProfileId || resolvedProfile?.id || null;

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // Search History & Trending Suggestions
  const [searchHistory, setSearchHistory] = useState([
    'One Piece',
    'Jujutsu Kaisen',
    'Demon Slayer',
    'Bleach',
  ]);
  const trendingSuggestions = [
    'Solo Leveling',
    'Chainsaw Man',
    'Attack on Titan',
    'Dr. Stone',
    'Vinland Saga',
    'Spy x Family',
  ];

  // Saved library items map for quick bookmark status lookup
  const [savedLibraryMap, setSavedLibraryMap] = useState({});

  // Filter Modal / Bottom Sheet State
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState('ALL');
  const [selectedGenre, setSelectedGenre] = useState('ALL');
  const [selectedSort, setSelectedSort] = useState('POPULARITY_DESC');

  // Fullscreen <View> Play.js Overlay State
  const [activePlayAnime, setActivePlayAnime] = useState(null);

  const searchInputRef = useRef(null);

  const genresList = [
    'ALL',
    'Action',
    'Adventure',
    'Comedy',
    'Drama',
    'Fantasy',
    'Romance',
    'Sci-Fi',
    'Supernatural',
    'Thriller',
  ];

  const formatsList = [
    { label: 'All Formats', value: 'ALL' },
    { label: 'TV Series', value: 'TV' },
    { label: 'Movie', value: 'MOVIE' },
    { label: 'OVA / ONA', value: 'OVA' },
  ];

  const sortOptions = [
    { label: 'Most Popular', value: 'POPULARITY_DESC' },
    { label: 'Highest Score', value: 'SCORE_DESC' },
    { label: 'Newest Release', value: 'START_DATE_DESC' },
  ];

  // --- HIDE BOTTOMNAV WHEN FILTER OR PLAY IS ACTIVE ---
  const shouldHideBottomNav = Boolean(activePlayAnime || isFilterModalOpen);

  useEffect(() => {
    const showNav = !shouldHideBottomNav;
    if (typeof onToggleBottomNav === 'function') onToggleBottomNav(showNav);
    if (typeof setShowBottomNav === 'function') setShowBottomNav(showNav);
    if (typeof setHideBottomNav === 'function') setHideBottomNav(shouldHideBottomNav);
  }, [shouldHideBottomNav, onToggleBottomNav, setShowBottomNav, setHideBottomNav]);

  // Enforce Immersive Fullscreen
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
  }, [isFilterModalOpen, activePlayAnime]);

  // Sync user's saved library items from Firestore
  useEffect(() => {
    if (!resolvedUser?.uid) return;
    const colRef = firestore()
      .collection('users')
      .doc(String(resolvedUser.uid))
      .collection('library');

    const unsubscribe = colRef.onSnapshot(
      (snap) => {
        if (!snap || snap.empty) {
          setSavedLibraryMap({});
          return;
        }
        const map = {};
        snap.forEach((doc) => {
          const d = doc.data() || {};
          const id = String(d.id || d.animeId || doc.id);
          map[id] = true;
        });
        setSavedLibraryMap(map);
      },
      () => {}
    );
    return () => unsubscribe();
  }, [resolvedUser?.uid]);

  // --- ANILIST SEARCH API ---
  useEffect(() => {
    const queryTerm = searchQuery.trim();
    if (!queryTerm) {
      setSearchResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const formatArg = selectedFormat !== 'ALL' ? `, format: ${selectedFormat}` : '';
        const genreArg = selectedGenre !== 'ALL' ? `, genre: "${selectedGenre}"` : '';
        const sortArg = selectedSort ? `, sort: [${selectedSort}]` : '';

        const query = `query ($search: String) {
          Page (perPage: 20) {
            media (search: $search, type: ANIME${formatArg}${genreArg}${sortArg}) {
              id
              title { romaji english native }
              coverImage { extraLarge large medium }
              bannerImage
              description
              genres
              status
              format
              episodes
              averageScore
            }
          }
        }`;

        const res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { search: queryTerm } }),
        });
        const json = await res.json();
        const list = json?.data?.Page?.media || [];
        setSearchResults(list);
      } catch (_) {
        setSearchResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedFormat, selectedGenre, selectedSort]);

  // --- SAVE / UNSAVE TOGGLE ---
  const handleToggleSave = async (item) => {
    const animeId = String(item.id);
    const isAlreadySaved = Boolean(savedLibraryMap[animeId]);

    // Optimistic UI update
    setSavedLibraryMap((prev) => ({ ...prev, [animeId]: !isAlreadySaved }));

    if (!resolvedUser?.uid) return;

    try {
      const docRef = firestore()
        .collection('users')
        .doc(String(resolvedUser.uid))
        .collection('library')
        .doc(animeId);

      if (isAlreadySaved) {
        await docRef.delete();
      } else {
        const payload = {
          id: animeId,
          animeId: animeId,
          title: item.title?.english || item.title?.romaji || 'Anime',
          image: item.coverImage?.extraLarge || item.coverImage?.large || '',
          coverImage: item.coverImage?.extraLarge || '',
          backdrop: item.bannerImage || item.coverImage?.extraLarge || '',
          format: item.format || 'TV',
          episodes: item.episodes || 12,
          sub: item.episodes || 12,
          genres: item.genres || ['Anime'],
          score: item.averageScore || 85,
          status: item.status || 'RELEASING',
          addedAt: firestore.FieldValue.serverTimestamp(),
        };
        await docRef.set(payload, { merge: true });
      }
    } catch (_) {
      // Revert optimistic on error
      setSavedLibraryMap((prev) => ({ ...prev, [animeId]: isAlreadySaved }));
    }
  };

  // --- EXECUTE SEARCH TERM & SAVE TO HISTORY ---
  const handleSelectSearchTerm = (term) => {
    setSearchQuery(term);
    setIsSearchActive(true);
    Keyboard.dismiss();

    setSearchHistory((prev) => {
      const filtered = prev.filter((t) => t.toLowerCase() !== term.toLowerCase());
      return [term, ...filtered].slice(0, 10);
    });
  };

  const handleClearHistory = () => {
    setSearchHistory([]);
  };

  // --- OPEN PLAY.JS OVERLAY ---
  const handlePressCard = useCallback(
    (item) => {
      Keyboard.dismiss();
      const animeId = String(item.id);
      const playPayload = {
        id: animeId,
        animeId: animeId,
        title: item.title?.english || item.title?.romaji || 'Anime',
        coverImage: item.coverImage?.extraLarge || item.coverImage?.large || '',
        backdrop: item.bannerImage || item.coverImage?.extraLarge || '',
        description: item.description?.replace(/<[^>]*>?/gm, '').trim() || '',
        genres: item.genres || ['Anime'],
        status: item.status || 'RELEASING',
        format: item.format || 'TV',
        score: item.averageScore || 85,
        rating: 'U/A 13+',
        userUid: resolvedUser?.uid || null,
        activeProfileId: resolvedProfileId,
        activeProfile: resolvedProfile,
        currentProfile: resolvedProfile,
      };

      if (typeof onToggleBottomNav === 'function') onToggleBottomNav(false);
      if (typeof setShowBottomNav === 'function') setShowBottomNav(false);
      if (typeof setHideBottomNav === 'function') setHideBottomNav(true);

      setActivePlayAnime(playPayload);
    },
    [resolvedUser?.uid, resolvedProfileId, resolvedProfile, onToggleBottomNav, setShowBottomNav, setHideBottomNav]
  );

  // Hardware Back Button Support
  useEffect(() => {
    const onHardwareBack = () => {
      if (activePlayAnime) {
        setActivePlayAnime(null);
        return true;
      }
      if (isFilterModalOpen) {
        setIsFilterModalOpen(false);
        return true;
      }
      if (searchQuery.trim().length > 0 || isSearchActive) {
        setSearchQuery('');
        setIsSearchActive(false);
        Keyboard.dismiss();
        return true;
      }
      if (onBack) {
        onBack();
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [activePlayAnime, isFilterModalOpen, searchQuery, isSearchActive, onBack]);

  const activeFiltersCount =
    (selectedFormat !== 'ALL' ? 1 : 0) + (selectedGenre !== 'ALL' ? 1 : 0);

  return (
    <View style={styles.screenContainer}>
      <StatusBar hidden={true} translucent={true} backgroundColor="transparent" />

      {/* TOP BAR */}
      <View style={styles.topHeaderBar}>
        <View style={styles.topHeaderLeft}>
          {onBack && (
            <TouchableOpacity style={styles.backCircleBtn} activeOpacity={0.75} onPress={onBack}>
              <IconBack size={20} color={WHITE} />
            </TouchableOpacity>
          )}
          <Text style={styles.pageTitle}>Search Anime</Text>
        </View>

        <TouchableOpacity
          style={[styles.filterHeaderBtn, activeFiltersCount > 0 && styles.filterHeaderBtnActive]}
          activeOpacity={0.8}
          onPress={() => setIsFilterModalOpen(true)}
        >
          <IconFilter size={16} color={activeFiltersCount > 0 ? BRAND_RED : WHITE} />
          {activeFiltersCount > 0 && (
            <View style={styles.filterBadgeCount}>
              <Text style={styles.filterBadgeCountText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* NATIVE SEARCH BAR */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchInputBox}>
          <IconSearch size={18} color={isSearchActive ? WHITE : TEXT_GREY} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={searchQuery}
            onFocus={() => setIsSearchActive(true)}
            onChangeText={(txt) => {
              setSearchQuery(txt);
              if (!isSearchActive) setIsSearchActive(true);
            }}
            placeholder="Search anime titles, genres..."
            placeholderTextColor={TEXT_GREY}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.clearSearchBtn}
              activeOpacity={0.75}
              onPress={() => setSearchQuery('')}
            >
              <IconClose size={14} color={WHITE} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* BODY CONTENT */}
      {loading ? (
        <SearchSkeleton />
      ) : searchQuery.trim().length > 0 ? (
        /* SEARCH RESULTS GRID */
        <FlatList
          key="search-results-grid"
          data={searchResults}
          numColumns={GRID_COLUMNS}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => `search-res-${item.id}`}
          columnWrapperStyle={styles.gridColumnWrapper}
          contentContainerStyle={styles.gridContentPadding}
          ListHeaderComponent={() => (
            <View style={[styles.headerRow, { paddingHorizontal: 0, marginBottom: 14 }]}>
              <Text style={styles.sectionTitle}>
                Results for "{searchQuery}" ({searchResults.length})
              </Text>
            </View>
          )}
          ListEmptyComponent={() => (
            <View style={styles.emptyStateBox}>
              <Text style={styles.emptyTitle}>No Anime Found</Text>
              <Text style={styles.emptySubtitle}>
                No results matched "{searchQuery}". Try a different keyword or check filters.
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <SearchAnimeCard
              item={item}
              isSaved={Boolean(savedLibraryMap[String(item.id)])}
              onPressCard={handlePressCard}
              onToggleSave={handleToggleSave}
            />
          )}
        />
      ) : (
        /* SEARCH HISTORY & TRENDING SUGGESTIONS */
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContentPadding}
        >
          {searchHistory.length > 0 && (
            <View style={styles.sectionContainer}>
              <View style={styles.headerRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <IconClock size={16} color={TEXT_GREY} />
                  <Text style={[styles.sectionTitle, { marginLeft: 8 }]}>Recent Searches</Text>
                </View>
                <TouchableOpacity activeOpacity={0.75} onPress={handleClearHistory}>
                  <IconTrash size={16} color={TEXT_GREY} />
                </TouchableOpacity>
              </View>
              <View style={styles.chipsWrap}>
                {searchHistory.map((term, index) => (
                  <TouchableOpacity
                    key={`history-${index}`}
                    style={styles.chipPill}
                    activeOpacity={0.8}
                    onPress={() => handleSelectSearchTerm(term)}
                  >
                    <Text style={styles.chipText}>{term}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.sectionContainer}>
            <View style={styles.headerRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <IconTrending size={16} color={BRAND_RED} />
                <Text style={[styles.sectionTitle, { marginLeft: 8 }]}>Trending Suggestions</Text>
              </View>
            </View>
            <View style={styles.chipsWrap}>
              {trendingSuggestions.map((term, index) => (
                <TouchableOpacity
                  key={`trending-${index}`}
                  style={[styles.chipPill, styles.trendingChipPill]}
                  activeOpacity={0.8}
                  onPress={() => handleSelectSearchTerm(term)}
                >
                  <Text style={[styles.chipText, { color: WHITE }]}>{term}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* FULLY WORKING FILTERS BOTTOM SHEET (Pure <View>, Zero <Modal>) */}
      {isFilterModalOpen && (
        <View style={styles.filterModalOverlay}>
          <TouchableOpacity
            style={styles.filterBackdrop}
            activeOpacity={1}
            onPress={() => setIsFilterModalOpen(false)}
          />
          <View style={styles.filterBottomSheetCard}>
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>Filter & Sort</Text>
              <TouchableOpacity
                style={styles.filterCloseBtn}
                activeOpacity={0.8}
                onPress={() => setIsFilterModalOpen(false)}
              >
                <IconClose size={16} color={WHITE} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {/* FORMAT */}
              <Text style={styles.filterSectionLabel}>Format</Text>
              <View style={styles.filterChipsRow}>
                {formatsList.map((f) => (
                  <TouchableOpacity
                    key={f.value}
                    style={[
                      styles.filterOptionChip,
                      selectedFormat === f.value && styles.filterOptionChipActive,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => setSelectedFormat(f.value)}
                  >
                    <Text
                      style={[
                        styles.filterOptionText,
                        selectedFormat === f.value && styles.filterOptionTextActive,
                      ]}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* SORT BY */}
              <Text style={styles.filterSectionLabel}>Sort By</Text>
              <View style={styles.filterChipsRow}>
                {sortOptions.map((s) => (
                  <TouchableOpacity
                    key={s.value}
                    style={[
                      styles.filterOptionChip,
                      selectedSort === s.value && styles.filterOptionChipActive,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => setSelectedSort(s.value)}
                  >
                    <Text
                      style={[
                        styles.filterOptionText,
                        selectedSort === s.value && styles.filterOptionTextActive,
                      ]}
                    >
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* GENRES */}
              <Text style={styles.filterSectionLabel}>Genre</Text>
              <View style={styles.filterChipsRow}>
                {genresList.map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[
                      styles.filterOptionChip,
                      selectedGenre === g && styles.filterOptionChipActive,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => setSelectedGenre(g)}
                  >
                    <Text
                      style={[
                        styles.filterOptionText,
                        selectedGenre === g && styles.filterOptionTextActive,
                      ]}
                    >
                      {g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ACTION BUTTONS */}
              <View style={styles.filterActionsRow}>
                <TouchableOpacity
                  style={styles.filterResetBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedFormat('ALL');
                    setSelectedGenre('ALL');
                    setSelectedSort('POPULARITY_DESC');
                  }}
                >
                  <Text style={styles.filterResetText}>Reset All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.filterApplyBtn}
                  activeOpacity={0.85}
                  onPress={() => setIsFilterModalOpen(false)}
                >
                  <Text style={styles.filterApplyText}>Apply Filters</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {/* FULLSCREEN <VIEW> OVERLAY FOR PLAY.JS */}
      {Boolean(activePlayAnime) && (
        <View style={styles.playFullscreenViewOverlay}>
          <Play
            anime={activePlayAnime}
            user={resolvedUser}
            activeProfile={resolvedProfile}
            currentProfile={resolvedProfile}
            activeProfileId={resolvedProfileId}
            onBack={() => setActivePlayAnime(null)}
            onClose={() => setActivePlayAnime(null)}
            navigation={navigation}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: BLACK,
  },
  topHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 48 : 34,
    paddingBottom: 12,
  },
  topHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: DARK_GREY,
    borderWidth: 1,
    borderColor: BORDER_GREY,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  pageTitle: {
    color: WHITE,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  filterHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: DARK_GREY,
    borderWidth: 1,
    borderColor: BORDER_GREY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterHeaderBtnActive: {
    borderColor: BRAND_RED,
  },
  filterBadgeCount: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: BRAND_RED,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeCountText: {
    color: WHITE,
    fontSize: 10,
    fontWeight: '900',
  },

  // Search Bar
  searchBarContainer: {
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  searchInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DARK_GREY,
    borderWidth: 1,
    borderColor: BORDER_GREY,
    borderRadius: 8,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: WHITE,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 10,
    paddingVertical: 0,
  },
  clearSearchBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: BORDER_GREY,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },

  // Sections & Chips
  scrollContentPadding: {
    paddingBottom: 120,
    paddingHorizontal: 20,
  },
  sectionContainer: {
    marginTop: 15,
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '800',
    borderLeftWidth: 3,
    borderLeftColor: BRAND_RED,
    paddingLeft: 8,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chipPill: {
    backgroundColor: DARK_GREY,
    borderWidth: 1,
    borderColor: BORDER_GREY,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  trendingChipPill: {
    borderColor: 'rgba(229, 9, 20, 0.4)',
  },
  chipText: {
    color: TEXT_GREY,
    fontSize: 13,
    fontWeight: '700',
  },

  // Grid Layout (Identical to Library)
  gridContentPadding: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 120,
  },
  gridColumnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  gridCardContainer: {
    width: GRID_CARD_WIDTH,
  },
  gridImageWrapper: {
    width: GRID_CARD_WIDTH,
    height: Math.floor(GRID_CARD_WIDTH * 1.5),
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: DARK_GREY,
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  badgeContainer: {
    position: 'absolute',
    top: 8,
    left: 8,
    alignItems: 'flex-start',
  },
  epBadge: {
    backgroundColor: WHITE,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  epBadgeText: {
    color: BLACK,
    fontSize: 9,
    fontWeight: '900',
  },
  ccBadge: {
    backgroundColor: DARK_GREY,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  ccBadgeText: {
    color: WHITE,
    fontSize: 9,
    fontWeight: 'bold',
  },
  saveBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  saveBtnActive: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderColor: BRAND_RED,
  },
  animeTitle: {
    color: '#E0E0E0',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },

  // Skeletons & Empty State
  skeletonGridCard: {
    width: '100%',
    height: Math.floor(GRID_CARD_WIDTH * 1.5),
    backgroundColor: DARK_GREY,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER_GREY,
    marginBottom: 18,
  },
  emptyStateBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  emptyTitle: {
    color: WHITE,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: TEXT_GREY,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },

  // Filter Bottom Sheet Styles
  filterModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 99999,
    elevation: 99999,
  },
  filterBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  filterBottomSheetCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: BLACK,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderColor: BORDER_GREY,
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  filterModalTitle: {
    color: WHITE,
    fontSize: 18,
    fontWeight: '900',
  },
  filterCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: DARK_GREY,
    borderWidth: 1,
    borderColor: BORDER_GREY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterSectionLabel: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 14,
    marginBottom: 10,
  },
  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  filterOptionChip: {
    backgroundColor: DARK_GREY,
    borderWidth: 1,
    borderColor: BORDER_GREY,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  filterOptionChipActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    borderColor: BRAND_RED,
  },
  filterOptionText: {
    color: TEXT_GREY,
    fontSize: 12,
    fontWeight: '700',
  },
  filterOptionTextActive: {
    color: WHITE,
    fontWeight: '800',
  },
  filterActionsRow: {
    flexDirection: 'row',
    marginTop: 24,
  },
  filterResetBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 8,
    backgroundColor: DARK_GREY,
    borderWidth: 1,
    borderColor: BORDER_GREY,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  filterResetText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '700',
  },
  filterApplyBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 8,
    backgroundColor: BRAND_RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  filterApplyText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '900',
  },

  // Play Overlay
  playFullscreenViewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BLACK,
    zIndex: 100000,
    elevation: 100000,
  },
});
