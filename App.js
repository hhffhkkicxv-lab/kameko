import React, { useState, useEffect, useRef } from 'react';
import { 
  SafeAreaView, StatusBar, StyleSheet, ActivityIndicator, 
  View, Animated, Easing, Platform, Alert 
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import messaging from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import * as NavigationBar from 'expo-navigation-bar'; // <-- Added for Immersive Mode

import Login from './pages/login';
import Profiles from './pages/profile'; 
import Home from './pages/home';

// --- NEW NATIVE NOTIFEE ENGINE ---
import { registerNotificationListener } from './components/NotificationEngine';

// 1. Configure foreground notification behavior (Expo FCM)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// 2. Headless background handler for Firebase Push Messages
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('FCM Message handled in background:', remoteMessage);
});

// 3. Register the Notifee background listener for Download Cancel buttons BEFORE App mounts
registerNotificationListener();

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);
  
  const [activeProfile, setActiveProfile] = useState(null);
  const [previousProfile, setPreviousProfile] = useState(null);
  
  const [isAnimating, setIsAnimating] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  // --- GLOBAL IMMERSIVE MODE ---
  useEffect(() => {
    const enableImmersiveMode = async () => {
      try {
        if (Platform.OS === 'android') {
          await NavigationBar.setVisibilityAsync('hidden');
          await NavigationBar.setBehaviorAsync('overlay-swipe');
        }
      } catch (error) {
        console.warn("Immersive mode failed:", error);
      }
    };
    enableImmersiveMode();
  }, []);

  // Firebase Auth Listener
  useEffect(() => {
    const subscriber = auth().onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (!currentUser) setActiveProfile(null);
      if (initializing) setInitializing(false);
    });
    return subscriber;
  }, [initializing]);

  // Push Notifications Setup & Token Registration
  useEffect(() => {
    if (!user) return;

    const setupNotifications = async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#E50914',
          });
        }

        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (enabled) {
          const fcmToken = await messaging().getToken();
          if (fcmToken) {
            // Save FCM token under the user document for targeted pushes
            await firestore().collection('users').doc(user.uid).set(
              {
                fcmToken,
                lastSeen: firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
        }
      } catch (err) {
        console.warn('Push registration warning:', err);
      }
    };

    setupNotifications();

    // Foreground notification listener
    const unsubscribeForeground = messaging().onMessage(async remoteMessage => {
      const { notification } = remoteMessage;
      if (notification) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: notification.title || 'Kameko',
            body: notification.body || '',
            data: remoteMessage.data || {},
          },
          trigger: null, // show immediately
        });
      }
    });

    // Refresh token listener
    const unsubscribeTokenRefresh = messaging().onTokenRefresh(async (newToken) => {
      if (user) {
        await firestore().collection('users').doc(user.uid).set(
          { fcmToken: newToken },
          { merge: true }
        );
      }
    });

    return () => {
      unsubscribeForeground();
      unsubscribeTokenRefresh();
    };
  }, [user]);

  const handleProfileSelect = (profile) => {
    setIsAnimating(true);
    setActiveProfile(profile);
    setPreviousProfile(null);

    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: 4, duration: 700, easing: Easing.out(Easing.exp), useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 700, easing: Easing.out(Easing.exp), useNativeDriver: true })
    ]).start(() => {
      setIsAnimating(false);
      scaleAnim.setValue(1);
      opacityAnim.setValue(1);
    });
  };

  const handleSwitchProfile = () => {
    setPreviousProfile(activeProfile);
    setActiveProfile(null);
  };

  if (initializing) {
    return (
      <View style={styles.trueBlackRoot}>
        <ActivityIndicator size="large" color="#E50914" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.trueBlackRoot}>
      <StatusBar hidden={true} translucent={true} backgroundColor="transparent" />
      
      {!user ? (
        <Login setLoggedInUser={setUser} />
      ) : (
        <View style={styles.trueBlackRoot}>
          {activeProfile && (
            <Home 
              user={user} 
              activeProfile={activeProfile} 
              onSwitchProfile={handleSwitchProfile} 
            />
          )}

          {(!activeProfile || isAnimating) && (
            <Animated.View 
              style={[
                styles.overlay, 
                isAnimating && { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }
              ]}
            >
              <Profiles 
                user={user} 
                onSelectProfile={handleProfileSelect} 
                onHardwareBack={previousProfile ? () => setActiveProfile(previousProfile) : null} 
              />
            </Animated.View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  trueBlackRoot: { flex: 1, backgroundColor: '#000000', width: '100%', height: '100%' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000', zIndex: 10 }
});
