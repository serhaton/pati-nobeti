import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Card } from '../src/components/Card';
import { BottomBannerAd } from '../src/components/BottomBannerAd';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { colors } from '../src/theme';
import {
  createExpense,
  deleteExpense,
  ExpenseAllocationSummary,
  ExpenseRecord,
  ExpenseType,
  getExpenseAllocationSummaries,
  getApprovedExpensesByCommunity,
  getExpensesByCommunity,
  getExpensesBySubmitter,
  updateExpense,
} from '../src/services/expenseService';
import { getVeterinariansByCommunity, VeterinarianRecord } from '../src/services/veterinarianService';
import { uploadExpenseReceiptsIfNeeded } from '../src/services/supabaseStorage';
import { getCommunityMembers } from '../src/data/mock';
import { ContributionRecord, getContributionsByCommunity, updateContribution } from '../src/services/contributionService';
import { downloadAndOpenRemoteFile } from '../src/services/fileDownload';

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

function contributionStatusLabel(status: ContributionRecord['approvalStatus']): string {
  if (status === 'approved') return 'Onaylandı';
  if (status === 'rejected') return 'Reddedildi';
  return 'Onay bekliyor';
}

function expenseStatusLabel(status: ExpenseRecord['approvalStatus']): string {
  if (status === 'approved') return 'Onaylandı';
  if (status === 'rejected') return 'Reddedildi';
  return 'Onay bekliyor';
}

function getClosurePercent(amount: number, dueAmount: number): number {
  if (amount <= 0) return 0;
  const raw = ((amount - dueAmount) / amount) * 100;
  const bounded = Math.min(100, Math.max(0, raw));
  return Math.round(bounded);
}

function getAllocationPercent(amount: number, remainingAmount: number): number {
  if (amount <= 0) return 0;
  const raw = ((amount - remainingAmount) / amount) * 100;
  const bounded = Math.min(100, Math.max(0, raw));
  return Math.round(bounded);
}

function fileNameFromUri(uri: string, fallback: string): string {
  const clean = uri.split('?')[0].split('#')[0];
  const name = clean.split('/').pop();
  if (!name) return fallback;
  return decodeURIComponent(name);
}

