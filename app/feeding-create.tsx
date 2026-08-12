import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Card } from '../src/components/Card';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { FeedingPoint, addFeedingRecord, getFeedingPointsByCommunity } from '../src/data/feedingPointStore';
import { getCommunityMembers } from '../src/data/mock';
import { colors } from '../src/theme';

const PICKER_MODAL_MAX_HEIGHT = 260;

export default function FeedingCreateScreen() {
  const { currentUser } = useAuth();
  const { selectedCommunity } = useCommunity();
  const [showPointPicker, setShowPointPicker] = useState(false);
  const [showFeederPicker, setShowFeederPicker] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [feederSearchText, setFeederSearchText] = useState('');
  const [selectedPointId, setSelectedPointId] = useState('');
  const [selectedFeederName, setSelectedFeederName] = useState(currentUser?.fullName ?? '');
  const [feedingDateTime, setFeedingDateTime] = useState(new Date());
  const [note, setNote] = useState('');

  const communityPoints = useMemo<FeedingPoint[]>(() => {
    if (!selectedCommunity) return [];
    return getFeedingPointsByCommunity(selectedCommunity.id, searchText);
  }, [searchText, selectedCommunity]);

  const allCommunityPoints = useMemo<FeedingPoint[]>(() => {
    if (!selectedCommunity) return [];
    return getFeedingPointsByCommunity(selectedCommunity.id);
  }, [selectedCommunity]);

  const selectedPoint = useMemo(
    () => allCommunityPoints.find((point) => point.id === selectedPointId) ?? null,
    [allCommunityPoints, selectedPointId]
  );

  const communityMembers = useMemo(() => {
    if (!selectedCommunity) return [];

    return getCommunityMembers(selectedCommunity.id)
      .filter((member) => member.status === 'active' && member.user?.status === 'active' && !!member.user?.fullName)
      .map((member) => member.user!.fullName)
      .sort((left, right) => left.localeCompare(right, 'tr-TR'));
  }, [selectedCommunity]);

  const filteredCommunityMembers = useMemo(() => {
    const normalized = feederSearchText.trim().toLowerCase();
    if (!normalized) return communityMembers;
    return communityMembers.filter((fullName) => fullName.toLowerCase().includes(normalized));
  }, [communityMembers, feederSearchText]);

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

  async function saveFeedingLog() {
    if (!selectedCommunity) {
      Alert.alert('Topluluk seçilmedi', 'Besleme kaydı için önce topluluk seçmelisin.');
      return;
    }

    if (!selectedPoint) {
      Alert.alert('Nokta seçilmedi', 'Lütfen listeden bir besleme noktası seç.');
      return;
    }

    if (!selectedFeederName.trim()) {
      Alert.alert('Eksik bilgi', 'Lütfen topluluk uyelerinden besleme yapan kisiyi seç.');
      return;
    }

    if (feedingDateTime.getTime() > Date.now()) {
      Alert.alert('Geçersiz tarih', 'İleri tarihli besleme kaydı giremezsin.');
      return;
    }

    try {
      const created = await addFeedingRecord({
        pointId: selectedPoint.id,
        feederName: selectedFeederName.trim(),
        note: note.trim() ? note.trim() : undefined,
        fedAt: feedingDateTime,
        fedByUserId: currentUser?.id,
      });

      if (!created) {
        Alert.alert('Kayıt hatası', 'Besleme kaydı oluşturulamadı.');
        return;
      }

      router.replace('/feeding');
    } catch (error: any) {
      Alert.alert('Supabase kayıt hatası', String(error?.message ?? 'Besleme kaydı kaydedilemedi.'));
    }
  }

  if (!selectedCommunity) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 34 }}>
      <TouchableOpacity onPress={() => router.back()}><Text style={{ fontSize: 30 }}>‹</Text></TouchableOpacity>
      <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Besleme Kaydı Ekle</Text>
      <Text style={{ color: colors.muted, marginTop: 5 }}>Yeni besleme kaydını topluluk listesine ekle.</Text>

      <Card style={{ marginTop: 22 }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>Besleme noktası</Text>
        <TouchableOpacity
          onPress={() => setShowPointPicker((value) => !value)}
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
        >
          <Text style={{ color: selectedPoint ? colors.text : colors.muted, fontWeight: selectedPoint ? '700' : '500' }}>
            {selectedPoint ? selectedPoint.name : 'Besleme noktası seç'}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 4, fontSize: 12 }}>
            {showPointPicker ? 'Listeyi kapat ▲' : 'Listeden seçmek için dokun ▼'}
          </Text>
        </TouchableOpacity>

        {showPointPicker ? (
          <Modal
            visible={showPointPicker}
            transparent
            animationType="fade"
            onRequestClose={() => setShowPointPicker(false)}
          >
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', padding: 20 }}>
              <Card style={{ borderRadius: 14, maxHeight: '75%' }}>
                <Text style={{ fontWeight: '800', color: colors.text, fontSize: 16 }}>Besleme Noktası Seçimi</Text>

                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Topluluk noktalari içinde ara"
                  style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
                />

                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: '#fff', maxHeight: PICKER_MODAL_MAX_HEIGHT }}
                  contentContainerStyle={{ paddingBottom: 10 }}
                >
                  {communityPoints.length > 0 ? (
                    communityPoints.map((point) => (
                      <TouchableOpacity
                        key={point.id}
                        onPress={() => {
                          setSelectedPointId(point.id);
                          setShowPointPicker(false);
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 12,
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
                    <Text style={{ color: colors.muted, padding: 12 }}>Bu toplulukta aramaya uygun nokta bulunamadı.</Text>
                  )}
                </ScrollView>

                <TouchableOpacity
                  onPress={() => setShowPointPicker(false)}
                  style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 11, backgroundColor: '#fff' }}
                >
                  <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Kapat</Text>
                </TouchableOpacity>
              </Card>
            </View>
          </Modal>
        ) : null}

        <Text style={{ fontWeight: '800', color: colors.text, marginTop: 18 }}>Besleme yapan</Text>
        <TouchableOpacity
          onPress={() => setShowFeederPicker((value) => !value)}
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
        >
          <Text style={{ color: selectedFeederName ? colors.text : colors.muted, fontWeight: selectedFeederName ? '700' : '500' }}>
            {selectedFeederName || 'Topluluk uyelerinden seç'}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 4, fontSize: 12 }}>
            {showFeederPicker ? 'Listeyi kapat ▲' : 'Üyeler listesini ac ▼'}
          </Text>
        </TouchableOpacity>

        {showFeederPicker ? (
          <Modal
            visible={showFeederPicker}
            transparent
            animationType="fade"
            onRequestClose={() => setShowFeederPicker(false)}
          >
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', padding: 20 }}>
              <Card style={{ borderRadius: 14, maxHeight: '75%' }}>
                <Text style={{ fontWeight: '800', color: colors.text, fontSize: 16 }}>Besleme Yapan Seçimi</Text>

                <TextInput
                  value={feederSearchText}
                  onChangeText={setFeederSearchText}
                  placeholder="Üyelerde ara"
                  style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
                />

                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: '#fff', maxHeight: PICKER_MODAL_MAX_HEIGHT }}
                  contentContainerStyle={{ paddingBottom: 10 }}
                >
                  {filteredCommunityMembers.length > 0 ? (
                    filteredCommunityMembers.map((fullName) => (
                      <TouchableOpacity
                        key={fullName}
                        onPress={() => {
                          setSelectedFeederName(fullName);
                          setShowFeederPicker(false);
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border,
                          backgroundColor: selectedFeederName === fullName ? colors.primarySoft : '#fff',
                        }}
                      >
                        <Text style={{ color: colors.text, fontWeight: '700' }}>{fullName}</Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={{ color: colors.muted, padding: 12 }}>Aramaya uygun topluluk üyesi bulunamadı.</Text>
                  )}
                </ScrollView>

                <TouchableOpacity
                  onPress={() => setShowFeederPicker(false)}
                  style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 11, backgroundColor: '#fff' }}
                >
                  <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Kapat</Text>
                </TouchableOpacity>
              </Card>
            </View>
          </Modal>
        ) : null}

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

        <Text style={{ fontWeight: '800', color: colors.text, marginTop: 18 }}>Not</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="İsteğe bağlı"
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
        />
      </Card>

      <TouchableOpacity onPress={saveFeedingLog} style={{ backgroundColor: colors.primary, borderRadius: 15, padding: 17, marginTop: 15 }}>
        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>Besleme Kaydini Ekle</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
