import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, DeviceEventEmitter } from 'react-native';
import Svg, { Path, Circle, Polyline, Line } from 'react-native-svg';

// --- SIGNATURE PALETTE ---
const BRAND_RED = '#E50914';
const NAV_BG = '#0A0A0A';
const INACTIVE_COLOR = '#888888';
const BORDER_COLOR = '#222222';

// --- Premium Navigation Icons ---
const IconHome = ({ color }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <Polyline points="9 22 9 12 15 12 15 22" />
  </Svg>
);

const IconSearch = ({ color }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="11" cy="11" r="8" />
    <Line x1="21" y1="21" x2="16.65" y2="16.65" />
  </Svg>
);

const IconDownload = ({ color }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <Polyline points="7 10 12 15 17 10" />
    <Line x1="12" y1="15" x2="12" y2="3" />
  </Svg>
);

const IconSettings = ({ color }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="3" />
    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Svg>
);

export default function BottomNav({ activeTab, setActiveTab }) {
  const [isVisible, setIsVisible] = useState(true);

  // Listen for signals to hide/show the bottom nav
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('TOGGLE_BOTTOM_NAV', (visible) => {
      setIsVisible(visible);
    });
    return () => subscription.remove();
  }, []);

  if (!isVisible) return null; // Fully hides the nav bar when a popup/player is active

  const tabs = [
    { name: 'Home', Icon: IconHome },
    { name: 'Search', Icon: IconSearch },
    { name: 'Downloads', Icon: IconDownload },
    { name: 'Settings', Icon: IconSettings }
  ];

  return (
    <View style={styles.bottomNav}>
      {tabs.map((tab, idx) => {
        const isActive = activeTab === tab.name;
        const color = isActive ? BRAND_RED : INACTIVE_COLOR;
        return (
          <TouchableOpacity 
            key={idx} 
            style={styles.navItem} 
            onPress={() => setActiveTab(tab.name)}
            activeOpacity={0.8}
          >
            <tab.Icon color={color} />
            <Text style={[styles.navText, isActive && styles.navTextActive]}>
              {tab.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: { 
    flexDirection: 'row', 
    justifyContent: 'space-around', 
    alignItems: 'center', 
    backgroundColor: NAV_BG, 
    borderTopWidth: 1, 
    borderTopColor: BORDER_COLOR, 
    minHeight: 65, 
    paddingTop: 10,
    paddingBottom: Platform.OS === 'android' ? 12 : 24, 
  },
  navItem: { 
    alignItems: 'center', 
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 4,
  },
  navText: { 
    color: INACTIVE_COLOR, 
    fontSize: 10, 
    marginTop: 6, 
    fontWeight: '600' 
  },
  navTextActive: { 
    color: BRAND_RED, 
    fontWeight: '800' 
  }
});
