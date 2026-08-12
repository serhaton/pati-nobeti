import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Image, PanResponder, View, Text, TouchableOpacity } from 'react-native';
import MapView, { LongPressEvent, Marker } from 'react-native-maps';
import {
  FeedingPoint,
  FeedingRecord,
  getAllFeedingPoints,
  getRecentFeedingRecords,
  getTodayFeedingRecordCountByPoint,
} from '../src/data/feedingPointStore';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { colors } from '../src/theme';

const WINDOW_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = Math.max(420, WINDOW_HEIGHT - 20);
const SHEET_COLLAPSED_Y = SHEET_HEIGHT - 95;
const SHEET_TOP_GAP = 88;
const SHEET_EXPANDED_Y = SHEET_TOP_GAP;

function FeedingBowlIcon() {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', gap: 3, marginBottom: 2 }}>
        <View style={{ width: 4, height: 4, borderRadius: 999, backgroundColor: '#F0C76A' }} />
        <View style={{ width: 4, height: 4, borderRadius: 999, backgroundColor: '#F0C76A' }} />
        <View style={{ width: 4, height: 4, borderRadius: 999, backgroundColor: '#F0C76A' }} />
      </View>
      <View style={{ width: 22, height: 10, borderRadius: 999, backgroundColor: '#D06E49' }} />
      <View style={{ width: 16, height: 3, borderRadius: 999, backgroundColor: '#9C4D2F', marginTop: 1 }} />
    </View>
  );
}

