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
  StatusBar,
  Platform,
  BackHandler,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import * as NavigationBar from 'expo-navigation-bar';
import Svg, { Path, Circle } from 'react-native-svg';
import ProxyImage from '../components/ProxyImage';

// --- STRICT PALETTE ---
const BRAND_RED = '#E50914';
const PURE_RED = '#FF0000';
const BLACK = '#000000';
const WHITE = '#FFFFFF';
const DARK_GREY = '#18181C';
const BORDER_GREY = '#26262C';
const TEXT_GREY = '#8E8E93';

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

const IconTrash = ({ size = 20, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </Svg>
);

const IconCheck = ({ size = 14, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 6L9 17l-5-5" />
  </Svg>
);

const IconBack = ({ size = 20, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);

// --- SKELETON LOADER (Matches BingeSlider) ---
const LibrarySliderSkeleton = ({ title }) => {
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
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.skeletonRow}>
        {[1, 2, 3, 4].map((_, i) => (
          <Animated.View key={i} style={[styles.skeletonCard, { opacity: shimmer }]} />
        ))}
      </View>
    </View>
  );
};

// --- INDIVIDUAL CARD (Exact BingeSlider Look + Multi-Select Support) ---
const LibraryAnimeCard = React.memo(({
  item,
  badgeLabel,
  isBulkDeleteMode,
  isSelected,
  onSelectCard,
  onLongPressCard,
  onRequestSingleRemove,
}) => {
  const animeId = String(item.id || item.animeId || '');
  const displayTitle = item.title || item.animeTitle || 'Unknown Anime';
  const displayImage = item.image || item.img || item.coverImage || item.backdrop || 'https://via.placeholder.com/140x210/18181C/ffffff?text=Anime';
  const subCount = item.sub || item.episodesCount || item.episodes || '12';
  const topTag = badgeLabel || item.format || 'SAVED';

  return (
    <TouchableOpacity
      style={styles.cardContainer}
      activeOpacity={0.85}
      delayLongPress={280}
      onLongPress={() => onLongPressCard(animeId)}
      onPress={() => onSelectCard(item)}
    >
      <View style={[styles.imageWrapper, isBulkDeleteMode && isSelected && styles.imageWrapperSelected]}>
        <ProxyImage source={{ uri: displayImage }} style={styles.coverImage} resizeMode="cover" />

        <View style={styles.badgeContainer}>
          <View style={styles.epBadge}>
            <Text style={styles.epBadgeText}>{String(topTag).toUpperCase()}</Text>
          </View>
          <View style={styles.ccBadge}>
            <Text style={styles.ccBadgeText}>CC {subCount}</Text>
          </View>
        </View>

        {isBulkDeleteMode ? (
          <TouchableOpacity
            style={[styles.bulkCheckCircle, isSelected && styles.bulkCheckCircleActive]}
            activeOpacity={0.8}
            onPress={() => onSelectCard(item)}
          >
            {isSelected && <IconCheck size={14} color={WHITE} />}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.saveBtn, styles.saveBtnActive]}
            activeOpacity={0.8}
            delayLongPress={280}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => onRequestSingleRemove(item)}
            onLongPress={() => onLongPressCard(animeId)}
          >
            <BookmarkIcon filled={true} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.animeTitle, isBulkDeleteMode && isSelected && { color: PURE_RED }]} numberOfLines={1}>
        {displayTitle}
      </Text>
    </TouchableOpacity>
  );
});

