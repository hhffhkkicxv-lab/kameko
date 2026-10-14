import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, 
  FlatList, ActivityIndicator, Animated, Keyboard, Modal, ScrollView
} from 'react-native';
import Svg, { Path, Rect, Defs, LinearGradient, Stop, Circle, Polyline } from 'react-native-svg';
import firestore from '@react-native-firebase/firestore';
import ProxyImage from './ProxyImage';

const BRAND_RED = '#E50914';
const API_BASE = 'https://anikoto-api-lyart.vercel.app';
const ANILIST_URL = 'https://graphql.anilist.co';

// --- Premium SVG Icons ---
const IconSearch = ({ size = 20, color = "#FFF" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Circle cx="11" cy="11" r="8" /><Path d="M21 21l-4.35-4.35" /></Svg>);
const IconClear = ({ size = 18, color = "#FFF" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Path d="M18 6L6 18M6 6l12 12" /></Svg>);
const IconHistory = ({ size = 14, color = "#888" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></Svg>);
const IconTrash = ({ size = 14, color = BRAND_RED }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></Svg>);
const IconFilter = ({ size = 20, color = "#FFF" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></Svg>);
const IconPlay = ({ size = 16, color = "#000" }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Path d="M8 5v14l11-7z" /></Svg>);
const IconBookmark = ({ size = 14, color = "#FFF", filled = false }) => (<Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></Svg>);

const HistoryChip = ({ term, onSelect, onDelete }) => {
  const [showDelete, setShowDelete] = useState(false);
  const widthAnim = useRef(new Animated.Value(0)).current;

  const handleLongPress = () => {
    setShowDelete(true);
    Animated.timing(widthAnim, { toValue: 30, duration: 200, useNativeDriver: false }).start();
  };

  const handleCancel = () => {
    Animated.timing(widthAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start(() => setShowDelete(false));
  };

  return (
    <TouchableOpacity style={styles.historyChip} onPress={() => showDelete ? handleCancel() : onSelect(term)} onLongPress={handleLongPress} activeOpacity={0.8} delayLongPress={400}>
      {!showDelete && <IconHistory />}
      <Text style={styles.historyText}>{term}</Text>
      {showDelete && (
        <Animated.View style={{ width: widthAnim, overflow: 'hidden', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => onDelete(term)} hitSlop={{top:10, bottom:10, left:10, right:10}}><IconTrash /></TouchableOpacity>
        </Animated.View>
      )}
    </TouchableOpacity>
  );
};

export default function Search({ user, onBack, onSelectAnime }) {
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
  const [activeFilters, setActiveFilters] = useState({ genres: '', year: '', format: 'TV' });

  const typingTimer = useRef(null);
  const typeIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const isDeletingRef = useRef(false);

  // 1. Initial Listeners
  useEffect(() => {
    if (!user) return;
    const unsubHist = firestore().collection('users').doc(user.uid).collection('history').where('historyType', '==', 'search').orderBy('timestamp', 'desc').limit(10).onSnapshot((snap) => {
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

  const deleteFromHistory = async (term) => {
    if (!user) return;
    const safeTerm = term.trim().replace(/[\/\\.#$\[\]]/g, '_');
    await firestore().collection('users').doc(user.uid).collection('history').doc(`search_${safeTerm}`).delete();
  };

  const toggleLibrary = async (anime) => {
    if (!user) return;
    const ref = firestore().collection('users').doc(user.uid).collection('library').doc(String(anime.id));
    if (librarySet.has(String(anime.id))) await ref.delete();
    else await ref.set({ id: String(anime.id), title: anime.title, img: anime.image || anime.poster, addedAt: firestore.FieldValue.serverTimestamp() });
  };

  const executeSearch = async (searchTerm) => {
    Keyboard.dismiss();
    const term = searchTerm.trim();
    if (!term) return;

    setQuery(term);
    setViewState('loading');
    saveToHistory(term);

    try {
      // Build filter params
      const params = new URLSearchParams();
      params.append('keyword', term);
      if (activeFilters.genres) params.append('genres', activeFilters.genres);
      if (activeFilters.year) params.append('seasonYear', activeFilters.year);
      if (activeFilters.format) params.append('format', activeFilters.format);

      const endpoint = (activeFilters.genres || activeFilters.year) ? '/api/filter' : '/api/search';
      const res = await fetch(`${API_BASE}${endpoint}?${params.toString()}`);
      const json = await res.json();
      
      let data = [];
      if (endpoint === '/api/filter' && json.success) data = json.results?.data || [];
      else if (json.success) data = json.data || json.results || [];

      if (data.length > 0) {
        const topHit = data[0];
        
        // Fetch rich metadata for the top hit
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
      id: anime.id,
      title: anime.title,
      coverImage: anime.image || anime.poster,
      backdrop: anime.backdrop || anime.image || anime.poster,
      description: anime.description || "Start watching the latest episodes.",
      genres: ['Anime'], status: 'RELEASING', score: 'N/A', rating: 'U/A 13+'
    });
    onBack(); // Close search modal instantly
  };

  // --- RENDERING VIEWS ---
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
          <Defs><LinearGradient id="heroGrad" x1="0" y1="1" x2="0" y2="0"><Stop offset="0" stopColor="#0a0a0a" stopOpacity="1" /><Stop offset="0.6" stopColor="#0a0a0a" stopOpacity="0.8" /><Stop offset="1" stopColor="#0a0a0a" stopOpacity="0" /></LinearGradient></Defs>
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
              <TouchableOpacity style={[styles.heroSaveBtn, isAdded && styles.heroSaveBtnActive]} onPress={() => toggleLibrary(topResult)}>
                <IconBookmark color={isAdded ? BRAND_RED : "#FFF"} filled={isAdded} />
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
            <TouchableOpacity style={styles.listSaveBtn} onPress={() => toggleLibrary(item)}>
              <IconBookmark size={16} color={isAdded ? BRAND_RED : "#888"} filled={isAdded} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search Header */}
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
        <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterModalVisible(true)}>
          <IconFilter />
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={onBack}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* View States */}
      {viewState === 'idle' && (
        <ScrollView style={styles.historyContainer}>
          {history.length > 0 ? (
            <>
              <Text style={styles.historyHeader}>Recent Searches</Text>
              <View style={styles.historyWrap}>
                {history.map(term => <HistoryChip key={term} term={term} onSelect={executeSearch} onDelete={deleteFromHistory} />)}
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
                <IconSearch size={14} color="#555" />
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
          <Text style={styles.loadingText}>Scanning Anime...</Text>
        </View>
      )}

      {viewState === 'empty' && (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyTitle}>Nothing matched your search.</Text>
          <Text style={styles.emptySub}>Check your spelling or try different filters.</Text>
        </View>
      )}

      {viewState === 'results' && (
        <FlatList
          data={listResults}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderTopResult}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={renderListItem}
          keyboardDismissMode="on-drag"
        />
      )}

      {/* Filter Modal */}
      <Modal visible={filterModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.filterSheet}>
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>Advanced Filters</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}><IconClear size={24} color="#FFF" /></TouchableOpacity>
            </View>

            <Text style={styles.filterLabel}>Format</Text>
            <View style={styles.filterRow}>
              {['TV', 'MOVIE', 'OVA'].map(f => (
                <TouchableOpacity key={f} style={[styles.filterChip, activeFilters.format === f && styles.filterChipActive]} onPress={() => setActiveFilters({...activeFilters, format: f})}>
                  <Text style={[styles.filterChipText, activeFilters.format === f && styles.filterChipTextActive]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.applyFilterBtn} onPress={() => { setFilterModalVisible(false); if (query.trim()) executeSearch(query); }}>
              <Text style={styles.applyFilterText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', paddingTop: 50 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 12, paddingHorizontal: 14, height: 46, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  input: { flex: 1, color: '#FFF', fontSize: 15, fontWeight: '500', marginLeft: 10, height: '100%' },
  filterBtn: { marginLeft: 12, padding: 8, backgroundColor: '#1A1A1A', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  cancelBtn: { marginLeft: 14 },
  cancelBtnText: { color: BRAND_RED, fontSize: 15, fontWeight: '700' },
  
  historyContainer: { paddingHorizontal: 20, paddingTop: 24 },
  historyHeader: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 12 },
  historyWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  historyChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', gap: 8 },
  historyText: { color: '#CCC', fontSize: 13, fontWeight: '600' },
  emptyHistoryText: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: 14, marginTop: 40, fontStyle: 'italic' },
  
  suggestionsContainer: { paddingHorizontal: 20, paddingTop: 10 },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', gap: 12 },
  suggestionText: { color: '#CCC', fontSize: 14, fontWeight: '500' },

  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  loadingText: { color: BRAND_RED, fontSize: 14, fontWeight: '700', marginTop: 16, letterSpacing: 1 },
  emptyTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  emptySub: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center' },
  
  listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
  
  // Hero Result
  heroCard: { width: '100%', minHeight: 280, backgroundColor: '#0A0A0A', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 20 },
  heroBackdrop: { ...StyleSheet.absoluteFillObject, opacity: 0.3 },
  heroContent: { flexDirection: 'row', alignItems: 'flex-end', padding: 16, marginTop: 'auto', zIndex: 10 },
  heroPoster: { width: 100, height: 140, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  heroMetaBox: { flex: 1, marginLeft: 16 },
  topMatchTag: { backgroundColor: 'rgba(229,9,20,0.2)', alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginBottom: 8 },
  topMatchText: { color: BRAND_RED, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  heroTitle: { color: '#FFF', fontSize: 20, fontWeight: '900', marginBottom: 6, textShadowColor: '#000', textShadowRadius: 4 },
  heroDesc: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 12, lineHeight: 16 },
  heroActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  watchNowBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, gap: 6 },
  watchNowText: { color: '#000', fontSize: 11, fontWeight: '900' },
  heroSaveBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  heroSaveBtnActive: { backgroundColor: 'rgba(229,9,20,0.2)', borderColor: BRAND_RED },

  // List Results
  listCard: { flexDirection: 'row', backgroundColor: '#0F0F0F', borderRadius: 12, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  listThumbWrapper: { width: 80, height: 110, borderRadius: 8, overflow: 'hidden' },
  listThumb: { width: '100%', height: '100%' },
  listTypeBadge: { position: 'absolute', top: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 3 },
  listMeta: { flex: 1, marginLeft: 14, justifyContent: 'space-between' },
  listTitle: { color: '#FFF', fontSize: 15, fontWeight: '800', marginBottom: 4 },
  listDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 11, lineHeight: 15 },
  listBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 8 },
  
  // Shared Badges
  epRow: { flexDirection: 'row', alignItems: 'center' },
  typeBadge: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 8 },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  subText: { color: '#888', fontSize: 10, fontWeight: '900' },
  dubText: { color: '#888', fontSize: 10, fontWeight: '900' },

  listSaveBtn: { padding: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 6 },

  // Filter Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  filterSheet: { backgroundColor: '#111', padding: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  filterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  filterTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  filterLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 10 },
  filterRow: { flexDirection: 'row', gap: 10, marginBottom: 30 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#222', borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  filterChipActive: { backgroundColor: 'rgba(229,9,20,0.2)', borderColor: BRAND_RED },
  filterChipText: { color: '#AAA', fontSize: 13, fontWeight: '700' },
  filterChipTextActive: { color: '#FFF' },
  applyFilterBtn: { backgroundColor: BRAND_RED, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  applyFilterText: { color: '#FFF', fontSize: 15, fontWeight: '800' }
});
