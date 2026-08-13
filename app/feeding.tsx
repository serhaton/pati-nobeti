import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, ScrollView, View, Text, TouchableOpacity, TextInput } from 'react-native';
import { BottomBannerAd } from '../src/components/BottomBannerAd';
import { useCommunity } from '../src/context/CommunityContext';
import { Card } from '../src/components/Card';
import { FeedingPoint, FeedingRecord, getFeedingPointsByCommunity, getFeedingRecordsByCommunity } from '../src/data/feedingPointStore';
import { getCommunityMembers } from '../src/data/mock';
import { colors } from '../src/theme';

const PAGE_SIZE = 4;
const MEMBER_FILTER_MAX_HEIGHT = 260;

export default function Feeding() {
  const { selectedCommunity } = useCommunity();
  const [refreshTick, setRefreshTick] = useState(0);
  const [showPointPicker, setShowPointPicker] = useState(false);
  const [showFeederPicker, setShowFeederPicker] = useState(false);
  const [pointSearchText, setPointSearchText] = useState('');
  const [feederSearchText, setFeederSearchText] = useState('');
  const [selectedPointId, setSelectedPointId] = useState<string | undefined>(undefined);
  const [feederFilter, setFeederFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [canLoadMoreFromScroll, setCanLoadMoreFromScroll] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setRefreshTick((value) => value + 1);
    }, [])
  );

  const communityPoints = useMemo<FeedingPoint[]>(() => {
    if (!selectedCommunity) return [];
    return getFeedingPointsByCommunity(selectedCommunity.id, pointSearchText);
  }, [pointSearchText, selectedCommunity]);

  const allCommunityPoints = useMemo<FeedingPoint[]>(() => {
    if (!selectedCommunity) return [];
    return getFeedingPointsByCommunity(selectedCommunity.id);
  }, [selectedCommunity]);

  const selectedPoint = useMemo(() => {
    if (!selectedPointId) return null;
    return allCommunityPoints.find((point) => point.id === selectedPointId) ?? null;
  }, [allCommunityPoints, selectedPointId]);

  const records = useMemo<FeedingRecord[]>(() => {
    if (!selectedCommunity) return [];
    return getFeedingRecordsByCommunity(selectedCommunity.id, {
      pointId: selectedPointId,
      feederName: feederFilter,
    });
  }, [feederFilter, refreshTick, selectedCommunity, selectedPointId]);

  const communityMembers = useMemo(() => {
    if (!selectedCommunity) return [];

    const memberNames = getCommunityMembers(selectedCommunity.id)
      .filter((member) => !!member.user?.fullName)
      .map((member) => member.user!.fullName);

    return Array.from(new Set(memberNames))
      .sort((left, right) => left.localeCompare(right, 'tr-TR'));
  }, [selectedCommunity]);

  const filteredCommunityMembers = useMemo(() => {
    const normalized = feederSearchText.trim().toLowerCase();
    if (!normalized) return communityMembers;
    return communityMembers.filter((fullName) => fullName.toLowerCase().includes(normalized));
  }, [communityMembers, feederSearchText]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setCanLoadMoreFromScroll(false);
  }, [selectedCommunity?.id, selectedPointId, feederFilter, refreshTick]);

  const visibleRecords = useMemo(() => records.slice(0, visibleCount), [records, visibleCount]);

  function loadMoreRecords() {
    if (visibleCount >= records.length) return;
    setVisibleCount((count) => Math.min(records.length, count + PAGE_SIZE));
  }

  function handleListScroll(event: any) {
    if (!canLoadMoreFromScroll) return;

    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (layoutMeasurement.height + contentOffset.y);

    if (distanceFromBottom <= 120) {
      loadMoreRecords();
      setCanLoadMoreFromScroll(false);
    }
  }

  if (!selectedCommunity) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 120 }}
        data={visibleRecords}
        keyExtractor={(record) => record.id}
        onEndReached={() => {
          if (!canLoadMoreFromScroll) return;
          loadMoreRecords();
          setCanLoadMoreFromScroll(false);
        }}
        onEndReachedThreshold={0.35}
        onScroll={handleListScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => setCanLoadMoreFromScroll(true)}
        onMomentumScrollBegin={() => setCanLoadMoreFromScroll(true)}
        ListHeaderComponent={(
        <>
      <TouchableOpacity onPress={() => router.replace('/home')}><Text style={{ fontSize: 30 }}>‹</Text></TouchableOpacity>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <View>
          <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text }}>Besleme Kayıtları</Text>
          <Text style={{ color: colors.muted }}>{visibleRecords.length}/{records.length} kayıt gösteriliyor</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/feeding-create')} style={{ backgroundColor: colors.primary, padding: 13, borderRadius: 15 }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>＋</Text>
        </TouchableOpacity>
      </View>

      <Card style={{ marginTop: 22 }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>Filtreler</Text>

        <Text style={{ fontWeight: '700', color: colors.text, marginTop: 14 }}>Mama noktası (opsiyonel)</Text>
        <TouchableOpacity
          onPress={() => setShowPointPicker((value) => !value)}
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
        >
          <Text style={{ color: selectedPoint ? colors.text : colors.muted, fontWeight: selectedPoint ? '700' : '500' }}>
            {selectedPoint ? selectedPoint.name : 'Tüm noktalar'}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 4, fontSize: 12 }}>
            {showPointPicker ? 'Listeyi kapat ▲' : 'Nokta seçmek için dokun ▼'}
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
                <Text style={{ fontWeight: '800', color: colors.text, fontSize: 16 }}>Topluluk Noktası Filtresi</Text>

                <TextInput
                  value={pointSearchText}
                  onChangeText={setPointSearchText}
                  placeholder="Topluluk noktalari içinde ara"
                  style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
                />

                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: '#fff', maxHeight: MEMBER_FILTER_MAX_HEIGHT }}
                  contentContainerStyle={{ paddingBottom: 10 }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedPointId(undefined);
                      setShowPointPicker(false);
                    }}
                    style={{ paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: !selectedPointId ? colors.primarySoft : '#fff' }}
                  >
                    <Text style={{ color: colors.text, fontWeight: '700' }}>Tüm noktalar</Text>
                  </TouchableOpacity>

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

        <Text style={{ fontWeight: '700', color: colors.text, marginTop: 16 }}>Besleyen kisi (opsiyonel)</Text>
        <TouchableOpacity
          onPress={() => setShowFeederPicker((value) => !value)}
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
        >
          <Text style={{ color: feederFilter ? colors.text : colors.muted, fontWeight: feederFilter ? '700' : '500' }}>
            {feederFilter || 'Tüm üyeler'}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 4, fontSize: 12 }}>
            {showFeederPicker ? 'Listeyi kapat ▲' : 'Üyeler listesinden seç ▼'}
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
                <Text style={{ fontWeight: '800', color: colors.text, fontSize: 16 }}>Besleyen Kisi Filtresi</Text>

                <TextInput
                  value={feederSearchText}
                  onChangeText={setFeederSearchText}
                  placeholder="Üyelerde ara"
                  style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
                />

                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: '#fff', maxHeight: MEMBER_FILTER_MAX_HEIGHT }}
                  contentContainerStyle={{ paddingBottom: 10 }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      setFeederFilter('');
                      setShowFeederPicker(false);
                    }}
                    style={{ minHeight: 44, paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: !feederFilter ? colors.primarySoft : '#fff', justifyContent: 'center' }}
                  >
                    <Text style={{ color: colors.text, fontWeight: '700' }}>Tüm üyeler</Text>
                  </TouchableOpacity>

                  {filteredCommunityMembers.length > 0 ? (
                    filteredCommunityMembers.map((fullName) => (
                      <TouchableOpacity
                        key={fullName}
                        onPress={() => {
                          setFeederFilter(fullName);
                          setShowFeederPicker(false);
                        }}
                        style={{
                          minHeight: 44,
                          paddingHorizontal: 12,
                          paddingVertical: 11,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border,
                          backgroundColor: feederFilter === fullName ? colors.primarySoft : '#fff',
                          justifyContent: 'center',
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
      </Card>

        </>
      )}
      renderItem={({ item, index }) => {
        const point = allCommunityPoints.find((pointItem) => pointItem.id === item.pointId);
        return (
          <TouchableOpacity onPress={() => router.push({ pathname: '/feeding-edit', params: { id: item.id } })}>
            <Card style={{ marginTop: index === 0 ? 14 : 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: colors.text }}>{point?.name ?? 'Bilinmeyen nokta'}</Text>
                  <Text style={{ color: colors.muted, marginTop: 5 }}>{item.fedAt}</Text>
                </View>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>Düzenle</Text>
              </View>
              <Text style={{ color: colors.text, marginTop: 10 }}>Besleyen: {item.feederName}</Text>
              {item.note ? <Text style={{ color: colors.muted, marginTop: 4 }}>Not: {item.note}</Text> : null}
            </Card>
          </TouchableOpacity>
        );
      }}
        ListEmptyComponent={(
        <Card style={{ marginTop: 14 }}>
          <Text style={{ color: colors.muted }}>Filtreye uygun besleme kaydı bulunamadı.</Text>
        </Card>
        )}
      />
      <BottomBannerAd />
    </View>
  );
}
