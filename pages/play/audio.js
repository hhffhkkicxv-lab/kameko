import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  ScrollView, ActivityIndicator, Alert, useWindowDimensions 
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as DocumentPicker from 'expo-document-picker';
import firestore from '@react-native-firebase/firestore';

const BRAND_RED = '#E50914';
const VERCEL_API_BASE = 'https://anikoto-api-lyart.vercel.app';

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

export default function AudioSheet({ 
  activeMenu, 
  setActiveMenu, 
  animeId, 
  episodeNum, 
  slug,
  currentTargetType = 'sub', 
  onSelectAudioType,
  roomCode = null,
  memberKey = 'guest',
  memberName = 'User',
  remoteAudioState = null,
}) {
  // Live window dimensions matching SubtitleSheet so landscape & portrait never overflow
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const effectiveScreenHeight = Math.max(240, windowHeight);
  const sheetMaxHeight = Math.floor(effectiveScreenHeight * 0.86);
  const scrollAreaMaxHeight = Math.max(140, sheetMaxHeight - 78);
  const sheetMaxWidth = Math.min(560, Math.floor(windowWidth * 0.92));

  const [availableTypes, setAvailableTypes] = useState(['sub', 'dub']);
  const [customAudioTracks, setCustomAudioTracks] = useState([]);
  const [loading, setLoading] = useState(false);

  const lastRoomSyncTimestampRef = useRef(0);
  const isApplyingRemoteAudioRef = useRef(false);

  // 1. Fetch Available Audio Formats (Sub / Dub / Raw) from Server API
  useEffect(() => {
    let isMounted = true;
    if (!animeId || (!episodeNum && !slug)) return;

    const fetchAudioFormats = async () => {
      try {
        setLoading(true);
        const epParam = slug || episodeNum;
        const res = await fetch(
          `${VERCEL_API_BASE}/api/servers?id=${encodeURIComponent(animeId)}&ep=${encodeURIComponent(epParam)}`
        );
        const json = await res.json();
        
        if (json?.success && Array.isArray(json?.data) && json.data.length > 0) {
          const typesFromApi = [
            ...new Set(
              json.data
                .map((s) => s.type?.toLowerCase())
                .filter((t) => t === 'sub' || t === 'dub' || t === 'raw')
            )
          ];
          
          if (isMounted) {
            setAvailableTypes(
              typesFromApi.length > 0 ? typesFromApi : ['sub', 'dub']
            );
          }
        } else if (isMounted) {
          setAvailableTypes(['sub', 'dub']);
        }
      } catch (_) {
        if (isMounted) {
          setAvailableTypes(['sub', 'dub']);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAudioFormats();
    return () => { isMounted = false; };
  }, [animeId, episodeNum, slug]);

  // 2. Broadcast Audio Selection to Watch Room in Firestore
  const broadcastAudioToRoom = useCallback(
    async (selectedType) => {
      if (!roomCode || isApplyingRemoteAudioRef.current) return;
      const now = Date.now();
      lastRoomSyncTimestampRef.current = now;

      try {
        await firestore()
          .collection('rooms')
          .doc(String(roomCode))
          .update({
            audioState: {
              type: String(selectedType).toLowerCase(),
              episodeNum: Number(episodeNum || 1),
              updatedBy: String(memberKey),
              updatedByName: String(memberName),
              updatedAt: now,
            },
          });
      } catch (_) {}
    },
    [roomCode, episodeNum, memberKey, memberName]
  );

  // 3. Listen for Incoming Room Audio Changes from Other Members
  useEffect(() => {
    if (!roomCode || !remoteAudioState?.type) return;

    // Ignore our own broadcast echo
    if (
      remoteAudioState.updatedBy === memberKey &&
      Math.abs((remoteAudioState.updatedAt || 0) - lastRoomSyncTimestampRef.current) < 1800
    ) {
      return;
    }

    const incomingType = String(remoteAudioState.type).toLowerCase();
    if (incomingType !== String(currentTargetType || 'sub').toLowerCase()) {
      isApplyingRemoteAudioRef.current = true;
      if (onSelectAudioType) {
        onSelectAudioType(incomingType);
      }
      setTimeout(() => {
        isApplyingRemoteAudioRef.current = false;
      }, 300);
    }
  }, [
    roomCode,
    remoteAudioState?.type,
    remoteAudioState?.updatedAt,
    remoteAudioState?.updatedBy,
    currentTargetType,
    memberKey,
    onSelectAudioType,
  ]);

  const handleSelectType = (type) => {
    const cleanType = String(type).toLowerCase();
    if (onSelectAudioType) {
      onSelectAudioType(cleanType);
    }
    if (roomCode) {
      broadcastAudioToRoom(cleanType);
    }
    setActiveMenu(null);
  };

  const handlePickCustomAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', '*/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const customLabel = file.name || 'Custom Local Audio';
        setCustomAudioTracks((prev) => [...prev, { label: customLabel, uri: file.uri }]);
        setActiveMenu(null);
      }
    } catch (_) {
      Alert.alert('File Error', 'Could not load custom audio file.');
    }
  };

  if (activeMenu !== 'audio') return null;

  const getAudioLabel = (type) => {
    switch (String(type).toLowerCase()) {
      case 'sub':
        return 'Japanese (Original Sub)';
      case 'dub':
        return 'English (Dubbed)';
      case 'raw':
        return 'Raw Japanese Audio';
      default:
        return String(type).toUpperCase();
    }
  };

  return (
    <View style={styles.absoluteWrapper} pointerEvents="box-none">
      <TouchableOpacity 
        style={styles.backdrop} 
        activeOpacity={1} 
        onPress={() => setActiveMenu(null)} 
      />

      {/* Exact Same Centered Popup Surface as SubtitleSheet */}
      <View 
        style={[
          styles.sheetSurface, 
          { 
            maxHeight: sheetMaxHeight, 
            width: sheetMaxWidth 
          }
        ]}
      >
        {/* Fixed Header Row Matching SubtitleSheet */}
        <View style={styles.headerRow}>
          <View style={styles.tabHeader}>
            <View style={[styles.tabBtn, styles.tabBtnActive]}>
              <Text style={[styles.tabText, styles.tabTextActive]}>
                {roomCode
                  ? `Room Audio Tracks (${availableTypes.length + customAudioTracks.length})`
                  : `Audio Tracks (${availableTypes.length + customAudioTracks.length})`}
              </Text>
            </View>
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

        {/* Scrollable Track List Matching SubtitleSheet */}
        <ScrollView 
          style={[styles.scrollArea, { maxHeight: scrollAreaMaxHeight }]}
          contentContainerStyle={styles.scrollContentContainer}
          showsVerticalScrollIndicator={true}
          persistentScrollbar={true}
          nestedScrollEnabled={true}
          bounces={true}
          overScrollMode="contain"
        >
          <View style={styles.listContainer}>
            {roomCode && (
              <Text style={styles.roomSyncHint}>
                Switching between Sub and Dub syncs audio automatically for everyone in the room.
              </Text>
            )}

            {loading && (
              <ActivityIndicator size="small" color={BRAND_RED} style={{ marginVertical: 8 }} />
            )}

            {availableTypes.map((type) => {
              const isSelected =
                String(currentTargetType || 'sub').toLowerCase() === String(type).toLowerCase();

              return (
                <TouchableOpacity 
                  key={type}
                  style={[
                    styles.trackCard,
                    isSelected ? styles.trackCardActive : styles.trackCardInactive
                  ]}
                  activeOpacity={0.8}
                  onPress={() => handleSelectType(type)}
                >
                  <View style={styles.trackItemRow}>
                    <Text
                      style={[
                        styles.trackName,
                        isSelected ? styles.trackNameActive : styles.trackNameInactive,
                      ]}
                      numberOfLines={1}
                    >
                      {getAudioLabel(type)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {customAudioTracks.map((custom, idx) => (
              <TouchableOpacity
                key={`custom-audio-${idx}`}
                style={[styles.trackCard, styles.trackCardInactive]}
                activeOpacity={0.8}
                onPress={() => setActiveMenu(null)}
              >
                <Text style={[styles.trackName, styles.trackNameInactive]} numberOfLines={1}>
                  {custom.label}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.addCustomBtn}
              activeOpacity={0.7}
              onPress={handlePickCustomAudio}
            >
              <IconPlus size={16} color="#FFF" />
              <Text style={styles.addCustomText}>Add Custom Audio (.mp3 / .aac / .m4a)</Text>
            </TouchableOpacity>
          </View>
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
  roomSyncHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
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
});
