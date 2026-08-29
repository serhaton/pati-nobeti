import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
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
        <Text style={{ color: colors.muted, marginTop: 5 }}>Geçmiş görünümü. En yeni kayıtlar üstte.</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 30 }}
        onEndReachedThreshold={0.3}
        onEndReached={() => {
          void loadMore();
        }}
        refreshing={isLoading}
        onRefresh={() => {
          void loadFirstPage();
        }}
        ListEmptyComponent={!isLoading ? (
          <View style={{ marginTop: 18, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#F7F8FA', paddingVertical: 14, paddingHorizontal: 12 }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Henüz bildirim kaydı yok.</Text>
          </View>
        ) : null}
        ListFooterComponent={isLoadingMore ? (
          <View style={{ alignItems: 'center', marginTop: 14 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.muted, marginTop: 6, fontSize: 12 }}>Daha fazla yükleniyor...</Text>
          </View>
        ) : null}
        renderItem={({ item, index }) => {
          const tone = decisionStyle(item.decisionStatus);
          return (
            <View
              style={{
                marginTop: index === 0 ? 4 : 0,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                flexDirection: 'row',
                gap: 10,
              }}
            >
              <View style={{ width: 10, alignItems: 'center', paddingTop: 5 }}>
                <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: tone.text }} />
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <View style={{ flex: 1, paddingRight: 6 }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, lineHeight: 19 }}>{item.title}</Text>
                    <Text style={{ color: colors.muted, marginTop: 3, fontSize: 13, lineHeight: 18 }}>{item.body}</Text>
                  </View>

                  <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ color: tone.text, fontWeight: '800', fontSize: 11 }}>{decisionLabel(item.decisionStatus)}</Text>
                  </View>
                </View>

                <Text style={{ color: colors.muted, marginTop: 6, fontSize: 11 }}>{formatDateTime(item.createdAt)}</Text>

              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
