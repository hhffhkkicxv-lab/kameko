const { withAndroidManifest, withDangerousMod, withAndroidStyles } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withAndroidFixes(config) {
  // 1. Force Video Behind Camera Notch (Short Edges)
  config = withAndroidStyles(config, async (config) => {
    const styles = config.modResults;
    const appTheme = styles.resources.style.find(
      (style) => style.$.name === 'AppTheme'
    );
    if (appTheme) {
      // Prevents the black bar on the side of the screen
      appTheme.item.push({
        _: 'shortEdges',
        $: { name: 'android:windowLayoutInDisplayCutoutMode' }
      });
    }
    return config;
  });

  // 2. Fix Firebase vs Expo Notification Manifest Conflict
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];
    
    manifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    if (app['meta-data']) {
      const colorMeta = app['meta-data'].find(
        (item) => item.$['android:name'] === 'com.google.firebase.messaging.default_notification_color'
      );
      if (colorMeta) {
        colorMeta.$['tools:replace'] = 'android:resource';
      }
    }
    return config;
  });

  // 3. Preserve Firebase & Google Sign-In through R8 Minification
  config = withDangerousMod(config, [
    'android',
    (config) => {
      const proguardPath = path.join(config.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const customRules = `
# Protect Firebase
-keep class com.google.firebase.** { *; }
-keep class io.invertase.firebase.** { *; }
-dontwarn com.google.firebase.**
-dontwarn io.invertase.firebase.**

# Protect Google Play Services
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**
`;
      
      if (fs.existsSync(proguardPath)) {
        const contents = fs.readFileSync(proguardPath, 'utf-8');
        if (!contents.includes('io.invertase.firebase')) {
          fs.writeFileSync(proguardPath, contents + '\n' + customRules);
        }
      } else {
        fs.writeFileSync(proguardPath, customRules);
      }
      return config;
    }
  ]);

  return config;
};
