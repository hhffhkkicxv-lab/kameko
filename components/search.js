import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, 
  FlatList, ActivityIndicator, Animated, Keyboard, ScrollView, Platform
} from 'react-native';
import Svg, { Path, Rect, Defs, LinearGradient, Stop, Circle, Polyline, Line } from 'react-native-svg';
import firestore from '@react-native-firebase/firestore';
import ProxyImage from './ProxyImage';

// --- THEME ---
const BRAND_RED = '#E50914';
const BLACK = '#000000';
const DARK_GREY = '#18181C';
const BORDER_GREY = '#26262C';
const TEXT_GREY = '#8E8E93';
const WHITE = '#FFFFFF';

const API_BASE = 'https://anikoto-api-lyart.vercel.app';
const ANILIST_URL = 'https://graphql.anilist.co';

// --- PREMIUM SVG ICONS ---
const IconSearch = ({ size = 20, color = TEXT_GREY }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><Circle cx="11" cy="11" r="8" /><Path d="M21 21l-4.35-4.35" /></Svg>);
const IconClear = ({ size = 16, color = WHITE }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><Path d="M18 6L6 18M6 6l12 12" /></Svg>);
const IconHistory = ({ size = 14, color = TEXT_GREY }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><Circle cx="12" cy="12" r="9" /><Polyline points="12 6 12 12 16 14" /></Svg>);
const IconTrash = ({ size = 18, color = WHITE }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><Path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></Svg>);
const IconFilter = ({ size = 18, color = WHITE }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><Line x1="4" y1="21" x2="4" y2="14" /><Line x1="4" y1="10" x2="4" y2="3" /><Line x1="12" y1="21" x2="12" y2="12" /><Line x1="12" y1="8" x2="12" y2="3" /><Line x1="20" y1="21" x2="20" y2="16" /><Line x1="20" y1="12" x2="20" y2="3" /><Line x1="1" y1="14" x2="7" y2="14" /><Line x1="9" y1="8" x2="15" y2="8" /><Line x1="17" y1="16" x2="23" y2="16" /></Svg>);
const IconPlay = ({ size = 14, color = BLACK }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Path d="M8 5v14l11-7z" /></Svg>);
const IconBookmark = ({ size = 14, color = WHITE, filled = false }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth="2.5" strokeLinecap="round"><Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></Svg>);
const IconCheck = ({ size = 12, color = WHITE }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"><Path d="M20 6L9 17l-5-5" /></Svg>);
const IconDropdown = ({ size = 16, color = WHITE }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><Path d="M6 9l6 6 6-6" /></Svg>);
const IconFire = ({ size = 12, color = BRAND_RED }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><Path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" /></Svg>);

// --- CUSTOM NATIVE DROPDOWN COMPONENT ---
const PremiumDropdown = ({ label, options, selectedValue, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedLabel = options.find(o => o.value === selectedValue)?.label || 'All';

  return (
    <View style={styles.dropdownContainer}>
      <Text style={styles.dropdownLabel}>{label}</Text>
      <TouchableOpacity style={[styles.dropdownSelector, isOpen && styles.dropdownSelectorActive]} activeOpacity={0.8} onPress={() => setIsOpen(!isOpen)}>
        <Text style={styles.dropdownSelectedText}>{selectedLabel}</Text>
        <IconDropdown />
      </TouchableOpacity>
      {isOpen && (
        <View style={styles.dropdownOptionsMap}>
          {options.map((opt) => (
            <TouchableOpacity key={opt.value} style={styles.dropdownOption} onPress={() => { onSelect(opt.value); setIsOpen(false); }}>
              <Text style={[styles.dropdownOptionText, selectedValue === opt.value && styles.dropdownOptionTextActive]}>{opt.label}</Text>
              {selectedValue === opt.value && <IconCheck size={14} color={BRAND_RED} />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

export default function Search({ 
  user, onBack, onSelectAnime, 
  onToggleBottomNav, setShowBottomNav, setHideBottomNav 
}) {
  const [query, setQuery] = useState('');
  const [placeholderText, setPlaceholderText] = useState('Search anime...');
  const [trendingNames, setTrendingNames] = useState(['Solo Leveling', 'Jujutsu Kaisen', 'One Piece', 'Bleach']);
  
  const [history, setHistory] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  
  const [topResult, setTopResult] = useState(null);
  const [listResults, setListResults] = useState([]);
  const [librarySet, setLibrarySet] = useState(new Set());
  
  const [viewState, setViewState] = useState('idle'); // idle | typing | loading | results | empty
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState({ genres: '', format: '' });

  // History Multi-Select State
  const [historySelectMode, setHistorySelectMode] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const typingTimer = useRef(null);
  const typeIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const isDeletingRef = useRef(false);

  // --- HIDE BOTTOM NAV LOGIC ---
  const isOverlayActive = filterModalVisible || showDeleteConfirm;
  useEffect(() => {
    if (typeof onToggleBottomNav === 'function') onToggleBottomNav(!isOverlayActive);
    if (typeof setShowBottomNav === 'function') setShowBottomNav(!isOverlayActive);
    if (typeof setHideBottomNav === 'function') setHideBottomNav(isOverlayActive);
    
    return () => {
      if (typeof onToggleBottomNav === 'function') onToggleBottomNav(true);
      if (typeof setShowBottomNav === 'function') setShowBottomNav(true);
      if (typeof setHideBottomNav === 'function') setHideBottomNav(false);
    };
  }, [isOverlayActive]);

  // 1. Initial Listeners
  useEffect(() => {
    if (!user) return;
    const db = firestore();
    const unsubHist = db.collection('users').doc(user.uid).collection('history')
      .where('historyType', '==', 'search')
      .orderBy('timestamp', 'desc').limit(15)
      .onSnapshot((snap) => {
        if (!snap) return;
        const h = []; snap.forEach(doc => h.push(doc.data().term)); setHistory(h);
      });
    const unsubLib = db.collection('users').doc(user.uid).collection('library')
      .onSnapshot((snap) => {
        if (!snap) return;
        const l = new Set(); snap.forEach(doc => l.add(doc.id)); setLibrarySet(l);
      });
    return () => { unsubHist(); unsubLib(); };
  }, [user]);

  // 2. Typewriter Animation Engine
  useEffect(() => {
    let typeSpeed = 100; let timeout;
    const animatePlaceholder = () => {
      if (query.trim() !== '') return;
      const currentName = trendingNames[typeIndexRef.current] || 'Anime';
      if (isDeletingRef.current) {
        setPlaceholderText(`Search "${currentName.substring(0, charIndexRef.current - 1)}"`);
        charIndexRef.current--; typeSpeed = 50;
      } else {
        setPlaceholderText(`Search "${currentName.substring(0, charIndexRef.current + 1)}"`);
        charIndexRef.current++; typeSpeed = 100;
      }
      if (!isDeletingRef.current && charIndexRef.current === currentName.length) {
        typeSpeed = 2500; isDeletingRef.current = true;
      } else if (isDeletingRef.current && charIndexRef.current === 0) {
        isDeletingRef.current = false;
        typeIndexRef.current = (typeIndexRef.current + 1) % trendingNames.length;
        typeSpeed = 500;
      }
      timeout = setTimeout(animatePlaceholder, typeSpeed);
    };
    timeout = setTimeout(animatePlaceholder, typeSpeed);
    return () => clearTimeout(timeout);
  }, [trendingNames, query]);

  // 3. API Handlers
  const fetchSuggestions = async (term) => {
    try {
      const q = `query ($search: String) { Page(page: 1, perPage: 6) { media(type: ANIME, search: $search, sort: SEARCH_MATCH) { title { romaji english } } } }`;
      const res = await fetch(ANILIST_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, variables: { search: term } }) });
      const json = await res.json();
      if (json.data?.Page?.media) setSuggestions(json.data.Page.media.map(a => a.title.english || a.title.romaji));
      else setSuggestions([]);
    } catch (e) { setSuggestions([]); }
  };

  const handleInputChange = (text) => {
    setQuery(text);
    if (text.trim() === '') {
      setViewState('idle'); setTopResult(null); setListResults([]); setSuggestions([]);
    } else {
      setViewState('typing');
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => fetchSuggestions(text), 300);
    }
  };

  const saveToHistory = async (term) => {
    if (!user || !term.trim()) return;
    const safeTerm = term.trim().replace(/[\/\\.#$\[\]]/g, '_');
    await firestore().collection('users').doc(user.uid).collection('history').doc(`search_${safeTerm}`).set({ historyType: 'search', term: term.trim(), timestamp: Date.now() }, { merge: true });
  };

  const toggleLibrary = async (anime) => {
    if (!user) return;
    const ref = firestore().collection('users').doc(user.uid).collection('library').doc(String(anime.id));
    if (librarySet.has(String(anime.id))) await ref.delete();
    else await ref.set({ 
      id: String(anime.id), animeId: String(anime.id), title: anime.title, 
      img: anime.image || anime.poster, coverImage: anime.image || anime.poster, backdrop: anime.backdrop || anime.image,
      addedAt: firestore.FieldValue.serverTimestamp() 
    });
  };

  const executeSearch = async (searchTerm) => {
    Keyboard.dismiss();
    const term = searchTerm.trim();
    if (!term && !activeFilters.genres && !activeFilters.format) return;
    
    if (term) setQuery(term);
    setViewState('loading');
    if (term) saveToHistory(term);

    try {
      const params = new URLSearchParams();
      if (term) params.append('keyword', term);
      if (activeFilters.genres) params.append('genres', activeFilters.genres);
      if (activeFilters.format) params.append('format', activeFilters.format);

      const endpoint = (activeFilters.genres || activeFilters.format) ? '/api/filter' : '/api/search';
      const res = await fetch(`${API_BASE}${endpoint}?${params.toString()}`);
      const json = await res.json();
      
      let data = [];
      if (endpoint === '/api/filter' && json.success) data = json.results?.data || [];
      else if (json.success) data = json.data || json.results || [];

      if (data.length > 0) {
        const topHit = data[0];
        try {
          const q = `query { Media(type: ANIME, search: "${topHit.title}") { bannerImage description(asHtml: false) } }`;
          const aniRes = await fetch(ANILIST_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
          const aniJson = await aniRes.json();
          if (aniJson.data?.Media) {
            topHit.backdrop = aniJson.data.Media.bannerImage;
            topHit.description = aniJson.data.Media.description?.replace(/<[^>]*>?/gm, '');
          }
        } catch (_) {}

        setTopResult(topHit);
        setListResults(data.slice(1));
        setViewState('results');
      } else {
        setViewState('empty');
      }
    } catch (e) {
      setViewState('empty');
    }
  };

  const navigateToPlay = (anime) => {
    onSelectAnime({
      id: String(anime.id),
      animeId: String(anime.id),
      title: anime.title,
      coverImage: anime.image || anime.poster,
      backdrop: anime.backdrop || anime.image || anime.poster,
      description: anime.description || "Start watching the latest episodes.",
      genres: ['Anime'], status: 'RELEASING', score: 85, rating: 'U/A 13+'
    });
    onBack(); 
  };

  // --- HISTORY MULTI-SELECT LOGIC ---
  const handleLongPressHistory = (term) => {
    Keyboard.dismiss();
    setHistorySelectMode(true);
    setSelectedHistory(new Set([term]));
  };

  const toggleHistorySelection = (term) => {
    const newSet = new Set(selectedHistory);
    if (newSet.has(term)) newSet.delete(term);
    else newSet.add(term);
    setSelectedHistory(newSet);
    if (newSet.size === 0) setHistorySelectMode(false);
  };

  const executeDeleteSelectedHistory = async () => {
    if (!user || selectedHistory.size === 0) return;
    const batch = firestore().batch();
    selectedHistory.forEach(term => {
      const safeTerm = term.trim().replace(/[\/\\.#$\[\]]/g, '_');
      const ref = firestore().collection('users').doc(user.uid).collection('history').doc(`search_${safeTerm}`);
      batch.delete(ref);
    });
    await batch.commit();
    setHistorySelectMode(false);
    setSelectedHistory(new Set());
    setShowDeleteConfirm(false);
  };

  // --- RENDERING VIEWS ---
  const highlightText = (text, highlight) => {
    if (!highlight.trim()) return <Text>{text}</Text>;
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return <Text>{parts.map((part, i) => part.toLowerCase() === highlight.toLowerCase() ? <Text key={i} style={{color: WHITE, fontWeight:'900'}}>{part}</Text> : <Text key={i}>{part}</Text>)}</Text>;
  };

  const renderTopResult = () => {
    if (!topResult) return null;
    const aSub = topResult.tvInfo?.sub || topResult.sub || '?';
    const aType = topResult.type || 'TV';
    const isAdded = librarySet.has(String(topResult.id));

    return (
      <TouchableOpacity style={styles.heroCard} activeOpacity={0.9} onPress={() => navigateToPlay(topResult)}>
        <View style={styles.heroBackdropWrapper}>
          <ProxyImage source={{ uri: topResult.backdrop || topResult.image || topResult.poster }} style={styles.heroBackdrop} resizeMode="cover" blurRadius={3} />
          <View style={styles.heroOverlay} />
        </View>

        <View style={styles.heroContent}>
          <ProxyImage source={{ uri: topResult.image || topResult.poster }} style={styles.heroPoster} resizeMode="cover" />
          <View style={styles.heroMetaBox}>
            <View style={styles.topMatchBadge}>
              <IconFire />
              <Text style={styles.topMatchText}>TOP MATCH</Text>
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>{topResult.title}</Text>
            {topResult.description && <Text style={styles.heroDesc} numberOfLines={2}>{topResult.description}</Text>}
            
            <View style={styles.heroTagsRow}>
              <View style={styles.tagPill}><Text style={styles.tagText}>{aType}</Text></View>
              <View style={[styles.tagPill, { borderColor: 'rgba(244,117,33,0.3)' }]}>
                <Text style={[styles.tagText, { color: '#F47521' }]}>SUB {aSub}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.heroActionsRow}>
          <TouchableOpacity style={styles.heroPlayBtn} onPress={() => navigateToPlay(topResult)}>
            <IconPlay />
            <Text style={styles.heroPlayText}>WATCH NOW</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.heroSaveBtn, isAdded && { borderColor: BRAND_RED }]} onPress={() => toggleLibrary(topResult)}>
            <IconBookmark color={isAdded ? BRAND_RED : WHITE} filled={isAdded} />
            <Text style={[styles.heroSaveText, isAdded && { color: BRAND_RED }]}>{isAdded ? 'SAVED' : 'SAVE'}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderListItem = ({ item }) => {
    const aSub = item.tvInfo?.sub || item.sub || '?';
    const aType = item.type || 'TV';
    const isAdded = librarySet.has(String(item.id));

    return (
      <TouchableOpacity style={styles.listCard} activeOpacity={0.8} onPress={() => navigateToPlay(item)}>
        <ProxyImage source={{ uri: item.image || item.poster }} style={styles.listThumb} resizeMode="cover" />
        <View style={styles.listMeta}>
          <View>
            <Text style={styles.listTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.listDesc} numberOfLines={2}>{item.description || "Dive into this exciting series. Click to view more details."}</Text>
          </View>
          <View style={styles.listBottomRow}>
            <View style={styles.heroTagsRow}>
              <View style={styles.tagPill}><Text style={styles.tagText}>{aType}</Text></View>
              <View style={[styles.tagPill, { borderColor: 'rgba(244,117,33,0.3)' }]}>
                <Text style={[styles.tagText, { color: '#F47521' }]}>SUB {aSub}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.listSaveBtn} onPress={() => toggleLibrary(item)}>
              <IconBookmark size={14} color={isAdded ? BRAND_RED : WHITE} filled={isAdded} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const GENRE_OPTIONS = [
    { label: 'All Genres', value: '' }, { label: 'Action', value: 'Action' }, { label: 'Adventure', value: 'Adventure' }, 
    { label: 'Comedy', value: 'Comedy' }, { label: 'Drama', value: 'Drama' }, { label: 'Fantasy', value: 'Fantasy' },
    { label: 'Romance', value: 'Romance' }, { label: 'Sci-Fi', value: 'Sci-Fi' }, { label: 'Thriller', value: 'Thriller' }
  ];

  const FORMAT_OPTIONS = [
    { label: 'All Formats', value: '' }, { label: 'TV Series', value: 'TV' }, { label: 'Movie', value: 'MOVIE' }, { label: 'OVA/ONA', value: 'OVA' }
  ];

  const searchInputRef = useRef(null);

  return (
    <View style={styles.container}>
      {/* Top Header / Search Bar */}
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <IconSearch />
          <TextInput
            ref={searchInputRef}
            style={styles.input}
            placeholder={placeholderText}
            placeholderTextColor={TEXT_GREY}
            value={query}
            onChangeText={handleInputChange}
            onSubmitEditing={() => executeSearch(query)}
            returnKeyType="search"
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => handleInputChange('')} hitSlop={{top:10,bottom:10,left:10,right:10}}>
              <IconClear />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterModalVisible(true)}>
          <IconFilter />
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={onBack}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Floating Multi-Delete Bar */}
      {historySelectMode && (
        <View style={styles.historySelectBar}>
          <Text style={styles.historySelectCount}>{selectedHistory.size} Selected</Text>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => { setHistorySelectMode(false); setSelectedHistory(new Set()); }}>
              <Text style={styles.historyCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => selectedHistory.size > 0 && setShowDeleteConfirm(true)} disabled={selectedHistory.size === 0}>
              <IconTrash size={18} color={selectedHistory.size > 0 ? BRAND_RED : TEXT_GREY} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* View States */}
      {viewState === 'idle' && (
        <ScrollView style={styles.historyContainer}>
          {history.length > 0 ? (
            <>
              <Text style={styles.historyHeader}>Recent Searches</Text>
              <View style={styles.historyWrap}>
                {history.map(term => {
                  const isSelected = selectedHistory.has(term);
                  return (
                    <TouchableOpacity 
                      key={term}
                      style={[styles.historyChip, isSelected && styles.historyChipSelected]}
                      onLongPress={() => handleLongPressHistory(term)}
                      onPress={() => historySelectMode ? toggleHistorySelection(term) : executeSearch(term)}
                      activeOpacity={0.8}
                    >
                      {isSelected ? <IconCheck size={14} color={BRAND_RED} /> : <IconHistory />}
                      <Text style={[styles.historyText, isSelected && { color: WHITE }]}>{term}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : (
            <Text style={styles.emptyHistoryText}>Search for your favorite anime...</Text>
          )}
        </ScrollView>
      )}

      {viewState === 'typing' && (
        <ScrollView style={styles.suggestionsContainer}>
          {suggestions.length > 0 ? (
            suggestions.map((sug, idx) => (
              <TouchableOpacity key={idx} style={styles.suggestionRow} onPress={() => { setQuery(sug); executeSearch(sug); }}>
                <IconSearch size={14} color={TEXT_GREY} />
                <Text style={styles.suggestionText} numberOfLines={1}>{highlightText(sug, query)}</Text>
              </TouchableOpacity>
            ))
          ) : (
            <ActivityIndicator size="small" color={BRAND_RED} style={{ marginTop: 20 }} />
          )}
        </ScrollView>
      )}

      {viewState === 'loading' && (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={BRAND_RED} />
        </View>
      )}

      {viewState === 'empty' && (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyTitle}>No Anime Found</Text>
          <Text style={styles.emptySub}>We couldn't find anything matching your search or filters.</Text>
        </View>
      )}

      {viewState === 'results' && (
        <FlatList
          data={listResults}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={renderTopResult}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={renderListItem}
          keyboardDismissMode="on-drag"
        />
      )}

      {/* TRUE NATIVE-STYLE DROPDOWN FILTER MENU (Max Z-Index Overlay) */}
      {filterModalVisible && (
        <View style={styles.overlayWrapper}>
          <TouchableOpacity style={styles.overlayBackdrop} activeOpacity={1} onPress={() => setFilterModalVisible(false)} />
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Advanced Filters</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)} style={styles.sheetCloseBtn}>
                <IconClear />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
              <PremiumDropdown 
                label="Format Type" 
                options={FORMAT_OPTIONS} 
                selectedValue={activeFilters.format} 
                onSelect={(val) => setActiveFilters({...activeFilters, format: val})} 
              />
              <PremiumDropdown 
                label="Genre" 
                options={GENRE_OPTIONS} 
                selectedValue={activeFilters.genres} 
                onSelect={(val) => setActiveFilters({...activeFilters, genres: val})} 
              />
            </ScrollView>

            <View style={styles.sheetActionsRow}>
              <TouchableOpacity style={styles.sheetResetBtn} onPress={() => setActiveFilters({ genres: '', format: '' })}>
                <Text style={styles.sheetResetText}>Reset All</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetApplyBtn} onPress={() => { setFilterModalVisible(false); executeSearch(query); }}>
                <Text style={styles.sheetApplyText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* DELETE CONFIRMATION POPUP (Max Z-Index Overlay) */}
      {showDeleteConfirm && (
        <View style={styles.overlayWrapper}>
          <TouchableOpacity style={styles.overlayBackdrop} activeOpacity={1} onPress={() => setShowDeleteConfirm(false)} />
          <View style={styles.bottomSheet}>
            <View style={styles.deleteConfirmIconWrap}><IconTrash size={24} color={BRAND_RED} /></View>
            <Text style={styles.deleteConfirmTitle}>Remove Search History</Text>
            <Text style={styles.deleteConfirmSub}>Are you sure you want to delete the {selectedHistory.size} selected items? This cannot be undone.</Text>
            
            <View style={styles.sheetActionsRow}>
              <TouchableOpacity style={styles.sheetResetBtn} onPress={() => setShowDeleteConfirm(false)}>
                <Text style={styles.sheetResetText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sheetApplyBtn, { backgroundColor: BRAND_RED }]} onPress={executeDeleteSelectedHistory}>
                <Text style={styles.sheetApplyText}>Delete Items</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BLACK, paddingTop: Platform.OS === 'ios' ? 50 : 34 },
  
  // Header & Search Bar
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16 },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: DARK_GREY, borderRadius: 10, paddingHorizontal: 14, height: 44, borderWidth: 1, borderColor: BORDER_GREY },
  input: { flex: 1, color: WHITE, fontSize: 14, fontWeight: '600', marginLeft: 10, paddingVertical: 0 },
  filterBtn: { marginLeft: 10, padding: 10, backgroundColor: DARK_GREY, borderRadius: 10, borderWidth: 1, borderColor: BORDER_GREY, justifyContent: 'center', alignItems: 'center' },
  cancelBtn: { marginLeft: 12 },
  cancelBtnText: { color: WHITE, fontSize: 14, fontWeight: '700' },
  
  // History Multi-Select Floating Bar
  historySelectBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: DARK_GREY, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: BORDER_GREY },
  historySelectCount: { color: WHITE, fontSize: 14, fontWeight: '800' },
  historyCancelText: { color: TEXT_GREY, fontSize: 13, fontWeight: '700' },

  // History Tags
  historyContainer: { paddingHorizontal: 20, paddingTop: 20 },
  historyHeader: { color: TEXT_GREY, fontSize: 13, fontWeight: '800', marginBottom: 12 },
  historyWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  historyChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: DARK_GREY, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: BORDER_GREY, gap: 8 },
  historyChipSelected: { borderColor: BRAND_RED, backgroundColor: 'rgba(229,9,20,0.1)' },
  historyText: { color: TEXT_GREY, fontSize: 13, fontWeight: '700' },
  emptyHistoryText: { color: TEXT_GREY, textAlign: 'center', fontSize: 13, marginTop: 40 },
  
  // Autocomplete Suggestions
  suggestionsContainer: { paddingHorizontal: 20, paddingTop: 10 },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderColor: BORDER_GREY, gap: 12 },
  suggestionText: { color: TEXT_GREY, fontSize: 14, fontWeight: '500' },

  // Empty / Loading States
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle: { color: WHITE, fontSize: 16, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  emptySub: { color: TEXT_GREY, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  
  listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
  
  // Hero Result Card
  heroCard: { width: '100%', backgroundColor: DARK_GREY, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: BORDER_GREY, marginBottom: 16 },
  heroBackdropWrapper: { position: 'absolute', width: '100%', height: '100%' },
  heroBackdrop: { width: '100%', height: '100%', opacity: 0.5 },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  heroContent: { flexDirection: 'row', padding: 16, paddingTop: 20 },
  heroPoster: { width: 100, height: 145, borderRadius: 8, borderWidth: 1, borderColor: BORDER_GREY },
  heroMetaBox: { flex: 1, marginLeft: 14, justifyContent: 'center' },
  topMatchBadge: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  topMatchText: { color: BRAND_RED, fontSize: 10, fontWeight: '900', letterSpacing: 0.5, marginLeft: 4 },
  heroTitle: { color: WHITE, fontSize: 18, fontWeight: '900', marginBottom: 6, lineHeight: 22 },
  heroDesc: { color: '#ccc', fontSize: 11, marginBottom: 10, lineHeight: 16 },
  heroTagsRow: { flexDirection: 'row', gap: 8 },
  tagPill: { backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: BORDER_GREY, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagText: { color: '#ccc', fontSize: 9, fontWeight: '900' },
  heroActionsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  heroPlayBtn: { flex: 1, backgroundColor: WHITE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 8 },
  heroPlayText: { color: BLACK, fontSize: 12, fontWeight: '900', marginLeft: 6 },
  heroSaveBtn: { backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: BORDER_GREY },
  heroSaveText: { color: WHITE, fontSize: 11, fontWeight: '900', marginLeft: 6 },

  // List Results
  listCard: { flexDirection: 'row', backgroundColor: DARK_GREY, borderRadius: 12, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: BORDER_GREY },
  listThumb: { width: 80, height: 115, borderRadius: 8 },
  listMeta: { flex: 1, marginLeft: 14, justifyContent: 'space-between' },
  listTitle: { color: WHITE, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  listDesc: { color: TEXT_GREY, fontSize: 11, lineHeight: 16 },
  listBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 },
  listSaveBtn: { backgroundColor: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 8 },

  // MAX Z-INDEX OVERLAYS (Bottom Sheets)
  overlayWrapper: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 99999, elevation: 99999 },
  overlayBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.85)' },
  bottomSheet: { width: '100%', backgroundColor: BLACK, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 22, paddingTop: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 24, borderTopWidth: 1, borderColor: BORDER_GREY },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle: { color: WHITE, fontSize: 18, fontWeight: '900' },
  sheetCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: DARK_GREY, borderWidth: 1, borderColor: BORDER_GREY, justifyContent: 'center', alignItems: 'center' },
  sheetActionsRow: { flexDirection: 'row', marginTop: 24, gap: 12 },
  sheetResetBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: DARK_GREY, borderWidth: 1, borderColor: BORDER_GREY, alignItems: 'center' },
  sheetResetText: { color: WHITE, fontSize: 14, fontWeight: '700' },
  sheetApplyBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: BRAND_RED, alignItems: 'center' },
  sheetApplyText: { color: WHITE, fontSize: 14, fontWeight: '900' },

  // Custom Dropdown Styles
  dropdownContainer: { marginBottom: 20 },
  dropdownLabel: { color: WHITE, fontSize: 14, fontWeight: '800', marginBottom: 8 },
  dropdownSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: DARK_GREY, borderWidth: 1, borderColor: BORDER_GREY, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14 },
  dropdownSelectorActive: { borderColor: BRAND_RED },
  dropdownSelectedText: { color: WHITE, fontSize: 14, fontWeight: '600' },
  dropdownOptionsMap: { backgroundColor: DARK_GREY, borderWidth: 1, borderColor: BORDER_GREY, borderRadius: 10, marginTop: 6, overflow: 'hidden' },
  dropdownOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: BORDER_GREY },
  dropdownOptionText: { color: TEXT_GREY, fontSize: 14, fontWeight: '600' },
  dropdownOptionTextActive: { color: WHITE, fontWeight: '800' },

  // Delete Confirmation Popup Styles
  deleteConfirmIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(229,9,20,0.1)', borderWidth: 1, borderColor: 'rgba(229,9,20,0.3)', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 16 },
  deleteConfirmTitle: { color: WHITE, fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  deleteConfirmSub: { color: TEXT_GREY, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 10 },
});
