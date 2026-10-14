import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  ScrollView, ActivityIndicator, Alert, Dimensions 
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as FileSystem from 'expo-file-system';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

let DocumentPicker = null;
try {
  DocumentPicker = require('expo-document-picker');
} catch (_) {}

const BRAND_RED = '#E50914';
const VERCEL_API_BASE = 'https://anikoto-api-lyart.vercel.app';
const PROXY_URL = 'https://icy-wave-30d8.prashant-yash69.workers.dev/proxy?url=';

const FONT_OPTIONS = [
  { label: 'System Default', value: 'normal' },
  { label: 'Roboto / Sans', value: 'Roboto' },
  { label: 'Monospace', value: 'monospace' },
  { label: 'Courier New', value: 'Courier New' },
  { label: 'Inter (Clean)', value: 'sans-serif' },
  { label: 'Cinzel (Serif)', value: 'serif' },
  { label: 'Montserrat', value: 'sans-serif-medium' },
  { label: 'Oswald (Condensed)', value: 'sans-serif-condensed' },
  { label: 'Caveat (Casual)', value: 'casual' },
  { label: 'Impact (Heavy)', value: 'sans-serif-black' },
];

const COLOR_OPTIONS = [
  '#FFFFFF', '#FACC15', '#F97316', '#4ADE80', 
  '#38BDF8', '#A855F7', '#F43F5E', '#000000'
];

const IconPlus = ({ size = 18, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5">
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);

// --- ROBUST LINE-BY-LINE PARSER ---
const parseTimeToSeconds = (timeStr) => {
  const cleanTimeStr = timeStr.trim().split(/\s+/)[0].replace(',', '.');
  const parts = cleanTimeStr.split(':');
  let seconds = NaN;
  
  if (parts.length === 3) {
    seconds = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  
  return Number.isFinite(seconds) ? seconds : NaN;
};

const fetchAndParseSubtitle = async (uri, referer) => {
  try {
    let text = '';
    
    if (uri.startsWith('file://')) {
      text = await FileSystem.readAsStringAsync(uri);
    } else {
      // USE CLOUDFLARE PROXY TO BYPASS 403 BLOCKS
      const proxyUri = `${PROXY_URL}${encodeURIComponent(uri)}&referer=${encodeURIComponent(referer)}`;
      const response = await fetch(proxyUri);
      
      if (!response.ok) throw new Error('Proxy fetch failed');
      text = await response.text();
    }
    
    // If we received an HTML error page instead of a VTT file, abort
    if (text.trim().toLowerCase().startsWith('<!doctype html>') || text.trim().toLowerCase().startsWith('<html')) {
      throw new Error('Received HTML blocked page instead of VTT.');
    }

    const cues = [];
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    let currentCue = null;

    // Line-by-line parsing avoids splitting errors on badly formatted VTTs
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.includes('-->')) {
        const [startStr, endStr] = line.split('-->');
        const start = parseTimeToSeconds(startStr);
        const end = parseTimeToSeconds(endStr);

        if (Number.isFinite(start) && Number.isFinite(end)) {
          currentCue = { start, end, text: '' };
          cues.push(currentCue);
        }
      } else if (currentCue && line.trim() === '') {
        currentCue.text = currentCue.text.trim();
        currentCue = null;
      } else if (currentCue) {
        const cleanText = line.replace(/<[^>]*>/g, '');
        currentCue.text += (currentCue.text ? '\n' : '') + cleanText;
      }
    }

    if (currentCue) currentCue.text = currentCue.text.trim();
    return cues.filter(c => c.text.length > 0);
  } catch (err) {
    console.error("Subtitle parsing error:", err);
    return []; 
  }
};

