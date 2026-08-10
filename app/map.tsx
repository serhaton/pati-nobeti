import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, View, Text, TouchableOpacity } from 'react-native';
import MapView, { LongPressEvent, Marker } from 'react-native-maps';
import { FeedingPoint, FeedingRecord, getAllFeedingPoints, getRecentFeedingRecords } from '../src/data/feedingPointStore';
import { colors } from '../src/theme';

const SHEET_HEIGHT = 300;
const SHEET_COLLAPSED_Y = 215;
const SHEET_EXPANDED_Y = 0;

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
  const params = useLocalSearchParams<{ focusLat?: string; focusLng?: string; focusId?: string; refresh?: string }>();
  const mapRef = useRef<MapView | null>(null);
  const hasUserInteractedRef = useRef(false);
  const sheetY = useRef(new Animated.Value(SHEET_COLLAPSED_Y)).current;
  const dragStartY = useRef(SHEET_COLLAPSED_Y);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [points, setPoints] = useState<FeedingPoint[]>(() => getAllFeedingPoints());
  const [selectedPoint, setSelectedPoint] = useState<FeedingPoint | null>(null);
  const [highlightedPointId, setHighlightedPointId] = useState<string | null>(null);
  const focusLatitude = useMemo(() => Number(params.focusLat), [params.focusLat]);
  const focusLongitude = useMemo(() => Number(params.focusLng), [params.focusLng]);
  const selectedPointRecords = useMemo<FeedingRecord[]>(() => {
    if (!selectedPoint) return [];
    return getRecentFeedingRecords(selectedPoint.id, 5);
  }, [selectedPoint]);

  useFocusEffect(
    useCallback(() => {
      setPoints(getAllFeedingPoints());

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

  function openCreatePointFromPress(event: LongPressEvent) {
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

    async function zoomToCurrentLocation() {
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

      mapRef.current?.animateToRegion(
        {
          latitude: coords.latitude,
          longitude: coords.longitude,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        },
        700
      );
    }

    zoomToCurrentLocation();

    return () => {
      mounted = false;
    };
  }, [focusLatitude, focusLongitude]);

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        showsUserLocation
        showsMyLocationButton
        onPanDrag={() => {
          hasUserInteractedRef.current = true;
        }}
        onPress={() => {
          hasUserInteractedRef.current = true;
        }}
        onLongPress={openCreatePointFromPress}
        initialRegion={{ latitude: 40.987, longitude: 29.026, latitudeDelta: 0.025, longitudeDelta: 0.025 }}
      >
        {currentLocation && (
          <Marker coordinate={currentLocation} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text }}>Buradasın</Text>
              </View>
              <View style={{ width: 16, height: 16, borderRadius: 999, backgroundColor: '#2F80ED', borderWidth: 2, borderColor: '#fff' }} />
            </View>
          </Marker>
        )}
        {points.map(p => (
          <Marker key={p.id} coordinate={{ latitude: p.lat, longitude: p.lng }} onPress={() => onPointMarkerPress(p)}>
            <View
              style={{
                backgroundColor: highlightedPointId === p.id ? colors.accent : colors.primary,
                padding: 8,
                borderRadius: 18,
                borderWidth: highlightedPointId === p.id ? 3 : 2,
                borderColor: '#fff',
              }}
            >
              <FeedingBowlIcon />
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

              <TouchableOpacity
                onPress={() => openEditPoint(selectedPoint.id)}
                style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, marginTop: 16 }}
              >
                <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>Noktayi Duzenle</Text>
              </TouchableOpacity>

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
                <Text style={{ color: colors.muted, marginTop: 8 }}>Bu nokta icin henuz besleme kaydi yok.</Text>
              )}
            </>
          ) : (
            <>
              <Text style={{ fontWeight: '800', color: colors.text, fontSize: 17 }}>Mama Nokta Detayi</Text>
              <Text style={{ color: colors.muted, marginTop: 8 }}>
                Haritadaki bir mama noktasina dokun. Detaylari burada acilir, paneli yukari kaydirarak genisletebilirsin.
              </Text>
            </>
          )}
        </View>
      </Animated.View>
    </View>
  );
}
