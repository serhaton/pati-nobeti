import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, View, Text, TouchableOpacity, TextInput } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { FeedingPoint, addFeedingRecord, getFeedingPointsByCommunity } from '../src/data/feedingPointStore';
import { colors } from '../src/theme';
import { Card } from '../src/components/Card';

export default function Feeding() {
  const { currentUser } = useAuth();
  const { selectedCommunity } = useCommunity();
  const [showPointPicker, setShowPointPicker] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedPointId, setSelectedPointId] = useState('');
  const [feederName, setFeederName] = useState(currentUser?.fullName ?? '');
  const [feedingDateTime, setFeedingDateTime] = useState(new Date());
  const [note, setNote] = useState('');

  const communityPoints = useMemo<FeedingPoint[]>(() => {
    if (!selectedCommunity) return [];
    return getFeedingPointsByCommunity(selectedCommunity.id, searchText);
  }, [selectedCommunity, searchText]);

  const allCommunityPoints = useMemo<FeedingPoint[]>(() => {
    if (!selectedCommunity) return [];
    return getFeedingPointsByCommunity(selectedCommunity.id);
  }, [selectedCommunity]);

  const selectedPoint = useMemo(
    () => allCommunityPoints.find((point) => point.id === selectedPointId) ?? null,
    [allCommunityPoints, selectedPointId]
  );

  useEffect(() => {
    if (!feederName && currentUser?.fullName) {
      setFeederName(currentUser.fullName);
    }
  }, [currentUser?.fullName, feederName]);

  function onDateChange(_: any, selected?: Date) {
    if (!selected) return;

    const next = new Date(feedingDateTime);
    next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    setFeedingDateTime(next);
  }

  function onTimeChange(_: any, selected?: Date) {
    if (!selected) return;

    const next = new Date(feedingDateTime);
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    setFeedingDateTime(next);
  }

  function saveFeedingLog() {
    if (!selectedCommunity) {
      Alert.alert('Topluluk secilmedi', 'Besleme kaydi icin once topluluk secmelisin.');
      return;
    }

    if (!selectedPoint) {
      Alert.alert('Nokta secilmedi', 'Lutfen listeden bir besleme noktasi sec.');
      return;
    }

    if (!feederName.trim()) {
      Alert.alert('Eksik bilgi', 'Lutfen besleme yapan kisinin adini gir.');
      return;
    }

    const created = addFeedingRecord({
      pointId: selectedPoint.id,
      feederName: feederName.trim(),
      note: note.trim() ? note.trim() : undefined,
      fedAt: feedingDateTime,
    });

    if (!created) {
      Alert.alert('Kayit hatasi', 'Besleme kaydi olusturulamadi.');
      return;
    }

    router.replace({
      pathname: '/map',
      params: {
        focusLat: String(selectedPoint.lat),
        focusLng: String(selectedPoint.lng),
        focusId: selectedPoint.id,
        refresh: String(Date.now()),
      },
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 58 }}>
      <TouchableOpacity onPress={() => router.back()}><Text style={{ fontSize: 30 }}>‹</Text></TouchableOpacity>
      <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Besleme Kaydi</Text>
      <Text style={{ color: colors.muted, marginTop: 5 }}>Kim ne zaman besleme yaptiysa kaydet.</Text>
      <Card style={{ marginTop: 22 }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>Besleme noktasi</Text>
        <TouchableOpacity
          onPress={() => setShowPointPicker((value) => !value)}
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
        >
          <Text style={{ color: selectedPoint ? colors.text : colors.muted, fontWeight: selectedPoint ? '700' : '500' }}>
            {selectedPoint ? selectedPoint.name : 'Besleme noktasi sec'}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 4, fontSize: 12 }}>
            {showPointPicker ? 'Listeyi kapat ▲' : 'Listeden secmek icin dokun ▼'}
          </Text>
        </TouchableOpacity>

        {showPointPicker ? (
          <>
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Topluluk noktalari icinde ara"
              style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
            />

            <View style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: '#fff', maxHeight: 180 }}>
              {communityPoints.length > 0 ? (
                communityPoints.slice(0, 8).map((point) => (
                  <TouchableOpacity
                    key={point.id}
                    onPress={() => {
                      setSelectedPointId(point.id);
                      setShowPointPicker(false);
                    }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 11,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                      backgroundColor: selectedPointId === point.id ? colors.primarySoft : '#fff',
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{point.name}</Text>
                    <Text style={{ color: colors.muted, marginTop: 3, fontSize: 12 }}>{point.status}</Text>
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={{ color: colors.muted, padding: 12 }}>Bu toplulukta aramaya uygun nokta bulunamadi.</Text>
              )}
            </View>
          </>
        ) : null}

        {selectedPoint ? (
          <Text style={{ color: colors.primary, marginTop: 8, fontWeight: '700' }}>Secilen nokta: {selectedPoint.name}</Text>
        ) : (
          <Text style={{ color: colors.muted, marginTop: 8 }}>Kaydetmeden once bir nokta sec.</Text>
        )}

        <Text style={{ fontWeight: '800', color: colors.text, marginTop: 18 }}>Besleme yapan</Text>
        <TextInput
          value={feederName}
          onChangeText={setFeederName}
          placeholder="Orn. Serhat Onal"
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
        />

        <Text style={{ fontWeight: '800', color: colors.text, marginTop: 18 }}>Tarih ve Saat</Text>
        <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: '#fff', paddingVertical: 6 }}>
            <DateTimePicker
              value={feedingDateTime}
              mode="date"
              display={Platform.OS === 'ios' ? 'compact' : 'default'}
              onChange={onDateChange}
            />
          </View>
          <View style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: '#fff', paddingVertical: 6 }}>
            <DateTimePicker
              value={feedingDateTime}
              mode="time"
              display={Platform.OS === 'ios' ? 'compact' : 'default'}
              onChange={onTimeChange}
            />
          </View>
        </View>
        <Text style={{ color: colors.muted, marginTop: 8, fontSize: 12 }}>Varsayilan tarih ve saat simdiki zamanla gelir, istersen iOS picker ile degistirebilirsin.</Text>

        <Text style={{ fontWeight: '800', color: colors.text, marginTop: 18 }}>Not</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Istege bagli"
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
        />
      </Card>
      <TouchableOpacity onPress={saveFeedingLog} style={{ backgroundColor: colors.primary, borderRadius: 15, padding: 17, marginTop: 15 }}><Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>Besleme Kaydini Ekle</Text></TouchableOpacity>
    </View>
  );
}
