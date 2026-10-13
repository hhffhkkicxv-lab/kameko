import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  ScrollView, ActivityIndicator, Alert 
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

let DocumentPicker = null;
try {
  DocumentPicker = require('expo-document-picker');
} catch (_) {}

const BRAND_RED = '#E50914';
const VERCEL_API_BASE = 'https://anikoto-api-lyart.vercel.app';

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

// --- VTT / SRT PARSER ENGINE ---
const parseTimeToSeconds = (timeStr) => {
  const parts = timeStr.replace(',', '.').split(':');
  let seconds = 0;
  if (parts.length === 3) {
    seconds = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return seconds;
};

const fetchAndParseSubtitle = async (url) => {
  try {
    const response = await fetch(url);
    const text = await response.text();
    
    const cues = [];
    // Normalize newlines and split into blocks
    const blocks = text.replace(/\r\n/g, '\n').split('\n\n');
    
    for (const block of blocks) {
      const lines = block.split('\n');
      const timeLineIndex = lines.findIndex(l => l.includes('-->'));
      
      if (timeLineIndex !== -1) {
        const timeLine = lines[timeLineIndex];
        const [startStr, endStr] = timeLine.split('-->');
        
        const start = parseTimeToSeconds(startStr.trim());
        const end = parseTimeToSeconds(endStr.trim());
        
        const textContent = lines.slice(timeLineIndex + 1)
          .join('\n')
          .replace(/<[^>]*>/g, '') // Strip inline HTML/VTT styling tags
          .trim();
          
        if (textContent) {
          cues.push({ start, end, text: textContent });
        }
      }
    }
    return cues;
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
  onSelectSubtitleTrack,
  onLoadCustomSubtitle
}) {
  const [availableTracks, setAvailableTracks] = useState([]);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [activeTab, setActiveTab] = useState('tracks');

  useEffect(() => {
    let isMounted = true;
    if (activeMenu !== 'subs' || !animeId) return;

    const fetchSubtitles = async () => {
      try {
        setLoading(true);
        const url = `${VERCEL_API_BASE}/api/stream?id=${encodeURIComponent(animeId)}&ep=${encodeURIComponent(episodeNum)}&server=hd-1&type=sub`;
        const res = await fetch(url);
        const json = await res.json();

        if (json?.success && Array.isArray(json?.data?.subtitles) && json.data.subtitles.length > 0) {
          if (isMounted) {
            setAvailableTracks(json.data.subtitles);
          }
        }
      } catch (_) {
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchSubtitles();
    return () => { isMounted = false; };
  }, [activeMenu, animeId, episodeNum]);

  if (activeMenu !== 'subs') return null;

  const handleTrackSelect = async (track, idx) => {
    setIsParsing(true);
    setSelectedTrackIndex(idx);
    setSubtitlesEnabled(true);
    
    // Download and parse the VTT/SRT into JavaScript objects
    const parsedCues = await fetchAndParseSubtitle(track.file);
    
    if (onSelectSubtitleTrack) {
      // Pass the fully parsed array back to the player
      onSelectSubtitleTrack({ ...track, cues: parsedCues });
    }
    
    setIsParsing(false);
    setActiveMenu(null);
  };

  const handlePickCustomSubtitle = async () => {
    if (!DocumentPicker) {
      Alert.alert('Feature Notice', 'Please install expo-document-picker.');
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/vtt', 'application/x-subrip', 'text/plain'],
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

        setAvailableTracks(prev => [newTrack, ...prev]);
        handleTrackSelect(newTrack, 0);
      }
    } catch (err) {
      Alert.alert('File Error', 'Could not load custom subtitle file.');
    }
  };

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setActiveMenu(null)} />

      <View style={styles.sheetSurface}>
        <View style={styles.tabHeader}>
          <TouchableOpacity onPress={() => setActiveTab('tracks')} style={[styles.tabBtn, activeTab === 'tracks' && styles.tabBtnActive]}>
            <Text style={[styles.tabText, activeTab === 'tracks' && styles.tabTextActive]}>Tracks</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setActiveTab('styles')} style={[styles.tabBtn, activeTab === 'styles' && styles.tabBtnActive]}>
            <Text style={[styles.tabText, activeTab === 'styles' && styles.tabTextActive]}>Appearance & Fonts</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'tracks' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContainer}>
            {(loading || isParsing) && <ActivityIndicator size="small" color={BRAND_RED} style={{ marginVertical: 10 }} />}

            <TouchableOpacity 
              style={[styles.trackCard, !subtitlesEnabled ? styles.trackCardActive : styles.trackCardInactive]}
              onPress={() => {
                setSubtitlesEnabled(false);
                if (onSelectSubtitleTrack) onSelectSubtitleTrack(null);
                setActiveMenu(null);
              }}
            >
              <Text style={[styles.trackName, !subtitlesEnabled ? styles.trackNameActive : styles.trackNameInactive]}>Off</Text>
            </TouchableOpacity>

            {availableTracks.map((track, idx) => {
              const isSelected = subtitlesEnabled && selectedTrackIndex === idx;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.trackCard, isSelected ? styles.trackCardActive : styles.trackCardInactive]}
                  onPress={() => handleTrackSelect(track, idx)}
                  disabled={isParsing}
                >
                  <Text style={[styles.trackName, isSelected ? styles.trackNameActive : styles.trackNameInactive]}>
                    {track.label || track.lang || `Track ${idx + 1}`}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={styles.addCustomBtn} activeOpacity={0.7} onPress={handlePickCustomSubtitle} disabled={isParsing}>
              <IconPlus size={16} color="#FFF" />
              <Text style={styles.addCustomText}>Add Custom Subtitle (.vtt, .srt)</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {activeTab === 'styles' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stylesContainer}>
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
              {[20, 35, 50, 75].map((h) => (
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
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 50 },
  sheetSurface: { position: 'absolute', bottom: 0, alignSelf: 'center', width: '100%', maxWidth: 580, backgroundColor: '#121212', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 28, maxHeight: '82%', zIndex: 60, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  tabHeader: { flexDirection: 'row', marginBottom: 16, backgroundColor: '#1E1E1E', borderRadius: 12, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: BRAND_RED },
  tabText: { color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontSize: 13 },
  tabTextActive: { color: '#FFF', fontWeight: '900' },
  listContainer: { gap: 10, paddingBottom: 8 },
  trackCard: { width: '100%', paddingVertical: 16, paddingHorizontal: 18, borderRadius: 10 },
  trackCardActive: { backgroundColor: BRAND_RED },
  trackCardInactive: { backgroundColor: '#1E1E1E' },
  trackName: { fontSize: 15 },
  trackNameActive: { color: '#FFF', fontWeight: '800' },
  trackNameInactive: { color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  addCustomBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', gap: 8, marginTop: 4 },
  addCustomText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  stylesContainer: { gap: 12, paddingBottom: 16 },
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
