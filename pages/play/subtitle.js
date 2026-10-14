import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  ScrollView, ActivityIndicator, Alert, useWindowDimensions 
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as FileSystem from 'expo-file-system';

let DocumentPicker = null;
try {
  DocumentPicker = require('expo-document-picker');
} catch (_) {}

let AsyncStorage = null;
try {
  const mod = require('@react-native-async-storage/async-storage');
  AsyncStorage = mod?.default || mod;
} catch (_) {}

const BRAND_RED = '#E50914';
const VERCEL_API_BASE = 'https://anikoto-api-lyart.vercel.app';
const PROXY_URL = 'https://icy-wave-30d8.prashant-yash69.workers.dev/proxy?url=';

const SUB_SETTINGS_STORAGE_KEY = '@kameko_subtitle_settings_v1';
const SUB_SETTINGS_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}kameko_subtitle_settings.json`
  : null;

const DEFAULT_SUB_SETTINGS = {
  color: '#FFFFFF',
  size: 16,
  height: 40,
  fontFamily: 'normal',
  backgroundColor: 'transparent',
};

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

const IconClose = ({ size = 18, color = "rgba(255,255,255,0.75)" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

// --- LOCAL STORAGE HELPERS (FileSystem + AsyncStorage + Web localStorage) ---
const loadSavedSubSettings = async () => {
  try {
    if (AsyncStorage?.getItem) {
      const raw = await AsyncStorage.getItem(SUB_SETTINGS_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch (_) {}

  try {
    if (SUB_SETTINGS_FILE_URI) {
      const info = await FileSystem.getInfoAsync(SUB_SETTINGS_FILE_URI);
      if (info.exists) {
        const raw = await FileSystem.readAsStringAsync(SUB_SETTINGS_FILE_URI);
        if (raw) return JSON.parse(raw);
      }
    }
  } catch (_) {}

  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      const raw = globalThis.localStorage.getItem(SUB_SETTINGS_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch (_) {}

  return null;
};

const persistSubSettings = async (settingsObj) => {
  const serialized = JSON.stringify(settingsObj);

  try {
    if (AsyncStorage?.setItem) {
      await AsyncStorage.setItem(SUB_SETTINGS_STORAGE_KEY, serialized);
    }
  } catch (_) {}

  try {
    if (SUB_SETTINGS_FILE_URI) {
      await FileSystem.writeAsStringAsync(SUB_SETTINGS_FILE_URI, serialized);
    }
  } catch (_) {}

  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      globalThis.localStorage.setItem(SUB_SETTINGS_STORAGE_KEY, serialized);
    }
  } catch (_) {}
};

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
      const proxyUri = `${PROXY_URL}${encodeURIComponent(uri)}&referer=${encodeURIComponent(referer)}`;
      const response = await fetch(proxyUri);

      if (!response.ok) throw new Error('Proxy fetch failed');
      text = await response.text();
    }

    if (
      text.trim().toLowerCase().startsWith('<!doctype html>') ||
      text.trim().toLowerCase().startsWith('<html')
    ) {
      throw new Error('Received HTML blocked page instead of VTT.');
    }

    const cues = [];
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    let currentCue = null;

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
  // Live window dimensions so landscape rotation never overflows the screen
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Constrain popup height to fit comfortably inside the current screen
  const effectiveScreenHeight = Math.max(240, windowHeight);
  const sheetMaxHeight = Math.floor(effectiveScreenHeight * 0.86);
  const scrollAreaMaxHeight = Math.max(140, sheetMaxHeight - 78);
  const sheetMaxWidth = Math.min(560, Math.floor(windowWidth * 0.92));

  const [availableTracks, setAvailableTracks] = useState([]);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(-1);
  const [isFetchingList, setIsFetchingList] = useState(false);
  const [parsingIndex, setParsingIndex] = useState(null); 
  const [activeTab, setActiveTab] = useState('tracks');

  const customFileUrisRef = useRef([]);
  const requestIdRef = useRef(0);
  const refererRef = useRef('https://vidwish.live/');

  // 0. LOAD SAVED SUBTITLE SETTINGS FROM LOCAL STORAGE ON MOUNT
  useEffect(() => {
    let isMounted = true;
    const restoreSettings = async () => {
      const saved = await loadSavedSubSettings();
      if (saved && isMounted && typeof setSubSettings === 'function') {
        setSubSettings(prev => ({
          ...DEFAULT_SUB_SETTINGS,
          ...(prev || {}),
          ...saved,
        }));
      }
    };
    restoreSettings();
    return () => { isMounted = false; };
  }, [setSubSettings]);

  // Helper to update state AND immediately persist to local storage
  const updateAndSaveSubSettings = useCallback((patch) => {
    setSubSettings(prev => {
      const current = { ...DEFAULT_SUB_SETTINGS, ...(prev || {}) };
      const nextPatch = typeof patch === 'function' ? patch(current) : patch;
      const updated = { ...current, ...nextPatch };
      persistSubSettings(updated);
      return updated;
    });
  }, [setSubSettings]);

  // 1. BACKGROUND FETCH & AUTO-LOAD
  useEffect(() => {
    if (!animeId || !episodeNum) return;
    const currentRequestId = ++requestIdRef.current;

    const fetchSubtitles = async () => {
      try {
        setIsFetchingList(true);
        const servers = ['hd-1', 'hd-2'];
        let subTracks = [];
        let resolvedReferer = 'https://vidwish.live/';

        for (const srv of servers) {
          try {
            const url = `${VERCEL_API_BASE}/api/stream?id=${encodeURIComponent(animeId)}&ep=${encodeURIComponent(episodeNum)}&server=${srv}&type=sub`;
            const res = await fetch(url);
            const json = await res.json();
            const payload = json?.data || json?.results;

            if (payload?.referer) resolvedReferer = payload.referer;
            if (Array.isArray(payload?.subtitles) && payload.subtitles.length > 0) {
              subTracks = payload.subtitles;
              break;
            }
          } catch (_) {}
        }

        if (currentRequestId !== requestIdRef.current) return;

        refererRef.current = resolvedReferer;

        if (subTracks.length > 0) {
          setAvailableTracks(subTracks);

          const defaultIdx = subTracks.findIndex(s => s.default) !== -1 
            ? subTracks.findIndex(s => s.default) 
            : 0;

          handleTrackSelect(subTracks[defaultIdx], defaultIdx, currentRequestId);
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
    } else if (!parentRequestId) {
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

  const currentFontFamily = subSettings?.fontFamily || DEFAULT_SUB_SETTINGS.fontFamily;
  const currentColor = subSettings?.color || DEFAULT_SUB_SETTINGS.color;
  const currentSize = subSettings?.size || DEFAULT_SUB_SETTINGS.size;
  const currentHeight = subSettings?.height || DEFAULT_SUB_SETTINGS.height;
  const currentBg = subSettings?.backgroundColor || DEFAULT_SUB_SETTINGS.backgroundColor;

  return (
    <View style={styles.absoluteWrapper} pointerEvents="box-none">
      <TouchableOpacity 
        style={styles.backdrop} 
        activeOpacity={1} 
        onPress={() => setActiveMenu(null)} 
      />

      <View 
        style={[
          styles.sheetSurface, 
          { 
            maxHeight: sheetMaxHeight, 
            width: sheetMaxWidth 
          }
        ]}
      >
        {/* Fixed Header Row (Never Scrolls Off-Screen) */}
        <View style={styles.headerRow}>
          <View style={styles.tabHeader}>
            <TouchableOpacity 
              onPress={() => setActiveTab('tracks')} 
              style={[styles.tabBtn, activeTab === 'tracks' && styles.tabBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === 'tracks' && styles.tabTextActive]}>
                Tracks ({availableTracks.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => setActiveTab('styles')} 
              style={[styles.tabBtn, activeTab === 'styles' && styles.tabBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === 'styles' && styles.tabTextActive]}>
                Appearance
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={styles.closeBtn} 
            onPress={() => setActiveMenu(null)} 
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <IconClose />
          </TouchableOpacity>
        </View>

        {/* Explicitly Bounded Scrollable Content Area */}
        <ScrollView 
          style={[styles.scrollArea, { maxHeight: scrollAreaMaxHeight }]}
          contentContainerStyle={styles.scrollContentContainer}
          showsVerticalScrollIndicator={true}
          persistentScrollbar={true}
          nestedScrollEnabled={true}
          bounces={true}
          overScrollMode="contain"
          keyboardShouldPersistTaps="handled"
        >
          {activeTab === 'tracks' && (
            <View style={styles.listContainer}>
              {isFetchingList && (
                <ActivityIndicator size="small" color={BRAND_RED} style={{ marginVertical: 8 }} />
              )}

              <TouchableOpacity 
                style={[
                  styles.trackCard, 
                  (!subtitlesEnabled || selectedTrackIndex === -1) ? styles.trackCardActive : styles.trackCardInactive
                ]}
                activeOpacity={0.8}
                onPress={() => { handleTurnOff(); setActiveMenu(null); }}
              >
                <Text 
                  style={[
                    styles.trackName, 
                    (!subtitlesEnabled || selectedTrackIndex === -1) ? styles.trackNameActive : styles.trackNameInactive
                  ]}
                >
                  Off
                </Text>
              </TouchableOpacity>

              {availableTracks.map((track, idx) => {
                const isSelected = subtitlesEnabled && selectedTrackIndex === idx;
                const isDownloading = parsingIndex === idx;

                return (
                  <TouchableOpacity
                    key={`${track.label || 'track'}-${idx}`}
                    style={[styles.trackCard, isSelected ? styles.trackCardActive : styles.trackCardInactive]}
                    activeOpacity={0.8}
                    onPress={() => {
                      handleTrackSelect(track, idx);
                      if (!isDownloading) setActiveMenu(null);
                    }}
                    disabled={isDownloading}
                  >
                    <View style={styles.trackItemRow}>
                      <Text 
                        style={[styles.trackName, isSelected ? styles.trackNameActive : styles.trackNameInactive]}
                        numberOfLines={1}
                      >
                        {track.label || track.lang || `Track ${idx + 1}`}
                      </Text>
                      {isDownloading && <ActivityIndicator size="small" color="#FFF" />}
                    </View>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity style={styles.addCustomBtn} activeOpacity={0.7} onPress={handlePickCustomSubtitle}>
                <IconPlus size={16} color="#FFF" />
                <Text style={styles.addCustomText}>Add Custom Subtitle (.vtt / .srt)</Text>
              </TouchableOpacity>
            </View>
          )}

          {activeTab === 'styles' && (
            <View style={styles.stylesContainer}>
              {/* Live Subtitle Preview Box */}
              <View style={styles.previewBox}>
                <Text
                  style={[
                    styles.previewText,
                    {
                      color: currentColor,
                      fontSize: Math.min(currentSize, 22),
                      fontFamily: currentFontFamily,
                      backgroundColor: currentBg,
                    },
                  ]}
                  numberOfLines={1}
                >
                  Subtitle Preview Text
                </Text>
              </View>

              <Text style={styles.sectionTitle}>Font Family</Text>
              <View style={styles.fontGrid}>
                {FONT_OPTIONS.map((f, i) => {
                  const isSelected = currentFontFamily === f.value;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.fontCard, isSelected && styles.fontCardActive]}
                      activeOpacity={0.8}
                      onPress={() => updateAndSaveSubSettings({ fontFamily: f.value })}
                    >
                      <Text
                        style={[
                          styles.fontCardText,
                          { fontFamily: f.value },
                          isSelected && { color: '#FFF', fontWeight: '900' },
                        ]}
                        numberOfLines={1}
                      >
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionTitle}>Text Color</Text>
              <View style={styles.colorPalette}>
                {COLOR_OPTIONS.map((c, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.colorChip,
                      { backgroundColor: c },
                      currentColor === c && styles.colorChipActive,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => updateAndSaveSubSettings({ color: c })}
                  />
                ))}
              </View>

              <Text style={styles.sectionTitle}>Font Size ({currentSize}px)</Text>
              <View style={styles.pillRow}>
                {[12, 14, 16, 20, 24, 28].map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.pillBtn, currentSize === s && styles.pillBtnActive]}
                    activeOpacity={0.8}
                    onPress={() => updateAndSaveSubSettings({ size: s })}
                  >
                    <Text style={[styles.pillText, currentSize === s && styles.pillTextActive]}>
                      {s}px
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionTitle}>Bottom Offset ({currentHeight}px)</Text>
              <View style={styles.pillRow}>
                {[20, 35, 50, 75, 100].map((h) => (
                  <TouchableOpacity
                    key={h}
                    style={[styles.pillBtn, currentHeight === h && styles.pillBtnActive]}
                    activeOpacity={0.8}
                    onPress={() => updateAndSaveSubSettings({ height: h })}
                  >
                    <Text style={[styles.pillText, currentHeight === h && styles.pillTextActive]}>
                      {h}px
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionTitle}>Background Box</Text>
              <View style={styles.pillRow}>
                {[
                  { label: 'None', val: 'transparent' },
                  { label: 'Translucent', val: 'rgba(0,0,0,0.6)' },
                  { label: 'Solid Black', val: '#000000' },
                ].map((bg, i) => {
                  const isSelected = currentBg === bg.val;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.pillBtn, isSelected && styles.pillBtnActive]}
                      activeOpacity={0.8}
                      onPress={() => updateAndSaveSubSettings({ backgroundColor: bg.val })}
                    >
                      <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>
                        {bg.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Reset to Default Button */}
              <TouchableOpacity
                style={styles.resetBtn}
                activeOpacity={0.75}
                onPress={() => updateAndSaveSubSettings(DEFAULT_SUB_SETTINGS)}
              >
                <Text style={styles.resetBtnText}>Reset to Default Style</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  absoluteWrapper: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.68)',
  },
  sheetSurface: {
    backgroundColor: '#121212',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    elevation: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  tabHeader: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: BRAND_RED,
  },
  tabText: {
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '700',
    fontSize: 13,
  },
  tabTextActive: {
    color: '#FFF',
    fontWeight: '900',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  scrollArea: {
    width: '100%',
    flexGrow: 0,
  },
  scrollContentContainer: {
    paddingBottom: 18,
  },
  listContainer: {
    gap: 8,
  },
  trackCard: {
    width: '100%',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  trackCardActive: {
    backgroundColor: BRAND_RED,
  },
  trackCardInactive: {
    backgroundColor: '#1E1E1E',
  },
  trackItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trackName: {
    fontSize: 14,
    flex: 1,
    paddingRight: 8,
  },
  trackNameActive: {
    color: '#FFF',
    fontWeight: '800',
  },
  trackNameInactive: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
  },
  addCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    gap: 8,
    marginTop: 4,
  },
  addCustomText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  stylesContainer: {
    gap: 10,
  },
  previewBox: {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: {
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  fontGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  fontCard: {
    width: '48.5%',
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    alignItems: 'center',
  },
  fontCardActive: {
    backgroundColor: BRAND_RED,
  },
  fontCardText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
  },
  colorPalette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingVertical: 4,
  },
  colorChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  colorChipActive: {
    borderColor: '#FFF',
    transform: [{ scale: 1.15 }],
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pillBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1E1E1E',
  },
  pillBtnActive: {
    backgroundColor: BRAND_RED,
  },
  pillText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#FFF',
    fontWeight: '800',
  },
  resetBtn: {
    marginTop: 6,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  },
  resetBtnText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '700',
  },
});