export default function SubtitleSheet({
  activeMenu,
  setActiveMenu,
  subtitlesEnabled,
  setSubtitlesEnabled,
  subSettings,
  setSubSettings,
  animeId,
  episodeNum,
  onSelectSubtitleTrack
}) {
  const [availableTracks, setAvailableTracks] = useState([]);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(-1);
  const [isFetchingList, setIsFetchingList] = useState(false);
  const [parsingIndex, setParsingIndex] = useState(null); 
  const [activeTab, setActiveTab] = useState('tracks');

  const customFileUrisRef = useRef([]);
  const requestIdRef = useRef(0);
  const refererRef = useRef('https://vidwish.live/');

  // 1. BACKGROUND FETCH & AUTO-LOAD
  useEffect(() => {
    if (!animeId || !episodeNum) return;
    const currentRequestId = ++requestIdRef.current;

    const fetchSubtitles = async () => {
      try {
        setIsFetchingList(true);
        const url = `${VERCEL_API_BASE}/api/stream?id=${encodeURIComponent(animeId)}&ep=${encodeURIComponent(episodeNum)}&server=hd-1&type=sub`;
        const res = await fetch(url);
        const json = await res.json();

        if (currentRequestId !== requestIdRef.current) return;

        if (json?.success && json.data) {
          if (json.data.referer) {
            refererRef.current = json.data.referer; // Save the API's referer for the proxy
          }

          if (Array.isArray(json.data.subtitles) && json.data.subtitles.length > 0) {
            setAvailableTracks(json.data.subtitles);
            
            const defaultIdx = json.data.subtitles.findIndex(s => s.default) !== -1 
              ? json.data.subtitles.findIndex(s => s.default) 
              : 0;
            
            handleTrackSelect(json.data.subtitles[defaultIdx], defaultIdx, currentRequestId);
          }
        }
      } catch (_) {
      } finally {
        if (currentRequestId === requestIdRef.current) setIsFetchingList(false);
      }
    };

    fetchSubtitles();

    return () => {
      requestIdRef.current++; 
      setAvailableTracks([]);
      if (onSelectSubtitleTrack) onSelectSubtitleTrack(null);
      
      customFileUrisRef.current.forEach(uri => {
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      });
      customFileUrisRef.current = [];
    };
  }, [animeId, episodeNum]);

  // Core Track Loader
  const handleTrackSelect = async (track, idx, parentRequestId = null) => {
    const reqId = parentRequestId || ++requestIdRef.current;
    
    setParsingIndex(idx); 
    const parsedCues = await fetchAndParseSubtitle(track.file, refererRef.current);
    
    if (reqId !== requestIdRef.current) return;
    setParsingIndex(null);

    if (parsedCues.length > 0) {
      setSelectedTrackIndex(idx);
      setSubtitlesEnabled(true);
      if (onSelectSubtitleTrack) {
        onSelectSubtitleTrack({ ...track, cues: parsedCues });
      }
    } else {
      Alert.alert('Subtitle Error', 'Could not load text from this subtitle track.');
      handleTurnOff();
    }
  };

  const handleTurnOff = () => {
    requestIdRef.current++; 
    setParsingIndex(null);
    setSelectedTrackIndex(-1);
    setSubtitlesEnabled(false);
    if (onSelectSubtitleTrack) onSelectSubtitleTrack(null);
  };

  const handlePickCustomSubtitle = async () => {
    if (!DocumentPicker) {
      Alert.alert('Feature Notice', 'Please install expo-document-picker.');
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/vtt', 'application/x-subrip', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const newTrack = {
          file: file.uri,
          label: file.name || 'Custom Local Subtitle',
          kind: 'captions',
          isCustom: true
        };

        customFileUrisRef.current.push(file.uri);
        
        const newIndex = availableTracks.length;
        setAvailableTracks(prev => [...prev, newTrack]);
        handleTrackSelect(newTrack, newIndex);
        setActiveMenu(null);
      }
    } catch (err) {
      Alert.alert('File Error', 'Could not load custom subtitle file.');
    }
  };

  if (activeMenu !== 'subs') return null;

  return (
    <View style={styles.absoluteWrapper} pointerEvents="box-none">
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setActiveMenu(null)} />

      <View style={styles.sheetSurface}>
        <View style={styles.tabHeader}>
          <TouchableOpacity onPress={() => setActiveTab('tracks')} style={[styles.tabBtn, activeTab === 'tracks' && styles.tabBtnActive]}>
            <Text style={[styles.tabText, activeTab === 'tracks' && styles.tabTextActive]}>Tracks</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setActiveTab('styles')} style={[styles.tabBtn, activeTab === 'styles' && styles.tabBtnActive]}>
            <Text style={[styles.tabText, activeTab === 'styles' && styles.tabTextActive]}>Appearance</Text>
          </TouchableOpacity>
        </View>

        {/* UI FIX: flexShrink ensures the ScrollView doesn't collapse to 0 height or overflow off-screen */}
        <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
          
          {activeTab === 'tracks' && (
            <View style={styles.listContainer}>
              {isFetchingList && <ActivityIndicator size="small" color={BRAND_RED} style={{ marginVertical: 10 }} />}

              <TouchableOpacity 
                style={[styles.trackCard, selectedTrackIndex === -1 ? styles.trackCardActive : styles.trackCardInactive]}
                onPress={() => { handleTurnOff(); setActiveMenu(null); }}
              >
                <Text style={[styles.trackName, selectedTrackIndex === -1 ? styles.trackNameActive : styles.trackNameInactive]}>Off</Text>
              </TouchableOpacity>

              {availableTracks.map((track, idx) => {
                const isSelected = subtitlesEnabled && selectedTrackIndex === idx;
                const isDownloading = parsingIndex === idx;

                return (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.trackCard, isSelected ? styles.trackCardActive : styles.trackCardInactive]}
                    onPress={() => {
                      handleTrackSelect(track, idx);
                      if (!isDownloading) setActiveMenu(null);
                    }}
                    disabled={isDownloading}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[styles.trackName, isSelected ? styles.trackNameActive : styles.trackNameInactive]}>
                        {track.label || track.lang || `Track ${idx + 1}`}
                      </Text>
                      {isDownloading && <ActivityIndicator size="small" color="#FFF" />}
                    </View>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity style={styles.addCustomBtn} activeOpacity={0.7} onPress={handlePickCustomSubtitle}>
                <IconPlus size={16} color="#FFF" />
                <Text style={styles.addCustomText}>Add Custom Subtitle</Text>
              </TouchableOpacity>
            </View>
          )}

          {activeTab === 'styles' && (
            <View style={styles.stylesContainer}>
              <Text style={styles.sectionTitle}>Font Family</Text>
              <View style={styles.fontGrid}>
                {FONT_OPTIONS.map((f, i) => {
                  const isSelected = (subSettings.fontFamily || 'normal') === f.value;
                  return (
                    <TouchableOpacity key={i} style={[styles.fontCard, isSelected && styles.fontCardActive]} onPress={() => setSubSettings(prev => ({ ...prev, fontFamily: f.value }))}>
                      <Text style={[styles.fontCardText, { fontFamily: f.value }, isSelected && { color: '#FFF', fontWeight: '900' }]} numberOfLines={1}>{f.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionTitle}>Text Color</Text>
              <View style={styles.colorPalette}>
                {COLOR_OPTIONS.map((c, i) => (
                  <TouchableOpacity key={i} style={[styles.colorChip, { backgroundColor: c }, subSettings.color === c && styles.colorChipActive]} onPress={() => setSubSettings(prev => ({ ...prev, color: c }))} />
                ))}
              </View>

              <Text style={styles.sectionTitle}>Font Size ({subSettings.size || 16}px)</Text>
              <View style={styles.pillRow}>
                {[12, 14, 16, 20, 24, 28].map((s) => (
                  <TouchableOpacity key={s} style={[styles.pillBtn, (subSettings.size || 16) === s && styles.pillBtnActive]} onPress={() => setSubSettings(prev => ({ ...prev, size: s }))}>
                    <Text style={[styles.pillText, (subSettings.size || 16) === s && styles.pillTextActive]}>{s}px</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionTitle}>Bottom Offset</Text>
              <View style={styles.pillRow}>
                {[20, 35, 50, 75, 100].map((h) => (
                  <TouchableOpacity key={h} style={[styles.pillBtn, (subSettings.height || 40) === h && styles.pillBtnActive]} onPress={() => setSubSettings(prev => ({ ...prev, height: h }))}>
                    <Text style={[styles.pillText, (subSettings.height || 40) === h && styles.pillTextActive]}>{h}px</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionTitle}>Background Box</Text>
              <View style={styles.pillRow}>
                {[{ label: 'None', val: 'transparent' }, { label: 'Translucent', val: 'rgba(0,0,0,0.6)' }, { label: 'Solid Black', val: '#000000' }].map((bg, i) => {
                  const isSelected = (subSettings.backgroundColor || 'transparent') === bg.val;
                  return (
                    <TouchableOpacity key={i} style={[styles.pillBtn, isSelected && styles.pillBtnActive]} onPress={() => setSubSettings(prev => ({ ...prev, backgroundColor: bg.val }))}>
                      <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{bg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  absoluteWrapper: { ...StyleSheet.absoluteFillObject, zIndex: 100, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheetSurface: { width: '100%', maxWidth: 600, alignSelf: 'center', backgroundColor: '#121212', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 18, maxHeight: SCREEN_HEIGHT * 0.85, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  tabHeader: { flexDirection: 'row', marginBottom: 16, backgroundColor: '#1E1E1E', borderRadius: 12, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: BRAND_RED },
  tabText: { color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontSize: 13 },
  tabTextActive: { color: '#FFF', fontWeight: '900' },
  listContainer: { gap: 10 },
  trackCard: { width: '100%', paddingVertical: 16, paddingHorizontal: 18, borderRadius: 10 },
  trackCardActive: { backgroundColor: BRAND_RED },
  trackCardInactive: { backgroundColor: '#1E1E1E' },
  trackName: { fontSize: 15 },
  trackNameActive: { color: '#FFF', fontWeight: '800' },
  trackNameInactive: { color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  addCustomBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', gap: 8, marginTop: 4 },
  addCustomText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  stylesContainer: { gap: 12 },
  sectionTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  fontGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fontCard: { width: '48%', paddingVertical: 12, paddingHorizontal: 10, backgroundColor: '#1E1E1E', borderRadius: 8, alignItems: 'center' },
  fontCardActive: { backgroundColor: BRAND_RED },
  fontCardText: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  colorPalette: { flexDirection: 'row', gap: 12, paddingVertical: 4 },
  colorChip: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  colorChipActive: { borderColor: '#FFF', transform: [{ scale: 1.15 }] },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1E1E1E' },
  pillBtnActive: { backgroundColor: BRAND_RED },
  pillText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  pillTextActive: { color: '#FFF', fontWeight: '800' },
});
