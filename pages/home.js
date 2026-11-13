import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  Image, StatusBar, Platform, BackHandler 
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle } from 'react-native-svg';
import * as NavigationBar from 'expo-navigation-bar';
import * as ScreenOrientation from 'expo-screen-orientation';

// --- SLIDER IMPORTS ---
import Carousel from './home/carousel';
import ContinueWatching from './home/continue_watching'; 
import RecentSlider from './home/recent_slider';
import TrendingSlider from './home/trending_slider';
import Top10Slider from './home/top10_slider';      
import GenresSlider from './home/genres_slider';       
import ForYouSlider from './home/foryou_slider';    
import MoviesSlider from './home/movies_slider';       
import BingeSlider from './home/binge_slider';
import ShortsSlider from './home/shorts_slider';
import AllTimePopularSlider from './home/all_time_popular_slider'; 
import IsekaiSlider from './home/isekai_slider';                   
import UnderratedSlider from './home/underrated_slider';           
import BecauseYouLikedSlider from './home/because_you_liked_slider';
import EditorsChoiceSlider from './home/editors_choice_slider';
import TopRomanceSlider from './home/top_romance_slider';
import DubsSlider from './home/dubs_slider';

// --- OVERLAY & PLAYER IMPORTS ---
import GenreGrid from './home/genre_grid';             
import Play from '../pages/play';
import PlayerComponent from '../pages/play/player';
import ProfileSettings from './profile'; 
import Search from '../components/search'; 
import Downloads from '../pages/downloads'; 
import BottomNav from './home/bottomnav'; 

// --- STRICT PALETTE ---
const BRAND_RED = '#E50914';
const PURE_RED = '#FF0000';
const BLACK = '#000000';
const WHITE = '#FFFFFF';
const DARK_GREY = '#18181C';
const BORDER_GREY = '#26262C';
const TEXT_GREY = '#8E8E93';

const AVATARS = {
  'pfp1.jpg': require('../assets/pfp1.jpg'),
  'pfp2.jpg': require('../assets/pfp2.jpg'),
  'pfp3.jpg': require('../assets/pfp3.jpg'),
  'pfp4.jpg': require('../assets/pfp4.jpg'),
  'pfp5.jpg': require('../assets/pfp5.jpg'),
  'pfp6.jpg': require('../assets/pfp6.jpg'),
};

const IconSearch = ({ size = 26, color = WHITE }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="11" cy="11" r="8" />
    <Path d="M21 21l-4.35-4.35" />
  </Svg>
);