export default function Expenses() {
  const params = useLocalSearchParams<{ mode?: string; source?: string }>();
  const { currentUser } = useAuth();
  const { selectedCommunity } = useCommunity();
  const selectedCommunityId = selectedCommunity?.id ?? null;
  const isCommunityAdmin = !!currentUser && !!selectedCommunity?.adminUserIds.includes(currentUser.id);
  const source = Array.isArray(params.source) ? params.source[0] : params.source;
  const isMemberHistoryMode = params.mode === 'member-history';
  const isExpensesManageMode = isCommunityAdmin && params.mode === 'expenses-manage';
  const isAdminFinanceView = isCommunityAdmin && !isMemberHistoryMode && !isExpensesManageMode;
  const canManageRecords = isCommunityAdmin && (params.mode === 'manage' || params.mode === 'expenses-manage');
  const canSelectPerformer = canManageRecords;
  const canCreateExpense = canManageRecords || isMemberHistoryMode;

  function goBackBySource() {
    if (source === 'community' || params.mode === 'expenses-manage') {
      router.replace('/community');
      return;
    }
    router.replace('/home');
  }

  const [approvedExpenses, setApprovedExpenses] = useState<ExpenseRecord[]>([]);
  const [allCommunityExpenses, setAllCommunityExpenses] = useState<ExpenseRecord[]>([]);
  const [memberExpenses, setMemberExpenses] = useState<ExpenseRecord[]>([]);
  const [contributions, setContributions] = useState<ContributionRecord[]>([]);
  const [communityVets, setCommunityVets] = useState<VeterinarianRecord[]>([]);
  const [communityMembers, setCommunityMembers] = useState<MemberOption[]>([]);
  const [allocationSummaryByExpenseId, setAllocationSummaryByExpenseId] = useState<Record<string, ExpenseAllocationSummary>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showVetPicker, setShowVetPicker] = useState(false);
  const [showPerformerPicker, setShowPerformerPicker] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [selectedContribution, setSelectedContribution] = useState<ContributionRecord | null>(null);
  const [selectedReadonlyExpense, setSelectedReadonlyExpense] = useState<ExpenseRecord | null>(null);
  const [pendingReadonlyExpense, setPendingReadonlyExpense] = useState<ExpenseRecord | null>(null);
  const [showContributionEditModal, setShowContributionEditModal] = useState(false);
  const [editingContributionId, setEditingContributionId] = useState<string | null>(null);
  const [contributionTransferAt, setContributionTransferAt] = useState<Date>(new Date());
  const [contributionAmountText, setContributionAmountText] = useState('');
  const [contributionNote, setContributionNote] = useState('');
  const [contributionContributorUserId, setContributionContributorUserId] = useState<string | null>(null);
  const [showCompletedFinanceItems, setShowCompletedFinanceItems] = useState(false);
  const [visibleFinanceCount, setVisibleFinanceCount] = useState(4);
  const [isPagingFinance, setIsPagingFinance] = useState(false);

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
    () => approvedExpenses.reduce((total, item) => total + item.dueAmount, 0),
    [approvedExpenses]
  );

  const approvedContributionRemainingTotal = useMemo(
    () => contributions
      .filter((item) => item.approvalStatus === 'approved')
      .reduce((total, item) => total + item.remainingAmount, 0),
    [contributions]
  );

  const debtCreditBalance = useMemo(
    () => approvedContributionRemainingTotal - openDebt,
    [approvedContributionRemainingTotal, openDebt]
  );

  const memberNameById = useMemo(() => {
    return new Map(communityMembers.map((item) => [item.userId, item.fullName]));
  }, [communityMembers]);

  const approvedExpenseById = useMemo(() => {
    return new Map(approvedExpenses.map((item) => [item.id, item]));
  }, [approvedExpenses]);

  const visibleApprovedExpenses = useMemo(() => {
    if (isExpensesManageMode) {
      return allCommunityExpenses;
    }

    if (isMemberHistoryMode) {
      return memberExpenses;
    }

    const base = isCommunityAdmin
      ? approvedExpenses
      : approvedExpenses.filter((item) => !!currentUser && item.submittedBy === currentUser.id);

    if (!isCommunityAdmin || showCompletedFinanceItems) return base;
    return base.filter((item) => item.dueAmount > 0);
  }, [allCommunityExpenses, approvedExpenses, currentUser, isCommunityAdmin, isExpensesManageMode, isMemberHistoryMode, memberExpenses, showCompletedFinanceItems]);

  const visibleApprovedContributions = useMemo(() => {
    const base = isCommunityAdmin
      ? contributions
      : contributions.filter((item) => !!currentUser && item.contributorUserId === currentUser.id);
    const approvedRows = base.filter((item) => item.approvalStatus === 'approved');
    if (!isCommunityAdmin || showCompletedFinanceItems) return approvedRows;
    return approvedRows.filter((item) => item.remainingAmount > 0);
  }, [contributions, currentUser, isCommunityAdmin, showCompletedFinanceItems]);

  const financeTimeline = useMemo(() => {
    const expenseRows = visibleApprovedExpenses.map((expense) => ({
      kind: 'expense' as const,
      id: `expense-${expense.id}`,
      date: expense.expenseAt,
      expense,
    }));

    const contributionRows = visibleApprovedContributions.map((contribution) => ({
      kind: 'contribution' as const,
      id: `contribution-${contribution.id}`,
      date: contribution.transferAt,
      contribution,
    }));

    return [...expenseRows, ...contributionRows].sort((left, right) => right.date.localeCompare(left.date));
  }, [visibleApprovedContributions, visibleApprovedExpenses]);

  const visibleFinanceTimeline = useMemo(
    () => financeTimeline.slice(0, visibleFinanceCount),
    [financeTimeline, visibleFinanceCount]
  );

  const hasMoreFinanceTimeline = visibleFinanceCount < financeTimeline.length;

  useEffect(() => {
    if (selectedContribution || !pendingReadonlyExpense) return;

    const timer = setTimeout(() => {
      setSelectedReadonlyExpense(pendingReadonlyExpense);
      setPendingReadonlyExpense(null);
    }, 120);

    return () => clearTimeout(timer);
  }, [pendingReadonlyExpense, selectedContribution]);

  const selectedPerformerName = useMemo(() => {
    if (performedByUserId) {
      const found = memberNameById.get(performedByUserId);
      if (found) return found;
    }

    return currentUser?.fullName ?? 'Bilinmiyor';
  }, [currentUser?.fullName, memberNameById, performedByUserId]);

  const editingAllocationSummary = useMemo(() => {
    if (!editingExpenseId) return null;
    return allocationSummaryByExpenseId[editingExpenseId] ?? null;
  }, [allocationSummaryByExpenseId, editingExpenseId]);

  const loadExpenseData = useCallback(async () => {
    if (!selectedCommunityId) {
      setApprovedExpenses([]);
      setAllCommunityExpenses([]);
      setMemberExpenses([]);
      setContributions([]);
      setCommunityVets([]);
      setCommunityMembers([]);
      setAllocationSummaryByExpenseId({});
      return;
    }

    setIsLoading(true);
    try {
      const [approvedRows, contributionRows, vets, allRows] = await Promise.all([
        getApprovedExpensesByCommunity(selectedCommunityId),
        getContributionsByCommunity(selectedCommunityId),
        getVeterinariansByCommunity(selectedCommunityId),
        isExpensesManageMode ? getExpensesByCommunity(selectedCommunityId) : Promise.resolve([] as ExpenseRecord[]),
      ]);

      const members = getCommunityMembers(selectedCommunityId)
        .filter((member) => member.status === 'active' && member.user)
        .map((member) => ({
          userId: member.userId,
          fullName: member.user?.fullName ?? member.user?.username ?? member.userId,
        }));

      setApprovedExpenses(approvedRows);
      setAllCommunityExpenses(allRows);
      setContributions(contributionRows);
      setCommunityVets(vets);
      setCommunityMembers(members);

      const summaryExpenseIds = Array.from(new Set([
        ...approvedRows.map((item) => item.id),
        ...allRows.map((item) => item.id),
      ]));

      if (isCommunityAdmin && summaryExpenseIds.length > 0) {
        const summaries = await getExpenseAllocationSummaries({
          communityId: selectedCommunityId,
          expenseIds: summaryExpenseIds,
        });
        setAllocationSummaryByExpenseId(Object.fromEntries(Array.from(summaries.entries())));
      } else {
        setAllocationSummaryByExpenseId({});
      }

      if (isMemberHistoryMode && currentUser?.id) {
        const ownRows = await getExpensesBySubmitter({
          communityId: selectedCommunityId,
          submitterUserId: currentUser.id,
        });
        setMemberExpenses(ownRows);
      } else {
        setMemberExpenses([]);
      }

      setVisibleFinanceCount(4);
    } catch (error: any) {
      Alert.alert('Masraf listesi hatası', String(error?.message ?? 'Masraf bilgileri okunamadı.'));
      setAllCommunityExpenses([]);
      setMemberExpenses([]);
      setAllocationSummaryByExpenseId({});
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id, isExpensesManageMode, isMemberHistoryMode, selectedCommunityId]);

  function onMainScroll(event: any) {
    if (!hasMoreFinanceTimeline || isPagingFinance) return;

    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isNearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 140;
    if (!isNearBottom) return;

    setIsPagingFinance(true);
    setVisibleFinanceCount((current) => current + 4);
    setTimeout(() => {
      setIsPagingFinance(false);
    }, 160);
  }

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

  function onContributionDateChange(_: any, selected?: Date) {
    if (!selected) return;

    const next = new Date(contributionTransferAt);
    next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    setContributionTransferAt(next);
  }

  function onContributionTimeChange(_: any, selected?: Date) {
    if (!selected) return;

    const next = new Date(contributionTransferAt);
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    setContributionTransferAt(next);
  }

  function openCreateModal() {
    resetForm();
    setShowCreateModal(true);
  }

  function canEditExpense(item: ExpenseRecord): boolean {
    if (!currentUser) return false;
    return canManageRecords;
  }

  function openEditContributionModal(item: ContributionRecord) {
    setEditingContributionId(item.id);
    setContributionTransferAt(new Date(item.transferAt));
    setContributionAmountText(item.amount.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/\./g, ''));
    setContributionNote(item.note);
    setContributionContributorUserId(item.contributorUserId);
    setShowContributionEditModal(true);
  }

  async function submitContributionUpdate() {
    if (!selectedCommunityId || !editingContributionId || !contributionContributorUserId) return;

    const parsedAmount = parseAmountText(contributionAmountText);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Geçersiz tutar', 'Tutar 0’dan büyük olmalı ve en fazla 2 ondalık basamak içermeli.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateContribution({
        contributionId: editingContributionId,
        communityId: selectedCommunityId,
        contributorUserId: contributionContributorUserId,
        amount: parsedAmount,
        transferAtIso: contributionTransferAt.toISOString(),
        note: contributionNote.trim() || undefined,
      });

      setShowContributionEditModal(false);
      setEditingContributionId(null);
      await loadExpenseData();
      Alert.alert('Pati Uzat güncellendi', 'Kayıt başarıyla güncellendi.');
    } catch (error: any) {
      Alert.alert('Güncelleme hatası', String(error?.message ?? 'Pati Uzat kaydı güncellenemedi.'));
    } finally {
      setIsSubmitting(false);
    }
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

  async function submitExpense(skipAllocationWarning = false) {
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

    const hasExistingAllocations =
      isCommunityAdmin
      && !!editingExpenseId
      && (editingAllocationSummary?.allocationCount ?? 0) > 0;

    if (hasExistingAllocations && !skipAllocationWarning) {
      const allocationCount = editingAllocationSummary?.allocationCount ?? 0;
      const allocatedTotal = editingAllocationSummary?.allocatedTotal ?? 0;
      Alert.alert(
        'Dağıtım ilişkileri sıfırlanacak',
        `Bu masraf daha önce ${allocationCount} dağıtım ile ilişkilendirilmiş (${allocatedTotal.toLocaleString('tr-TR')} ₺). Tutar değiştirildiğinde bu ilişkiler silinecek ve masraf yeniden dağıtıma açılacaktır.`,
        [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Devam et', style: 'destructive', onPress: () => { void submitExpense(true); } },
        ]
      );
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
        const updateResult = await updateExpense({
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

        setShowCreateModal(false);
        await loadExpenseData();

        if (updateResult.clearedAllocationCount > 0) {
          Alert.alert(
            'Masraf güncellendi',
            `Masraf kaydı güncellendi. Önceki ${updateResult.clearedAllocationCount} dağıtım ilişkisi otomatik temizlendi.`
          );
        } else {
          Alert.alert('Masraf güncellendi', 'Masraf kaydı başarıyla güncellendi.');
        }
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

        setShowCreateModal(false);
        await loadExpenseData();

        if (isCommunityAdmin) {
          Alert.alert('Masraf kaydedildi', 'Masraf kaydı admin olarak doğrudan onaylandı.');
        } else {
          Alert.alert('Masraf gönderildi', 'Masraf kaydı yönetici onayına düştü.');
        }
      }
    } catch (error: any) {
      Alert.alert('Masraf kaydı hatası', String(error?.message ?? 'Masraf kaydı oluşturulamadı.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  function openReceipt(url: string) {
    downloadAndOpenRemoteFile({
      url,
      baseName: 'masraf-fisi',
    }).catch(() => {
      Alert.alert('Fiş açılamadı', 'Fiş indirilemedi veya cihazda açılamadı.');
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
    if (!canManageRecords) {
      setSelectedReadonlyExpense(item);
      return;
    }

    const actions: Array<{ text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }> = [
      {
        text: 'Fişleri İndir / Aç',
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

  function openContributionActions(item: ContributionRecord) {
    if (!canManageRecords) {
      setSelectedContribution(item);
      return;
    }

    const actions: Array<{ text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }> = [
      { text: 'Kaydı Güncelle', onPress: () => openEditContributionModal(item) },
      {
        text: 'Dekontları İndir / Aç',
        onPress: () => openReceipts(item.receiptUrls.length ? item.receiptUrls : [item.receiptUrl]),
      },
      { text: 'Dağıtım Detayını Gör', onPress: () => setSelectedContribution(item) },
      { text: 'Kapat', style: 'cancel' },
    ];

    Alert.alert('Pati Uzat İşlemi', 'Yapmak istediğin işlemi seç.', actions);
  }

  if (!selectedCommunity) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 120 }}
        onScroll={onMainScroll}
        scrollEventThrottle={16}
      >
      <TouchableOpacity onPress={goBackBySource} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <View>
          <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text }}>
            {isExpensesManageMode ? 'Masraflar' : isMemberHistoryMode ? 'Masraf Geçmişim' : 'Kasa'}
          </Text>
          <Text style={{ color: colors.muted }}>
            {isExpensesManageMode
              ? 'Topluluktaki tüm masraf kayıtları listelenir.'
              : isMemberHistoryMode
              ? 'Sadece kendi masraf kayıtların listelenir.'
              : 'Yalnızca onaylı masraflar toplam borca yansır.'}
          </Text>
        </View>
        {canCreateExpense ? (
          <TouchableOpacity onPress={openCreateModal} style={{ backgroundColor: colors.primary, padding: 13, borderRadius: 15 }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>＋</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {!isMemberHistoryMode && !isExpensesManageMode ? (
        <Card
          style={{
            marginTop: 20,
            backgroundColor: debtCreditBalance >= 0 ? '#2F7A44' : '#A94842',
          }}
        >
          <Text style={{ color: '#DCE9DE' }}>Borç / Alacak</Text>
          <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 5 }}>
            {debtCreditBalance >= 0 ? '+' : '-'}{Math.abs(debtCreditBalance).toLocaleString('tr-TR')} ₺
          </Text>
          <Text style={{ color: '#DCE9DE', marginTop: 6 }}>
            {debtCreditBalance >= 0
              ? 'Alacak pozisyonu (kalan Pati Uzat bakiyesi açık borçtan fazla)'
              : 'Borç pozisyonu (açık borç, kalan Pati Uzat bakiyesinden fazla)'}
          </Text>
        </Card>
      ) : null}

      <Text style={{ marginTop: 18, marginBottom: 8, fontWeight: '800', color: colors.text }}>
        {isExpensesManageMode
          ? 'Tüm Masraf Kayıtları'
          : isMemberHistoryMode
            ? 'Masraf Geçmişim'
            : isCommunityAdmin
              ? 'Kasa Borç / Alacak Akışı'
              : 'Onaylı Masraflar'}
      </Text>

      {isAdminFinanceView ? (
        <TouchableOpacity
          onPress={() => {
            setShowCompletedFinanceItems((current) => !current);
            setVisibleFinanceCount(4);
          }}
          style={{ alignSelf: 'flex-start', marginBottom: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: showCompletedFinanceItems ? '#EEF5EE' : '#fff' }}
        >
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>
            {showCompletedFinanceItems ? 'Tamamlananları gizle' : 'Kapananlar / Tam Dağıtılanları göster'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {isLoading ? (
        <Card>
          <Text style={{ color: colors.muted }}>Masraf kayıtları yükleniyor...</Text>
        </Card>
      ) : null}

      {!isLoading && !isAdminFinanceView && visibleApprovedExpenses.length === 0 ? (
        <Card>
          <Text style={{ color: colors.muted }}>
            {isMemberHistoryMode ? 'Henüz masraf kaydın bulunmuyor.' : 'Onaylanmış masraf bulunmuyor.'}
          </Text>
        </Card>
      ) : null}

      {!isLoading && !isAdminFinanceView && visibleApprovedExpenses.map((item) => (
        <TouchableOpacity
          key={item.id}
          onPress={() => {
            if (isMemberHistoryMode) return;
            openExpenseActions(item);
          }}
          activeOpacity={isMemberHistoryMode ? 1 : 0.9}
          disabled={isMemberHistoryMode}
        >
        <Card
          style={{
            marginTop: 11,
            backgroundColor: item.dueAmount <= 0 ? '#EAF7EC' : '#FDECEC',
            borderWidth: 1,
            borderColor: item.dueAmount <= 0 ? '#B8DEBF' : '#F3B7B2',
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: '800', color: '#245A88', backgroundColor: '#E6F1FB', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>MASRAF</Text>
              <Text style={{ fontWeight: '800', color: colors.text }}>{item.title}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>{item.vendorName} · {new Date(item.expenseAt).toLocaleString('tr-TR')}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>{expenseTypeLabel(item.type)}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>Durum: {expenseStatusLabel(item.approvalStatus)}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>
                Yapan: {item.submittedBy ? (memberNameById.get(item.submittedBy) ?? item.submittedBy) : 'Belirtilmedi'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontWeight: '900', color: item.dueAmount <= 0 ? '#2F7A44' : colors.danger }}>{item.amount.toLocaleString('tr-TR')} ₺</Text>
              <Text
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  fontWeight: '800',
                  color: item.dueAmount <= 0 ? '#2F7A44' : '#9B3A34',
                  backgroundColor: item.dueAmount <= 0 ? '#D8F0DE' : '#FAD9D6',
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                {item.dueAmount <= 0 ? 'KAPANDI' : 'AÇIK BORÇ'}
              </Text>
            </View>
          </View>

          <View
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: item.dueAmount <= 0 ? '#B8DEBF' : '#F3B7B2',
              borderRadius: 12,
              padding: 10,
              backgroundColor: '#FFFFFFD0',
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>Kapanma Oranı</Text>
                <Text style={{ marginTop: 2, fontSize: 24, fontWeight: '900', color: item.dueAmount <= 0 ? '#2F7A44' : '#9B3A34' }}>
                  %{getClosurePercent(item.amount, item.dueAmount)}
                </Text>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>Kalan Borç</Text>
                <Text style={{ marginTop: 2, fontSize: 20, fontWeight: '900', color: item.dueAmount <= 0 ? '#2F7A44' : '#9B3A34' }}>
                  {item.dueAmount.toLocaleString('tr-TR')} ₺
                </Text>
              </View>
            </View>
            <View style={{ height: 8, borderRadius: 999, backgroundColor: '#E8EBE7', overflow: 'hidden', marginTop: 8 }}>
              <View
                style={{
                  width: `${getClosurePercent(item.amount, item.dueAmount)}%`,
                  height: '100%',
                  backgroundColor: item.dueAmount <= 0 ? '#3E9755' : '#D56A61',
                }}
              />
            </View>
          </View>

          {item.note ? <Text style={{ color: colors.muted, marginTop: 8 }}>Not: {item.note}</Text> : null}

          <TouchableOpacity
            onPress={() => openReceipts(item.receiptUrls.length ? item.receiptUrls : [item.receiptUrl])}
            style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: '#fff' }}
          >
            <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Fişleri İndir / Aç</Text>
          </TouchableOpacity>
        </Card>
        </TouchableOpacity>
      ))}

      {isAdminFinanceView ? (
        <>
          {!isLoading && visibleFinanceTimeline.length === 0 ? (
            <Card>
              <Text style={{ color: colors.muted }}>
                {showCompletedFinanceItems
                  ? 'Kasa akışında gösterilecek kayıt bulunmuyor.'
                  : 'Açık borç veya kalan bakiyesi olan kayıt bulunmuyor.'}
              </Text>
            </Card>
          ) : null}

          {visibleFinanceTimeline.map((timelineItem) => {
            if (timelineItem.kind === 'expense') {
              const item = timelineItem.expense;
              return (
                <TouchableOpacity key={timelineItem.id} onPress={() => openExpenseActions(item)} activeOpacity={0.9}>
                  <Card
                    style={{
                      marginTop: 11,
                      backgroundColor: item.dueAmount <= 0 ? '#EAF7EC' : '#FDECEC',
                      borderWidth: 1,
                      borderColor: item.dueAmount <= 0 ? '#B8DEBF' : '#F3B7B2',
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: '800', color: '#245A88', backgroundColor: '#E6F1FB', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>MASRAF</Text>
                        <Text style={{ fontWeight: '800', color: colors.text }}>{item.title}</Text>
                        <Text style={{ color: colors.muted, marginTop: 4 }}>{item.vendorName} · {new Date(item.expenseAt).toLocaleString('tr-TR')}</Text>
                        <Text style={{ color: colors.muted, marginTop: 2 }}>{expenseTypeLabel(item.type)}</Text>
                        <Text style={{ color: colors.muted, marginTop: 2 }}>
                          Yapan: {item.submittedBy ? (memberNameById.get(item.submittedBy) ?? item.submittedBy) : 'Belirtilmedi'}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontWeight: '900', color: item.dueAmount <= 0 ? '#2F7A44' : colors.danger }}>{item.amount.toLocaleString('tr-TR')} ₺</Text>
                        <Text
                          style={{
                            marginTop: 6,
                            fontSize: 11,
                            fontWeight: '800',
                            color: item.dueAmount <= 0 ? '#2F7A44' : '#9B3A34',
                            backgroundColor: item.dueAmount <= 0 ? '#D8F0DE' : '#FAD9D6',
                            borderRadius: 999,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                          }}
                        >
                          {item.dueAmount <= 0 ? 'KAPANDI' : 'AÇIK BORÇ'}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={{
                        marginTop: 10,
                        borderWidth: 1,
                        borderColor: item.dueAmount <= 0 ? '#B8DEBF' : '#F3B7B2',
                        borderRadius: 12,
                        padding: 10,
                        backgroundColor: '#FFFFFFD0',
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <View>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>Kapanma Oranı</Text>
                          <Text style={{ marginTop: 2, fontSize: 24, fontWeight: '900', color: item.dueAmount <= 0 ? '#2F7A44' : '#9B3A34' }}>
                            %{getClosurePercent(item.amount, item.dueAmount)}
                          </Text>
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>Kalan Borç</Text>
                          <Text style={{ marginTop: 2, fontSize: 20, fontWeight: '900', color: item.dueAmount <= 0 ? '#2F7A44' : '#9B3A34' }}>
                            {item.dueAmount.toLocaleString('tr-TR')} ₺
                          </Text>
                        </View>
                      </View>
                      <View style={{ height: 8, borderRadius: 999, backgroundColor: '#E8EBE7', overflow: 'hidden', marginTop: 8 }}>
                        <View
                          style={{
                            width: `${getClosurePercent(item.amount, item.dueAmount)}%`,
                            height: '100%',
                            backgroundColor: item.dueAmount <= 0 ? '#3E9755' : '#D56A61',
                          }}
                        />
                      </View>
                    </View>

                    {item.note ? <Text style={{ color: colors.muted, marginTop: 8 }}>Not: {item.note}</Text> : null}

                    <TouchableOpacity
                      onPress={() => openReceipts(item.receiptUrls.length ? item.receiptUrls : [item.receiptUrl])}
                      style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: '#fff' }}
                    >
                      <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Fişleri İndir / Aç</Text>
                    </TouchableOpacity>
                  </Card>
                </TouchableOpacity>
              );
            }

            const item = timelineItem.contribution;
            return (
              <TouchableOpacity key={timelineItem.id} onPress={() => openContributionActions(item)} activeOpacity={0.9}>
                <Card
                  style={{
                    marginBottom: 10,
                    backgroundColor: item.remainingAmount > 0 ? '#FFF7E9' : '#EAF7EC',
                    borderWidth: 1,
                    borderColor: item.remainingAmount > 0 ? '#EAC891' : '#B8DEBF',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: '800', color: '#7A5318', backgroundColor: '#FCECC8', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>PATI UZAT</Text>
                      <Text style={{ fontWeight: '800', color: colors.text }}>{item.amount.toLocaleString('tr-TR')} ₺</Text>
                      <Text style={{ color: colors.muted, marginTop: 3 }}>
                        Üye: {item.contributorUserId ? (memberNameById.get(item.contributorUserId) ?? item.contributorUserId) : 'Belirtilmedi'}
                      </Text>
                      <Text style={{ color: colors.muted, marginTop: 2 }}>{new Date(item.transferAt).toLocaleString('tr-TR')}</Text>
                      <Text style={{ color: colors.muted, marginTop: 2 }}>{contributionStatusLabel(item.approvalStatus)}</Text>
                    </View>
                    <Text
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        fontWeight: '800',
                        color: item.remainingAmount > 0 ? '#9A6720' : '#2F7A44',
                        backgroundColor: item.remainingAmount > 0 ? '#F8E4BF' : '#D8F0DE',
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                      }}
                    >
                      {item.remainingAmount > 0 ? 'BAKİYE VAR' : 'TAMAMEN DAĞITILDI'}
                    </Text>
                  </View>

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
                        <Text style={{ marginTop: 2, fontSize: 24, fontWeight: '900', color: item.remainingAmount > 0 ? '#9A6720' : '#2F7A44' }}>
                          %{getAllocationPercent(item.amount, item.remainingAmount)}
                        </Text>
                      </View>

                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>Kalan Bakiye</Text>
                        <Text style={{ marginTop: 2, fontSize: 20, fontWeight: '900', color: item.remainingAmount > 0 ? '#9A6720' : '#2F7A44' }}>
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
                    <View style={{ marginTop: 6 }}>
                      {item.allocations.map((allocation) => (
                        <Text key={allocation.id} style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                          • {allocation.expenseTitle}: {allocation.amount.toLocaleString('tr-TR')} ₺
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </Card>
              </TouchableOpacity>
            );
          })}

          {!isLoading && hasMoreFinanceTimeline ? (
            <Card style={{ marginTop: 8 }}>
              <Text style={{ color: colors.muted, textAlign: 'center' }}>
                Aşağı kaydırdıkça yeni kayıtlar yükleniyor...
              </Text>
            </Card>
          ) : null}
        </>
      ) : null}

      <Modal visible={showCreateModal} animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
          <TouchableOpacity onPress={() => setShowCreateModal(false)}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
          <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>
            {editingExpenseId ? 'Masrafı Güncelle' : 'Masraf Ekle'}
          </Text>

          <Card style={{ marginTop: 20 }}>
            <Text style={{ fontWeight: '800', color: colors.text }}>Masrafı yapan üye</Text>
            {canSelectPerformer ? (
              <>

            {editingExpenseId && isCommunityAdmin && (editingAllocationSummary?.allocationCount ?? 0) > 0 ? (
              <View style={{ marginTop: 12, borderWidth: 1, borderColor: '#E3B25F', borderRadius: 12, backgroundColor: '#FFF5E5', padding: 11 }}>
                <Text style={{ color: '#8A5A12', fontWeight: '800' }}>Uyarı: Bu masraf daha önce Pati Uzat ile dağıtılmış.</Text>
                <Text style={{ color: '#8A5A12', marginTop: 4 }}>
                  Bağlı dağıtım: {(editingAllocationSummary?.allocationCount ?? 0).toLocaleString('tr-TR')} kayıt · {(editingAllocationSummary?.allocatedTotal ?? 0).toLocaleString('tr-TR')} ₺
                </Text>
                <Text style={{ color: '#8A5A12', marginTop: 4 }}>
                  Tutar güncellendiğinde bu dağıtım ilişkileri otomatik silinir ve masraf yeniden dağıtıma açılır.
                </Text>
              </View>
            ) : null}
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
            onPress={() => { void submitExpense(); }}
            disabled={isSubmitting}
            style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 12, padding: 12, opacity: isSubmitting ? 0.7 : 1 }}
          >
            <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>
              {isSubmitting ? 'Kaydediliyor...' : editingExpenseId ? 'Masrafı Güncelle' : 'Masrafı Kaydet'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      <Modal visible={showContributionEditModal} animationType="slide" onRequestClose={() => setShowContributionEditModal(false)}>
        <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
          <TouchableOpacity onPress={() => setShowContributionEditModal(false)}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
          <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Pati Uzat Kaydını Güncelle</Text>

          <Card style={{ marginTop: 18 }}>
            <Text style={{ fontWeight: '800', color: colors.text }}>Pati uzatan üye</Text>
            <TouchableOpacity
              onPress={() => setShowPerformerPicker((current) => !current)}
              style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
            >
              <Text style={{ color: colors.text }}>
                {contributionContributorUserId ? (memberNameById.get(contributionContributorUserId) ?? contributionContributorUserId) : 'Üye seç'}
              </Text>
            </TouchableOpacity>

            {showPerformerPicker ? (
              <View style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: '#fff' }}>
                {communityMembers.map((member) => (
                  <TouchableOpacity
                    key={`contributor-${member.userId}`}
                    onPress={() => {
                      setContributionContributorUserId(member.userId);
                      setShowPerformerPicker(false);
                    }}
                    style={{ padding: 12, borderTopWidth: 1, borderTopColor: colors.border }}
                  >
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{member.fullName}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>Pati uzatma tarihi</Text>
            <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: '#fff', paddingVertical: 6 }}>
                <DateTimePicker
                  value={contributionTransferAt}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'compact' : 'default'}
                  onChange={onContributionDateChange}
                />
              </View>
              <View style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: '#fff', paddingVertical: 6 }}>
                <DateTimePicker
                  value={contributionTransferAt}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'compact' : 'default'}
                  onChange={onContributionTimeChange}
                />
              </View>
            </View>

            <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>Tutar</Text>
            <TextInput
              value={contributionAmountText}
              onChangeText={(value) => setContributionAmountText(sanitizeAmountInput(value))}
              placeholder="Örn. 450,75"
              keyboardType="decimal-pad"
              style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
            />

            <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>Not</Text>
            <TextInput
              value={contributionNote}
              onChangeText={setContributionNote}
              placeholder="Ek bilgi"
              multiline
              style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12, minHeight: 80, textAlignVertical: 'top' }}
            />
          </Card>

          <TouchableOpacity
            onPress={submitContributionUpdate}
            disabled={isSubmitting}
            style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 12, padding: 12, opacity: isSubmitting ? 0.7 : 1 }}
          >
            <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>
              {isSubmitting ? 'Kaydediliyor...' : 'Pati Uzat Kaydını Güncelle'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      <Modal visible={!!selectedReadonlyExpense} animationType="slide" onRequestClose={() => setSelectedReadonlyExpense(null)}>
        <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
          <TouchableOpacity onPress={() => setSelectedReadonlyExpense(null)}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
          <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Masraf Görüntüleme</Text>

          {selectedReadonlyExpense ? (
            <Card style={{ marginTop: 18 }}>
              <Text style={{ fontWeight: '800', color: colors.text }}>{selectedReadonlyExpense.title}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>
                {expenseTypeLabel(selectedReadonlyExpense.type)} · {selectedReadonlyExpense.vendorName}
              </Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>
                Tarih: {new Date(selectedReadonlyExpense.expenseAt).toLocaleString('tr-TR')}
              </Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>
                Yapan: {selectedReadonlyExpense.submittedBy ? (memberNameById.get(selectedReadonlyExpense.submittedBy) ?? selectedReadonlyExpense.submittedBy) : 'Belirtilmedi'}
              </Text>

              <View style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, backgroundColor: '#fff' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>Kapanma Oranı</Text>
                <Text style={{ marginTop: 2, fontSize: 24, fontWeight: '900', color: selectedReadonlyExpense.dueAmount <= 0 ? '#2F7A44' : '#9B3A34' }}>
                  %{getClosurePercent(selectedReadonlyExpense.amount, selectedReadonlyExpense.dueAmount)}
                </Text>
                <Text style={{ marginTop: 2, color: colors.muted }}>
                  Kalan borç: {selectedReadonlyExpense.dueAmount.toLocaleString('tr-TR')} ₺
                </Text>
              </View>

              <Text style={{ color: colors.text, marginTop: 10, fontWeight: '800' }}>
                Tutar: {selectedReadonlyExpense.amount.toLocaleString('tr-TR')} ₺
              </Text>
              {selectedReadonlyExpense.note ? <Text style={{ color: colors.muted, marginTop: 6 }}>Not: {selectedReadonlyExpense.note}</Text> : null}

              <TouchableOpacity
                onPress={() => openReceipts(selectedReadonlyExpense.receiptUrls.length ? selectedReadonlyExpense.receiptUrls : [selectedReadonlyExpense.receiptUrl])}
                style={{ marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: '#fff' }}
              >
                <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Fişleri İndir / Aç</Text>
              </TouchableOpacity>
            </Card>
          ) : null}
        </ScrollView>
      </Modal>

      <Modal visible={!!selectedContribution} animationType="slide" onRequestClose={() => setSelectedContribution(null)}>
        <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
          <TouchableOpacity onPress={() => setSelectedContribution(null)}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
          <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Pati Uzat Detayı</Text>

          {selectedContribution ? (
            <Card style={{ marginTop: 18 }}>
              <Text style={{ fontWeight: '800', color: colors.text }}>Pati uzatan üye</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>
                {selectedContribution.contributorUserId ? (memberNameById.get(selectedContribution.contributorUserId) ?? selectedContribution.contributorUserId) : 'Belirtilmedi'}
              </Text>

              <Text style={{ fontWeight: '800', color: colors.text, marginTop: 14 }}>Pati uzatma tarihi</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>{new Date(selectedContribution.transferAt).toLocaleString('tr-TR')}</Text>

              <Text style={{ fontWeight: '800', color: colors.text, marginTop: 14 }}>Tutar</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>{selectedContribution.amount.toLocaleString('tr-TR')} ₺</Text>

              <Text style={{ fontWeight: '800', color: colors.text, marginTop: 14 }}>Onay durumu</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>{contributionStatusLabel(selectedContribution.approvalStatus)}</Text>

              <Text style={{ fontWeight: '800', color: colors.text, marginTop: 14 }}>Not</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>{selectedContribution.note || 'Not girilmemiş.'}</Text>

              <Text style={{ fontWeight: '800', color: colors.text, marginTop: 14 }}>Yardım dağıtımı</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>
                Dağıtılan: {selectedContribution.allocatedAmount.toLocaleString('tr-TR')} ₺ · Kalan: {selectedContribution.remainingAmount.toLocaleString('tr-TR')} ₺
              </Text>

              {selectedContribution.allocations.length === 0 ? (
                <Text style={{ color: colors.muted, marginTop: 6 }}>Henüz bir masrafa dağıtılmadı.</Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {selectedContribution.allocations.map((allocation) => {
                    const linkedExpense = approvedExpenseById.get(allocation.expenseId);
                    return (
                      <TouchableOpacity
                        key={allocation.id}
                        onPress={() => {
                          if (linkedExpense) {
                            // Queue expense opening, then close contribution modal.
                            setPendingReadonlyExpense(linkedExpense);
                            setSelectedContribution(null);
                          } else {
                            Alert.alert('Kayıt bulunamadı', 'Bağlı masraf kaydı görüntülenemedi.');
                          }
                        }}
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
                    );
                  })}
                </View>
              )}

              <TouchableOpacity
                onPress={() => openReceipts(selectedContribution.receiptUrls.length ? selectedContribution.receiptUrls : [selectedContribution.receiptUrl])}
                style={{ marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: '#fff' }}
              >
                <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Dekontları İndir / Aç</Text>
              </TouchableOpacity>
            </Card>
          ) : null}
        </ScrollView>
      </Modal>
      </ScrollView>
      <BottomBannerAd />
    </View>
  );
}
