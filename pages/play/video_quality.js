import React from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  ScrollView, useWindowDimensions 
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

const BRAND_RED = '#E50914';

const IconClose = ({ size = 18, color = "rgba(255,255,255,0.75)" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

export default function VideoQualitySheet({ 
  activeMenu, 
  setActiveMenu, 
  qualityList, 
  selectedQuality, 
  setSelectedQuality, 
  setActiveUrl, 
  currentAutoRes 
}) {
  // Live window dimensions matching SubtitleSheet and AudioSheet so landscape & portrait never overflow
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const effectiveScreenHeight = Math.max(240, windowHeight);
  const sheetMaxHeight = Math.floor(effectiveScreenHeight * 0.86);
  const scrollAreaMaxHeight = Math.max(140, sheetMaxHeight - 78);
  const sheetMaxWidth = Math.min(560, Math.floor(windowWidth * 0.92));

  if (activeMenu !== 'quality') return null;

  return (
    <View style={styles.absoluteWrapper} pointerEvents="box-none">
      {/* Outside Backdrop */}
      <TouchableOpacity 
        style={styles.backdrop} 
        activeOpacity={1} 
        onPress={() => setActiveMenu(null)} 
      />

      {/* Centered Popup Surface Matching SubtitleSheet & AudioSheet */}
      <View 
        style={[
          styles.sheetSurface, 
          { 
            maxHeight: sheetMaxHeight, 
            width: sheetMaxWidth 
          }
        ]}
      >
        {/* Fixed Header Row Matching SubtitleSheet & AudioSheet */}
        <View style={styles.headerRow}>
          <View style={styles.tabHeader}>
            <View style={[styles.tabBtn, styles.tabBtnActive]}>
              <Text style={[styles.tabText, styles.tabTextActive]}>
                Video Quality
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

        {/* Scrollable Quality List Matching SubtitleSheet & AudioSheet */}
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
            <TouchableOpacity 
              style={[
                styles.trackCard, 
                selectedQuality === 'Auto' ? styles.trackCardActive : styles.trackCardInactive
              ]} 
              activeOpacity={0.8}
              onPress={() => { 
                setSelectedQuality('Auto'); 
                setActiveMenu(null); 
              }}
            >
              <View style={styles.trackItemRow}>
                <Text 
                  style={[
                    styles.trackName, 
                    selectedQuality === 'Auto' ? styles.trackNameActive : styles.trackNameInactive
                  ]}
                  numberOfLines={1}
                >
                  Auto ({currentAutoRes})
                </Text>
              </View>
            </TouchableOpacity>

            {qualityList.filter(q => q.label !== 'Auto').map((q, i) => {
              const isSelected = selectedQuality === q.label;
              return (
                <TouchableOpacity 
                  key={i} 
                  style={[
                    styles.trackCard, 
                    isSelected ? styles.trackCardActive : styles.trackCardInactive
                  ]} 
                  activeOpacity={0.8}
                  onPress={() => { 
                    setSelectedQuality(q.label); 
                    setActiveUrl(q.uri);
                    setActiveMenu(null); 
                  }}
                >
                  <View style={styles.trackItemRow}>
                    <Text 
                      style={[
                        styles.trackName, 
                        isSelected ? styles.trackNameActive : styles.trackNameInactive
                      ]}
                      numberOfLines={1}
                    >
                      {q.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
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
});
