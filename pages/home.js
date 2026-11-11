import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image, StatusBar, Platform } from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle } from 'react-native-svg';
import * as NavigationBar from 'expo-navigation-bar';

// --- SLIDER IMPORTS ---
import Carousel from './home/carousel';
import ContinueWatching from './home/continue_watching'; 
import RecentSlider from './home/recent_slider';
import TrendingSlider from './home/trending_slider';
import Top10Slider from './home/top10_slider';      
import ForYouSlider from './home/foryou_slider';    
import MoviesSlider from './home/movies_slider';       
import GenresSlider from './home/genres_slider';       
import BingeSlider from './home/binge_slider';
import BecauseYouLikedSlider from './home/because_you_liked_slider';
import EditorsChoiceSlider from './home/editors_choice_slider';
import TopRomanceSlider from './home/top_romance_slider';
import DubsSlider from './home/dubs_slider';

// --- OVERLAY IMPORTS ---
import GenreGrid from './home/genre_grid';             
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
  const [activeGenre, setActiveGenre] = useState(null); 

  const resolvedUser = propUser || route?.params?.user || auth().currentUser || null;
  const incomingProfile = propActiveProfile || propCurrentProfile || route?.params?.activeProfile || route?.params?.currentProfile || null;
  const [currentProfile, setCurrentProfile] = useState(incomingProfile);

  useEffect(() => {
    if (incomingProfile?.id) setCurrentProfile(incomingProfile);
  }, [incomingProfile?.id, incomingProfile?.name, incomingProfile?.avatar]);

  useEffect(() => {
    if (currentProfile?.id || !resolvedUser?.uid) return;
    let isMounted = true;
    const loadFallbackProfile = async () => {
      try {
        const userDoc = await firestore().collection('users').doc(String(resolvedUser.uid)).get();
        if (userDoc.exists) {
          const uData = userDoc.data();
          if (uData?.activeProfile?.id && isMounted) { setCurrentProfile(uData.activeProfile); return; }
          if (uData?.activeProfileId) {
            const profDoc = await firestore().collection('users').doc(String(resolvedUser.uid)).collection('profiles').doc(String(uData.activeProfileId)).get();
            if (profDoc.exists && isMounted) { setCurrentProfile({ id: profDoc.id, ...profDoc.data() }); return; }
          }
        }
        const snap = await firestore().collection('users').doc(String(resolvedUser.uid)).collection('profiles').limit(1).get();
        if (!snap.empty && isMounted) {
          const firstDoc = snap.docs[0];
          setCurrentProfile({ id: firstDoc.id, ...firstDoc.data() });
        }
      } catch (err) {}
    };
    loadFallbackProfile();
    return () => { isMounted = false; };
  }, [resolvedUser?.uid, currentProfile?.id]);

  useEffect(() => {
    const manageImmersive = async () => {
      try {
        if (selectedAnime || activeGenre) {
          if (Platform.OS === 'android' && NavigationBar?.setVisibilityAsync) {
            await NavigationBar.setVisibilityAsync('hidden');
            await NavigationBar.setBehaviorAsync('overlay-swipe');
          }
        }
      } catch (_) {}
    };
    manageImmersive();
  }, [selectedAnime, activeGenre]);

  const activeProfileId = currentProfile?.id ? String(currentProfile.id) : null;

  const handleSelectAnime = (anime) => {
    if (!anime) { setSelectedAnime(null); return; }
    setSelectedAnime({ ...anime, userUid: resolvedUser?.uid || null, activeProfileId, activeProfile: currentProfile, currentProfile });
  };

  const isOverlayActive = selectedAnime !== null || activeGenre !== null || activeTab === 'Search' || activeTab === 'Settings' || activeTab === 'Downloads';

  return (
    <View style={styles.masterContainer}>
      <StatusBar hidden={true} translucent={true} backgroundColor="transparent" />

      {/* HOME SCREEN LAYER */}
      <View style={[styles.container, isOverlayActive && { display: 'none' }]}>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll} overScrollMode="never" bounces={false}>
          
          {/* 1. Carousel */}
          <Carousel user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />
          
          {/* 2. Continue Watching */}
          <View style={styles.contentPadding}>
            <ContinueWatching user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />
          </View>

          {/* 3. Recent */}
          <RecentSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />

          {/* 4. Trending */}
          <TrendingSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />

          {/* 5. Top 10 */}
          <Top10Slider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />

          {/* 6. For You */}
          <ForYouSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />

          {/* 7. Movies */}
          <MoviesSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />

          {/* 8. Genres (Special colorful slider) */}
          <GenresSlider onSelectGenre={(genre) => setActiveGenre(genre)} />
          
          {/* 9. Binge in One Night */}
          <BingeSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />
          
          {/* 10. Because You Liked... */}
          <BecauseYouLikedSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />
          
          {/* 11. Editor's Choice */}
          <EditorsChoiceSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />
          
          {/* 12. Romance */}
          <TopRomanceSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />

          {/* 13. Dubs (Included from previous request) */}
          <DubsSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />

          {/* Bottom spacer to clear absolute BottomNav */}
          <View style={{ height: 110 }} />
        </ScrollView>

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
            <Image source={require('../assets/kameko_header.png')} style={styles.headerLogoImage} resizeMode="contain" />
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={() => setActiveTab('Search')} activeOpacity={0.7} style={styles.searchBtn}><IconSearch /></TouchableOpacity>
              <TouchableOpacity onPress={onSwitchProfile} style={styles.profileSwitcher} activeOpacity={0.8}><Image source={AVATARS[currentProfile?.avatar] || AVATARS['pfp1.jpg']} style={styles.headerAvatar} /></TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* --- OVERLAY SCREENS --- */}

      {activeGenre && (
        <GenreGrid 
          genre={activeGenre} 
          onBack={() => setActiveGenre(null)} 
          onSelectAnime={handleSelectAnime} 
        />
      )}

      {selectedAnime && (
        <View style={styles.overlayScreen}>
          <Play anime={selectedAnime} user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onBack={() => setSelectedAnime(null)} navigation={navigation} />
        </View>
      )}

      {activeTab === 'Search' && (
        <View style={styles.overlayScreen}>
          <Search user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onBack={() => setActiveTab('Home')} onSelectAnime={(anime) => { setActiveTab('Home'); handleSelectAnime(anime); }} />
        </View>
      )}

      {activeTab === 'Downloads' && (
        <View style={styles.overlayScreen}>
          <Downloads user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} navigation={navigation} onBack={() => setActiveTab('Home')} />
        </View>
      )}

      {activeTab === 'Settings' && (
        <View style={styles.overlayScreen}>
          <ProfileSettings user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSwitchProfile={onSwitchProfile} setLoggedInUser={() => {}} onHardwareBack={() => setActiveTab('Home')} /> 
        </View>
      )}

      {/* GLOBAL BOTTOM NAV */}
      {!selectedAnime && !activeGenre && (
        <View style={styles.bottomNavWrapper}>
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
  bottomNavWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100, elevation: 100 },
  floatingHeader: { position: 'absolute', top: 0, left: 0, right: 0, height: 110, zIndex: 100 },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 32 },
  headerLogoImage: { width: 175, height: 48, tintColor: '#E50914' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  searchBtn: { padding: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.8, shadowRadius: 4 },
  profileSwitcher: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.5)', elevation: 5 },
  headerAvatar: { width: 38, height: 38, borderRadius: 5 },
  scroll: { flex: 1 },
  contentPadding: { paddingTop: 10 },
});
