import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

const BRAND_RED = '#E50914';
const PURE_RED = '#FF0000';
const BLACK = '#000000';
const WHITE = '#FFFFFF';
const BORDER_GREY = '#26262C';
const TEXT_GREY = '#8E8E93';

// --- TAB ICONS ---
const IconHome = ({ active }) => (
  <Svg
    width={22}
    height={22}
    viewBox="0 0 24 24"
    fill={active ? PURE_RED : 'none'}
    stroke={active ? PURE_RED : TEXT_GREY}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z" />
  </Svg>
);

const IconLibrary = ({ active }) => (
  <Svg
    width={22}
    height={22}
    viewBox="0 0 24 24"
    fill={active ? PURE_RED : 'none'}
    stroke={active ? PURE_RED : TEXT_GREY}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </Svg>
);

const IconDownloads = ({ active }) => (
  <Svg
    width={22}
    height={22}
    viewBox="0 0 24 24"
    fill="none"
    stroke={active ? PURE_RED : TEXT_GREY}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <Path d="M7 10l5 5 5-5" />
    <Path d="M12 15V3" />
  </Svg>
);

const IconSettings = ({ active }) => (
  <Svg
    width={22}
    height={22}
    viewBox="0 0 24 24"
    fill="none"
    stroke={active ? PURE_RED : TEXT_GREY}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <Circle cx="12" cy="7" r="4" />
  </Svg>
);

const TABS = [
  { key: 'Home', label: 'Home', Icon: IconHome },
  { key: 'Library', label: 'Library', Icon: IconLibrary },
  { key: 'Downloads', label: 'Downloads', Icon: IconDownloads },
  { key: 'Settings', label: 'Profile', Icon: IconSettings },
];

export default function BottomNav({ activeTab = 'Home', setActiveTab }) {
  return (
    <View style={styles.navContainer}>
      {TABS.map(({ key, label, Icon }) => {
        const isActive = activeTab === key;
        return (
          <TouchableOpacity
            key={key}
            style={styles.tabItem}
            activeOpacity={0.75}
            onPress={() => setActiveTab && setActiveTab(key)}
          >
            <Icon active={isActive} />
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {label}
            </Text>
            {isActive && <View style={styles.activeDot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  navContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(0, 0, 0, 0.96)',
    borderTopWidth: 1,
    borderTopColor: BORDER_GREY,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    paddingHorizontal: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    color: TEXT_GREY,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    color: WHITE,
    fontWeight: '900',
  },
  activeDot: {
    width: 16,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: BRAND_RED,
    marginTop: 4,
  },
});
