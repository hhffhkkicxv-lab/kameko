import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, 
  FlatList, ActivityIndicator, Animated, Keyboard 
} from 'react-native';
import Svg, { Path, Rect, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import firestore from '@react-native-firebase/firestore';
import ProxyImage from './ProxyImage';

const BRAND_RED = '#E50914';
const API_BASE = 'https://anikoto-api-lyart.vercel.app';
const ANILIST_URL = 'https://graphql.anilist.co';

// --- SVGs ---
const IconSearch = ({ size = 20, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="11" cy="11" r="8" />
    <Path d="M21 21l-4.35-4.35" />
  </Svg>
);
const IconClear = ({ size = 18, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);
const IconHistory = ({ size = 14, color = "#888" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </Svg>
);
const IconTrash = ({ size = 14, color = BRAND_RED }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </Svg>
);

// --- History Chip Component (With Delete Animation) ---
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
    <TouchableOpacity 
      style={styles.historyChip} 
      onPress={() => showDelete ? handleCancel() : onSelect(term)}
      onLongPress={handleLongPress}
      activeOpacity={0.8}
      delayLongPress={400}
    >
      {!showDelete && <IconHistory />}
      <Text style={styles.historyText}>{term}</Text>
      
      {showDelete && (
        <Animated.View style={{ width: widthAnim, overflow: 'hidden', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => onDelete(term)} hitSlop={{top:10, bottom:10, left:10, right:10}}>
            <IconTrash />
          </TouchableOpacity>
        </Animated.View>
      )}
    </TouchableOpacity>
  );
};

export default function Search({ user, onBack, onSelectAnime }) {
  const [query, setQuery] = useState('');
  const [placeholderText, setPlaceholderText] = useState('Search anime...');
  const [trendingNames, setTrendingNames] = useState(['Solo Leveling', 'Jujutsu Kaisen', 'One Piece', 'Bleach', 'Naruto']);
  
  const [history, setHistory] = useState([]);
  const [results, setResults] = useState([]);
  
  const [viewState, setViewState] = useState('idle'); // 'idle' | 'loading' | 'results' | 'empty'
  
  const typingTimer = useRef(null);
  const typeIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const isDeletingRef = useRef(false);

  // 1. Load Search History from Firestore
  useEffect(() => {
    if (!user) return;
    const unsub = firestore()
      .collection('users')
      .doc(user.uid)
      .collection('history')
      .where('historyType', '==', 'search')
      .orderBy('timestamp', 'desc')
      .limit(10)
      .onSnapshot((snap) => {
        if (!snap) return;
        const h = [];
        snap.forEach(doc => h.push(doc.data().term));
        setHistory(h);
      });
    return () => unsub();
  }, [user]);

  // 2. Fetch Top Trending Names for Typewriter Effect
  useEffect(() => {
    const fetchTrending = async () => {
      try {
        const q = `query { Page(page: 1, perPage: 5) { media(type: ANIME, sort: TRENDING_DESC) { title { english romaji } } } }`;
        const res = await fetch(ANILIST_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q })
        });
        const json = await res.json();
        if (json?.data?.Page?.media) {
          const names = json.data.Page.media.map(a => a.title.english || a.title.romaji);
          setTrendingNames(names);
        }
      } catch (e) {}
    };
    fetchTrending();
  }, []);

  // 3. Typewriter Animation Engine
  useEffect(() => {
    let typeSpeed = 100;
    let timeout;

    const animatePlaceholder = () => {
      // Pause animation if user is typing
      if (query.trim() !== '') return;

      const currentName = trendingNames[typeIndexRef.current];

      if (isDeletingRef.current) {
        setPlaceholderText(`Search "${currentName.substring(0, charIndexRef.current - 1)}"`);
        charIndexRef.current--;
        typeSpeed = 50;
      } else {
        setPlaceholderText(`Search "${currentName.substring(0, charIndexRef.current + 1)}"`);
        charIndexRef.current++;
        typeSpeed = 100;
      }

      if (!isDeletingRef.current && charIndexRef.current === currentName.length) {
        typeSpeed = 2500; // Pause at end of word
        isDeletingRef.current = true;
      } else if (isDeletingRef.current && charIndexRef.current === 0) {
        isDeletingRef.current = false;
        typeIndexRef.current = (typeIndexRef.current + 1) % trendingNames.length;
        typeSpeed = 500; // Pause before new word
      }

      timeout = setTimeout(animatePlaceholder, typeSpeed);
    };

    timeout = setTimeout(animatePlaceholder, typeSpeed);
    return () => clearTimeout(timeout);
  }, [trendingNames, query]);

  // 4. Save/Delete History
  const saveToHistory = async (term) => {
    if (!user || !term.trim()) return;
    const safeTerm = term.trim().replace(/[\/\\.#$\[\]]/g, '_');
    await firestore().collection('users').doc(user.uid).collection('history').doc(`search_${safeTerm}`).set({
      historyType: 'search',
      term: term.trim(),
      timestamp: Date.now()
    }, { merge: true });
  };

  const deleteFromHistory = async (term) => {
    if (!user) return;
    const safeTerm = term.trim().replace(/[\/\\.#$\[\]]/g, '_');
    await firestore().collection('users').doc(user.uid).collection('history').doc(`search_${safeTerm}`).delete();
  };

  // 5. Execute API Search
  const executeSearch = async (searchTerm) => {
    Keyboard.dismiss();
    const term = searchTerm.trim();
    if (!term) return;

    setQuery(term);
    setViewState('loading');
    saveToHistory(term);

    try {
      const res = await fetch(`${API_BASE}/api/search?keyword=${encodeURIComponent(term)}`);
      const json = await res.json();
      const data = json.data || json.results || [];

      if (data.length > 0) {
        setResults(data);
        setViewState('results');
      } else {
        setViewState('empty');
      }
    } catch (e) {
      setViewState('empty');
    }
  };

  const handleInputChange = (text) => {
    setQuery(text);
    if (text.trim() === '') {
      setViewState('idle');
      setResults([]);
    }
  };

  // Render Functions
  const renderItem = ({ item }) => {
    const aSub = item.tvInfo?.sub || item.sub || '?';
    const aDub = item.tvInfo?.dub || item.dub || 0;
    const aType = item.type || 'TV';

    return (
      <TouchableOpacity 
        style={styles.cardContainer} 
        activeOpacity={0.8}
        onPress={() => onSelectAnime({
          id: item.id,
          title: item.title,
          coverImage: item.image || item.poster,
          backdrop: item.image || item.poster,
          description: "Select an episode below to start watching.",
          genres: ['Anime'],
          status: 'RELEASING',
          score: 'N/A',
          rating: 'U/A 13+'
        })}
      >
        <View style={styles.posterWrapper}>
          <ProxyImage source={{ uri: item.image || item.poster }} style={styles.posterImage} resizeMode="cover" />
          
          <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <Defs>
              <LinearGradient id="cardGrad" x1="0" y1="1" x2="0" y2="0">
                <Stop offset="0" stopColor="#000000" stopOpacity="0.9" />
                <Stop offset="0.5" stopColor="#000000" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#cardGrad)" />
          </Svg>

          <View style={styles.badgeContainer}>
            <View style={styles.typeBadge}><Text style={styles.badgeText}>{aType}</Text></View>
          </View>
        </View>
        
        <View style={styles.metaDataRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <View style={styles.epRow}>
            <Text style={styles.subText}>CC <Text style={{ color: BRAND_RED }}>{aSub}</Text></Text>
            {aDub > 0 && <Text style={styles.dubText}> • MIC <Text style={{ color: '#A855F7' }}>{aDub}</Text></Text>}
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
        <TouchableOpacity style={styles.cancelBtn} onPress={onBack}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* State Renderers */}
      {viewState === 'idle' && (
        <View style={styles.historyContainer}>
          {history.length > 0 ? (
            <>
              <Text style={styles.historyHeader}>Recent Searches</Text>
              <View style={styles.historyWrap}>
                {history.map(term => (
                  <HistoryChip 
                    key={term} 
                    term={term} 
                    onSelect={executeSearch} 
                    onDelete={deleteFromHistory} 
                  />
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.emptyHistoryText}>Search for your favorite anime...</Text>
          )}
        </View>
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
          <Text style={styles.emptySub}>Check your spelling or try different keywords.</Text>
        </View>
      )}

      {viewState === 'results' && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          renderItem={renderItem}
          keyboardDismissMode="on-drag"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', paddingTop: 50 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 12, paddingHorizontal: 14, height: 46, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  input: { flex: 1, color: '#FFF', fontSize: 15, fontWeight: '500', marginLeft: 10, height: '100%' },
  cancelBtn: { marginLeft: 14 },
  cancelBtnText: { color: BRAND_RED, fontSize: 15, fontWeight: '700' },
  
  historyContainer: { paddingHorizontal: 20, paddingTop: 24 },
  historyHeader: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 12 },
  historyWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  historyChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', gap: 8 },
  historyText: { color: '#CCC', fontSize: 13, fontWeight: '600' },
  emptyHistoryText: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: 14, marginTop: 40, fontStyle: 'italic' },
  
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  loadingText: { color: BRAND_RED, fontSize: 14, fontWeight: '700', marginTop: 16, letterSpacing: 1 },
  emptyTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  emptySub: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center' },
  
  listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
  columnWrapper: { justifyContent: 'space-between', marginBottom: 16 },
  cardContainer: { width: '48%', backgroundColor: '#0D0D0D', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  posterWrapper: { width: '100%', aspectRatio: 3/4 },
  posterImage: { width: '100%', height: '100%' },
  badgeContainer: { position: 'absolute', top: 6, left: 6, flexDirection: 'row', gap: 4 },
  typeBadge: { backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  
  metaDataRow: { padding: 10 },
  cardTitle: { color: '#FFF', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  epRow: { flexDirection: 'row', alignItems: 'center' },
  subText: { color: '#888', fontSize: 10, fontWeight: '900' },
  dubText: { color: '#888', fontSize: 10, fontWeight: '900' }
});