export default function Library({
  user: propUser,
  activeProfile,
  onSelectAnime,
  onBack,
}) {
  const resolvedUser = propUser || auth().currentUser || null;
  const resolvedUid = resolvedUser?.uid || null;

  const [libraryItems, setLibraryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Multi-Select & CSS Popup State (Zero <Modal> used)
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false);
  const [selectedMap, setSelectedMap] = useState({});
  const [confirmPopupConfig, setConfirmPopupConfig] = useState(null);

  const deletedIdsRef = useRef(new Set());
  const metadataCacheRef = useRef({});

  // Keep Android Immersive Mode locked
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
  }, [confirmPopupConfig, isBulkDeleteMode]);

  // Real-time Firestore Sync + Background AniList Enrichment
  useEffect(() => {
    if (!resolvedUid) {
      setLibraryItems([]);
      setLoading(false);
      return;
    }

    const colRef = firestore()
      .collection('users')
      .doc(String(resolvedUid))
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

          const cachedMeta = metadataCacheRef.current[docId] || {};

          rawItems.push({
            id: docId,
            animeId: docId,
            _docId: doc.id,
            title: d.title || d.animeTitle || cachedMeta.title || `Anime ${docId}`,
            image: d.img || d.image || d.coverImage || cachedMeta.image || d.backdrop || '',
            coverImage: d.img || d.image || d.coverImage || cachedMeta.image || d.backdrop || '',
            backdrop: d.backdrop || cachedMeta.backdrop || d.img || d.image || '',
            description: d.description || cachedMeta.description || '',
            genres: d.genres || cachedMeta.genres || ['Anime'],
            status: d.status || cachedMeta.status || 'FINISHED',
            format: d.format || cachedMeta.format || 'TV',
            sub: d.sub || d.episodes || cachedMeta.sub || '12',
            addedAt: rawAddedAt,
          });
        });

        // Sort newest added first
        rawItems.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
        setLibraryItems(rawItems);
        setLoading(false);

        // Background hydration for missing format / episode count / HD covers
        rawItems.forEach(async (item) => {
          if (metadataCacheRef.current[item.id]) return;
          try {
            const cleanSearch = String(item.title || item.id).replace(/-/g, ' ').trim();
            if (!cleanSearch) return;
            const query = `query ($search: String) { Media (search: $search, type: ANIME) { format episodes status bannerImage coverImage { extraLarge } description genres } }`;
            const res = await fetch('https://graphql.anilist.co', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query, variables: { search: cleanSearch } }),
            });
            const ani = (await res.json())?.data?.Media;
            if (ani) {
              const enriched = {
                format: ani.format || 'TV',
                sub: ani.episodes || item.sub || '12',
                status: ani.status || item.status,
                image: item.image || ani.coverImage?.extraLarge || '',
                backdrop: item.backdrop || ani.bannerImage || ani.coverImage?.extraLarge || '',
                description: item.description || ani.description?.replace(/<[^>]*>?/gm, '').trim() || '',
                genres: ani.genres || item.genres || ['Anime'],
              };
              metadataCacheRef.current[item.id] = enriched;
              setLibraryItems((prev) =>
                prev.map((p) => (p.id === item.id ? { ...p, ...enriched } : p))
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
  }, [resolvedUid]);

  // Hardware Back Button Support
  useEffect(() => {
    const onHardwareBack = () => {
      if (confirmPopupConfig) {
        setConfirmPopupConfig(null);
        return true;
      }
      if (isBulkDeleteMode) {
        setIsBulkDeleteMode(false);
        setSelectedMap({});
        return true;
      }
      if (searchQuery.trim().length > 0) {
        setSearchQuery('');
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
  }, [confirmPopupConfig, isBulkDeleteMode, searchQuery, onBack]);

  // --- SELECTION & DELETION LOGIC ---
  const handleLongPressCard = useCallback((animeId) => {
    setIsBulkDeleteMode(true);
    setSelectedMap((prev) => ({ ...prev, [animeId]: true }));
  }, []);

  const toggleSelection = useCallback((animeId) => {
    setSelectedMap((prev) => {
      const next = { ...prev, [animeId]: !prev[animeId] };
      const anySelected = Object.keys(next).some((k) => next[k]);
      if (!anySelected) setIsBulkDeleteMode(false);
      return next;
    });
  }, []);

  const handleCardPress = useCallback(
    (item) => {
      const animeId = String(item.id || item.animeId || '');
      if (isBulkDeleteMode) {
        toggleSelection(animeId);
      } else if (onSelectAnime) {
        onSelectAnime({
          id: animeId,
          animeId: animeId,
          title: item.title,
          image: item.image,
          coverImage: item.image,
          backdrop: item.backdrop || item.image,
          description: item.description,
          genres: item.genres,
          status: item.status,
          format: item.format,
          sub: item.sub,
        });
      }
    },
    [isBulkDeleteMode, toggleSelection, onSelectAnime]
  );

  const executeRemoveIds = useCallback(
    async (targetIds) => {
      const cleanIds = (targetIds || []).map(String).filter(Boolean);
      if (cleanIds.length === 0) {
        setConfirmPopupConfig(null);
        return;
      }

      setConfirmPopupConfig(null);
      cleanIds.forEach((id) => deletedIdsRef.current.add(id));

      setLibraryItems((prev) => prev.filter((item) => !cleanIds.includes(String(item.id))));
      setIsBulkDeleteMode(false);
      setSelectedMap({});

      if (!resolvedUid) return;

      try {
        const colRef = firestore()
          .collection('users')
          .doc(String(resolvedUid))
          .collection('library');
        const batch = firestore().batch();

        cleanIds.forEach((id) => {
          batch.delete(colRef.doc(id));
        });

        await batch.commit();
      } catch (_) {
      } finally {
        setTimeout(() => {
          cleanIds.forEach((id) => deletedIdsRef.current.delete(id));
        }, 4000);
      }
    },
    [resolvedUid]
  );

  const handleRequestSingleRemove = useCallback(
    (item) => {
      const animeId = String(item.id || item.animeId || '');
      const title = item.title || 'this anime';
      setConfirmPopupConfig({
        title: 'Remove from Library',
        message: `Are you sure you want to remove "${title}" from your saved library?`,
        confirmText: 'Remove',
        onConfirm: () => executeRemoveIds([animeId]),
      });
    },
    [executeRemoveIds]
  );

  const handleRequestBatchRemove = useCallback(() => {
    const selectedIds = Object.keys(selectedMap).filter((k) => selectedMap[k]);
    if (selectedIds.length === 0) return;

    const isSingle = selectedIds.length === 1;
    const matchedItem = isSingle
      ? libraryItems.find((i) => String(i.id) === String(selectedIds[0]))
      : null;

    setConfirmPopupConfig({
      title: isSingle ? 'Remove from Library' : `Remove ${selectedIds.length} Selected Anime`,
      message: isSingle
        ? `Are you sure you want to remove "${matchedItem?.title || 'this anime'}" from your saved library?`
        : `Are you sure you want to remove these ${selectedIds.length} anime from your library?`,
      confirmText: isSingle ? 'Remove' : `Remove (${selectedIds.length})`,
      onConfirm: () => executeRemoveIds(selectedIds),
    });
  }, [selectedMap, libraryItems, executeRemoveIds]);

  const handleRequestClearAll = useCallback(() => {
    const allIds = libraryItems.map((i) => String(i.id));
    if (allIds.length === 0) return;

    setConfirmPopupConfig({
      title: 'Clear Entire Library',
      message: `Are you sure you want to remove all ${allIds.length} saved anime from your library?`,
      confirmText: 'Delete All',
      onConfirm: () => executeRemoveIds(allIds),
    });
  }, [libraryItems, executeRemoveIds]);

  // --- FILTERED & CATEGORIZED SLIDER LISTS ---
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return libraryItems;
    return libraryItems.filter((item) =>
      String(item.title || '').toLowerCase().includes(q)
    );
  }, [libraryItems, searchQuery]);

  const sliders = useMemo(() => {
    if (filteredItems.length === 0) return [];

    // If user is actively searching, show a dedicated Search Results slider + matching categories
    if (searchQuery.trim().length > 0) {
      return [
        {
          key: 'search-results',
          title: `Search Results (${filteredItems.length})`,
          badge: 'MATCH',
          data: filteredItems,
        },
      ];
    }

    const recentlyAdded = filteredItems.slice(0, 15);
    const seriesList = filteredItems.filter(
      (i) => !i.format || i.format === 'TV' || i.format === 'ONA' || i.format === 'TV_SHORT'
    );
    const moviesAndSpecials = filteredItems.filter(
      (i) => i.format === 'MOVIE' || i.format === 'OVA' || i.format === 'SPECIAL'
    );
    const alphabeticalList = [...filteredItems].sort((a, b) =>
      String(a.title || '').localeCompare(String(b.title || ''))
    );

    const sections = [
      {
        key: 'recent-saved',
        title: 'Recently Added',
        badge: 'NEW',
        data: recentlyAdded,
      },
    ];

    if (seriesList.length > 0) {
      sections.push({
        key: 'tv-series',
        title: 'Saved Series & Binge List',
        badge: 'SERIES',
        data: seriesList,
      });
    }

    if (moviesAndSpecials.length > 0) {
      sections.push({
        key: 'movies-specials',
        title: 'Movies & OVAs',
        badge: 'MOVIE',
        data: moviesAndSpecials,
      });
    }

    if (alphabeticalList.length > 1) {
      sections.push({
        key: 'az-collection',
        title: 'A–Z Collection',
        badge: 'SAVED',
        data: alphabeticalList,
      });
    }

    return sections;
  }, [filteredItems, searchQuery]);

  const selectedCount = Object.keys(selectedMap).filter((k) => selectedMap[k]).length;
  const isAllSelected =
    filteredItems.length > 0 && selectedCount === filteredItems.length;

  return (
    <View style={styles.screenContainer}>
      <StatusBar hidden={true} translucent={true} backgroundColor="transparent" />

      {/* TOP HEADER BAR */}
      <View style={styles.topHeaderBar}>
        <View style={styles.topHeaderLeft}>
          {onBack && (
            <TouchableOpacity style={styles.backButton} activeOpacity={0.75} onPress={onBack}>
              <IconBack size={20} color={WHITE} />
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.pageTitle}>My Library</Text>
            <Text style={styles.pageSubtitle}>
              {libraryItems.length} {libraryItems.length === 1 ? 'Anime Saved' : 'Anime Saved'}
            </Text>
          </View>
        </View>

        {libraryItems.length > 0 && (
          <View style={styles.headerActionGroup}>
            {isBulkDeleteMode ? (
              <TouchableOpacity
                style={styles.selectAllHeaderBtn}
                activeOpacity={0.8}
                onPress={() => {
                  if (isAllSelected) {
                    setSelectedMap({});
                  } else {
                    const nextMap = {};
                    filteredItems.forEach((i) => {
                      nextMap[i.id] = true;
                    });
                    setSelectedMap(nextMap);
                  }
                }}
              >
                <Text style={styles.selectAllHeaderText}>
                  {isAllSelected ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.clearAllBtn}
                activeOpacity={0.75}
                onPress={handleRequestClearAll}
              >
                <Text style={styles.clearAllText}>Delete All</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* NATIVE SEARCH BAR */}
      <View style={styles.searchBarWrapper}>
        <View style={styles.searchBarBox}>
          <IconSearch size={18} color={TEXT_GREY} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search your saved library..."
            placeholderTextColor={TEXT_GREY}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.clearSearchBtn}
              activeOpacity={0.7}
              onPress={() => setSearchQuery('')}
            >
              <IconClose size={14} color={WHITE} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* MAIN CONTENT: SKELETONS, EMPTY STATE, OR SLIDERS */}
      {loading ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <LibrarySliderSkeleton title="Recently Added" />
          <LibrarySliderSkeleton title="Saved Series & Binge List" />
        </ScrollView>
      ) : libraryItems.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <View style={styles.emptyIconCircle}>
            <BookmarkIcon filled={false} />
          </View>
          <Text style={styles.emptyStateTitle}>Your Library is Empty</Text>
          <Text style={styles.emptyStateSub}>
            Tap the bookmark icon on any anime to save it here for quick access.
          </Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateTitle}>No Matches Found</Text>
          <Text style={styles.emptyStateSub}>
            No saved anime matched "{searchQuery}".
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            isBulkDeleteMode && { paddingBottom: 140 },
          ]}
        >
          {sliders.map((section) => (
            <View key={section.key} style={styles.sectionContainer}>
              <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionCountText}>{section.data.length}</Text>
              </View>

              <FlatList
                data={section.data}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => `${section.key}-${item.id}`}
                contentContainerStyle={styles.listPadding}
                snapToInterval={155}
                decelerationRate="fast"
                renderItem={({ item }) => (
                  <LibraryAnimeCard
                    item={item}
                    badgeLabel={section.badge}
                    isBulkDeleteMode={isBulkDeleteMode}
                    isSelected={Boolean(selectedMap[item.id])}
                    onSelectCard={handleCardPress}
                    onLongPressCard={handleLongPressCard}
                    onRequestSingleRemove={handleRequestSingleRemove}
                  />
                )}
              />
            </View>
          ))}
        </ScrollView>
      )}

      {/* CSS FLOATING MULTI-SELECT BAR (PURE <VIEW>, NO <MODAL>) */}
      {isBulkDeleteMode && (
        <View style={styles.bulkDeleteFloatingBar}>
          <View style={styles.bulkDeleteBarTopRow}>
            <Text style={styles.bulkDeleteCountText}>
              {selectedCount} {selectedCount === 1 ? 'Anime' : 'Anime'} Selected
            </Text>
            <TouchableOpacity
              style={styles.bulkCancelBtn}
              activeOpacity={0.8}
              onPress={() => {
                setIsBulkDeleteMode(false);
                setSelectedMap({});
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
            onPress={handleRequestBatchRemove}
          >
            <IconTrash size={18} color={WHITE} />
            <Text style={styles.bulkConfirmDeleteText}>
              Remove Selected ({selectedCount})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* CSS CONFIRMATION POPUP OVERLAY (PURE <VIEW>, NO <MODAL>) */}
      {Boolean(confirmPopupConfig) && (
        <View style={styles.cssPopupOverlay} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.cssPopupBackdrop}
            activeOpacity={1}
            onPress={() => setConfirmPopupConfig(null)}
          />
          <View style={styles.bottomSheetCard}>
            <View style={styles.confirmIconWrap}>
              <IconTrash size={24} color={PURE_RED} />
            </View>
            <Text style={styles.confirmPopupTitle}>
              {confirmPopupConfig?.title}
            </Text>
            <Text style={styles.confirmPopupMessage}>
              {confirmPopupConfig?.message}
            </Text>

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
    paddingTop: Platform.OS === 'ios' ? 50 : 36,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  topHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
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
  pageSubtitle: {
    color: TEXT_GREY,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  headerActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearAllBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: DARK_GREY,
    borderWidth: 1,
    borderColor: BORDER_GREY,
  },
  clearAllText: {
    color: TEXT_GREY,
    fontSize: 12,
    fontWeight: '800',
  },
  selectAllHeaderBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: PURE_RED,
  },
  selectAllHeaderText: {
    color: PURE_RED,
    fontSize: 12,
    fontWeight: '800',
  },

  // --- NATIVE SEARCH BAR ---
  searchBarWrapper: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  searchBarBox: {
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

  // --- SLIDERS (Exact BingeSlider Styling) ---
  scrollContent: {
    paddingTop: 6,
    paddingBottom: 100,
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
    fontWeight: '800',
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
  imageWrapperSelected: {
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
  bulkCheckCircle: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: 'rgba(0,0,0,0.6)',
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
  skeletonRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
  },
  skeletonCard: {
    width: 140,
    height: 210,
    backgroundColor: DARK_GREY,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER_GREY,
    marginRight: 15,
  },

  // --- EMPTY STATE ---
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 60,
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
  emptyStateTitle: {
    color: WHITE,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyStateSub: {
    color: TEXT_GREY,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 6,
  },

  // --- FLOATING MULTI-SELECT BAR ---
  bulkDeleteFloatingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: BLACK,
    borderTopWidth: 1.5,
    borderTopColor: BORDER_GREY,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    zIndex: 900,
    elevation: 25,
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
    borderRadius: 6,
  },
  bulkConfirmDeleteText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '900',
    marginLeft: 8,
  },

  // --- CSS VIEW-BASED CONFIRMATION POPUP (NO <MODAL>) ---
  cssPopupOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  cssPopupBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  bottomSheetCard: {
    width: '100%',
    backgroundColor: BLACK,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 34,
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
});
