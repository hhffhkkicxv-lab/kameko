import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  View, Text, StyleSheet, Dimensions, 
  TouchableOpacity, Animated, Share, StatusBar, 
  ActivityIndicator, FlatList, Modal, Alert 
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Svg, { Defs, LinearGradient, Stop, Rect, Path } from 'react-native-svg';
import ProxyImage from '../components/ProxyImage';

import Player from './play/player';

const { width, height } = Dimensions.get('window');
const BRAND_RED = '#E50914';
const TMDB_API_KEY = 'f39f02a34ded84924626dd5ec7de1f29';
const VERCEL_API_BASE = 'https://anikoto-api-lyart.vercel.app';
const EPISODE_CHUNK_SIZE = 50;
const WATCH_HISTORY_COLLECTION = 'watch_history';

const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
};

// UI Icons
const IconBack = ({ size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5">
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);
const IconPlay = ({ size = 18, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M8 5v14l11-7z" />
  </Svg>
);
const IconPlus = ({ size = 24, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);
const IconCheck = ({ size = 24, color = BRAND_RED }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3">
    <Path d="M20 6L9 17l-5-5" />
  </Svg>
);
const IconShare = ({ size = 22, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <Path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
  </Svg>
);
const IconDownload = ({ size = 22, color = "#FFF" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </Svg>
);

export default function Play({
  anime: propAnime,
  user: propUser,
  activeProfile: propActiveProfile,
  currentProfile: propCurrentProfile,
  activeProfileId: propActiveProfileId,
  onBack,
  navigation,
  route,
}) {
  const routeParams = route?.params || {};
  const initialAnime = propAnime || routeParams.anime || {
    id: 'solo-leveling',
    title: 'Solo Leveling',
    coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151807-m1gX3iqITmI6.png',
    backdrop: 'https://image.tmdb.org/t/p/original/vIgyYkXkg6NC2whRbYjBD7eb3Er.jpg',
    description: 'In a world of gifted hunters, Sung Jinwoo struggles as the weakest.',
    genres: ['Action', 'Fantasy'],
    score: 85,
    rating: 'U/A 13+',
    status: 'RELEASING'
  };

  const [currentAnime, setCurrentAnime] = useState(initialAnime);

  useEffect(() => {
    if (propAnime?.id || propAnime?.animeId) {
      setCurrentAnime(propAnime);
    } else if (routeParams.anime?.id) {
      setCurrentAnime(routeParams.anime);
    }
  }, [propAnime, routeParams.anime]);

  // Resolve User & Active Profile from props, anime object, route params, or Firebase
  const resolvedUser =
    propUser ||
    routeParams.user ||
    currentAnime?.user ||
    auth().currentUser ||
    null;

  const incomingProfile =
    propActiveProfile ||
    propCurrentProfile ||
    currentAnime?.activeProfile ||
    currentAnime?.currentProfile ||
    routeParams.activeProfile ||
    routeParams.currentProfile ||
    null;

  const [resolvedProfile, setResolvedProfile] = useState(incomingProfile);
  const [resolvedProfileId, setResolvedProfileId] = useState(
    () =>
      propActiveProfileId ||
      incomingProfile?.id ||
      currentAnime?.activeProfileId ||
      routeParams.activeProfileId ||
      null
  );

  useEffect(() => {
    if (incomingProfile?.id) {
      setResolvedProfile(incomingProfile);
      setResolvedProfileId(String(incomingProfile.id));
    } else if (propActiveProfileId) {
      setResolvedProfileId(String(propActiveProfileId));
    }
  }, [incomingProfile, propActiveProfileId]);

  const resolvedUid =
    resolvedUser?.uid ||
    currentAnime?.userUid ||
    routeParams.userUid ||
    auth().currentUser?.uid ||
    null;

  // Fallback: Fetch active profile from Firestore if Play was opened without one
  useEffect(() => {
    if (resolvedProfileId || !resolvedUid) return;
    let isMounted = true;

    const fetchActiveProfileFallback = async () => {
      try {
        const userDoc = await firestore().collection('users').doc(String(resolvedUid)).get();
        if (userDoc.exists) {
          const uData = userDoc.data();
          if (uData?.activeProfile?.id && isMounted) {
            setResolvedProfile(uData.activeProfile);
            setResolvedProfileId(String(uData.activeProfile.id));
            return;
          }
          if (uData?.activeProfileId && isMounted) {
            setResolvedProfileId(String(uData.activeProfileId));
            return;
          }
        }

        const snap = await firestore()
          .collection('users')
          .doc(String(resolvedUid))
          .collection('profiles')
          .limit(1)
          .get();

        if (!snap.empty && isMounted) {
          const firstDoc = snap.docs[0];
          const prof = { id: firstDoc.id, ...firstDoc.data() };
          setResolvedProfile(prof);
          setResolvedProfileId(String(firstDoc.id));
        }
      } catch (_) {}
    };

    fetchActiveProfileFallback();
    return () => { isMounted = false; };
  }, [resolvedUid, resolvedProfileId]);

  const animeDocId = String(currentAnime.animeId || currentAnime.id);
  const resolvedTitle = currentAnime.animeTitle || currentAnime.title || 'Unknown';
  const resolvedBackdrop =
    currentAnime.backdropUrl ||
    currentAnime.animeBackdrop ||
    currentAnime.backdrop ||
    currentAnime.coverImage ||
    '';

  const [activeTab, setActiveTab] = useState('episodes'); 
  const [descExpanded, setDescExpanded] = useState(false);
  const [inLibrary, setInLibrary] = useState(false);
  const [alternates, setAlternates] = useState([]);

  // Progress Tracking (Profile Specific)
  const [userProgressMap, setUserProgressMap] = useState({});
  const [latestWatched, setLatestWatched] = useState(null);

  // TMDB Metadata
  const [titleLogo, setTitleLogo] = useState(null);
  const [tmdbSynopsis, setTmdbSynopsis] = useState(currentAnime.description);
  const [isUpcoming, setIsUpcoming] = useState(currentAnime.status?.toUpperCase() === 'UPCOMING');

  // Episodes List & Pagination
  const [vercelAnimeId, setVercelAnimeId] = useState(animeDocId);
  const [episodes, setEpisodes] = useState([]);
  const [episodesLoading, setEpisodesLoading] = useState(true);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);

  // Player Overlay
  const [loadingEpisode, setLoadingEpisode] = useState(null);
  const [activePlayback, setActivePlayback] = useState(null);

  // Download Sheet
  const [downloadModal, setDownloadModal] = useState({ visible: false, ep: null });

  // 1. Firebase Listeners (Library & Profile Watch History)
  useEffect(() => {
    if (!resolvedUid || !animeDocId) return;
    
    const libRef = firestore()
      .collection('users')
      .doc(String(resolvedUid))
      .collection('library')
      .doc(animeDocId);
    const libUnsub = libRef.onSnapshot(doc => setInLibrary(doc?.exists || false), () => {});

    if (!resolvedProfileId) {
      return () => libUnsub();
    }

    // Listen to users/{uid}/profiles/{profileId}/watch_history for this anime
    const historyRef = firestore()
      .collection('users')
      .doc(String(resolvedUid))
      .collection('profiles')
      .doc(String(resolvedProfileId))
      .collection(WATCH_HISTORY_COLLECTION)
      .where('animeId', '==', animeDocId);
      
    const historyUnsub = historyRef.onSnapshot(snapshot => {
      if (snapshot && !snapshot.empty) {
        const pMap = {};
        let latest = null;
        snapshot.forEach(doc => {
          const data = doc.data();
          const epKey = String(data.slug || data.episodeNum || data.lastWatchedEp || '');
          if (epKey) pMap[epKey] = data;
          if (data.episodeNum) pMap[`ep_${data.episodeNum}`] = data;
          if (data.lastWatchedEp) pMap[`ep_${data.lastWatchedEp}`] = data;
          if (!latest || (data.timestamp || 0) > (latest.timestamp || 0)) {
            latest = data;
          }
        });
        setUserProgressMap(pMap);
        setLatestWatched(latest);
      } else {
        setUserProgressMap({});
        setLatestWatched(null);
      }
    }, () => {});

    return () => {
      libUnsub();
      historyUnsub();
    };
  }, [resolvedUid, resolvedProfileId, animeDocId]);

  const toggleLibrary = async () => {
    if (!resolvedUid || !animeDocId) return;
    const ref = firestore()
      .collection('users')
      .doc(String(resolvedUid))
      .collection('library')
      .doc(animeDocId);

    if (inLibrary) {
      await ref.delete().catch(() => {});
    } else {
      await ref.set({
        id: animeDocId,
        animeId: animeDocId,
        title: resolvedTitle,
        img: currentAnime.coverImage || resolvedBackdrop,
        backdrop: resolvedBackdrop,
        profileId: resolvedProfileId,
        addedAt: firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    }
  };

  const handleOpenDownload = (episodeItem) => {
    if (!episodeItem) return;
    setDownloadModal({ visible: true, ep: episodeItem });
    Alert.alert(
      'Download Episode',
      `${resolvedTitle} - Episode ${episodeItem.num}: ${episodeItem.title || ''}`,
      [{ text: 'OK', onPress: () => setDownloadModal({ visible: false, ep: null }) }]
    );
  };

  // 2. Fetch TMDB Data & Alternates
  useEffect(() => {
    let isMounted = true;
    const loadTMDB = async () => {
      try {
        const cleanTitle = resolvedTitle.replace(/\(Dub\)|\(Sub\)/gi, '').trim();
        const searchType = currentAnime.format === 'MOVIE' ? 'movie' : 'tv';
        const tmdbRes = await fetchWithTimeout(
          `https://api.themoviedb.org/3/search/${searchType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}`
        );
        const tmdbJson = await tmdbRes.json();
        const show = tmdbJson?.results?.[0];

        if (show && isMounted) {
          const detailRes = await fetchWithTimeout(
            `https://api.themoviedb.org/3/${searchType}/${show.id}?api_key=${TMDB_API_KEY}&append_to_response=images`
          );
          const detailJson = await detailRes.json();
          if (detailJson?.overview && isMounted) setTmdbSynopsis(detailJson.overview);

          const logos = detailJson?.images?.logos || [];
          const bestLogo = logos.find(l => l.iso_639_1 === 'en') || logos.find(l => l.iso_639_1 === 'ja') || logos[0];
          if (bestLogo && isMounted) setTitleLogo(`https://image.tmdb.org/t/p/w500${bestLogo.file_path}`);
        }
      } catch (_) {}
    };

    const loadAlternates = async () => {
      try {
        const aniQuery = `query ($search: String) { Media (search: $search, type: ANIME) { status relations { edges { relationType node { id title { romaji english } bannerImage coverImage { extraLarge large } format seasonYear averageScore } } } } }`;
        const aRes = await fetchWithTimeout('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: aniQuery, variables: { search: resolvedTitle } })
        });
        const aJson = await aRes.json();
        const edges = aJson?.data?.Media?.relations?.edges || [];
        if (isMounted) {
          setAlternates(edges.map(edge => ({
            id: String(edge.node.id),
            animeId: String(edge.node.id),
            title: edge.node.title?.english || edge.node.title?.romaji || 'Untitled',
            coverImage: edge.node.coverImage?.extraLarge || edge.node.coverImage?.large,
            backdrop: edge.node.bannerImage || edge.node.coverImage?.extraLarge || edge.node.coverImage?.large,
            relationType: edge.relationType || 'RELATED',
            format: edge.node.format || 'TV',
            score: edge.node.averageScore ? `★ ${edge.node.averageScore}%` : 'N/A',
            year: edge.node.seasonYear || 'N/A'
          })));
        }
      } catch (_) {}
    };

    loadTMDB();
    loadAlternates();
    return () => { isMounted = false; };
  }, [resolvedTitle, currentAnime.format]);

  // 3. Fetch Flat Episodes
  useEffect(() => {
    let isMounted = true;
    const fetchEpisodes = async () => {
      setEpisodesLoading(true);
      if (isUpcoming) {
        if (isMounted) setEpisodesLoading(false);
        return;
      }
      try {
        let targetId = animeDocId;
        const searchRes = await fetchWithTimeout(
          `${VERCEL_API_BASE}/api/search?keyword=${encodeURIComponent(resolvedTitle)}`
        );
        const searchJson = await searchRes.json();
        const matches = searchJson?.data || [];
        if (matches.length > 0) {
          const exact = matches.find(m => (m.title || '').toLowerCase() === resolvedTitle.toLowerCase()) || matches[0];
          targetId = exact.id;
        }
        if (isMounted) setVercelAnimeId(targetId);

        const res = await fetchWithTimeout(`${VERCEL_API_BASE}/api/episodes/${encodeURIComponent(targetId)}`);
        const json = await res.json();
        const list = json?.data || [];

        if (isMounted && Array.isArray(list)) {
          const formatted = list.map((ep, idx) => ({
            id: String(ep.id || idx + 1),
            slug: String(ep.slug || ep.id || ep.num),
            num: ep.num || (idx + 1),
            title: ep.title || `Episode ${ep.num || idx + 1}`,
            isFiller: ep.isFiller || false,
            isSub: ep.isSub ?? true,
            isDub: ep.isDub ?? false,
          }));
          setEpisodes(formatted);
          
          const targetEpNum = latestWatched?.episodeNum || latestWatched?.lastWatchedEp || currentAnime?.episodeNum;
          if (targetEpNum) {
            const epIndex = formatted.findIndex(e => String(e.num) === String(targetEpNum));
            if (epIndex !== -1) {
              setCurrentChunkIndex(Math.floor(epIndex / EPISODE_CHUNK_SIZE));
            }
          }
        }
      } catch (err) {
        if (isMounted) setEpisodes([]);
      } finally {
        if (isMounted) setEpisodesLoading(false);
      }
    };

    fetchEpisodes();
    return () => { isMounted = false; };
  }, [animeDocId, resolvedTitle, isUpcoming, latestWatched?.episodeNum, latestWatched?.lastWatchedEp]);

  // Episode Chunking Logic
  const episodeChunks = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < episodes.length; i += EPISODE_CHUNK_SIZE) {
      chunks.push(episodes.slice(i, i + EPISODE_CHUNK_SIZE));
    }
    return chunks;
  }, [episodes]);

  const currentEpisodesToRender = episodeChunks[currentChunkIndex] || [];

  // 4. Playback Navigation Handler -> Passes User & Active Profile to Player.js
  const handlePlayEpisode = async (episodeItem) => {
    if (!episodeItem) return;

    try {
      setLoadingEpisode(episodeItem.num);
      const safeId = encodeURIComponent(vercelAnimeId || animeDocId);
      const safeEp = encodeURIComponent(String(episodeItem.slug));

      let streamManifest = null;
      try {
        const streamUrl = `${VERCEL_API_BASE}/api/stream?id=${safeId}&ep=${safeEp}&server=hd-1&type=sub`;
        const res = await fetchWithTimeout(streamUrl, {}, 8000);
        const json = await res.json();
        streamManifest = json?.data || json?.results || null;
      } catch (_) {
        // Player.js has multi-server fallback (hd-1, hd-2, vidstream-2), so we still launch Player
      }

      const savedEpProgress =
        userProgressMap[String(episodeItem.slug)] ||
        userProgressMap[`ep_${episodeItem.num}`] ||
        null;

      const playbackPayload = {
        streamUrl: streamManifest?.m3u8 || streamManifest?.streamingLink || null,
        referer: streamManifest?.referer || 'https://vidwish.live/',
        subtitles: streamManifest?.subtitles || [],
        animeTitle: resolvedTitle,
        title: resolvedTitle,
        animeBackdrop: resolvedBackdrop,
        backdropUrl: resolvedBackdrop,
        backdrop: resolvedBackdrop,
        coverImage: currentAnime.coverImage || resolvedBackdrop,
        episodeNum: Number(episodeItem.num),
        episodeTitle: episodeItem.title || `Episode ${episodeItem.num}`,
        epTitle: episodeItem.title || `Episode ${episodeItem.num}`,
        animeId: animeDocId,
        providerId: vercelAnimeId || animeDocId,
        slug: String(episodeItem.slug),
        progress: savedEpProgress && !savedEpProgress.finishedEp ? Number(savedEpProgress.progress || 0) : 0,
        duration: savedEpProgress ? Number(savedEpProgress.duration || 0) : 0,
        userUid: resolvedUid,
        uid: resolvedUid,
        user: resolvedUser,
        activeProfileId: resolvedProfileId,
        profileId: resolvedProfileId,
        activeProfile: resolvedProfile,
        currentProfile: resolvedProfile,
        targetType: currentAnime.targetType || 'sub',
      };

      if (navigation?.navigate) {
        navigation.navigate('Player', playbackPayload);
      } else {
        setActivePlayback(playbackPayload);
      }
    } catch (e) {
      Alert.alert('Playback Error', `Failed to play: ${e.message}`);
    } finally {
      setLoadingEpisode(null);
    }
  };

  // 5. Smart Target Episode Resolution
  const targetEp = (() => {
    if (episodes.length === 0) return null;
    if (latestWatched) {
      const lastEp = episodes.find(
        e =>
          String(e.slug) === String(latestWatched.slug) ||
          String(e.num) === String(latestWatched.episodeNum || latestWatched.lastWatchedEp)
      );
      if (lastEp) {
        if (latestWatched.finishedEp) {
          const nextEpIndex = episodes.findIndex(e => e.slug === lastEp.slug) + 1;
          if (nextEpIndex < episodes.length) return episodes[nextEpIndex];
        }
        return lastEp;
      }
    }
    if (currentAnime?.episodeNum) {
      const matched = episodes.find(e => String(e.num) === String(currentAnime.episodeNum));
      if (matched) return matched;
    }
    return episodes[0];
  })();

  let resumePct = 0;
  if (
    targetEp &&
    latestWatched &&
    latestWatched.duration > 0 &&
    (String(latestWatched.slug) === String(targetEp.slug) ||
      String(latestWatched.episodeNum || latestWatched.lastWatchedEp) === String(targetEp.num))
  ) {
    resumePct = Math.min((latestWatched.progress / latestWatched.duration) * 100, 100);
  }

  // Header Component
  const renderHeader = () => (
    <View style={styles.heroSection}>
      <View style={styles.backdropBox}>
        <ProxyImage
          source={{ uri: resolvedBackdrop || currentAnime.coverImage }}
          style={styles.backdropImg}
          resizeMode="cover"
        />
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
          <Defs>
            <LinearGradient id="heroDark" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000000" stopOpacity="0.1" />
              <Stop offset="0.65" stopColor="#000000" stopOpacity="0.85" />
              <Stop offset="1" stopColor="#000000" stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#heroDark)" />
        </Svg>
      </View>

      <View style={styles.heroForeground}>
        <View style={styles.logoRow}>
          {titleLogo ? (
            <ProxyImage source={{ uri: titleLogo }} style={styles.titleLogo} resizeMode="contain" />
          ) : (
            <Text style={styles.fallbackTitleText}>{resolvedTitle}</Text>
          )}
        </View>

        <View style={styles.badgesRow}>
          <View style={styles.newBadge}><Text style={styles.newBadgeText}>New Episode</Text></View>
          <View style={styles.ratingBadge}><Text style={styles.ratingBadgeText}>{currentAnime.rating || 'U/A 13+'}</Text></View>
          <Text style={styles.scoreText}>★ {currentAnime.score || 85}%</Text>
        </View>

        <TouchableOpacity
          style={[styles.resumeBtn, (episodes.length === 0 || isUpcoming) && { opacity: 0.5 }]}
          activeOpacity={0.85}
          onPress={() => targetEp && handlePlayEpisode(targetEp)}
          disabled={episodes.length === 0 || isUpcoming}
        >
          <View style={styles.resumeContentRow}>
            <Text style={styles.resumeBtnText}>
              {isUpcoming ? 'Not Yet Released' : (
                latestWatched?.finishedEp && targetEp?.slug !== latestWatched?.slug 
                  ? `Play Next: Episode ${targetEp?.num}` 
                  : resumePct > 0 
                    ? `Resume Episode ${targetEp?.num || 1}` 
                    : `Watch Episode ${targetEp?.num || 1}`
              )}
            </Text>
            <IconPlay size={18} color="#FFF" />
          </View>
          {resumePct > 0 && !latestWatched?.finishedEp && (
            <View style={styles.resumeProgressUnderline}>
              <View style={[styles.resumeProgressFill, { width: `${resumePct}%` }]} />
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.actionsBar}>
          <TouchableOpacity style={styles.actionTab} onPress={toggleLibrary} activeOpacity={0.7}>
            {inLibrary ? <IconCheck /> : <IconPlus />}
            <Text style={styles.actionTabText}>Watchlist</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionTab} onPress={() => targetEp && handleOpenDownload(targetEp)} activeOpacity={0.7}>
            <IconDownload />
            <Text style={styles.actionTabText}>Download</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionTab} onPress={() => Share.share({ message: `Watch ${resolvedTitle} on Kameko!` })} activeOpacity={0.7}>
            <IconShare />
            <Text style={styles.actionTabText}>Share</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.synopsisContainer}>
          <Text style={styles.synopsisBody} numberOfLines={descExpanded ? undefined : 3}>{tmdbSynopsis}</Text>
          {tmdbSynopsis?.length > 110 && (
            <TouchableOpacity onPress={() => setDescExpanded(!descExpanded)} activeOpacity={0.7} style={styles.moreBtn}>
              <Text style={styles.moreBtnText}>{descExpanded ? 'Less Details ▲' : 'More Details ▼'}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.tabsHeader}>
          <TouchableOpacity style={[styles.tabTitleBtn, activeTab === 'episodes' && styles.tabTitleBtnActive]} onPress={() => setActiveTab('episodes')}>
            <Text style={[styles.tabTitleText, activeTab === 'episodes' && styles.tabTitleTextActive]}>Episodes ({episodes.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabTitleBtn, activeTab === 'alternates' && styles.tabTitleBtnActive]} onPress={() => setActiveTab('alternates')}>
            <Text style={[styles.tabTitleText, activeTab === 'alternates' && styles.tabTitleTextActive]}>Alternates ({alternates.length})</Text>
          </TouchableOpacity>
        </View>

        {/* EPISODE CHUNK SELECTOR */}
        {activeTab === 'episodes' && episodeChunks.length > 1 && (
          <FlatList 
            horizontal
            data={episodeChunks}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, index) => `chunk-${index}`}
            contentContainerStyle={styles.chunkSelectorContainer}
            renderItem={({ item, index }) => {
              const startEp = item[0].num;
              const endEp = item[item.length - 1].num;
              const isActive = currentChunkIndex === index;
              return (
                <TouchableOpacity 
                  style={[styles.chunkBtn, isActive && styles.chunkBtnActive]}
                  onPress={() => setCurrentChunkIndex(index)}
                >
                  <Text style={[styles.chunkBtnText, isActive && styles.chunkBtnTextActive]}>
                    {startEp} - {endEp}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.screenContainer}>
      <StatusBar hidden={true} />

      <View style={styles.topNavFloat}>
        <TouchableOpacity style={styles.navBackCircle} onPress={onBack || (() => navigation?.goBack?.())}>
          <IconBack />
        </TouchableOpacity>
      </View>

      <FlatList
        data={activeTab === 'episodes' ? currentEpisodesToRender : alternates}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            {episodesLoading ? (
              <ActivityIndicator size="small" color={BRAND_RED} />
            ) : (
              <Text style={styles.emptyText}>
                {activeTab === 'episodes' ? 'No episodes found.' : 'No related media found.'}
              </Text>
            )}
          </View>
        )}
        renderItem={({ item }) => {
          if (activeTab === 'episodes') {
            const isLoadingThis = loadingEpisode === item.num;
            const epProgress = userProgressMap[String(item.slug)] || userProgressMap[`ep_${item.num}`];
            const isFinished = epProgress?.finishedEp === true;

            return (
              <View style={styles.episodeRow}>
                <Text style={[styles.bulletNumber, isFinished && styles.watchedText]}>•{item.num}</Text>

                <TouchableOpacity
                  style={[styles.episodeCard, isFinished && styles.watchedCardBg]}
                  activeOpacity={0.8}
                  onPress={() => handlePlayEpisode(item)}
                >
                  <Text style={[styles.episodeCardTitle, isFinished && styles.watchedText]} numberOfLines={1}>
                    {item.title}
                  </Text>

                  <View style={styles.cardRightGroup}>
                    {item.isFiller && (
                      <View style={[styles.fillerTag, isFinished && { borderColor: 'rgba(255,165,0,0.5)' }]}>
                        <Text style={[styles.fillerTagText, isFinished && { color: 'rgba(255,165,0,0.5)' }]}>FILLER</Text>
                      </View>
                    )}
                    {isLoadingThis ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <IconPlay size={18} color={isFinished ? "rgba(255,255,255,0.4)" : "#FFF"} />
                    )}
                  </View>
                  
                  {/* Small Progress Bar inside Episode Card */}
                  {epProgress && !isFinished && epProgress.duration > 0 && (
                    <View style={styles.epMiniProgressBg}>
                      <View style={[styles.epMiniProgressFill, { width: `${Math.min((epProgress.progress / epProgress.duration) * 100, 100)}%` }]} />
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.downloadIconBtn} activeOpacity={0.7} onPress={() => handleOpenDownload(item)}>
                  <IconDownload size={22} color={isFinished ? "rgba(255,255,255,0.4)" : "#FFF"} />
                </TouchableOpacity>
              </View>
            );
          } else {
            return (
              <TouchableOpacity
                style={styles.altCard}
                activeOpacity={0.8}
                onPress={() => {
                  const enrichedAlt = {
                    ...item,
                    userUid: resolvedUid,
                    activeProfileId: resolvedProfileId,
                    activeProfile: resolvedProfile,
                    currentProfile: resolvedProfile,
                  };
                  if (navigation?.push) {
                    navigation.push('Play', {
                      anime: enrichedAlt,
                      user: resolvedUser,
                      activeProfile: resolvedProfile,
                      activeProfileId: resolvedProfileId,
                    });
                  } else {
                    setCurrentAnime(enrichedAlt);
                    setActiveTab('episodes');
                  }
                }}
              >
                <ProxyImage source={{ uri: item.coverImage }} style={styles.altThumb} resizeMode="cover" />
                <View style={styles.altMeta}>
                  <View style={styles.altTag}><Text style={styles.altTagText}>{item.relationType}</Text></View>
                  <Text style={styles.altTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.altSub}>{item.format} • {item.year} • {item.score}</Text>
                </View>
              </TouchableOpacity>
            );
          }
        }}
        contentContainerStyle={styles.listPadding}
        showsVerticalScrollIndicator={false}
      />

      {/* Fullscreen Player Overlay (passes user & activeProfile via both route.params and props) */}
      {activePlayback && (
        <View style={styles.playerFullscreenContainer}>
          <Player
            route={{ params: activePlayback }}
            navigation={{ goBack: () => setActivePlayback(null) }}
            user={resolvedUser}
            activeProfile={resolvedProfile}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: { flex: 1, backgroundColor: '#000000' },
  playerFullscreenContainer: { ...StyleSheet.absoluteFillObject, zIndex: 9999, backgroundColor: '#000' },
  topNavFloat: { position: 'absolute', top: 38, left: 16, zIndex: 100 },
  navBackCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  heroSection: { width: '100%', marginBottom: 15 },
  backdropBox: { width: '100%', height: height * 0.58, position: 'absolute', top: 0, left: 0 },
  backdropImg: { width: '100%', height: '100%' },
  heroForeground: { paddingTop: height * 0.36, paddingHorizontal: 16 },
  logoRow: { width: '100%', alignItems: 'center', marginBottom: 12 },
  titleLogo: { width: width * 0.8, height: 100 },
  fallbackTitleText: { color: '#FFF', fontSize: 32, fontWeight: '900', textAlign: 'center', textShadowColor: '#000', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  badgesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 18 },
  newBadge: { backgroundColor: BRAND_RED, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  newBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  ratingBadge: { backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  ratingBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  scoreText: { color: '#CCC', fontSize: 12, fontWeight: '700' },
  resumeBtn: { width: '100%', backgroundColor: BRAND_RED, borderRadius: 6, paddingVertical: 14, justifyContent: 'center', marginBottom: 20, overflow: 'hidden' },
  resumeContentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  resumeBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  resumeProgressUnderline: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(0,0,0,0.2)' },
  resumeProgressFill: { height: '100%', backgroundColor: '#FFFFFF' },
  actionsBar: { flexDirection: 'row', justifyContent: 'center', gap: 48, marginBottom: 20 },
  actionTab: { alignItems: 'center', gap: 6 },
  actionTabText: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },
  synopsisContainer: { marginBottom: 18 },
  synopsisBody: { color: '#D1D5DB', fontSize: 13, lineHeight: 19 },
  moreBtn: { marginTop: 4 },
  moreBtnText: { color: BRAND_RED, fontSize: 12, fontWeight: '700' },
  tabsHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#222', gap: 24 },
  tabTitleBtn: { paddingVertical: 12 },
  tabTitleBtnActive: { borderBottomWidth: 3, borderBottomColor: BRAND_RED },
  tabTitleText: { color: '#777', fontSize: 15, fontWeight: '700' },
  tabTitleTextActive: { color: '#FFF' },
  
  chunkSelectorContainer: { paddingVertical: 14, gap: 10 },
  chunkBtn: { backgroundColor: '#1A1A1A', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  chunkBtnActive: { backgroundColor: 'rgba(229,9,20,0.15)', borderColor: BRAND_RED },
  chunkBtnText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700' },
  chunkBtnTextActive: { color: '#FFF' },

  listPadding: { paddingBottom: 60 },
  episodeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 },
  bulletNumber: { color: '#FFF', fontSize: 16, fontWeight: '800', minWidth: 26, marginRight: 6 },
  episodeCard: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#050505', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 4, paddingVertical: 14, paddingHorizontal: 14, overflow: 'hidden' },
  episodeCardTitle: { color: '#FFF', fontSize: 14, fontWeight: '600', flex: 1 },
  cardRightGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fillerTag: { backgroundColor: 'rgba(255,165,0,0.2)', borderWidth: 1, borderColor: '#FFA500', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  fillerTagText: { color: '#FFA500', fontSize: 9, fontWeight: '900' },
  downloadIconBtn: { padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 4, marginLeft: 8, justifyContent: 'center', alignItems: 'center' },
  
  watchedText: { color: 'rgba(255,255,255,0.4)' },
  watchedCardBg: { backgroundColor: '#111', borderColor: 'rgba(255,255,255,0.05)' },
  epMiniProgressBg: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.1)' },
  epMiniProgressFill: { height: '100%', backgroundColor: BRAND_RED },

  altCard: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 14, alignItems: 'center' },
  altThumb: { width: 80, height: 110, borderRadius: 6, backgroundColor: '#1A1A1A' },
  altMeta: { flex: 1, marginLeft: 16, justifyContent: 'center' },
  altTag: { backgroundColor: 'rgba(229,9,20,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginBottom: 6 },
  altTagText: { color: BRAND_RED, fontSize: 9, fontWeight: '900' },
  altTitle: { color: '#FFF', fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  altSub: { color: '#888', fontSize: 12 },
  emptyContainer: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { color: '#777', fontSize: 13 },
});
