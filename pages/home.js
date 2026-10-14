import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image, StatusBar } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle } from 'react-native-svg';

import Carousel from './home/carousel';
import ContinueWatching from './home/continue_watching'; 
import RecentSlider from './home/recent_slider';
import TrendingSlider from './home/trending_slider';
import Play from '../pages/play';
import ProfileSettings from './profile'; 
import Search from '../components/search'; 
import Downloads from '../pages/downloads'; 
import BottomNav from './home/bottomnav'; 

const AVATARS = {
  'pfp1.jpg': require('../assets/pfp1.jpg'),
  'pfp2.jpg': require('../assets/pfp2.jpg'),
  'pfp3.jpg': require('../assets/pfp3.jpg'),
  'pfp4.jpg': require('../assets/pfp4.jpg'),
  'pfp5.jpg': require('../assets/pfp5.jpg'),
  'pfp6.jpg': require('../assets/pfp6.jpg'),
};

const IconSearch = ({ size = 26, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="11" cy="11" r="8" />
    <Path d="M21 21l-4.35-4.35" />
  </Svg>
);

export default function Home({ user, activeProfile, onSwitchProfile, navigation }) {
  const [activeTab, setActiveTab] = useState('Home');
  const [selectedAnime, setSelectedAnime] = useState(null);

  // Hidden overlay detection includes the Downloads tab
  const isOverlayActive = selectedAnime !== null || activeTab === 'Search' || activeTab === 'Settings' || activeTab === 'Downloads';

  return (
    <View style={styles.masterContainer}>
      {/* 1. Hides the top notification bar globally for this screen */}
      <StatusBar hidden={true} translucent={true} backgroundColor="transparent" />

      {/* HOME SCREEN LAYER */}
      <View style={[styles.container, isOverlayActive && { display: 'none' }]}>
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          style={styles.scroll}
          overScrollMode="never" 
          bounces={false}
        >
          {/* Main Hero Slider */}
          <Carousel user={user} onSelectAnime={(anime) => setSelectedAnime(anime)} />
          
          {/* The New Premium Continue Watching Row */}
          <View style={styles.contentPadding}>
            <ContinueWatching user={user} onSelectAnime={(anime) => setSelectedAnime(anime)} />
          </View>
          
          <RecentSlider user={user} onSelectAnime={(anime) => setSelectedAnime(anime)} />
          <TrendingSlider user={user} onSelectAnime={(anime) => setSelectedAnime(anime)} />

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* 2. FLOATING HEADER WITH ENHANCED GRADIENT */}
        <View style={styles.floatingHeader} pointerEvents="box-none">
          <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <Defs>
              <LinearGradient id="headerGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#000000" stopOpacity="0.8" />
                <Stop offset="0.6" stopColor="#000000" stopOpacity="0.4" />
                <Stop offset="1" stopColor="#000000" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#headerGrad)" />
          </Svg>

          <View style={styles.headerContent}>
            <Image 
              source={require('../assets/kameko_header.png')} 
              style={styles.headerLogoImage}
              resizeMode="contain"
            />

            <View style={styles.headerActions}>
              <TouchableOpacity onPress={() => setActiveTab('Search')} activeOpacity={0.7} style={styles.searchBtn}>
                <IconSearch />
              </TouchableOpacity>

              <TouchableOpacity onPress={onSwitchProfile} style={styles.profileSwitcher} activeOpacity={0.8}>
                <Image 
                  source={AVATARS[activeProfile?.avatar || 'pfp1.jpg']} 
                  style={styles.headerAvatar} 
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Render Modular BottomNav */}
        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
      </View>

      {/* --- OVERLAY SCREENS --- */}

      {selectedAnime && (
        <Play 
          anime={selectedAnime} 
          user={user} 
          onBack={() => setSelectedAnime(null)} 
          navigation={navigation}
        />
      )}

      {activeTab === 'Search' && (
        <View style={styles.overlayScreen}>
          <Search 
            user={user} 
            onBack={() => setActiveTab('Home')} 
            onSelectAnime={(anime) => setSelectedAnime(anime)} 
          />
          <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
        </View>
      )}

      {/* Downloads Overlay Screen */}
      {activeTab === 'Downloads' && (
        <View style={styles.overlayScreen}>
          <Downloads 
            user={user} 
            navigation={navigation} 
            onBack={() => setActiveTab('Home')} 
          />
          <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
        </View>
      )}

      {activeTab === 'Settings' && (
        <View style={styles.overlayScreen}>
          <ProfileSettings user={user} setLoggedInUser={() => {}} onHardwareBack={() => setActiveTab('Home')} /> 
          <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  masterContainer: { flex: 1, backgroundColor: '#000000' },
  container: { flex: 1, backgroundColor: '#000000' },
  overlayScreen: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000', zIndex: 50 },

  // Header Styling Updates (Moved up to sit exactly beneath the notch with a smoother fade)
  floatingHeader: { 
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 110, 
    zIndex: 100,
  },
  headerContent: {
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingTop: 32, // Moved slightly up
  },
  headerLogoImage: { 
    width: 175, 
    height: 48, 
    tintColor: '#E50914'
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16
  },
  searchBtn: {
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  profileSwitcher: { 
    borderWidth: 1.5, 
    borderColor: 'rgba(255,255,255,0.3)', 
    borderRadius: 6, 
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.5)',
    elevation: 5
  },
  headerAvatar: { width: 38, height: 38, borderRadius: 5 },

  scroll: { flex: 1 },
  contentPadding: { paddingTop: 10 },
});
