import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Card } from '../src/components/Card';
import { BottomBannerAd } from '../src/components/BottomBannerAd';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { colors } from '../src/theme';
import { getCommunityMembers } from '../src/data/mock';
import { uploadExpenseReceiptsIfNeeded } from '../src/services/supabaseStorage';
import { ExpenseRecord, getApprovedExpensesByCommunity } from '../src/services/expenseService';
import {
  ContributionRecord,
  createContribution,
  getContributionsByCommunity,
  getContributionsByContributor,
  removeContributionAllocation,
} from '../src/services/contributionService';
import { downloadAndOpenRemoteFile } from '../src/services/fileDownload';

type LocalReceiptFile = {
  uri: string;
  name: string;
};

type MemberOption = {
  userId: string;
  fullName: string;
};

function sanitizeAmountInput(value: string): string {
  return value.replace(/[^0-9.,]/g, '');
}

function parseAmountText(value: string): number {
  const trimmed = value.trim().replace(/\s/g, '');
  if (!trimmed) return Number.NaN;

  const sanitized = sanitizeAmountInput(trimmed);
  if (!sanitized) return Number.NaN;

  const lastCommaIndex = sanitized.lastIndexOf(',');
  const lastDotIndex = sanitized.lastIndexOf('.');
  const decimalIndex = Math.max(lastCommaIndex, lastDotIndex);

  let integerPart = sanitized;
  let decimalPart = '';

  if (decimalIndex >= 0) {
    integerPart = sanitized.slice(0, decimalIndex);
    decimalPart = sanitized.slice(decimalIndex + 1);
  }

  integerPart = integerPart.replace(/[.,]/g, '');
  decimalPart = decimalPart.replace(/[.,]/g, '');

  if (decimalPart.length > 2) return Number.NaN;

  const normalized = decimalPart ? `${integerPart || '0'}.${decimalPart}` : integerPart;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function contributionStatusLabel(status: ContributionRecord['approvalStatus']): string {
  if (status === 'approved') return 'Onaylandı';
  if (status === 'rejected') return 'Reddedildi';
  return 'Onay bekliyor';
}

function getAllocationPercent(amount: number, remainingAmount: number): number {
  if (amount <= 0) return 0;
  const raw = ((amount - remainingAmount) / amount) * 100;
  const bounded = Math.min(100, Math.max(0, raw));
  return Math.round(bounded);
}

export default function PatiUzat() {
  const params = useLocalSearchParams<{ view?: string; source?: string }>();
  const { currentUser } = useAuth();
  const { selectedCommunity } = useCommunity();
  const selectedCommunityId = selectedCommunity?.id ?? null;
  const source = Array.isArray(params.source) ? params.source[0] : params.source;
  const isCommunityAdmin = !!currentUser && !!selectedCommunity?.adminUserIds.includes(currentUser.id);
  const shouldShowCommunityContributions = isCommunityAdmin && params.view === 'community';

  function goBackBySource() {
    if (source === 'community' || params.view === 'community') {
      router.replace('/community');
      return;
    }
    router.replace('/home');
  }

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [communityMembers, setCommunityMembers] = useState<MemberOption[]>([]);
  const [selectedContributorUserId, setSelectedContributorUserId] = useState<string | null>(currentUser?.id ?? null);
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  const [contributions, setContributions] = useState<ContributionRecord[]>([]);
  const [approvedExpenses, setApprovedExpenses] = useState<ExpenseRecord[]>([]);
  const [visibleCount, setVisibleCount] = useState(4);

  const [transferAt, setTransferAt] = useState<Date>(new Date());
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [receiptFiles, setReceiptFiles] = useState<LocalReceiptFile[]>([]);
  const [selectedReadonlyExpense, setSelectedReadonlyExpense] = useState<ExpenseRecord | null>(null);
  const [selectedAllocationContext, setSelectedAllocationContext] = useState<{ allocationId: string; contributionId: string } | null>(null);
  const [isRemovingAllocation, setIsRemovingAllocation] = useState(false);

  const selectedContributorName = useMemo(() => {
    const found = communityMembers.find((item) => item.userId === selectedContributorUserId);
    if (found) return found.fullName;
    return currentUser?.fullName ?? 'Bilinmiyor';
  }, [communityMembers, currentUser?.fullName, selectedContributorUserId]);

  const memberNameById = useMemo(() => {
    return new Map(communityMembers.map((item) => [item.userId, item.fullName]));
  }, [communityMembers]);

  const approvedExpenseById = useMemo(() => {
    return new Map(approvedExpenses.map((item) => [item.id, item]));
  }, [approvedExpenses]);

  const canManageAllocations = isCommunityAdmin && shouldShowCommunityContributions;

  const visibleContributions = useMemo(() => contributions.slice(0, visibleCount), [contributions, visibleCount]);
  const hasMoreContributions = visibleCount < contributions.length;

  const loadData = useCallback(async () => {
    if (!selectedCommunityId || !currentUser) {
      setCommunityMembers([]);
      setContributions([]);
      setVisibleCount(4);
      return;
    }

    setIsLoading(true);
    try {
      const members = getCommunityMembers(selectedCommunityId)
        .filter((member) => member.status === 'active' && member.user)
        .map((member) => ({
          userId: member.userId,
          fullName: member.user?.fullName ?? member.user?.username ?? member.userId,
        }));

      const [rows, expenseRows] = await Promise.all([
        shouldShowCommunityContributions
          ? getContributionsByCommunity(selectedCommunityId)
          : getContributionsByContributor(selectedCommunityId, currentUser.id),
        getApprovedExpensesByCommunity(selectedCommunityId),
      ]);
      const sortedRows = [...rows].sort((left, right) => right.transferAt.localeCompare(left.transferAt));

      setCommunityMembers(members);
      setContributions(sortedRows);
      setApprovedExpenses(expenseRows);
      setVisibleCount(4);
      setSelectedContributorUserId(currentUser.id);
    } catch (error: any) {
      Alert.alert('Pati Uzat hatası', String(error?.message ?? 'Kayıtlar yüklenemedi.'));
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, selectedCommunityId, shouldShowCommunityContributions]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  function resetForm() {
    setSelectedContributorUserId(currentUser?.id ?? null);
    setShowMemberPicker(false);
    setTransferAt(new Date());
    setAmountText('');
    setNote('');
    setReceiptFiles([]);
  }

  function openCreateModal() {
    resetForm();
    setShowCreateModal(true);
  }

  function loadMoreContributions() {
    if (!hasMoreContributions) return;
    setVisibleCount((current) => current + 4);
  }

  function onDateChange(_: any, selected?: Date) {
    if (!selected) return;

    const next = new Date(transferAt);
    next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    setTransferAt(next);
  }

  function onTimeChange(_: any, selected?: Date) {
    if (!selected) return;

    const next = new Date(transferAt);
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    setTransferAt(next);
  }

  function addReceiptFiles(newFiles: LocalReceiptFile[]) {
    if (!newFiles.length) return;

    setReceiptFiles((current) => {
      const next = [...current];
      for (const file of newFiles) {
        const alreadyAdded = next.some((item) => item.uri === file.uri);
        if (!alreadyAdded) next.push(file);
      }
      return next;
    });
  }

  function removeReceiptFile(uri: string) {
    setReceiptFiles((current) => current.filter((item) => item.uri !== uri));
  }

  async function pickReceiptImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('İzin gerekli', 'Dekont görseli seçmek için galeri izni vermelisin.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });

    if (result.canceled || !result.assets?.length) return;
    addReceiptFiles(
      result.assets.map((asset, index) => ({
        uri: asset.uri,
        name: asset.fileName ?? `dekont-${Date.now()}-${index + 1}`,
      }))
    );
  }

  async function pickReceiptFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('İzin gerekli', 'Dekont fotoğrafı çekmek için kamera izni vermelisin.');
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      addReceiptFiles([
        {
          uri: asset.uri,
          name: asset.fileName ?? `dekont-kamera-${Date.now()}`,
        },
      ]);
    } catch (error: any) {
      const message = String(error?.message ?? '').toLowerCase();
      if (message.includes('camera not available on simulator') || message.includes('camera not available')) {
        Alert.alert('Kamera kullanılamıyor', 'Simülatörde kamera bulunmadığı için fotoğraf çekilemiyor. Lütfen galeriden görsel seç veya gerçek cihaz kullan.');
        return;
      }

      Alert.alert('Kamera hatası', 'Fotoğraf çekilirken bir hata oluştu. Lütfen tekrar dene.');
    }
  }

  async function pickReceiptPdf() {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      multiple: true,
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) return;
    addReceiptFiles(
      result.assets.map((asset, index) => ({
        uri: asset.uri,
        name: asset.name ?? `dekont-${Date.now()}-${index + 1}.pdf`,
      }))
    );
  }

  function openReceipt(url: string) {
    downloadAndOpenRemoteFile({
      url,
      baseName: 'pati-uzat-dekont',
    }).catch(() => {
      Alert.alert('Dekont açılamadı', 'Dekont indirilemedi veya cihazda açılamadı.');
    });
  }

  function openReceipts(urls: string[]) {
    const cleanUrls = urls.map((item) => item.trim()).filter(Boolean);
    if (cleanUrls.length === 0) {
      Alert.alert('Dekont bulunamadı', 'Bu kayıt için dekont bulunamadı.');
      return;
    }

    if (cleanUrls.length === 1) {
      openReceipt(cleanUrls[0]);
      return;
    }

    Alert.alert(
      'Dekontlar',
      'Açmak istediğin dekontu seç.',
      [
        ...cleanUrls.map((url, index) => ({ text: `Dekont ${index + 1}`, onPress: () => openReceipt(url) })),
        { text: 'İptal', style: 'cancel' as const },
      ]
    );
  }

  function openAllocationExpense(contributionId: string, allocationId: string, expenseId: string) {
    const expense = approvedExpenseById.get(expenseId);
    if (!expense) {
      Alert.alert('Masraf bulunamadı', 'Bağlı masraf kaydı açılamadı.');
      return;
    }

    setSelectedAllocationContext({ allocationId, contributionId });
    setSelectedReadonlyExpense(expense);
  }

  async function onRemoveAllocation() {
    if (!selectedCommunityId || !canManageAllocations || !selectedAllocationContext) return;

    setIsRemovingAllocation(true);
    try {
      await removeContributionAllocation({
        allocationId: selectedAllocationContext.allocationId,
        communityId: selectedCommunityId,
      });

      setSelectedReadonlyExpense(null);
      setSelectedAllocationContext(null);
      await loadData();
      Alert.alert('Dağıtım geri alındı', 'Seçili dağıtım silindi, masraf borcu yeniden açıldı.');
    } catch (error: any) {
      Alert.alert('Geri alma hatası', String(error?.message ?? 'Dağıtım geri alınamadı.'));
    } finally {
      setIsRemovingAllocation(false);
    }
  }

  async function submitContribution() {
    if (!selectedCommunityId || !currentUser) return;

    const contributorUserId = shouldShowCommunityContributions
      ? (selectedContributorUserId ?? currentUser.id)
      : currentUser.id;
    if (!contributorUserId) {
      Alert.alert('Eksik bilgi', 'Pati uzatan üye seçilmelidir.');
      return;
    }

    const parsedAmount = parseAmountText(amountText);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Geçersiz tutar', 'Tutar 0’dan büyük olmalı ve en fazla 2 ondalık basamak içermeli.');
      return;
    }

    if (receiptFiles.length === 0) {
      Alert.alert('Eksik bilgi', 'Dekont zorunludur. PDF veya görsel yüklemelisin.');
      return;
    }

    setIsSubmitting(true);
    try {
      const uploadedReceiptUrls = await uploadExpenseReceiptsIfNeeded({
        uris: receiptFiles.map((item) => item.uri),
        communityId: selectedCommunityId,
        filePrefix: `contribution-receipt-${Date.now()}`,
      });

      if (uploadedReceiptUrls.length === 0) {
        throw new Error('Dekont yüklenemedi.');
      }

      await createContribution({
        communityId: selectedCommunityId,
        actorUserId: currentUser.id,
        contributorUserId,
        amount: parsedAmount,
        transferAtIso: transferAt.toISOString(),
        note: note.trim() || undefined,
        receiptUrls: uploadedReceiptUrls,
      });

      resetForm();
      setShowCreateModal(false);
      await loadData();
      Alert.alert('Pati Uzat kaydı alındı', 'Kayıt admin onayına gönderildi.');
    } catch (error: any) {
      Alert.alert('Pati Uzat hatası', String(error?.message ?? 'Kayıt oluşturulamadı.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!selectedCommunity) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 120 }}
        data={visibleContributions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: 10 }}>
            <Text style={{ fontWeight: '800', color: colors.text }}>{item.amount.toLocaleString('tr-TR')} ₺</Text>
            <Text style={{ color: colors.muted, marginTop: 3 }}>
              Pati uzatan: {item.contributorUserId ? (memberNameById.get(item.contributorUserId) ?? item.contributorUserId) : 'Belirtilmedi'}
            </Text>
            <Text style={{ color: colors.muted, marginTop: 4 }}>{new Date(item.transferAt).toLocaleString('tr-TR')}</Text>
            <Text style={{ color: colors.muted, marginTop: 2 }}>{contributionStatusLabel(item.approvalStatus)}</Text>
            <View
              style={{
                marginTop: 10,
                borderWidth: 1,
                borderColor: item.remainingAmount > 0 ? '#EAC891' : '#B8DEBF',
                borderRadius: 12,
                padding: 10,
                backgroundColor: '#FFFFFFD0',
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>Dağıtım Oranı</Text>
                  <Text style={{ marginTop: 2, fontSize: 22, fontWeight: '900', color: item.remainingAmount > 0 ? '#9A6720' : '#2F7A44' }}>
                    %{getAllocationPercent(item.amount, item.remainingAmount)}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>Kalan Bakiye</Text>
                  <Text style={{ marginTop: 2, fontSize: 18, fontWeight: '900', color: item.remainingAmount > 0 ? '#9A6720' : '#2F7A44' }}>
                    {item.remainingAmount.toLocaleString('tr-TR')} ₺
                  </Text>
                </View>
              </View>

              <View style={{ height: 8, borderRadius: 999, backgroundColor: '#E8EBE7', overflow: 'hidden', marginTop: 8 }}>
                <View
                  style={{
                    width: `${getAllocationPercent(item.amount, item.remainingAmount)}%`,
                    height: '100%',
                    backgroundColor: item.remainingAmount > 0 ? '#D09A4D' : '#3E9755',
                  }}
                />
              </View>
            </View>

            <Text style={{ color: colors.muted, marginTop: 8 }}>
              Dağıtılan: {item.allocatedAmount.toLocaleString('tr-TR')} ₺ · Kalan: {item.remainingAmount.toLocaleString('tr-TR')} ₺
            </Text>
            {item.allocations.length > 0 ? (
              <View style={{ marginTop: 8 }}>
                {item.allocations.map((allocation) => (
                  <TouchableOpacity
                    key={allocation.id}
                    onPress={() => openAllocationExpense(item.id, allocation.id, allocation.expenseId)}
                    style={{
                      marginTop: 6,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 12,
                      backgroundColor: '#fff',
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ color: colors.text, fontWeight: '700' }}>{allocation.expenseTitle}</Text>
                        <Text style={{ color: colors.muted, marginTop: 2 }}>
                          {allocation.amount.toLocaleString('tr-TR')} ₺ · {new Date(allocation.allocatedAt).toLocaleString('tr-TR')}
                        </Text>
                      </View>
                      <Text style={{ color: colors.muted, fontSize: 18 }}>›</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <TouchableOpacity
              onPress={() => openReceipts(item.receiptUrls.length ? item.receiptUrls : [item.receiptUrl])}
              style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: '#fff' }}
            >
              <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Dekontları İndir / Aç</Text>
            </TouchableOpacity>
          </Card>
        )}
        onEndReached={loadMoreContributions}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={(
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <TouchableOpacity onPress={goBackBySource} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
              <TouchableOpacity onPress={openCreateModal} style={{ backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 20 }}>＋</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Pati Uzat</Text>
            <Text style={{ color: colors.muted, marginTop: 4 }}>
              {shouldShowCommunityContributions
                ? 'Topluluktaki tüm Pati Uzat kayıtları (en yeniden eskiye) burada listelenir.'
                : 'Daha önce yaptığın katkılar (en yeniden eskiye) burada listelenir.'}
            </Text>
            <Text style={{ marginTop: 18, marginBottom: 8, fontWeight: '800', color: colors.text }}>
              {shouldShowCommunityContributions ? 'Topluluk Katkı Geçmişi' : 'Katkı Geçmişin'}
            </Text>

            {isLoading ? (
              <Card><Text style={{ color: colors.muted }}>Kayıtlar yükleniyor...</Text></Card>
            ) : null}

            {!isLoading && contributions.length === 0 ? (
              <Card><Text style={{ color: colors.muted }}>Henüz katkı kaydı bulunmuyor.</Text></Card>
            ) : null}
          </>
        )}
        ListFooterComponent={hasMoreContributions ? (
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.muted, marginTop: 6 }}>Daha fazla kayıt yükleniyor...</Text>
          </View>
        ) : null}
      />

      <BottomBannerAd />

      <Modal visible={showCreateModal} animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
          <TouchableOpacity onPress={() => setShowCreateModal(false)}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
          <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Pati Uzat Girişi</Text>

          <Card style={{ marginTop: 18 }}>
            <Text style={{ fontWeight: '800', color: colors.text }}>Pati uzatan üye</Text>
            {shouldShowCommunityContributions ? (
              <>
                <TouchableOpacity
                  onPress={() => setShowMemberPicker((current) => !current)}
                  style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
                >
                  <Text style={{ color: colors.text }}>{selectedContributorName}</Text>
                </TouchableOpacity>

                {showMemberPicker ? (
                  <View style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: '#fff' }}>
                    {communityMembers.map((member) => (
                      <TouchableOpacity
                        key={member.userId}
                        onPress={() => {
                          setSelectedContributorUserId(member.userId);
                          setShowMemberPicker(false);
                        }}
                        style={{ padding: 12, borderTopWidth: 1, borderTopColor: colors.border }}
                      >
                        <Text style={{ color: colors.text, fontWeight: '700' }}>{member.fullName}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <View style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#F6F7F8', padding: 12 }}>
                <Text style={{ color: colors.text }}>{selectedContributorName}</Text>
              </View>
            )}

            <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>Pati uzatma tarihi</Text>
            <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: '#fff', paddingVertical: 6 }}>
                <DateTimePicker
                  value={transferAt}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'compact' : 'default'}
                  onChange={onDateChange}
                />
              </View>
              <View style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: '#fff', paddingVertical: 6 }}>
                <DateTimePicker
                  value={transferAt}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'compact' : 'default'}
                  onChange={onTimeChange}
                />
              </View>
            </View>

            <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>Tutar</Text>
            <TextInput
              value={amountText}
              onChangeText={(value) => setAmountText(sanitizeAmountInput(value))}
              placeholder="Örn. 450,75"
              keyboardType="decimal-pad"
              style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
            />

            <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>Not (isteğe bağlı)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Ek bilgi"
              multiline
              style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12, minHeight: 80, textAlignVertical: 'top' }}
            />

            <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>Dekont (zorunlu)</Text>
            <Text style={{ color: colors.muted, marginTop: 6 }}>
              {receiptFiles.length === 0 ? 'Henüz dekont seçilmedi' : `${receiptFiles.length} dekont seçildi`}
            </Text>
            {receiptFiles.map((file, index) => (
              <View
                key={`${file.uri}-${index}`}
                style={{
                  marginTop: 6,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  backgroundColor: '#fff',
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <TouchableOpacity onPress={() => openReceipt(file.uri)} style={{ flex: 1 }}>
                  <Text style={{ color: colors.text }} numberOfLines={1}>{index + 1}. {file.name}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeReceiptFile(file.uri)}>
                  <Text style={{ color: colors.danger, fontWeight: '800' }}>Sil</Text>
                </TouchableOpacity>
              </View>
            ))}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                onPress={pickReceiptImage}
                style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: '#fff' }}
              >
                <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Görsel(ler) Seç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={pickReceiptPdf}
                style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: '#fff' }}
              >
                <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>PDF(ler) Seç</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={pickReceiptFromCamera}
              style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: '#fff' }}
            >
              <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Kamera ile Fotoğraf Çek</Text>
            </TouchableOpacity>
          </Card>

          <TouchableOpacity
            onPress={submitContribution}
            disabled={isSubmitting}
            style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 12, padding: 12, opacity: isSubmitting ? 0.7 : 1 }}
          >
            <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>
              {isSubmitting ? 'Kaydediliyor...' : 'Pati Uzat Kaydı Gönder'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      <Modal visible={!!selectedReadonlyExpense} animationType="slide" onRequestClose={() => {
        setSelectedReadonlyExpense(null);
        setSelectedAllocationContext(null);
      }}>
        <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
          <TouchableOpacity onPress={() => {
            setSelectedReadonlyExpense(null);
            setSelectedAllocationContext(null);
          }}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
          <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Masraf Görüntüleme</Text>

          {selectedReadonlyExpense ? (
            <Card style={{ marginTop: 18 }}>
              <Text style={{ fontWeight: '800', color: colors.text }}>{selectedReadonlyExpense.title}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>{selectedReadonlyExpense.vendorName}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>{new Date(selectedReadonlyExpense.expenseAt).toLocaleString('tr-TR')}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>{selectedReadonlyExpense.amount.toLocaleString('tr-TR')} ₺</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>Kalan borç: {selectedReadonlyExpense.dueAmount.toLocaleString('tr-TR')} ₺</Text>

              {selectedReadonlyExpense.note ? <Text style={{ color: colors.muted, marginTop: 8 }}>Not: {selectedReadonlyExpense.note}</Text> : null}

              <TouchableOpacity
                onPress={() => openReceipts(selectedReadonlyExpense.receiptUrls.length ? selectedReadonlyExpense.receiptUrls : [selectedReadonlyExpense.receiptUrl])}
                style={{ marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: '#fff' }}
              >
                <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Fişleri İndir / Aç</Text>
              </TouchableOpacity>

              {canManageAllocations ? (
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert('Dağıtımı geri al', 'Bu dağıtım silinsin mi? Masraf borcu yeniden açılır.', [
                      { text: 'Vazgeç', style: 'cancel' },
                      { text: 'Sil', style: 'destructive', onPress: () => { void onRemoveAllocation(); } },
                    ]);
                  }}
                  disabled={isRemovingAllocation || !selectedAllocationContext}
                  style={{ marginTop: 10, borderRadius: 10, padding: 11, backgroundColor: colors.danger, opacity: isRemovingAllocation || !selectedAllocationContext ? 0.65 : 1 }}
                >
                  <Text style={{ textAlign: 'center', color: '#fff', fontWeight: '800' }}>
                    {isRemovingAllocation ? 'İşleniyor...' : 'Bu Dağıtımı Geri Al'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </Card>
          ) : null}
        </ScrollView>
      </Modal>

    </View>
  );
}
