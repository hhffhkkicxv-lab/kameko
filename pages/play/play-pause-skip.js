import React, { useRef, useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  Animated, Dimensions, TouchableWithoutFeedback 
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
// Note: If you want to detect phone calls, you may need a library like react-native-callkeep or react-native-call-detection.
// For now, handling basic app state (background/foreground) is standard practice for pausing on calls.
import { AppState } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// --- SVG ICONS WITH SOFT DROP SHADOWS ---
const IconPlay = ({ size = 64 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF">
    <Path d="M8 5v14l11-7z" />
  </Svg>
);

const IconPause = ({ size = 64 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF">
    <Path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </Svg>
);

const IconBackward = ({ size = 42 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF">
    <Path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
  </Svg>
);

const IconForward = ({ size = 42 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF">
    <Path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
  </Svg>
);

export default function PlayPauseSkip({
  status = {},
  videoRef,
  resetHideTimer,
  isLocked,
  uiOpacity,
  showUI,
  setShowUI,
  activeMenu,
  setActiveMenu,
  onTouchStart,
  onTouchEnd,
  panHandlers = {}
}) {
  const [skipDirection, setSkipDirection] = useState(null);
  const appState = useRef(AppState.currentState);

  // Animations for Skip Effects
  const leftAnim = useRef(new Animated.Value(0)).current;
  const rightAnim = useRef(new Animated.Value(0)).current;
  const rotateLeft = useRef(new Animated.Value(0)).current;
  const rotateRight = useRef(new Animated.Value(0)).current;

  // Animation for Center Buffer Spinner
  const spinValue = useRef(new Animated.Value(0)).current;
  const spinAnimation = useRef(null);

  const lastTapRef = useRef(0);
  const singleTapTimer = useRef(null);

  const isBuffering = status.isBuffering || (!status.isLoaded && !status.error);

  // Pause on Phone Call / Backgrounding
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/active/) && 
        nextAppState.match(/inactive|background/)
      ) {
        // App went to background (e.g., phone call, switched apps)
        if (videoRef?.current && status.isPlaying) {
          videoRef.current.pauseAsync();
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [videoRef, status.isPlaying]);

  // Continuous rotation while video buffers
  useEffect(() => {
    if (isBuffering) {
      spinAnimation.current = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        })
      );
      spinAnimation.current.start();
    } else {
      if (spinAnimation.current) {
        spinAnimation.current.stop();
      }
      spinValue.setValue(0);
    }
  }, [isBuffering]);

  const togglePlayPause = () => {
    if (!videoRef?.current || isBuffering) return;
    if (status.isPlaying) {
      videoRef.current.pauseAsync();
    } else {
      videoRef.current.playAsync();
    }
    if (resetHideTimer) resetHideTimer();
  };

  const seekBy = async (seconds) => {
    if (!videoRef?.current || !status.isLoaded) return;
    const currentMs = status.positionMillis || 0;
    const durationMs = status.durationMillis || 0;
    const targetMs = Math.max(0, Math.min(durationMs, currentMs + seconds * 1000));
    await videoRef.current.setPositionAsync(targetMs);
    if (resetHideTimer) resetHideTimer();
  };

  const triggerLeftAnimation = () => {
    setSkipDirection('left');
    leftAnim.setValue(0);
    rotateLeft.setValue(0);

    Animated.parallel([
      Animated.timing(leftAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(rotateLeft, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start(() => setSkipDirection(null));
  };

  const triggerRightAnimation = () => {
    setSkipDirection('right');
    rightAnim.setValue(0);
    rotateRight.setValue(0);

    Animated.parallel([
      Animated.timing(rightAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(rotateRight, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start(() => setSkipDirection(null));
  };

  const handleTouch = (evt) => {
    if (activeMenu) {
      if (setActiveMenu) setActiveMenu(null);
      return;
    }

    const now = Date.now();
    const tapDelay = now - lastTapRef.current;
    lastTapRef.current = now;

    const touchX = evt.nativeEvent.locationX;
    const width = Dimensions.get('window').width || SCREEN_WIDTH;
    const leftThreshold = width * 0.35;
    const rightThreshold = width * 0.65;

    // Double Tap Logic
    if (tapDelay < 300) {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }

      if (isLocked) return;

      if (touchX < leftThreshold) {
        seekBy(-10);
        triggerLeftAnimation();
      } else if (touchX > rightThreshold) {
        seekBy(10);
        triggerRightAnimation();
      } else {
        togglePlayPause();
      }
    } else {
      // Single Tap Logic
      singleTapTimer.current = setTimeout(() => {
        if (showUI) {
          Animated.timing(uiOpacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }).start(() => setShowUI && setShowUI(false));
        } else {
          if (resetHideTimer) resetHideTimer();
        }
      }, 280);
    }
  };

  const spinBwd = rotateLeft.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-360deg'],
  });

  const spinFwd = rotateRight.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const bufferRotation = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* GESTURE TOUCH LAYER (DOUBLE TAP + LONG PRESS 2X) */}
      <View {...panHandlers} style={StyleSheet.absoluteFillObject}>
        <TouchableWithoutFeedback 
          onPress={handleTouch}
          onPressIn={onTouchStart}
          onPressOut={onTouchEnd}
        >
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>
      </View>

      {/* SKIP ANIMATIONS (-10s / +10s) */}
      {skipDirection === 'left' && !isLocked && (
        <View style={styles.skipLeftZone} pointerEvents="none">
          <Animated.View style={{ transform: [{ rotate: spinBwd }] }}>
            <IconBackward size={48} />
          </Animated.View>
          <Animated.Text
            style={[
              styles.floatText,
              {
                opacity: leftAnim.interpolate({
                  inputRange: [0, 0.2, 0.8, 1],
                  outputRange: [0, 1, 1, 0],
                }),
                transform: [
                  {
                    translateX: leftAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -35],
                    }),
                  },
                ],
              },
            ]}
          >
            -10s
          </Animated.Text>
        </View>
      )}

      {skipDirection === 'right' && !isLocked && (
        <View style={styles.skipRightZone} pointerEvents="none">
          <Animated.View style={{ transform: [{ rotate: spinFwd }] }}>
            <IconForward size={48} />
          </Animated.View>
          <Animated.Text
            style={[
              styles.floatText,
              {
                opacity: rightAnim.interpolate({
                  inputRange: [0, 0.2, 0.8, 1],
                  outputRange: [0, 1, 1, 0],
                }),
                transform: [
                  {
                    translateX: rightAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 35],
                    }),
                  },
                ],
              },
            ]}
          >
            +10s
          </Animated.Text>
        </View>
      )}

      {/* CENTER PLAY/PAUSE/SPINNER CONTROLS */}
      {!isLocked && (
        <Animated.View
          style={[styles.centerControls, { opacity: uiOpacity }]}
          pointerEvents={showUI ? 'box-none' : 'none'}
        >
          {/* Skip Backward 10s */}
          <TouchableOpacity
            style={styles.actionBtn}
            activeOpacity={0.75}
            onPress={() => {
              seekBy(-10);
              triggerLeftAnimation();
            }}
          >
            <IconBackward size={42} />
          </TouchableOpacity>

          {/* Center Dynamic Play / Pause / Spinner */}
          <TouchableOpacity
            style={styles.centerBtn}
            activeOpacity={0.8}
            onPress={togglePlayPause}
            disabled={isBuffering}
          >
            {isBuffering ? (
              <Animated.View 
                style={[
                  styles.spinnerRing, 
                  { transform: [{ rotate: bufferRotation }] }
                ]} 
              />
            ) : status.isPlaying ? (
              <IconPause size={68} />
            ) : (
              <IconPlay size={68} />
            )}
          </TouchableOpacity>

          {/* Skip Forward 10s */}
          <TouchableOpacity
            style={styles.actionBtn}
            activeOpacity={0.75}
            onPress={() => {
              seekBy(10);
              triggerRightAnimation();
            }}
          >
            <IconForward size={42} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centerControls: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 64,
    zIndex: 15,
  },
  centerBtn: {
    width: 72,
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
    // Soft ambient glow / drop shadow instead of a solid pill
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
  },
  actionBtn: {
    width: 52,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  spinnerRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderTopColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },
  skipLeftZone: {
    position: 'absolute',
    left: '18%',
    top: '42%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
  },
  skipRightZone: {
    position: 'absolute',
    right: '18%',
    top: '42%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
  },
  floatText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 6,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
});