export default function MapScreen() {
  const { selectedCommunity } = useCommunity();
  const { currentUser } = useAuth();
  const params = useLocalSearchParams<{ focusLat?: string; focusLng?: string; focusId?: string; refresh?: string }>();
  const mapRef = useRef<MapView | null>(null);
  const suppressNextMapPressRef = useRef(false);
  const hasUserInteractedRef = useRef(false);
  const sheetY = useRef(new Animated.Value(SHEET_COLLAPSED_Y)).current;
  const dragStartY = useRef(SHEET_COLLAPSED_Y);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [showCurrentLocationLabel, setShowCurrentLocationLabel] = useState(false);
  const [points, setPoints] = useState<FeedingPoint[]>(() => getAllFeedingPoints());
  const [selectedPoint, setSelectedPoint] = useState<FeedingPoint | null>(null);
  const [highlightedPointId, setHighlightedPointId] = useState<string | null>(null);
  const focusLatitude = useMemo(() => Number(params.focusLat), [params.focusLat]);
  const focusLongitude = useMemo(() => Number(params.focusLng), [params.focusLng]);
  const selectedPointRecords = useMemo<FeedingRecord[]>(() => {
    if (!selectedPoint) return [];
    return getRecentFeedingRecords(selectedPoint.id, 5);
  }, [selectedPoint]);
  const fedTodayPointIds = useMemo(() => {
    return new Set(
      points
        .filter((point) => getTodayFeedingRecordCountByPoint(point.id) > 0)
        .map((point) => point.id)
    );
  }, [points]);
  const defaultCenter = useMemo(
    () => ({
      latitude: selectedCommunity?.latitude ?? 41.018101,
      longitude: selectedCommunity?.longitude ?? 29.125607,
    }),
    [selectedCommunity?.latitude, selectedCommunity?.longitude]
  );
  const defaultMapDelta = useMemo(() => {
    const zoom = selectedCommunity?.defaultZoom ?? 17;
    return 360 / Math.pow(2, zoom);
  }, [selectedCommunity?.defaultZoom]);
  const isCommunityAdmin = !!currentUser && !!selectedCommunity?.adminUserIds.includes(currentUser.id);

  useFocusEffect(
    useCallback(() => {
      const refreshedPoints = getAllFeedingPoints();
      setPoints(refreshedPoints);
      setSelectedPoint((prev) => {
        if (!prev) return null;
        return refreshedPoints.find((item) => item.id === prev.id) ?? null;
      });

      if (Number.isFinite(focusLatitude) && Number.isFinite(focusLongitude)) {
        mapRef.current?.animateToRegion(
          {
            latitude: focusLatitude,
            longitude: focusLongitude,
            latitudeDelta: 0.006,
            longitudeDelta: 0.006,
          },
          500
        );
      }

      if (typeof params.focusId === 'string' && params.focusId.length > 0) {
        setHighlightedPointId(params.focusId);
      }
    }, [focusLatitude, focusLongitude, params.refresh])
  );

  useEffect(() => {
    if (!highlightedPointId) return;
    const timer = setTimeout(() => {
      setHighlightedPointId(null);
    }, 7000);

    return () => clearTimeout(timer);
  }, [highlightedPointId]);

  useEffect(() => {
    if (!showCurrentLocationLabel) return;
    const timer = setTimeout(() => {
      setShowCurrentLocationLabel(false);
    }, 3500);

    return () => clearTimeout(timer);
  }, [showCurrentLocationLabel]);

  function openCreatePointFromPress(event: LongPressEvent) {
    if (!isCommunityAdmin) return;

    hasUserInteractedRef.current = true;
    const { latitude, longitude } = event.nativeEvent.coordinate;
    router.push({
      pathname: '/point-create',
      params: {
        lat: String(latitude),
        lng: String(longitude),
      },
    });
  }

  function openEditPoint(pointId: string) {
    router.push({
      pathname: '/point-edit',
      params: { id: pointId },
    });
  }

  function clampSheetValue(value: number) {
    return Math.max(SHEET_EXPANDED_Y, Math.min(SHEET_COLLAPSED_Y, value));
  }

  function animateSheet(toValue: number) {
    Animated.spring(sheetY, {
      toValue,
      useNativeDriver: true,
      bounciness: 0,
      speed: 20,
    }).start();
  }

  const sheetPanResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderGrant: () => {
        sheetY.stopAnimation((value) => {
          dragStartY.current = value;
        });
      },
      onPanResponderMove: (_, gestureState) => {
        sheetY.setValue(clampSheetValue(dragStartY.current + gestureState.dy));
      },
      onPanResponderRelease: (_, gestureState) => {
        const nextValue = clampSheetValue(dragStartY.current + gestureState.dy);
        if (gestureState.vy < -0.35 || nextValue < (SHEET_COLLAPSED_Y + SHEET_EXPANDED_Y) / 2) {
          animateSheet(SHEET_EXPANDED_Y);
          return;
        }
        animateSheet(SHEET_COLLAPSED_Y);
      },
      onPanResponderTerminate: () => {
        animateSheet(SHEET_COLLAPSED_Y);
      },
    }),
    [sheetY]
  );

  function onPointMarkerPress(point: FeedingPoint) {
    hasUserInteractedRef.current = true;
    suppressNextMapPressRef.current = true;
    setSelectedPoint(point);
    animateSheet(SHEET_EXPANDED_Y);
  }

  async function recenterToCurrentLocation() {
    hasUserInteractedRef.current = true;
    setIsLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setCurrentLocation(coords);
      setShowCurrentLocationLabel(true);

      mapRef.current?.animateToRegion(
        {
          latitude: coords.latitude,
          longitude: coords.longitude,
          latitudeDelta: 0.007,
          longitudeDelta: 0.007,
        },
        700
      );
    } finally {
      setIsLocating(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadCurrentLocationWithoutAutoCenter() {
      if (Number.isFinite(focusLatitude) && Number.isFinite(focusLongitude)) return;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || !mounted) return;

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!mounted || hasUserInteractedRef.current) return;

      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setCurrentLocation(coords);
    }

    loadCurrentLocationWithoutAutoCenter();

    return () => {
      mounted = false;
    };
  }, [focusLatitude, focusLongitude]);

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        moveOnMarkerPress={false}
        showsUserLocation
        showsMyLocationButton
        onPanDrag={() => {
          hasUserInteractedRef.current = true;
        }}
        onPress={() => {
          if (suppressNextMapPressRef.current) {
            suppressNextMapPressRef.current = false;
            return;
          }

          hasUserInteractedRef.current = true;
          setSelectedPoint(null);
          animateSheet(SHEET_COLLAPSED_Y);
        }}
        onLongPress={isCommunityAdmin ? openCreatePointFromPress : undefined}
        initialRegion={{
          latitude: defaultCenter.latitude,
          longitude: defaultCenter.longitude,
          latitudeDelta: defaultMapDelta,
          longitudeDelta: defaultMapDelta,
        }}
      >
        {currentLocation && (
          <Marker coordinate={currentLocation} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
            <View style={{ alignItems: 'center' }}>
              {showCurrentLocationLabel ? (
                <View style={{ backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text }}>Buradasın</Text>
                </View>
              ) : null}
              <View style={{ height: 18 }} />
            </View>
          </Marker>
        )}
        {points.map(p => (
          <Marker key={p.id} coordinate={{ latitude: p.lat, longitude: p.lng }} onPress={() => onPointMarkerPress(p)}>
            <View
              style={{
                position: 'relative',
                backgroundColor: highlightedPointId === p.id ? colors.accent : colors.primary,
                padding: 8,
                borderRadius: 18,
                borderWidth: highlightedPointId === p.id ? 3 : 2,
                borderColor: '#fff',
              }}
            >
              <FeedingBowlIcon />
              {fedTodayPointIds.has(p.id) ? (
                <View
                  style={{
                    position: 'absolute',
                    right: -6,
                    top: -6,
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    backgroundColor: '#2EAF62',
                    borderWidth: 1,
                    borderColor: '#fff',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>✓</Text>
                </View>
              ) : null}
            </View>
          </Marker>
        ))}
      </MapView>
      <View style={{ position: 'absolute', top: 58, left: 18, right: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => router.replace('/home')} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 11 }}>
          <Text style={{ fontSize: 20 }}>‹</Text>
        </TouchableOpacity>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 }}>
          <Text style={{ fontWeight: '800', color: colors.text }}>Mama & Su Noktaları</Text>
        </View>
        <TouchableOpacity onPress={recenterToCurrentLocation} style={{ backgroundColor: colors.primary, borderRadius: 14, padding: 11 }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>{isLocating ? '...' : 'Konum'}</Text>
        </TouchableOpacity>
      </View>
      <Animated.View
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 10,
          height: SHEET_HEIGHT,
          backgroundColor: '#fff',
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.border,
          transform: [{ translateY: sheetY }],
        }}
      >
        <View {...sheetPanResponder.panHandlers} style={{ paddingTop: 10, paddingBottom: 10, alignItems: 'center' }}>
          <View style={{ width: 44, height: 5, borderRadius: 999, backgroundColor: '#D7DDD8' }} />
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          {selectedPoint ? (
            <>
              <Text style={{ fontWeight: '800', color: colors.text, fontSize: 18 }}>{selectedPoint.name}</Text>
              <Text style={{ color: colors.muted, marginTop: 6 }}>{selectedPoint.status}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>
                {selectedPoint.lat.toFixed(5)}, {selectedPoint.lng.toFixed(5)}
              </Text>

              {selectedPoint.photoUri ? (
                <Image
                  source={{ uri: selectedPoint.photoUri }}
                  style={{ marginTop: 12, width: '100%', height: 170, borderRadius: 12, backgroundColor: '#E7ECE8' }}
                  resizeMode="cover"
                />
              ) : null}

              {isCommunityAdmin ? (
                <TouchableOpacity
                  onPress={() => openEditPoint(selectedPoint.id)}
                  style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, marginTop: 16 }}
                >
                  <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>Noktayi Düzenle</Text>
                </TouchableOpacity>
              ) : null}

              <Text style={{ fontWeight: '800', color: colors.text, marginTop: 18, fontSize: 15 }}>Son 5 Besleme</Text>
              {selectedPointRecords.length > 0 ? (
                <View style={{ marginTop: 10, gap: 8 }}>
                  {selectedPointRecords.map((record) => (
                    <View key={record.id} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
                      <Text style={{ color: colors.text, fontWeight: '700' }}>{record.fedAt}</Text>
                      <Text style={{ color: colors.muted, marginTop: 2 }}>Besleyen: {record.feederName}</Text>
                      {record.note ? <Text style={{ color: colors.muted, marginTop: 2 }}>Not: {record.note}</Text> : null}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ color: colors.muted, marginTop: 8 }}>Bu nokta için henüz besleme kaydı yok.</Text>
              )}
            </>
          ) : (
            <>
              <Text style={{ fontWeight: '800', color: colors.text, fontSize: 17 }}>Mama Nokta Detayi</Text>
              <Text style={{ color: colors.muted, marginTop: 8 }}>
                Haritadaki bir mama noktasına dokun. Detayları burada açılır, paneli yukarı kaydırarak genişletebilirsin.
              </Text>
            </>
          )}
        </View>
      </Animated.View>
    </View>
  );
}
