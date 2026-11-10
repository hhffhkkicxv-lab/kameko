import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image, StatusBar } from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
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

export default function Home({
  user: propUser,
  activeProfile: propActiveProfile,
  currentProfile: propCurrentProfile,
  onSwitchProfile,
  navigation,
  route,
}) {
  const [activeTab, setActiveTab] = useState('Home');
  const [selectedAnime, setSelectedAnime] = useState(null);

  // Resolve User and Active Profile from props or navigation route params
  const resolvedUser = propUser || route?.params?.user || auth().currentUser || null;
  const incomingProfile =
    propActiveProfile ||
    propCurrentProfile ||
    route?.params?.activeProfile ||
    route?.params?.currentProfile ||
    null;

  const [currentProfile, setCurrentProfile] = useState(incomingProfile);

  // Keep local profile state synced whenever parent or route updates activeProfile
  useEffect(() => {
    if (incomingProfile?.id) {
      setCurrentProfile(incomingProfile);
    }
  }, [incomingProfile?.id, incomingProfile?.name, incomingProfile?.avatar]);

  // Fallback: If Home mounts without an activeProfile prop, load the active profile from Firestore
  useEffect(() => {
    if (currentProfile?.id || !resolvedUser?.uid) return;
    let isMounted = true;

    const loadFallbackProfile = async () => {
      try {
        const userDoc = await firestore().collection('users').doc(String(resolvedUser.uid)).get();
        if (userDoc.exists) {
          const uData = userDoc.data();
          if (uData?.activeProfile?.id && isMounted) {
            setCurrentProfile(uData.activeProfile);
            return;
          }
          if (uData?.activeProfileId) {
            const profDoc = await firestore()
              .collection('users')
              .doc(String(resolvedUser.uid))
              .collection('profiles')
              .doc(String(uData.activeProfileId))
              .get();
            if (profDoc.exists && isMounted) {
              setCurrentProfile({ id: profDoc.id, ...profDoc.data() });
              return;
            }
          }
        }

        const snap = await firestore()
          .collection('users')
          .doc(String(resolvedUser.uid))
          .collection('profiles')
          .limit(1)
          .get();

        if (!snap.empty && isMounted) {
          const firstDoc = snap.docs[0];
          setCurrentProfile({ id: firstDoc.id, ...firstDoc.data() });
        }
      } catch (err) {
        console.warn('Home profile fallback error:', err);
      }
    };

    loadFallbackProfile();
    return () => { isMounted = false; };
  }, [resolvedUser?.uid, currentProfile?.id]);

  const activeProfileId = currentProfile?.id ? String(currentProfile.id) : null;

  // Attach user & profile context to any selected anime object before opening Play.js
  const handleSelectAnime = (anime) => {
    if (!anime) {
      setSelectedAnime(null);
      return;
    }
    setSelectedAnime({
      ...anime,
      userUid: resolvedUser?.uid || null,
      activeProfileId: activeProfileId,
      activeProfile: currentProfile,
      currentProfile: currentProfile,
    });
  };

  // Hidden overlay detection includes the Downloads tab
  const isOverlayActive =
    selectedAnime !== null ||
    activeTab === 'Search' ||
    activeTab === 'Settings' ||
    activeTab === 'Downloads';

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
          <Carousel 
            user={resolvedUser} 
            activeProfile={currentProfile}
            currentProfile={currentProfile}
            activeProfileId={activeProfileId}
            onSelectAnime={handleSelectAnime} 
          />
          
          {/* Continue Watching Row (now receives activeProfile!) */}
          <View style={styles.contentPadding}>
            <ContinueWatching 
              user={resolvedUser} 
              activeProfile={currentProfile}
              currentProfile={currentProfile}
              activeProfileId={activeProfileId}
              onSelectAnime={handleSelectAnime} 
            />
          </View>
          
          <RecentSlider 
            user={resolvedUser} 
            activeProfile={currentProfile}
            currentProfile={currentProfile}
            activeProfileId={activeProfileId}
            onSelectAnime={handleSelectAnime} 
          />
          <TrendingSlider 
            user={resolvedUser} 
            activeProfile={currentProfile}
            currentProfile={currentProfile}
            activeProfileId={activeProfileId}
            onSelectAnime={handleSelectAnime} 
          />

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
                  source={AVATARS[currentProfile?.avatar] || AVATARS['pfp1.jpg']} 
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
          user={resolvedUser} 
          activeProfile={currentProfile}
          currentProfile={currentProfile}
          activeProfileId={activeProfileId}
          onBack={() => setSelectedAnime(null)} 
          navigation={navigation}
        />
      )}

      {activeTab === 'Search' && (
        <View style={styles.overlayScreen}>
          <Search 
            user={resolvedUser} 
            activeProfile={currentProfile}
            currentProfile={currentProfile}
            activeProfileId={activeProfileId}
            onBack={() => setActiveTab('Home')} 
            onSelectAnime={(anime) => {
              setActiveTab('Home');
              handleSelectAnime(anime);
            }} 
          />
          <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
        </View>
      )}

      {/* Downloads Overlay Screen */}
      {activeTab === 'Downloads' && (
        <View style={styles.overlayScreen}>
          <Downloads 
            user={resolvedUser} 
            activeProfile={currentProfile}
            currentProfile={currentProfile}
            activeProfileId={activeProfileId}
            navigation={navigation} 
            onBack={() => setActiveTab('Home')} 
          />
          <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
        </View>
      )}

      {activeTab === 'Settings' && (
        <View style={styles.overlayScreen}>
          <ProfileSettings 
            user={resolvedUser} 
            activeProfile={currentProfile}
            currentProfile={currentProfile}
            activeProfileId={activeProfileId}
            onSwitchProfile={onSwitchProfile}
            setLoggedInUser={() => {}} 
            onHardwareBack={() => setActiveTab('Home')} 
          /> 
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
    paddingTop: 32,
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