const IconTrash = ({ size = 24, color = PURE_RED }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
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

  // Root-level states for ContinueWatching Fullscreen <View> Player & Delete Popup
  const [directPlaybackParams, setDirectPlaybackParams] = useState(null);
  const [cwDeleteDialog, setCwDeleteDialog] = useState(null);

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

  // Strictly enforce immersive mode (hide status bar & bottom navigation bar)
  const enforceImmersive = useCallback(async () => {
    try {
      StatusBar.setHidden(true, 'none');
      if (Platform.OS === 'android' && NavigationBar?.setVisibilityAsync) {
        await NavigationBar.setVisibilityAsync('hidden');
        await NavigationBar.setBehaviorAsync('overlay-swipe');
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    enforceImmersive();
  }, [selectedAnime, activeGenre, directPlaybackParams, cwDeleteDialog, activeTab, enforceImmersive]);

  const activeProfileId = currentProfile?.id ? String(currentProfile.id) : null;

  const handleSelectAnime = (anime) => {
    if (!anime) { setSelectedAnime(null); return; }
    setSelectedAnime({ ...anime, userUid: resolvedUser?.uid || null, activeProfileId, activeProfile: currentProfile, currentProfile });
  };

  // Launch Player.js in a root-level <View>
  const handleLaunchDirectPlayer = async (episodePayload) => {
    await enforceImmersive();
    try {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } catch (_) {}

    setDirectPlaybackParams({
      ...episodePayload,
      userUid: resolvedUser?.uid || null,
      uid: resolvedUser?.uid || null,
      user: resolvedUser || null,
      activeProfileId: activeProfileId,
      profileId: activeProfileId,
      activeProfile: currentProfile || null,
      currentProfile: currentProfile || null,
    });
  };

  const handleCloseDirectPlayer = async () => {
    setDirectPlaybackParams(null);
    await enforceImmersive();
    try {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } catch (_) {}
  };

  // Hardware Back Button Interceptor for Root Overlays
  useEffect(() => {
    const onHardwareBack = () => {
      if (directPlaybackParams) {
        handleCloseDirectPlayer();
        return true;
      }
      if (cwDeleteDialog) {
        setCwDeleteDialog(null);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [directPlaybackParams, cwDeleteDialog]);

  const isOverlayActive = 
    selectedAnime !== null || 
    activeGenre !== null || 
    directPlaybackParams !== null ||
    activeTab === 'Search' || 
    activeTab === 'Settings' || 
    activeTab === 'Downloads';

  return (
    <View style={styles.masterContainer}>
      <StatusBar hidden={true} translucent={true} backgroundColor="transparent" />

      {/* HOME SCREEN LAYER */}
      <View style={[styles.container, isOverlayActive && { display: 'none' }]}>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll} overScrollMode="never" bounces={false}>
          
          <Carousel user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />
          
          <View style={styles.contentPadding}>
            <ContinueWatching 
              user={resolvedUser} 
              activeProfile={currentProfile} 
              currentProfile={currentProfile} 
              activeProfileId={activeProfileId} 
              onSelectAnime={handleSelectAnime}
              onPlayDirect={handleLaunchDirectPlayer}
              onRequestDeleteDialog={(dialogConfig) => setCwDeleteDialog(dialogConfig)}
            />
          </View>

          <RecentSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />

          <TrendingSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />

          <Top10Slider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />

          <GenresSlider onSelectGenre={(genre) => setActiveGenre(genre)} />
          
          <ForYouSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />

          <MoviesSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />

          <BingeSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />
          
          <ShortsSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />

          <AllTimePopularSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />

          <IsekaiSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />

          <UnderratedSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />

          <BecauseYouLikedSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />
          
          <EditorsChoiceSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />
          
          <TopRomanceSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />

          <DubsSlider user={resolvedUser} activeProfile={currentProfile} currentProfile={currentProfile} activeProfileId={activeProfileId} onSelectAnime={handleSelectAnime} />

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
          user={resolvedUser}               
          activeProfile={currentProfile}
          activeProfileId={activeProfileId} 
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
      {!selectedAnime && !activeGenre && !directPlaybackParams && !cwDeleteDialog && (
        <View style={styles.bottomNavWrapper}>
          <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
        </View>
      )}

      {/* --- ROOT-LEVEL <VIEW> DELETE POPUP FOR CONTINUE WATCHING --- */}
      {Boolean(cwDeleteDialog) && (
        <View style={styles.rootPopupOverlay}>
          <TouchableOpacity 
            style={styles.rootPopupBackdrop} 
            activeOpacity={1} 
            onPress={() => setCwDeleteDialog(null)} 
          />
          <View style={styles.bottomSheetCard}>
            <View style={styles.confirmIconWrap}>
              <IconTrash size={24} color={PURE_RED} />
            </View>
            <Text style={styles.confirmPopupTitle}>{cwDeleteDialog.title}</Text>
            <Text style={styles.confirmPopupMessage}>{cwDeleteDialog.message}</Text>
            <View style={styles.confirmBtnsRow}>
              <TouchableOpacity 
                style={styles.confirmCancelBtn} 
                activeOpacity={0.85} 
                onPress={() => setCwDeleteDialog(null)}
              >
                <Text style={styles.confirmCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.confirmDangerBtn} 
                activeOpacity={0.85} 
                onPress={async () => {
                  const confirmAction = cwDeleteDialog.onConfirm;
                  setCwDeleteDialog(null);
                  if (confirmAction) await confirmAction();
                }}
              >
                <Text style={styles.confirmDangerBtnText}>
                  {cwDeleteDialog.confirmText || 'Delete'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* --- ROOT-LEVEL <VIEW> FULLSCREEN PLAYER FOR CONTINUE WATCHING --- */}
      {directPlaybackParams && PlayerComponent && (
        <View style={styles.rootPlayerOverlay}>
          <StatusBar hidden={true} translucent={true} backgroundColor="transparent" />
          <PlayerComponent
            route={{ params: directPlaybackParams }}
            navigation={{ goBack: handleCloseDirectPlayer }}
            user={resolvedUser}
            activeProfile={currentProfile}
            activeProfileId={activeProfileId}
          />
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  masterContainer: { flex: 1, backgroundColor: BLACK },
  container: { flex: 1, backgroundColor: BLACK },
  overlayScreen: { ...StyleSheet.absoluteFillObject, backgroundColor: BLACK, zIndex: 50 },
  bottomNavWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100, elevation: 100 },
  floatingHeader: { position: 'absolute', top: 0, left: 0, right: 0, height: 110, zIndex: 100 },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 32 },
  headerLogoImage: { width: 175, height: 48, tintColor: BRAND_RED },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  searchBtn: { padding: 4, shadowColor: BLACK, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.8, shadowRadius: 4 },
  profileSwitcher: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.5)', elevation: 5 },
  headerAvatar: { width: 38, height: 38, borderRadius: 5 },
  scroll: { flex: 1 },
  contentPadding: { paddingTop: 10 },

  // Root-Level <View> Overlays (Above ScrollView & BottomNav)
  rootPopupOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99998,
    elevation: 99998,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  rootPopupBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.84)',
  },
  bottomSheetCard: {
    width: '100%',
    backgroundColor: BLACK,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderColor: BORDER_GREY,
    alignItems: 'center',
  },
  confirmIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: DARK_GREY,
    borderWidth: 1,
    borderColor: BORDER_GREY,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  confirmPopupTitle: {
    color: WHITE,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  confirmPopupMessage: {
    color: TEXT_GREY,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  confirmBtnsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 9,
    backgroundColor: DARK_GREY,
    borderWidth: 1,
    borderColor: BORDER_GREY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelBtnText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '700',
  },
  confirmDangerBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 9,
    backgroundColor: PURE_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDangerBtnText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '800',
  },
  rootPlayerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    elevation: 99999,
    backgroundColor: BLACK,
  },
});
