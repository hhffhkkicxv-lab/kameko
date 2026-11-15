import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, 
  FlatList, ActivityIndicator, Animated, Keyboard, Modal, ScrollView, StatusBar
} from 'react-native';
import Svg, { Path, Rect, Defs, LinearGradient, Stop, Circle, Polyline } from 'react-native-svg';
import firestore from '@react-native-firebase/firestore';
import ProxyImage from './ProxyImage';
import ShareSheet from './ShareSheet';

const BRAND_RED = '#E50914';
const BLACK = '#000000';
const DARK_GREY = '#18181C';
const BORDER_GREY = '#26262C';
const TEXT_GREY = '#8E8E93';

const API_BASE = 'https://anikoto-api-lyart.vercel.app';
const ANILIST_URL = 'https://graphql.anilist.co';

// --- Premium SVG Icons ---
const IconSearch = ({ size = 20, color = "#FFF" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Circle cx="11" cy="11" r="8" /><Path d="M21 21l-4.35-4.35" /></Svg>);
const IconClear = ({ size = 18, color = "#FFF" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Path d="M18 6L6 18M6 6l12 12" /></Svg>);
const IconHistory = ({ size = 14, color = "#888" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></Svg>);
const IconTrash = ({ size = 16, color = "#FFF" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></Svg>);
const IconFilter = ({ size = 20, color = "#FFF" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></Svg>);
const IconPlay = ({ size = 16, color = "#000" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Path d="M8 5v14l11-7z" /></Svg>);
const IconBookmark = ({ size = 14, color = "#FFF", filled = false }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></Svg>);
const IconShare = ({ size = 14, color = "#FFF" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Circle cx="18" cy="5" r="3" /><Circle cx="6" cy="12" r="3" /><Circle cx="18" cy="19" r="3" /><Path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" /></Svg>);
const IconCheck = ({ size = 12, color = "#FFF" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><Path d="M20 6L9 17l-5-5" /></Svg>);
const IconChevron = ({ size = 16, color = "#FFF", up = false }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d={up ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} /></Svg>);

// --- Custom Filter Dropdown ---
const FilterDropdown = ({ label, options, selectedValue, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <View style={styles.dropdownContainer}>
      <TouchableOpacity style={[styles.dropdownHeader, isOpen && styles.dropdownHeaderActive]} onPress={() => setIsOpen(!isOpen)} activeOpacity={0.8}>
        <Text style={styles.dropdownLabel}>{label}</Text>
        <View style={styles.dropdownValWrap}>
          <Text style={styles.dropdownValue}>{selectedValue || 'Any'}</Text>
          <IconChevron up={isOpen} />
        </View>
      </TouchableOpacity>
      {isOpen && (
        <View style={styles.dropdownList}>
          <ScrollView nestedScrollEnabled style={{ maxHeight: 160 }} showsVerticalScrollIndicator={false}>
            <TouchableOpacity style={styles.dropdownItem} onPress={() => { onSelect(''); setIsOpen(false); }}>
              <Text style={[styles.dropdownItemText, !selectedValue && styles.dropdownItemTextActive]}>Any</Text>
            </TouchableOpacity>
            {options.map(opt => (
              <TouchableOpacity key={opt} style={styles.dropdownItem} onPress={() => { onSelect(opt); setIsOpen(false); }}>
                <Text style={[styles.dropdownItemText, selectedValue === opt && styles.dropdownItemTextActive]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

export default function Search({ user, onBack, onSelectAnime, onToggleBottomNav, setShowBottomNav, setHideBottomNav }) {
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
  const [activeFilters, setActiveFilters] = useState({ genres: '', year: '', format: '' });

  // Share & Delete Overlays
  const [shareAnimeData, setShareAnimeData] = useState(null);
  const [historySelectMode, setHistorySelectMode] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState(new Set());
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);

  const typingTimer = useRef(null);
  const typeIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const isDeletingRef = useRef(false);

  // Hide BottomNav when any max z-index overlay is open
  const isOverlayActive = filterModalVisible || confirmDeleteVisible || !!shareAnimeData;
  useEffect(() => {
    if (typeof onToggleBottomNav === 'function') onToggleBottomNav(!isOverlayActive);
    if (typeof setShowBottomNav === 'function') setShowBottomNav(!isOverlayActive);
    if (typeof setHideBottomNav === 'function') setHideBottomNav(isOverlayActive);
  }, [isOverlayActive]);

  // 1. Initial Listeners
  useEffect(() => {
    if (!user) return;
    const unsubHist = firestore().collection('users').doc(user.uid).collection('history').where('historyType', '==', 'search').orderBy('timestamp', 'desc').limit(15).onSnapshot((snap) => {
      if (!snap) return;
      const h = []; snap.forEach(doc => h.push(doc.data().term)); setHistory(h);
    });
    const unsubLib = firestore().collection('users').doc(user.uid).collection('library').onSnapshot((snap) => {
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

  // 3. API Handlers (Exactly as provided)
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

  const executeSearch = async (searchTerm) => {
    Keyboard.dismiss();
    const term = searchTerm.trim();
    if (!term && !activeFilters.genres && !activeFilters.year && !activeFilters.format) return;

    setQuery(term);
    setViewState('loading');
    if (term) saveToHistory(term);

    try {
      const params = new URLSearchParams();
      if (term) params.append('keyword', term);
      if (activeFilters.genres) params.append('genres', activeFilters.genres);
      if (activeFilters.year) params.append('seasonYear', activeFilters.year);
      if (activeFilters.format) params.append('format', activeFilters.format);

      const endpoint = (activeFilters.genres || activeFilters.year || activeFilters.format) ? '/api/filter' : '/api/search';
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

  const toggleLibrary = async (anime) => {
    if (!user) return;
    const ref = firestore().collection('users').doc(user.uid).collection('library').doc(String(anime.id));
    if (librarySet.has(String(anime.id))) await ref.delete();
    else await ref.set({ id: String(anime.id), title: anime.title, img: anime.image || anime.poster, addedAt: firestore.FieldValue.serverTimestamp() });
  };

  const navigateToPlay = (anime) => {
    onSelectAnime({
      id: anime.id, title: anime.title,
      coverImage: anime.image || anime.poster,
      backdrop: anime.backdrop || anime.image || anime.poster,
      description: anime.description || "Start watching the latest episodes.",
      genres: ['Anime'], status: 'RELEASING', score: 'N/A', rating: 'U/A 13+'
    });
    onBack();
  };

  // --- History Selection Handlers ---
  const handleHistoryLongPress = (term) => {
    setHistorySelectMode(true);
    setSelectedHistory(new Set([term]));
  };

  const handleHistoryTap = (term) => {
    if (historySelectMode) {
      const next = new Set(selectedHistory);
      if (next.has(term)) next.delete(term); else next.add(term);
      if (next.size === 0) setHistorySelectMode(false);
      setSelectedHistory(next);
    } else {
      executeSearch(term);
    }
  };

  const confirmDeleteSelectedHistory = async () => {
    if (!user) return;
    const batch = firestore().batch();
    selectedHistory.forEach(term => {
      const safeTerm = term.trim().replace(/[\/\\.#$\[\]]/g, '_');
      batch.delete(firestore().collection('users').doc(user.uid).collection('history').doc(`search_${safeTerm}`));
    });
    await batch.commit();
    setHistory(history.filter(h => !selectedHistory.has(h)));
    setSelectedHistory(new Set());
    setHistorySelectMode(false);
    setConfirmDeleteVisible(false);
  };

  // --- Rendering UI ---
  const highlightText = (text, highlight) => {
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return <Text>{parts.map((part, i) => part.toLowerCase() === highlight.toLowerCase() ? <Text key={i} style={{color: BRAND_RED, fontWeight:'900'}}>{part}</Text> : <Text key={i}>{part}</Text>)}</Text>;
  };

  const renderTopResult = () => {
    if (!topResult) return null;
    const aSub = topResult.tvInfo?.sub || topResult.sub || '?';
    const aDub = topResult.tvInfo?.dub || topResult.dub || 0;
    const aType = topResult.type || 'TV';
    const isAdded = librarySet.has(String(topResult.id));

    return (
      <TouchableOpacity style={styles.heroCard} activeOpacity={0.9} onPress={() => navigateToPlay(topResult)}>
        <ProxyImage source={{ uri: topResult.backdrop || topResult.image || topResult.poster }} style={styles.heroBackdrop} resizeMode="cover" />
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Defs><LinearGradient id="heroGrad" x1="0" y1="1" x2="0" y2="0"><Stop offset="0" stopColor="#000000" stopOpacity="1" /><Stop offset="0.6" stopColor="#000000" stopOpacity="0.8" /><Stop offset="1" stopColor="#000000" stopOpacity="0" /></LinearGradient></Defs>
          <Rect width="100%" height="100%" fill="url(#heroGrad)" />
        </Svg>

        <View style={styles.heroContent}>
          <ProxyImage source={{ uri: topResult.image || topResult.poster }} style={styles.heroPoster} resizeMode="cover" />
          <View style={styles.heroMetaBox}>
            <View style={styles.topMatchTag}><Text style={styles.topMatchText}>★ TOP MATCH</Text></View>
            <Text style={styles.heroTitle} numberOfLines={2}>{topResult.title}</Text>
            {topResult.description && <Text style={styles.heroDesc} numberOfLines={3}>{topResult.description}</Text>}
            
            <View style={styles.heroActionsRow}>
              <TouchableOpacity style={styles.watchNowBtn} onPress={() => navigateToPlay(topResult)}>
                <IconPlay />
                <Text style={styles.watchNowText}>WATCH NOW</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.heroIconBtn, isAdded && styles.heroIconBtnActive]} onPress={() => toggleLibrary(topResult)}>
                <IconBookmark color={isAdded ? BRAND_RED : "#FFF"} filled={isAdded} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroIconBtn} onPress={() => setShareAnimeData(topResult)}>
                <IconShare />
              </TouchableOpacity>
            </View>

            <View style={styles.epRow}>
              <View style={styles.typeBadge}><Text style={styles.badgeText}>{aType}</Text></View>
              <Text style={styles.subText}>CC <Text style={{ color: BRAND_RED }}>{aSub}</Text></Text>
              {aDub > 0 && <Text style={styles.dubText}> • MIC <Text style={{ color: '#A855F7' }}>{aDub}</Text></Text>}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderListItem = ({ item }) => {
    const aSub = item.tvInfo?.sub || item.sub || '?';
    const aDub = item.tvInfo?.dub || item.dub || 0;
    const aType = item.type || 'TV';
    const isAdded = librarySet.has(String(item.id));

    return (
      <TouchableOpacity style={styles.listCard} activeOpacity={0.8} onPress={() => navigateToPlay(item)}>
        <View style={styles.listThumbWrapper}>
          <ProxyImage source={{ uri: item.image || item.poster }} style={styles.listThumb} resizeMode="cover" />
          <View style={styles.listTypeBadge}><Text style={styles.badgeText}>{aType}</Text></View>
        </View>
        
        <View style={styles.listMeta}>
          <Text style={styles.listTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.listDesc} numberOfLines={2}>{item.description || "Dive into this exciting series. Click to view more details and start watching."}</Text>
          
          <View style={styles.listBottomRow}>
            <View style={styles.epRow}>
              <Text style={styles.subText}>CC <Text style={{ color: BRAND_RED }}>{aSub}</Text></Text>
              {aDub > 0 && <Text style={styles.dubText}> • MIC <Text style={{ color: '#A855F7' }}>{aDub}</Text></Text>}
            </View>
            <View style={{flexDirection: 'row', gap: 6}}>
              <TouchableOpacity style={styles.listMiniBtn} onPress={() => toggleLibrary(item)}>
                <IconBookmark size={16} color={isAdded ? BRAND_RED : "#888"} filled={isAdded} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.listMiniBtn} onPress={() => setShareAnimeData(item)}>
                <IconShare size={14} color="#888" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <IconSearch color="#888" />
          <TextInput
            style={styles.input}
            placeholder={placeholderText}
            placeholderTextColor="#666"
            value={query}
            onChangeText={handleInputChange}
            onSubmitEditing={() => executeSearch(query)}
            returnKeyType="search"
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => handleInputChange('')} hitSlop={{top:10,bottom:10,left:10,right:10}}>
              <IconClear color="#888" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={[styles.filterBtn, (activeFilters.genres || activeFilters.year || activeFilters.format) && styles.filterBtnActive]} onPress={() => setFilterModalVisible(true)}>
          <IconFilter />
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={onBack}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Floating Selection Bar for History */}
      {historySelectMode && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCount}>{selectedHistory.size} Selected</Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity onPress={() => { setHistorySelectMode(false); setSelectedHistory(new Set()); }} style
