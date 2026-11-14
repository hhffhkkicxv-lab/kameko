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
import Svg, { Path, Circle } from 'react-native-svg';
import ProxyImage from '../components/ProxyImage';
import Play from './play';

const { width } = Dimensions.get('window');

// --- STRICT PALETTE (Identical to BingeSlider) ---
const BRAND_RED = '#E50914';
const PURE_RED = '#FF0000';
const BLACK = '#000000';
const WHITE = '#FFFFFF';
const DARK_GREY = '#18181C';
const BORDER_GREY = '#26262C';
const TEXT_GREY = '#8E8E93';

// Height clearance so floating bars & popups sit cleanly above BottomNav.js
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

const IconTrash = ({ size = 18, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round">
    <Path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </Svg>
);

const IconCheck = ({ size = 14, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round">
    <Path d="M20 6L9 17l-5-5" />
  </Svg>
);

const IconBack = ({ size = 20, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);

// --- SKELETON LOADER (Matches BingeSlider) ---
const LibrarySkeleton = () => {
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
    <View style={{ marginTop: 10 }}>
      {[1, 2].map((section) => (
        <View key={section} style={styles.sectionContainer}>
          <View style={styles.headerRow}>
            <View style={[styles.skeletonLine, { width: 150, height: 18 }]} />
          </View>
          <View style={{ flexDirection: 'row', paddingHorizontal: 20 }}>
            {[1, 2, 3].map((_, i) => (
              <Animated.View
                key={i}
                style={[styles.skeletonCard, { opacity: shimmer, marginRight: 15 }]}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
};

// --- REUSABLE SLIDER / GRID CARD (No Save SVG on Cover) ---
const LibraryAnimeCard = ({
  item,
  isGrid = false,
  isBulkDeleteMode,
  isSelectedForDelete,
  onPressCard,
  onLongPressCard,
}) => {
  const animeId = String(item.id || item.animeId || '');
  const posterUri =
    item.image ||
    item.img ||
    item.coverImage ||
    item.backdrop ||
    'https://via.placeholder.com/300x450/18181C/FFFFFF?text=Anime';
  const badgeTopText = String(item.format || item.type || 'SAVED').toUpperCase();
  const badgeSubText = item.sub || item.episodes || '12';

  return (
    <TouchableOpacity
      style={[
        isGrid ? styles.gridCardContainer : styles.cardContainer,
      ]}
      activeOpacity={0.85}
      delayLongPress={280}
      onLongPress={() => onLongPressCard(animeId)}
      onPress={() => onPressCard(item)}
    >
      <View
        style={[
          isGrid ? styles.gridImageWrapper : styles.imageWrapper,
          isBulkDeleteMode && isSelectedForDelete && styles.cardSelectedDelete,
        ]}
      >
        <ProxyImage source={{ uri: posterUri }} style={styles.coverImage} resizeMode="cover" />

        <View style={styles.badgeContainer}>
          <View style={styles.epBadge}>
            <Text style={styles.epBadgeText}>{badgeTopText}</Text>
          </View>
          <View style={styles.ccBadge}>
            <Text style={styles.ccBadgeText}>CC {badgeSubText}</Text>
          </View>
        </View>

        {/* Only show selection check circle during Bulk Delete mode — no Save SVG on covers */}
        {isBulkDeleteMode && (
          <TouchableOpacity
            style={[styles.bulkCheckCircle, isSelectedForDelete && styles.bulkCheckCircleActive]}
            activeOpacity={0.8}
            onPress={() => onPressCard(item)}
          >
            {isSelectedForDelete && <IconCheck size={14} color={WHITE} />}
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.animeTitle} numberOfLines={1}>
        {item.title || 'Untitled Anime'}
      </Text>
    </TouchableOpacity>
  );
};

export default function Library({
  user: propUser,
  activeProfile,
  currentProfile,
  activeProfileId,
  onBack,
  onToggleBottomNav,
  navigation,
}) {
  const resolvedUser = propUser || auth().currentUser || null;
  const resolvedProfile = activeProfile || currentProfile || null;
  const resolvedProfileId = activeProfileId || resolvedProfile?.id || null;

  const [libraryItems, setLibraryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);

  // Bulk Selection & CSS Popup State (No <Modal>)
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false);
  const [bulkDeleteSelectedMap, setBulkDeleteSelectedMap] = useState({});
  const [confirmPopupConfig, setConfirmPopupConfig] = useState(null);

  // Fullscreen <View> Play.js Overlay State (Keeps user inside Library when closed)
  const [activePlayAnime, setActivePlayAnime] = useState(null);

  const searchInputRef = useRef(null);
  const deletedIdsRef = useRef(new Set());
  const aniListCacheRef = useRef({});

  const isSearchModuleOpen = isSearchActive || searchQuery.trim().length > 0;

  // Close search module helper
  const closeSearchModule = useCallback(() => {
    setSearchQuery('');
    setIsSearchActive(false);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  // Top Back Button handler: closes search module first if active, or exits bulk mode, before calling onBack
  const handleTopBackPress = useCallback(() => {
    if (isSearchModuleOpen) {
      closeSearchModule();
      return;
    }
    if (isBulkDeleteMode) {
      setIsBulkDeleteMode(false);
      setBulkDeleteSelectedMap({});
      return;
    }
    if (typeof onBack === 'function') {
      onBack();
    }
  }, [isSearchModuleOpen, closeSearchModule, isBulkDeleteMode, onBack]);

  // Notify parent if Play overlay or delete confirmation is open so BottomNav never overlaps them
  useEffect(() => {
    if (typeof onToggleBottomNav === 'function') {
      const shouldShowBottomNav = !activePlayAnime && !confirmPopupConfig && !isBulkDeleteMode;
      onToggleBottomNav(shouldShowBottomNav);
    }
  }, [activePlayAnime, confirmPopupConfig, isBulkDeleteMode, onToggleBottomNav]);

  // Enforce Immersive Fullscreen Bars
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
  }, [confirmPopupConfig, activePlayAnime, isBulkDeleteMode]);

  // Sync User's Library from Firestore + Hydrate missing covers/formats in background
  useEffect(() => {
    if (!resolvedUser?.uid) {
      setLibraryItems([]);
      setLoading(false);
      return;
    }

    const colRef = firestore()
      .collection('users')
      .doc(String(resolvedUser.uid))
      .collection('library');

    const unsubscribe = colRef.onSnapshot(
      async (snap) => {
        if (!snap || snap.empty) {
          setLibraryItems([]);
          setLoading(false);
          return;
        }

        const rawItems = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          const docId = String(d.id || d.animeId || doc.id);
          if (deletedIdsRef.current.has(docId)) return;

          const rawAddedAt = d.addedAt?.toMillis
            ? d.addedAt.toMillis()
            : Number(d.addedAt || d.timestamp || 0);

          rawItems.push({
            ...d,
            id: docId,
            animeId: docId,
            _docId: doc.id,
            title: d.title || d.animeTitle || docId.replace(/-/g, ' '),
            image: d.img || d.image || d.coverImage || d.backdrop || '',
            coverImage: d.coverImage || d.img || d.image || d.backdrop || '',
            backdrop: d.backdrop || d.img || d.image || d.coverImage || '',
            format: d.format || d.type || 'TV',
            sub: d.sub || d.episodes || '12',
            addedAtMs: rawAddedAt,
          });
        });

        // Sort newest first
        rawItems.sort((a, b) => (b.addedAtMs || 0) - (a.addedAtMs || 0));

        // Render immediately without waiting for network hydration
        setLibraryItems(rawItems);
        setLoading(false);

        // Background hydration for any item missing cover art or format metadata
        rawItems.forEach(async (item) => {
          const cached = aniListCacheRef.current[item.id];
          if (cached) {
            setLibraryItems((prev) =>
              prev.map((p) => (p.id === item.id ? { ...p, ...cached } : p))
            );
            return;
          }

          if (item.image && item.description) return;

          try {
            const cleanSearch = String(item.title || item.id).replace(/\(Dub\)|\(Sub\)/gi, '').trim();
            const query = `query ($search: String) {
              Media (search: $search, type: ANIME) {
                title { romaji english }
                coverImage { extraLarge }
                bannerImage
                description
                genres
                status
                format
                episodes
                averageScore
              }
            }`;
            const res = await fetch('https://graphql.anilist.co', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query, variables: { search: cleanSearch } }),
            });
            const media = (await res.json())?.data?.Media;
            if (media) {
              const patch = {
                title: item.title || media.title?.english || media.title?.romaji,
                image: item.image || media.coverImage?.extraLarge || '',
                coverImage: item.coverImage || media.coverImage?.extraLarge || '',
                backdrop: media.bannerImage || item.backdrop || media.coverImage?.extraLarge || '',
                description:
                  item.description ||
                  media.description?.replace(/<[^>]*>?/gm, '').trim() ||
                  '',
                genres: item.genres || media.genres || ['Anime'],
                status: item.status || media.status || 'FINISHED',
                format: media.format || item.format || 'TV',
                sub: item.sub || media.episodes || '12',
                score: item.score || media.averageScore || 85,
              };
              aniListCacheRef.current[item.id] = patch;
              setLibraryItems((prev) =>
                prev.map((p) => (p.id === item.id ? { ...p, ...patch } : p))
              );
            }
          } catch (_) {}
        });
      },
      () => {
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [resolvedUser?.uid]);

  // --- SELECTION & BULK DELETE LOGIC ---
  const handleLongPressCard = useCallback((animeId) => {
    setIsBulkDeleteMode(true);
    setBulkDeleteSelectedMap((prev) => ({ ...prev, [animeId]: true }));
  }, []);

  const toggleBulkDeleteSelection = useCallback((animeId) => {
    setBulkDeleteSelectedMap((prev) => {
      const next = { ...prev, [animeId]: !prev[animeId] };
      const anyLeft = Object.keys(next).some((k) => next[k]);
      if (!anyLeft) setIsBulkDeleteMode(false);
      return next;
    });
  }, []);

  const executeDeleteLibraryIds = async (targetIds) => {
    const cleanIds = (targetIds || []).map(String).filter(Boolean);
    if (cleanIds.length === 0) {
      setConfirmPopupConfig(null);
      return;
    }

    setConfirmPopupConfig(null);

    const docIdsToDelete = new Set();
    libraryItems.forEach((item) => {
      if (cleanIds.includes(String(item.id))) {
        deletedIdsRef.current.add(String(item.id));
        docIdsToDelete.add(String(item._docId || item.id));
        docIdsToDelete.add(String(item.id));
      }
    });

    setLibraryItems((prev) => prev.filter((item) => !cleanIds.includes(String(item.id))));
    setIsBulkDeleteMode(false);
    setBulkDeleteSelectedMap({});

    if (!resolvedUser?.uid) return;

    try {
      const colRef = firestore()
        .collection('users')
        .doc(String(resolvedUser.uid))
        .collection('library');

      const batch = firestore().batch();
      docIdsToDelete.forEach((docId) => {
        if (docId) batch.delete(colRef.doc(String(docId)));
      });
      await batch.commit();
    } catch (_) {
    } finally {
      setTimeout(() => {
        cleanIds.forEach((id) => deletedIdsRef.current.delete(String(id)));
      }, 4000);
    }
  };

  const executeClearEntireLibrary = async () => {
    setConfirmPopupConfig(null);
    const allIds = libraryItems.map((i) => String(i.id));
    allIds.forEach((id) => deletedIdsRef.current.add(id));

    setLibraryItems([]);
    setIsBulkDeleteMode(false);
    setBulkDeleteSelectedMap({});

    if (!resolvedUser?.uid) return;

    try {
      const colRef = firestore()
        .collection('users')
        .doc(String(resolvedUser.uid))
        .collection('library');
      const snap = await colRef.get();
      const batch = firestore().batch();
      snap.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    } catch (_) {
    } finally {
      setTimeout(() => {
        deletedIdsRef.current.clear();
      }, 4000);
    }
  };

  // --- CSS POPUP TRIGGERS (Multiples & Clear All) ---
  const handleRequestSelectedRemove = () => {
    const selectedIds = Object.keys(bulkDeleteSelectedMap).filter((k) => bulkDeleteSelectedMap[k]);
    if (selectedIds.length === 0) return;

    const isSingle = selectedIds.length === 1;
    let singleTitle = 'this anime';
    if (isSingle) {
      const matched = libraryItems.find((i) => String(i.id) === String(selectedIds[0]));
      if (matched) singleTitle = matched.title || 'this anime';
    }

    setConfirmPopupConfig({
      title: isSingle ? 'Remove from Library' : `Remove ${selectedIds.length} Selected Anime`,
      message: isSingle
        ? `Are you sure you want to remove "${singleTitle}" from your library?`
        : `Are you sure you want to remove these ${selectedIds.length} anime from your library?`,
      confirmText: isSingle ? 'Remove' : `Remove (${selectedIds.length})`,
      onConfirm: () => executeDeleteLibraryIds(selectedIds),
    });
  };

  const handleRequestClearAll = () => {
    if (libraryItems.length === 0) return;
    setConfirmPopupConfig({
      title: 'Clear Entire Library',
      message: 'Are you sure you want to remove all saved anime from your library?',
      confirmText: 'Delete All',
      onConfirm: executeClearEntireLibrary,
    });
  };

  // --- OPEN PLAY.JS DIRECTLY INSIDE LIBRARY OVERLAY (Keeps user in Library on close) ---
  const handlePressCard = useCallback(
    (item) => {
      const animeId = String(item.id || item.animeId || '');
      if (isBulkDeleteMode) {
        toggleBulkDeleteSelection(animeId);
        return;
      }

      Keyboard.dismiss();

      const playPayload = {
        id: animeId,
        animeId: animeId,
        title: item.title || 'Anime',
        coverImage: item.coverImage || item.image || item.img || '',
        backdrop: item.backdrop || item.coverImage || item.image || item.img || '',
        description: item.description || 'Watch all episodes in HD.',
        genres: item.genres || ['Anime'],
        status: item.status || 'RELEASING',
        format: item.format || 'TV',
        score: item.score || 85,
        rating: 'U/A 13+',
        userUid: resolvedUser?.uid || null,
        activeProfileId: resolvedProfileId,
        activeProfile: resolvedProfile,
        currentProfile: resolvedProfile,
      };

      // Always open inside Library's local fullscreen overlay so closing Play keeps user in Library
      setActivePlayAnime(playPayload);
    },
    [isBulkDeleteMode, toggleBulkDeleteSelection, resolvedUser?.uid, resolvedProfileId, resolvedProfile]
  );

  // Hardware Back Button Support
  useEffect(() => {
    const onHardwareBack = () => {
      if (activePlayAnime) {
        setActivePlayAnime(null);
        return true;
      }
      if (confirmPopupConfig) {
        setConfirmPopupConfig(null);
        return true;
      }
      if (isBulkDeleteMode) {
        setIsBulkDeleteMode(false);
        setBulkDeleteSelectedMap({});
        return true;
      }
      if (isSearchModuleOpen) {
        closeSearchModule();
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
  }, [
    activePlayAnime,
    confirmPopupConfig,
    isBulkDeleteMode,
    isSearchModuleOpen,
    closeSearchModule,
    onBack,
  ]);

  // --- SEARCH & CATEGORIZED SLIDER GROUPS ---
  const cleanQuery = searchQuery.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    if (!cleanQuery) return libraryItems;
    return libraryItems.filter((item) => {
      const titleMatch = String(item.title || '').toLowerCase().includes(cleanQuery);
      const genreMatch = Array.isArray(item.genres)
        ? item.genres.some((g) => String(g).toLowerCase().includes(cleanQuery))
        : false;
      return titleMatch || genreMatch;
    });
  }, [libraryItems, cleanQuery]);

  const recentlyAddedList = useMemo(() => libraryItems.slice(0, 12), [libraryItems]);

  const tvSeriesList = useMemo(
    () =>
      libraryItems.filter((i) => {
        const fmt = String(i.format || 'TV').toUpperCase();
        return fmt === 'TV' || fmt === 'TV_SHORT' || fmt === 'ONA';
      }),
    [libraryItems]
  );

  const moviesAndSpecialsList = useMemo(
    () =>
      libraryItems.filter((i) => {
        const fmt = String(i.format || '').toUpperCase();
        return fmt === 'MOVIE' || fmt === 'SPECIAL' || fmt === 'OVA';
      }),
    [libraryItems]
  );

  const selectedCount = Object.keys(bulkDeleteSelectedMap).filter(
    (k) => bulkDeleteSelectedMap[k]
  ).length;
  const isAllSelected = libraryItems.length > 0 && selectedCount === libraryItems.length;

  const renderSliderSection = (title, dataList) => {
    if (!dataList || dataList.length === 0) return null;
    return (
      <View style={styles.sectionContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionCountText}>{dataList.length} Saved</Text>
        </View>
        <FlatList
          data={dataList}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => `${title}-${item.id}`}
          contentContainerStyle={styles.listPadding}
          snapToInterval={155}
          decelerationRate="fast"
          renderItem={({ item }) => (
            <LibraryAnimeCard
              item={item}
              isGrid={false}
              isBulkDeleteMode={isBulkDeleteMode}
              isSelectedForDelete={Boolean(bulkDeleteSelectedMap[item.id])}
              onPressCard={handlePressCard}
              onLongPressCard={handleLongPressCard}
            />
          )}
        />
      </View>
    );
  };

  return (
    <View style={styles.screenContainer}>
      <StatusBar hidden={true} translucent={true} backgroundColor="transparent" />

      {/* TOP BAR */}
      <View style={styles.topHeaderBar}>
        <View style={styles.topHeaderLeft}>
          {(Boolean(onBack) || isSearchModuleOpen || isBulkDeleteMode) && (
            <TouchableOpacity
              style={styles.backCircleBtn}
              activeOpacity={0.75}
              onPress={handleTopBackPress}
            >
              <IconBack size={20} color={WHITE} />
            </TouchableOpacity>
          )}
          <Text style={styles.pageTitle}>
            {isSearchModuleOpen ? 'Search Library' : 'My Library'}
          </Text>
          {libraryItems.length > 0 && !isSearchModuleOpen && (
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{libraryItems.length}</Text>
            </View>
          )}
        </View>

        {libraryItems.length > 0 && (
          <View style={styles.topHeaderActions}>
            {isBulkDeleteMode ? (
              <TouchableOpacity
                style={styles.selectAllPill}
                activeOpacity={0.8}
                onPress={() => {
                  if (isAllSelected) {
                    setBulkDeleteSelectedMap({});
                  } else {
                    const allMap = {};
                    libraryItems.forEach((item) => {
                      allMap[item.id] = true;
                    });
                    setBulkDeleteSelectedMap(allMap);
                  }
                }}
              >
                <Text style={styles.selectAllPillText}>
                  {isAllSelected ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.deleteAllBtn}
                activeOpacity={0.75}
                onPress={handleRequestClearAll}
              >
                <Text style={styles.deleteAllText}>Delete All</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* NATIVE SEARCH BAR */}
      <View style={styles.searchBarContainer}>
        <View
          style={[
            styles.searchInputBox,
            isSearchModuleOpen && { borderColor: BRAND_RED },
          ]}
        >
          <IconSearch size={18} color={isSearchModuleOpen ? WHITE : TEXT_GREY} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={searchQuery}
            onFocus={() => setIsSearchActive(true)}
            onChangeText={(txt) => {
              setSearchQuery(txt);
              if (!isSearchActive) setIsSearchActive(true);
            }}
            placeholder="Search saved anime or genres..."
            placeholderTextColor={TEXT_GREY}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {isSearchModuleOpen && (
            <TouchableOpacity
              style={styles.clearSearchBtn}
              activeOpacity={0.75}
              onPress={closeSearchModule}
            >
              <IconClose size={14} color={WHITE} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* BODY CONTENT */}
      {loading ? (
        <LibrarySkeleton />
      ) : libraryItems.length === 0 ? (
        <View style={styles.emptyStateBox}>
          <View style={styles.emptyIconCircle}>
            <BookmarkIcon filled={false} />
          </View>
          <Text style={styles.emptyTitle}>Your Library is Empty</Text>
          <Text style={styles.emptySubtitle}>
            Save your favorite anime from Home or Play to access them anytime here.
          </Text>
        </View>
      ) : isSearchModuleOpen ? (
        /* SEARCH MODULE GRID */
        <FlatList
          key="library-search-grid"
          data={filteredItems}
          numColumns={GRID_COLUMNS}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => `search-${item.id}`}
          columnWrapperStyle={styles.gridColumnWrapper}
          contentContainerStyle={[
            styles.gridContentPadding,
            isBulkDeleteMode && { paddingBottom: 210 },
          ]}
          ListHeaderComponent={() => (
            <View style={[styles.headerRow, { paddingHorizontal: 0, marginBottom: 14 }]}>
              <Text style={styles.sectionTitle}>
                {cleanQuery.length > 0
                  ? `Search Results (${filteredItems.length})`
                  : `All Saved Anime (${filteredItems.length})`}
              </Text>
            </View>
          )}
          ListEmptyComponent={() => (
            <View style={styles.emptyStateBox}>
              <Text style={styles.emptyTitle}>No Matching Anime</Text>
              <Text style={styles.emptySubtitle}>
                No saved anime matched "{searchQuery}".
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <LibraryAnimeCard
              item={item}
              isGrid={true}
              isBulkDeleteMode={isBulkDeleteMode}
              isSelectedForDelete={Boolean(bulkDeleteSelectedMap[item.id])}
              onPressCard={handlePressCard}
              onLongPressCard={handleLongPressCard}
            />
          )}
        />
      ) : (
        /* CATEGORIZED HORIZONTAL SLIDERS (Exact BingeSlider Look) */
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContentPadding,
            isBulkDeleteMode && { paddingBottom: 210 },
          ]}
        >
          {renderSliderSection('Recently Added', recentlyAddedList)}
          {renderSliderSection('Saved TV Series', tvSeriesList)}
          {moviesAndSpecialsList.length > 0 &&
            renderSliderSection('Movies & Specials', moviesAndSpecialsList)}
          {renderSliderSection('All Saved Anime', libraryItems)}
        </ScrollView>
      )}

      {/* FLOATING BULK DELETE BAR (Positioned cleanly above BottomNav.js) */}
      {isBulkDeleteMode && (
        <View style={styles.bulkDeleteFloatingBar}>
          <View style={styles.bulkDeleteBarTopRow}>
            <Text style={styles.bulkDeleteCountText}>
              {selectedCount} Anime Selected
            </Text>
            <TouchableOpacity
              style={styles.bulkCancelBtn}
              activeOpacity={0.8}
              onPress={() => {
                setIsBulkDeleteMode(false);
                setBulkDeleteSelectedMap({});
              }}
            >
              <Text style={styles.bulkCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.bulkConfirmDeleteBtn,
              selectedCount === 0 && { opacity: 0.45 },
            ]}
            disabled={selectedCount === 0}
            activeOpacity={0.85}
            onPress={handleRequestSelectedRemove}
          >
            <IconTrash size={18} color={WHITE} />
            <Text style={styles.bulkConfirmDeleteText}>
              Remove Selected ({selectedCount})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* CSS-BASED DELETE CONFIRMATION POPUP (Positioned above BottomNav.js, Zero <Modal>) */}
      {Boolean(confirmPopupConfig) && (
        <View style={styles.cssPopupOverlay}>
          <TouchableOpacity
            style={styles.cssPopupBackdrop}
            activeOpacity={1}
            onPress={() => setConfirmPopupConfig(null)}
          />
          <View style={styles.cssBottomSheetCard}>
            <View style={styles.confirmIconWrap}>
              <IconTrash size={24} color={PURE_RED} />
            </View>
            <Text style={styles.confirmPopupTitle}>{confirmPopupConfig?.title}</Text>
            <Text style={styles.confirmPopupMessage}>{confirmPopupConfig?.message}</Text>
            <View style={styles.confirmBtnsRow}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                activeOpacity={0.85}
                onPress={() => setConfirmPopupConfig(null)}
              >
                <Text style={styles.confirmCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDangerBtn}
                activeOpacity={0.85}
                onPress={() => {
                  if (confirmPopupConfig?.onConfirm) {
                    confirmPopupConfig.onConfirm();
                  }
                }}
              >
                <Text style={styles.confirmDangerBtnText}>
                  {confirmPopupConfig?.confirmText || 'Remove'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* FULLSCREEN <VIEW> OVERLAY FOR PLAY.JS (Keeps user in Library when closed) */}
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
    overflow: ' visible',
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
  countPill: {
    backgroundColor: BRAND_RED,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 10,
  },
  countPillText: {
    color: WHITE,
    fontSize: 11,
    fontWeight: '900',
  },
  topHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteAllBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  deleteAllText: {
    color: TEXT_GREY,
    fontSize: 13,
    fontWeight: '700',
  },
  selectAllPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: PURE_RED,
    backgroundColor: DARK_GREY,
  },
  selectAllPillText: {
    color: PURE_RED,
    fontSize: 11,
    fontWeight: '900',
  },

  // Native Search Bar
  searchBarContainer: {
    paddingHorizontal: 20,
    marginBottom: 10,
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

  // Exact BingeSlider Section & Card Styles
  scrollContentPadding: {
    paddingBottom: 120,
  },
  sectionContainer: {
    marginTop: 15,
    marginBottom: 25,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    color: WHITE,
    fontSize: 18,
    fontWeight: '800',
    borderLeftWidth: 3,
    borderLeftColor: BRAND_RED,
    paddingLeft: 8,
  },
  sectionCountText: {
    color: TEXT_GREY,
    fontSize: 12,
    fontWeight: '700',
  },
  listPadding: {
    paddingHorizontal: 20,
  },
  cardContainer: {
    width: 140,
    marginRight: 15,
  },
  imageWrapper: {
    width: 140,
    height: 210,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: DARK_GREY,
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  cardSelectedDelete: {
    borderColor: PURE_RED,
    borderWidth: 2,
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
  bulkCheckCircle: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bulkCheckCircleActive: {
    backgroundColor: PURE_RED,
    borderColor: PURE_RED,
  },
  animeTitle: {
    color: '#E0E0E0',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },

  // Search Grid Layout
  gridContentPadding: {
    paddingHorizontal: 20,
    paddingTop: 10,
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

  // Skeletons & Empty State
  skeletonCard: {
    width: 140,
    height: 210,
    backgroundColor: DARK_GREY,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  skeletonLine: {
    backgroundColor: DARK_GREY,
    borderRadius: 4,
  },
  emptyStateBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: DARK_GREY,
    borderWidth: 1,
    borderColor: BORDER_GREY,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
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

  // Floating Bulk Delete Bar (Elevated above BottomNav.js)
  bulkDeleteFloatingBar: {
    position: 'absolute',
    bottom: BOTTOM_NAV_CLEARANCE,
    left: 14,
    right: 14,
    backgroundColor: BLACK,
    borderWidth: 1.5,
    borderColor: BORDER_GREY,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    zIndex: 99998,
    elevation: 99998,
  },
  bulkDeleteBarTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  bulkDeleteCountText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '800',
  },
  bulkCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: DARK_GREY,
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  bulkCancelText: {
    color: WHITE,
    fontSize: 11,
    fontWeight: '700',
  },
  bulkConfirmDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PURE_RED,
    paddingVertical: 13,
    borderRadius: 8,
  },
  bulkConfirmDeleteText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '900',
    marginLeft: 8,
  },

  // Pure <View> CSS Confirmation Popup (Elevated above BottomNav.js)
  cssPopupOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 99999,
    elevation: 99999,
  },
  cssPopupBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  cssBottomSheetCard: {
    width: '100%',
    backgroundColor: BLACK,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: BOTTOM_NAV_CLEARANCE + 24,
    borderTopWidth: 1,
    borderColor: BORDER_GREY,
    alignItems: 'center',
  },
  confirmIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: DARK_GREY,
    borderWidth: 1,
    borderColor: BORDER_GREY,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  confirmPopupTitle: {
    color: WHITE,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  confirmPopupMessage: {
    color: TEXT_GREY,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  confirmBtnsRow: {
    flexDirection: 'row',
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 9,
    backgroundColor: DARK_GREY,
    borderWidth: 1,
    borderColor: BORDER_GREY,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  confirmCancelBtnText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '700',
  },
  confirmDangerBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 9,
    backgroundColor: PURE_RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  confirmDangerBtnText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '800',
  },

  // Fullscreen <View> Overlay for Play.js
  playFullscreenViewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BLACK,
    zIndex: 100000,
    elevation: 100000,
  },
});
