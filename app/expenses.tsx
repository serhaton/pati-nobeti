import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Image, Linking, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Card } from '../src/components/Card';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { colors } from '../src/theme';
import {
  approveExpense,
  createExpense,
  deleteExpense,
  ExpenseRecord,
  ExpenseType,
  getApprovedExpensesByCommunity,
  getPendingExpensesForCommunity,
  updateExpense,
} from '../src/services/expenseService';
import { getVeterinariansByCommunity, VeterinarianRecord } from '../src/services/veterinarianService';
import { uploadExpenseReceiptsIfNeeded } from '../src/services/supabaseStorage';
import { getCommunityMembers } from '../src/data/mock';

type LocalReceiptFile = {
  uri: string;
  name: string;
  isRemote?: boolean;
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

function expenseTypeLabel(type: ExpenseType): string {
  if (type === 'veteriner') return 'Veteriner';
  if (type === 'diger') return 'Diğer';
  return 'Mama';
}

function isPdfFile(value: string): boolean {
  return /\.pdf($|\?)/i.test(value);
}

function fileNameFromUri(uri: string, fallback: string): string {
  const clean = uri.split('?')[0].split('#')[0];
  const name = clean.split('/').pop();
  if (!name) return fallback;
  return decodeURIComponent(name);
}

export default function Expenses() {
  const { currentUser } = useAuth();
  const { selectedCommunity } = useCommunity();
  const selectedCommunityId = selectedCommunity?.id ?? null;
  const isCommunityAdmin = !!currentUser && !!selectedCommunity?.adminUserIds.includes(currentUser.id);

  const [approvedExpenses, setApprovedExpenses] = useState<ExpenseRecord[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<ExpenseRecord[]>([]);
  const [communityVets, setCommunityVets] = useState<VeterinarianRecord[]>([]);
  const [communityMembers, setCommunityMembers] = useState<MemberOption[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approvingExpenseId, setApprovingExpenseId] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showVetPicker, setShowVetPicker] = useState(false);
  const [showPerformerPicker, setShowPerformerPicker] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [expenseType, setExpenseType] = useState<ExpenseType>('veteriner');
  const [vendorText, setVendorText] = useState('');
  const [selectedVetId, setSelectedVetId] = useState<string | null>(null);
  const [expenseAt, setExpenseAt] = useState<Date>(new Date());
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [receiptFiles, setReceiptFiles] = useState<LocalReceiptFile[]>([]);
  const [performedByUserId, setPerformedByUserId] = useState<string | null>(currentUser?.id ?? null);

  const selectedVet = useMemo(
    () => communityVets.find((item) => item.id === selectedVetId) ?? null,
    [communityVets, selectedVetId]
  );

  const openDebt = useMemo(
    () => approvedExpenses.reduce((total, item) => total + item.amount, 0),
    [approvedExpenses]
  );

  const memberNameById = useMemo(() => {
    return new Map(communityMembers.map((item) => [item.userId, item.fullName]));
  }, [communityMembers]);

  const visiblePendingExpenses = useMemo(() => {
    if (isCommunityAdmin) return pendingExpenses;
    if (!currentUser) return [];
    return pendingExpenses.filter((item) => item.submittedBy === currentUser.id);
  }, [currentUser, isCommunityAdmin, pendingExpenses]);

  const selectedPerformerName = useMemo(() => {
    if (performedByUserId) {
      const found = memberNameById.get(performedByUserId);
      if (found) return found;
    }

    return currentUser?.fullName ?? 'Bilinmiyor';
  }, [currentUser?.fullName, memberNameById, performedByUserId]);

  const loadExpenseData = useCallback(async () => {
    if (!selectedCommunityId) {
      setApprovedExpenses([]);
      setPendingExpenses([]);
      setCommunityVets([]);
      setCommunityMembers([]);
      return;
    }

    setIsLoading(true);
    try {
      const [approvedRows, pendingRows, vets] = await Promise.all([
        getApprovedExpensesByCommunity(selectedCommunityId),
        getPendingExpensesForCommunity(selectedCommunityId),
        getVeterinariansByCommunity(selectedCommunityId),
      ]);

      const members = getCommunityMembers(selectedCommunityId)
        .filter((member) => member.status === 'active' && member.user)
        .map((member) => ({
          userId: member.userId,
          fullName: member.user?.fullName ?? member.user?.username ?? member.userId,
        }));

      setApprovedExpenses(approvedRows);
      setPendingExpenses(pendingRows);
      setCommunityVets(vets);
      setCommunityMembers(members);
    } catch (error: any) {
      Alert.alert('Masraf listesi hatası', String(error?.message ?? 'Masraf bilgileri okunamadı.'));
    } finally {
      setIsLoading(false);
    }
  }, [selectedCommunityId]);

  useFocusEffect(
    useCallback(() => {
      loadExpenseData();
    }, [loadExpenseData])
  );

  function resetForm() {
    setEditingExpenseId(null);
    setTitle('');
    setExpenseType('veteriner');
    setVendorText('');
    setSelectedVetId(null);
    setExpenseAt(new Date());
    setAmountText('');
    setNote('');
    setReceiptFiles([]);
    setShowVetPicker(false);
    setShowPerformerPicker(false);
    setPerformedByUserId(currentUser?.id ?? null);
  }

  function addReceiptFiles(newFiles: LocalReceiptFile[]) {
    if (!newFiles.length) return;

    setReceiptFiles((current) => {
      const next = [...current];
      for (const file of newFiles) {
        const alreadyAdded = next.some((item) => item.uri === file.uri);
        if (!alreadyAdded) {
          next.push(file);
        }
      }
      return next;
    });
  }

  function removeReceiptFile(uri: string) {
    setReceiptFiles((current) => current.filter((item) => item.uri !== uri));
  }

  function onDateChange(_: any, selected?: Date) {
    if (!selected) return;

    const next = new Date(expenseAt);
    next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    setExpenseAt(next);
  }

  function onTimeChange(_: any, selected?: Date) {
    if (!selected) return;

    const next = new Date(expenseAt);
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    setExpenseAt(next);
  }

  function openCreateModal() {
    resetForm();
    setShowCreateModal(true);
  }

  function canEditExpense(item: ExpenseRecord): boolean {
    if (!currentUser) return false;
    if (isCommunityAdmin) return true;
    return item.approvalStatus === 'pending' && item.submittedBy === currentUser.id;
  }

  function openEditModal(item: ExpenseRecord) {
    setEditingExpenseId(item.id);
    setTitle(item.title);
    setExpenseType(item.type);
    setVendorText(item.type === 'veteriner' ? '' : item.vendorName);
    setSelectedVetId(item.communityVeterinarianId);
    setExpenseAt(new Date(item.expenseAt));
    setAmountText(item.amount.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/\./g, ''));
    setNote(item.note);

    const baseReceipts = item.receiptUrls.length ? item.receiptUrls : (item.receiptUrl ? [item.receiptUrl] : []);
    setReceiptFiles(baseReceipts.map((uri, index) => ({
      uri,
      name: fileNameFromUri(uri, `fis-${index + 1}`),
      isRemote: true,
    })));

    setPerformedByUserId(item.submittedBy ?? currentUser?.id ?? null);
    setShowPerformerPicker(false);
    setShowVetPicker(false);
    setShowCreateModal(true);
  }

  async function onDeleteExpense(item: ExpenseRecord) {
    if (!selectedCommunityId) return;

    try {
      await deleteExpense({ expenseId: item.id, communityId: selectedCommunityId });
      await loadExpenseData();
      Alert.alert('Masraf silindi', 'Masraf kaydı başarıyla silindi.');
    } catch (error: any) {
      Alert.alert('Silme hatası', String(error?.message ?? 'Masraf kaydı silinemedi.'));
    }
  }

  async function pickReceiptImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('İzin gerekli', 'Fiş görseli seçmek için galeri izni vermelisin.');
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
        name: asset.fileName ?? `fis-gorseli-${Date.now()}-${index + 1}`,
      }))
    );
  }

  async function pickReceiptFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('İzin gerekli', 'Fiş fotoğrafı çekmek için kamera izni vermelisin.');
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
          name: asset.fileName ?? `fis-kamera-gorseli-${Date.now()}`,
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
        name: asset.name ?? `fis-${Date.now()}-${index + 1}.pdf`,
      }))
    );
  }

  async function submitExpense() {
    if (!selectedCommunityId || !currentUser) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert('Eksik bilgi', 'Masraf adını girmelisin.');
      return;
    }

    const parsedAmount = parseAmountText(amountText);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Geçersiz tutar', 'Masraf tutarı 0’dan büyük olmalı ve en fazla 2 ondalık basamak içermeli.');
      return;
    }

    let vendorName = '';
    let communityVeterinarianId: string | null = null;

    if (expenseType === 'veteriner') {
      if (!selectedVet) {
        Alert.alert('Eksik bilgi', 'Veteriner masrafı için topluluk veterineri seçmelisin.');
        return;
      }
      vendorName = selectedVet.clinicName;
      communityVeterinarianId = selectedVet.id;
    } else {
      vendorName = vendorText.trim();
      if (!vendorName) {
        const vendorMessage = expenseType === 'mama'
          ? 'Mama masrafında alışveriş yapılan yeri girmelisin.'
          : 'Diğer masrafta firma/kurum bilgisini girmelisin.';
        Alert.alert('Eksik bilgi', vendorMessage);
        return;
      }
    }

    if (receiptFiles.length === 0) {
      Alert.alert('Eksik bilgi', 'Masraf fişi zorunludur. Görsel veya PDF yüklemelisin.');
      return;
    }

    const effectivePerformedByUserId = isCommunityAdmin
      ? (performedByUserId ?? currentUser.id)
      : currentUser.id;

    if (!effectivePerformedByUserId) {
      Alert.alert('Eksik bilgi', 'Masrafı yapan üye seçilmelidir.');
      return;
    }

    setIsSubmitting(true);
    try {
      const existingRemoteReceiptUrls = receiptFiles
        .filter((item) => item.isRemote)
        .map((item) => item.uri);

      const localReceiptUris = receiptFiles
        .filter((item) => !item.isRemote)
        .map((item) => item.uri);

      const uploadedReceiptUrls = await uploadExpenseReceiptsIfNeeded({
        uris: localReceiptUris,
        communityId: selectedCommunityId,
        filePrefix: `receipt-${Date.now()}`,
      });

      const finalReceiptUrls = [...existingRemoteReceiptUrls, ...uploadedReceiptUrls];

      if (finalReceiptUrls.length === 0) {
        throw new Error('Fiş dosyası yüklenemedi.');
      }

      if (editingExpenseId) {
        await updateExpense({
          expenseId: editingExpenseId,
          communityId: selectedCommunityId,
          title: trimmedTitle,
          type: expenseType,
          amount: parsedAmount,
          expenseAtIso: expenseAt.toISOString(),
          note: note.trim() || undefined,
          receiptUrls: finalReceiptUrls,
          vendorName,
          communityVeterinarianId,
          performedByUserId: effectivePerformedByUserId,
        });
      } else {
        await createExpense({
          communityId: selectedCommunityId,
          submittedBy: currentUser.id,
          performedByUserId: effectivePerformedByUserId,
          isCommunityAdmin,
          title: trimmedTitle,
          type: expenseType,
          amount: parsedAmount,
          expenseAtIso: expenseAt.toISOString(),
          note: note.trim() || undefined,
          receiptUrls: finalReceiptUrls,
          vendorName,
          communityVeterinarianId,
        });
      }

      setShowCreateModal(false);
      await loadExpenseData();

      if (editingExpenseId) {
        Alert.alert('Masraf güncellendi', 'Masraf kaydı başarıyla güncellendi.');
      } else if (isCommunityAdmin) {
        Alert.alert('Masraf kaydedildi', 'Masraf kaydı admin olarak doğrudan onaylandı.');
      } else {
        Alert.alert('Masraf gönderildi', 'Masraf kaydı yönetici onayına düştü.');
      }
    } catch (error: any) {
      Alert.alert('Masraf kaydı hatası', String(error?.message ?? 'Masraf kaydı oluşturulamadı.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onApproveExpense(item: ExpenseRecord) {
    if (!selectedCommunityId || !currentUser || !isCommunityAdmin) return;

    setApprovingExpenseId(item.id);
    try {
      await approveExpense({
        expenseId: item.id,
        communityId: selectedCommunityId,
        approvedBy: currentUser.id,
      });
      await loadExpenseData();
    } catch (error: any) {
      Alert.alert('Onay hatası', String(error?.message ?? 'Masraf onaylanamadı.'));
    } finally {
      setApprovingExpenseId(null);
    }
  }

  function openReceipt(url: string) {
    if (!isPdfFile(url)) {
      setPreviewImageUri(url);
      return;
    }

    Linking.openURL(url).catch(() => {
      Alert.alert('Fiş açılamadı', 'Fiş bağlantısı açılamadı.');
    });
  }

  function openReceipts(urls: string[]) {
    const cleanUrls = urls.map((item) => item.trim()).filter(Boolean);
    if (cleanUrls.length === 0) {
      Alert.alert('Fiş bulunamadı', 'Bu masraf için fiş bağlantısı yok.');
      return;
    }

    if (cleanUrls.length === 1) {
      openReceipt(cleanUrls[0]);
      return;
    }

    Alert.alert(
      'Masraf fişleri',
      'Açmak istediğin fişi seç.',
      [
        ...cleanUrls.map((url, index) => ({ text: `Fiş ${index + 1}`, onPress: () => openReceipt(url) })),
        { text: 'İptal', style: 'cancel' as const },
      ]
    );
  }

  function openExpenseActions(item: ExpenseRecord) {
    const actions: Array<{ text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }> = [
      {
        text: 'Fişleri Görüntüle',
        onPress: () => openReceipts(item.receiptUrls.length ? item.receiptUrls : [item.receiptUrl]),
      },
    ];

    if (canEditExpense(item)) {
      actions.push({ text: 'Masrafı Güncelle', onPress: () => openEditModal(item) });
      actions.push({
        text: 'Masrafı Sil',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Masraf silinsin mi?', 'Bu işlem geri alınamaz.', [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Sil', style: 'destructive', onPress: () => onDeleteExpense(item) },
          ]);
        },
      });
    }

    actions.push({ text: 'Kapat', style: 'cancel' });
    Alert.alert(item.title, 'İşlem seç', actions);
  }

  if (!selectedCommunity) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
      <TouchableOpacity onPress={() => router.back()}><Text style={{ fontSize: 30 }}>‹</Text></TouchableOpacity>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <View>
          <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text }}>Kasa & Borçlar</Text>
          <Text style={{ color: colors.muted }}>Yalnızca onaylı masraflar toplam borca yansır.</Text>
        </View>
        <TouchableOpacity onPress={openCreateModal} style={{ backgroundColor: colors.primary, padding: 13, borderRadius: 15 }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>＋</Text>
        </TouchableOpacity>
      </View>

      <Card style={{ marginTop: 20, backgroundColor: colors.primary }}>
        <Text style={{ color: '#DCE9DE' }}>Toplam açık borç</Text>
        <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 5 }}>{openDebt.toLocaleString('tr-TR')} ₺</Text>
        <Text style={{ color: '#DCE9DE', marginTop: 6 }}>Yalnızca onaylanan masraflar</Text>
      </Card>

      <>
        <Text style={{ marginTop: 18, marginBottom: 8, fontWeight: '800', color: colors.text }}>
          {isCommunityAdmin ? 'Onay Bekleyen Masraflar' : 'Onay Bekleyen Masraflarım'}
        </Text>

        {visiblePendingExpenses.length === 0 ? (
          <Card>
            <Text style={{ color: colors.muted }}>Onay bekleyen masraf kaydı yok.</Text>
          </Card>
        ) : null}

        {visiblePendingExpenses.map((item) => (
          <TouchableOpacity key={`pending-${item.id}`} onPress={() => openExpenseActions(item)} activeOpacity={0.9}>
            <Card style={{ marginBottom: 10 }}>
              <Text style={{ fontWeight: '800', color: colors.text }}>{item.title}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>
                {expenseTypeLabel(item.type)} · {item.vendorName}
              </Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>
                Yapan: {item.submittedBy ? (memberNameById.get(item.submittedBy) ?? item.submittedBy) : 'Belirtilmedi'}
              </Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>
                {new Date(item.expenseAt).toLocaleString('tr-TR')} · {item.amount.toLocaleString('tr-TR')} ₺
              </Text>
              {item.note ? <Text style={{ color: colors.muted, marginTop: 2 }}>Not: {item.note}</Text> : null}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  onPress={() => openReceipts(item.receiptUrls.length ? item.receiptUrls : [item.receiptUrl])}
                  style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 9, backgroundColor: '#fff' }}
                >
                  <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Fişleri Görüntüle</Text>
                </TouchableOpacity>
                {isCommunityAdmin ? (
                  <TouchableOpacity
                    onPress={() => onApproveExpense(item)}
                    disabled={approvingExpenseId === item.id}
                    style={{ flex: 1, borderRadius: 10, padding: 9, backgroundColor: colors.primary, opacity: approvingExpenseId === item.id ? 0.7 : 1 }}
                  >
                    <Text style={{ textAlign: 'center', color: '#fff', fontWeight: '800' }}>Onayla</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </Card>
          </TouchableOpacity>
        ))}
      </>

      <Text style={{ marginTop: 18, marginBottom: 8, fontWeight: '800', color: colors.text }}>Onaylı Masraflar</Text>

      {isLoading ? (
        <Card>
          <Text style={{ color: colors.muted }}>Masraf kayıtları yükleniyor...</Text>
        </Card>
      ) : null}

      {!isLoading && approvedExpenses.length === 0 ? (
        <Card>
          <Text style={{ color: colors.muted }}>Onaylanmış masraf bulunmuyor.</Text>
        </Card>
      ) : null}

      {!isLoading && approvedExpenses.map((item) => (
        <TouchableOpacity key={item.id} onPress={() => openExpenseActions(item)} activeOpacity={0.9}>
        <Card style={{ marginTop: 11 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: colors.text }}>{item.title}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>{item.vendorName} · {new Date(item.expenseAt).toLocaleString('tr-TR')}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>{expenseTypeLabel(item.type)}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>
                Yapan: {item.submittedBy ? (memberNameById.get(item.submittedBy) ?? item.submittedBy) : 'Belirtilmedi'}
              </Text>
            </View>
            <Text style={{ fontWeight: '900', color: colors.danger }}>{item.amount.toLocaleString('tr-TR')} ₺</Text>
          </View>

          {item.note ? <Text style={{ color: colors.muted, marginTop: 8 }}>Not: {item.note}</Text> : null}

          <TouchableOpacity
            onPress={() => openReceipts(item.receiptUrls.length ? item.receiptUrls : [item.receiptUrl])}
            style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: '#fff' }}
          >
            <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Fişleri Görüntüle</Text>
          </TouchableOpacity>
        </Card>
        </TouchableOpacity>
      ))}

      <Modal visible={showCreateModal} animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
          <TouchableOpacity onPress={() => setShowCreateModal(false)}><Text style={{ fontSize: 30 }}>‹</Text></TouchableOpacity>
          <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>
            {editingExpenseId ? 'Masrafı Güncelle' : 'Masraf Ekle'}
          </Text>

          <Card style={{ marginTop: 20 }}>
            <Text style={{ fontWeight: '800', color: colors.text }}>Masrafı yapan üye</Text>
            {isCommunityAdmin ? (
              <>
                <TouchableOpacity
                  onPress={() => setShowPerformerPicker((current) => !current)}
                  style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
                >
                  <Text style={{ color: colors.text }}>{selectedPerformerName}</Text>
                </TouchableOpacity>

                {showPerformerPicker ? (
                  <View style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: '#fff' }}>
                    {communityMembers.length === 0 ? (
                      <Text style={{ color: colors.muted, padding: 12 }}>Topluluk üyesi bulunamadı.</Text>
                    ) : null}
                    {communityMembers.map((member) => (
                      <TouchableOpacity
                        key={member.userId}
                        onPress={() => {
                          setPerformedByUserId(member.userId);
                          setShowPerformerPicker(false);
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
                <Text style={{ color: colors.text }}>{selectedPerformerName}</Text>
              </View>
            )}

            <Text style={{ fontWeight: '800', color: colors.text }}>Masraf adı</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Örn. Acil tedavi"
              style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
            />

            <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>Masraf tipi</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  setExpenseType('veteriner');
                  setVendorText('');
                }}
                style={{ flex: 1, borderWidth: 1, borderColor: expenseType === 'veteriner' ? colors.primary : colors.border, borderRadius: 10, padding: 10, backgroundColor: '#fff' }}
              >
                <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Veteriner</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setExpenseType('mama');
                  setSelectedVetId(null);
                }}
                style={{ flex: 1, borderWidth: 1, borderColor: expenseType === 'mama' ? colors.primary : colors.border, borderRadius: 10, padding: 10, backgroundColor: '#fff' }}
              >
                <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Mama</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setExpenseType('diger');
                  setSelectedVetId(null);
                }}
                style={{ flex: 1, borderWidth: 1, borderColor: expenseType === 'diger' ? colors.primary : colors.border, borderRadius: 10, padding: 10, backgroundColor: '#fff' }}
              >
                <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Diğer</Text>
              </TouchableOpacity>
            </View>

            {expenseType === 'veteriner' ? (
              <>
                <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>Masraf firma (topluluk veterineri)</Text>
                <TouchableOpacity
                  onPress={() => setShowVetPicker((current) => !current)}
                  style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
                >
                  <Text style={{ color: colors.text }}>
                    {selectedVet ? selectedVet.clinicName : 'Listeden veteriner seç'}
                  </Text>
                </TouchableOpacity>

                {showVetPicker ? (
                  <View style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: '#fff' }}>
                    {communityVets.length === 0 ? (
                      <Text style={{ color: colors.muted, padding: 12 }}>Topluluk veterineri kaydı bulunmuyor.</Text>
                    ) : null}
                    {communityVets.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        onPress={() => {
                          setSelectedVetId(item.id);
                          setShowVetPicker(false);
                        }}
                        style={{ padding: 12, borderTopWidth: 1, borderTopColor: colors.border }}
                      >
                        <Text style={{ color: colors.text, fontWeight: '700' }}>{item.clinicName}</Text>
                        <Text style={{ color: colors.muted, marginTop: 2 }}>{item.locationLabel}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>
                  {expenseType === 'mama' ? 'Masraf firma (mama alınan yer)' : 'Masraf firma/kurum'}
                </Text>
                <TextInput
                  value={vendorText}
                  onChangeText={setVendorText}
                  placeholder={expenseType === 'mama' ? 'Örn. Pet market adı' : 'Örn. Laboratuvar / kurum adı'}
                  style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
                />
              </>
            )}

            <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>Masraf tarihi</Text>
            <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: '#fff', paddingVertical: 6 }}>
                <DateTimePicker
                  value={expenseAt}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'compact' : 'default'}
                  onChange={onDateChange}
                />
              </View>
              <View style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: '#fff', paddingVertical: 6 }}>
                <DateTimePicker
                  value={expenseAt}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'compact' : 'default'}
                  onChange={onTimeChange}
                />
              </View>
            </View>

            <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>Masraf tutarı</Text>
            <TextInput
              value={amountText}
              onChangeText={(value) => setAmountText(sanitizeAmountInput(value))}
              placeholder="Örn. 1250,50"
              keyboardType="decimal-pad"
              style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
            />

            <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>Masraf notu</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="İsteğe bağlı not"
              multiline
              style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12, minHeight: 80, textAlignVertical: 'top' }}
            />

            <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>Masraf fişi (zorunlu)</Text>
            <Text style={{ color: colors.muted, marginTop: 6 }}>
              {receiptFiles.length === 0 ? 'Henüz fiş seçilmedi' : `${receiptFiles.length} fiş seçildi`}
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
                  <Text style={{ color: colors.text }} numberOfLines={1}>
                    {index + 1}. {file.name}
                  </Text>
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
            onPress={submitExpense}
            disabled={isSubmitting}
            style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 12, padding: 12, opacity: isSubmitting ? 0.7 : 1 }}
          >
            <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>
              {isSubmitting ? 'Kaydediliyor...' : editingExpenseId ? 'Masrafı Güncelle' : 'Masrafı Kaydet'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      <Modal visible={!!previewImageUri} transparent animationType="fade" onRequestClose={() => setPreviewImageUri(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          {previewImageUri ? (
            <Image source={{ uri: previewImageUri }} resizeMode="contain" style={{ width: '100%', height: '75%' }} />
          ) : null}
          <View style={{ width: '100%', flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <TouchableOpacity
              onPress={() => {
                if (!previewImageUri) return;
                Linking.openURL(previewImageUri).catch(() => {
                  Alert.alert('Dosya açılamadı', 'Fiş dosyası açılamadı.');
                });
              }}
              style={{ flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12 }}
            >
              <Text style={{ textAlign: 'center', fontWeight: '800', color: colors.text }}>İndir / Aç</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPreviewImageUri(null)}
              style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 10, padding: 12 }}
            >
              <Text style={{ textAlign: 'center', fontWeight: '800', color: '#fff' }}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
