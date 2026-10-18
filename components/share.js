import React, { useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, Modal, TouchableOpacity, 
  Animated, Easing, Dimensions, Linking, Clipboard, Alert 
} from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

const { height } = Dimensions.get('window');
const BRAND_RED = '#E50914';

// Custom SVG Icons for the Share Sheet
const IconCopy = () => <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2"><Rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></Svg>;
const IconWhatsApp = () => <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2"><Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></Svg>;
const IconTwitter = () => <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1DA1F2" strokeWidth="2"><Path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/></Svg>;

export default function ShareSheet({ visible, onClose, animeTitle, animeId }) {
  const slideAnim = useRef(new Animated.Value(height)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // The deep link URL you want to share
  const shareUrl = `https://kameko.app/title/${animeId}`;
  const shareMessage = `Check out ${animeTitle} on Kameko! \n\n${shareUrl}`;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, easing: Easing.out(Easing.ease), useNativeDriver: true })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: height, duration: 250, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true })
      ]).start();
    }
  }, [visible]);

  const handleCopyLink = () => {
    Clipboard.setString(shareUrl);
    Alert.alert('Link Copied', 'The link has been copied to your clipboard.', [{ text: 'OK', onPress: onClose }]);
  };

  const handleShareWhatsApp = () => {
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(shareMessage)}`).catch(() => {
      Alert.alert('Error', 'WhatsApp is not installed on this device.');
    });
    onClose();
  };

  const handleShareTwitter = () => {
    Linking.openURL(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage)}`).catch(() => {});
    onClose();
  };

  if (!visible && slideAnim._value === height) return null;

  return (
    <Modal visible={visible || slideAnim._value !== height} transparent animationType="none" onRequestClose={onClose}>
      
      {/* Background Overlay */}
      <TouchableOpacity 
        style={styles.overlayArea} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} />
      </TouchableOpacity>

      {/* Sliding Sheet */}
      <Animated.View style={[styles.sheetContainer, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.dragIndicator} />
        <Text style={styles.sheetTitle}>Share "{animeTitle}"</Text>

        <View style={styles.actionGrid}>
          
          <TouchableOpacity style={styles.actionItem} onPress={handleCopyLink} activeOpacity={0.7}>
            <View style={[styles.iconCircle, { backgroundColor: '#333' }]}><IconCopy /></View>
            <Text style={styles.actionText}>Copy Link</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={handleShareWhatsApp} activeOpacity={0.7}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(37,211,102,0.15)' }]}><IconWhatsApp /></View>
            <Text style={styles.actionText}>WhatsApp</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={handleShareTwitter} activeOpacity={0.7}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(29,161,242,0.15)' }]}><IconTwitter /></View>
            <Text style={styles.actionText}>X (Twitter)</Text>
          </TouchableOpacity>

        </View>

        <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayArea: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheetContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#161616', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 25, paddingBottom: 40, zIndex: 10,
    borderTopWidth: 1, borderColor: '#333',
    elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.5, shadowRadius: 10
  },
  dragIndicator: { width: 45, height: 5, backgroundColor: '#444', borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 30 },
  actionGrid: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 35 },
  actionItem: { alignItems: 'center', gap: 10 },
  iconCircle: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  actionText: { color: '#E0E0E0', fontSize: 13, fontWeight: '600' },
  cancelBtn: { backgroundColor: '#262626', paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  cancelBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' }
});
