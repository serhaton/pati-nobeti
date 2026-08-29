import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { Card } from '../src/components/Card';
import { useAuth } from '../src/context/AuthContext';
import { colors } from '../src/theme';
import { getInboxNotificationsByEmail, InboxNotificationRecord } from '../src/services/notificationInboxService';

const PAGE_SIZE = 20;

function decisionLabel(status: InboxNotificationRecord['decisionStatus']): string {
  if (status === 'approved') return 'Onaylandı';
  if (status === 'rejected') return 'Reddedildi';
  if (status === 'pending') return 'Beklemede';
  return 'Bilgi';
}

function decisionStyle(status: InboxNotificationRecord['decisionStatus']) {
  if (status === 'approved') return { bg: '#EAF7ED', text: '#2F7A44' };
  if (status === 'rejected') return { bg: '#FDECEC', text: '#A94842' };
  if (status === 'pending') return { bg: '#FFF4D6', text: '#94601F' };
  return { bg: '#EEF0F4', text: '#596275' };
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('tr-TR');
}

export default function NotificationsScreen() {
  const params = useLocalSearchParams<{ source?: string }>();
  const { currentUser } = useAuth();
  const source = Array.isArray(params.source) ? params.source[0] : params.source;

  const [rows, setRows] = useState<InboxNotificationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  function goBackBySource() {
    if (source === 'profile') {
      router.replace({ pathname: '/profile', params: { source: 'home' } });
      return;
    }
    router.back();
  }

  const normalizedEmail = useMemo(
    () => String(currentUser?.email ?? '').trim().toLowerCase(),
    [currentUser?.email]
  );

  const loadFirstPage = useCallback(async () => {
    if (!normalizedEmail) {
      setRows([]);
      setHasMore(false);
      return;
    }

    setIsLoading(true);
    try {
      const page = await getInboxNotificationsByEmail({
        email: normalizedEmail,
        offset: 0,
        limit: PAGE_SIZE,
      });
      setRows(page.rows);
      setHasMore(page.hasMore);
    } finally {
      setIsLoading(false);
    }
  }, [normalizedEmail]);

  const loadMore = useCallback(async () => {
    if (!normalizedEmail || isLoading || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const page = await getInboxNotificationsByEmail({
        email: normalizedEmail,
        offset: rows.length,
        limit: PAGE_SIZE,
      });
      setRows((prev) => [...prev, ...page.rows]);
      setHasMore(page.hasMore);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoading, isLoadingMore, normalizedEmail, rows.length]);

  useFocusEffect(
    useCallback(() => {
      void loadFirstPage();
    }, [loadFirstPage])
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 58 }}>
      <View style={{ paddingHorizontal: 20 }}>
        <TouchableOpacity onPress={goBackBySource} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Bildirimlerim</Text>
        <Text style={{ color: colors.muted, marginTop: 5 }}>En yeni kayıtlar en üstte gösterilir.</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 44 }}
        onEndReachedThreshold={0.3}
        onEndReached={() => {
          void loadMore();
        }}
        refreshing={isLoading}
        onRefresh={() => {
          void loadFirstPage();
        }}
        ListEmptyComponent={!isLoading ? (
          <Card style={{ marginTop: 14 }}>
            <Text style={{ color: colors.muted }}>Henüz bildirim kaydı yok.</Text>
          </Card>
        ) : null}
        ListFooterComponent={isLoadingMore ? (
          <View style={{ alignItems: 'center', marginTop: 10 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.muted, marginTop: 6 }}>Daha fazla yükleniyor...</Text>
          </View>
        ) : null}
        renderItem={({ item, index }) => {
          const tone = decisionStyle(item.decisionStatus);
          return (
            <Card style={{ marginTop: index === 0 ? 14 : 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{item.title}</Text>
                  <Text style={{ color: colors.muted, marginTop: 4 }}>{item.body}</Text>
                </View>
                <View style={{ backgroundColor: tone.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ color: tone.text, fontWeight: '800', fontSize: 12 }}>{decisionLabel(item.decisionStatus)}</Text>
                </View>
              </View>

              <Text style={{ color: colors.muted, marginTop: 8, fontSize: 12 }}>{formatDateTime(item.createdAt)}</Text>

              {item.decisionNote ? (
                <View style={{ marginTop: 9, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, padding: 10 }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>Onay/Red Notu</Text>
                  <Text style={{ color: colors.muted, marginTop: 4, fontSize: 12 }}>{item.decisionNote}</Text>
                </View>
              ) : null}
            </Card>
          );
        }}
      />
    </View>
  );
}
