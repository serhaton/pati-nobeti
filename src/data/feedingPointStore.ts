import { feedingPoints } from './mock';
import { getAppDataSource, isSupabaseDataEnabled, supabase } from '../services/supabase';
import { resolveFileUrlForDisplay, uploadImageIfNeeded } from '../services/supabaseStorage';

export type FeedingPoint = {
  id: string;
  communityId: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
  status: string;
  photoUri?: string;
};

export type FeedingRecord = {
  id: string;
  pointId: string;
  fedAt: string;
  feederName: string;
  note?: string;
  fedAtDateTime?: string;
};

export type FeedingRecordFilter = {
  pointId?: string;
  feederName?: string;
};

let allFeedingPoints: FeedingPoint[] = getAppDataSource() === 'mock'
  ? feedingPoints.map((point, index) => ({
    ...point,
    communityId: point.communityId ?? (index === 0 ? '1' : index === 1 ? '2' : '3'),
  }))
  : [];

let feedingRecords: FeedingRecord[] = getAppDataSource() === 'mock' ? [
  { id: 'r1', pointId: '1', fedAt: 'Bugun 19:40', feederName: 'Elif Yilmaz', fedAtDateTime: toIsoWithOffset(0, 19, 40) },
  { id: 'r2', pointId: '1', fedAt: 'Bugun 15:10', feederName: 'Mert Kaya', fedAtDateTime: toIsoWithOffset(0, 15, 10) },
  { id: 'r3', pointId: '1', fedAt: 'Bugun 11:55', feederName: 'Sena Demir', fedAtDateTime: toIsoWithOffset(0, 11, 55) },
  { id: 'r4', pointId: '1', fedAt: 'Bugun 08:25', feederName: 'Can Ates', fedAtDateTime: toIsoWithOffset(0, 8, 25) },
  { id: 'r5', pointId: '1', fedAt: 'Dun 21:15', feederName: 'Aylin Tekin', fedAtDateTime: toIsoWithOffset(-1, 21, 15) },
  { id: 'r6', pointId: '2', fedAt: 'Bugun 18:05', feederName: 'Merve Yaman', fedAtDateTime: toIsoWithOffset(0, 18, 5) },
  { id: 'r7', pointId: '2', fedAt: 'Bugun 13:30', feederName: 'Gokhan Uslu', fedAtDateTime: toIsoWithOffset(0, 13, 30) },
  { id: 'r8', pointId: '2', fedAt: 'Bugun 09:05', feederName: 'Deniz Acar', fedAtDateTime: toIsoWithOffset(0, 9, 5) },
  { id: 'r9', pointId: '2', fedAt: 'Dun 20:50', feederName: 'Asli Ozturk', fedAtDateTime: toIsoWithOffset(-1, 20, 50) },
  { id: 'r10', pointId: '2', fedAt: 'Dun 16:10', feederName: 'Yigit Eren', fedAtDateTime: toIsoWithOffset(-1, 16, 10) },
  { id: 'r11', pointId: '3', fedAt: 'Bugun 20:15', feederName: 'Baris Korkmaz', fedAtDateTime: toIsoWithOffset(0, 20, 15) },
  { id: 'r12', pointId: '3', fedAt: 'Bugun 14:45', feederName: 'Sibel Kara', fedAtDateTime: toIsoWithOffset(0, 14, 45) },
  { id: 'r13', pointId: '3', fedAt: 'Bugun 10:20', feederName: 'Nihat Aksoy', fedAtDateTime: toIsoWithOffset(0, 10, 20) },
  { id: 'r14', pointId: '3', fedAt: 'Dun 22:00', feederName: 'Ece Turan', fedAtDateTime: toIsoWithOffset(-1, 22, 0) },
  { id: 'r15', pointId: '3', fedAt: 'Dun 17:35', feederName: 'Kaan Ileri', fedAtDateTime: toIsoWithOffset(-1, 17, 35) },
] : [];

export function setFeedingPointsData(points: FeedingPoint[]) {
  allFeedingPoints = points.map((point) => ({ ...point }));
}

export function setFeedingRecordsData(records: FeedingRecord[]) {
  feedingRecords = records.map((record) => ({ ...record }));
}

function toIsoWithOffset(dayOffset: number, hours: number, minutes: number): string {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

export function getAllFeedingPoints(): FeedingPoint[] {
  return allFeedingPoints.map((point) => ({ ...point }));
}

export function getFeedingPointById(id: string): FeedingPoint | null {
  const point = allFeedingPoints.find((item) => item.id === id);
  return point ? { ...point } : null;
}

function parseFeedingRecordDate(record: FeedingRecord): Date | null {
  if (record.fedAtDateTime) {
    const parsed = new Date(record.fedAtDateTime);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const value = record.fedAt.toLowerCase().trim();
  const timeMatch = value.match(/(\d{1,2}):(\d{2})$/);
  const hours = timeMatch ? Number(timeMatch[1]) : 0;
  const minutes = timeMatch ? Number(timeMatch[2]) : 0;

  if (value.startsWith('bugun')) {
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  if (value.startsWith('dun')) {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  return null;
}

export async function addCustomFeedingPoint(input: {
  communityId: string;
  name: string;
  lat: number;
  lng: number;
  photoUri?: string;
}): Promise<FeedingPoint> {
  let pointId = `custom-${Date.now()}`;
  let persistedPhotoUri = input.photoUri;

  if (persistedPhotoUri) {
    persistedPhotoUri = await uploadImageIfNeeded({
      uri: persistedPhotoUri,
      communityId: input.communityId,
      folder: 'feeding-points',
      filePrefix: input.communityId,
    });
  }

  if (isSupabaseDataEnabled()) {
    const { data, error } = await supabase
      .from('feeding_points')
      .insert({
        community_id: input.communityId,
        name: input.name,
        latitude: input.lat,
        longitude: input.lng,
        animal_type: 'both',
        photo_uri: persistedPhotoUri ?? null,
      })
      .select('id')
      .single();

    if (error) {
      throw formatPersistenceError(error, 'Besleme noktasi Supabase veritabanina kaydedilemedi.');
    }

    pointId = String(data.id);
  }

  const point: FeedingPoint = {
    id: pointId,
    communityId: input.communityId,
    name: input.name,
    lat: input.lat,
    lng: input.lng,
    type: 'Kedi + Kopek',
    status: 'Yeni eklendi',
    photoUri: persistedPhotoUri
      ? await resolveFileUrlForDisplay({ fileRef: persistedPhotoUri, expiresInSeconds: 1800 })
      : undefined,
  };

  allFeedingPoints.unshift(point);

  return { ...point };
}

export function getFeedingPointsByCommunity(communityId: string, searchText = ''): FeedingPoint[] {
  const normalized = searchText.trim().toLowerCase();

  return allFeedingPoints
    .filter((point) => point.communityId === communityId)
    .filter((point) => {
      if (!normalized) return true;
      return (
        point.name.toLowerCase().includes(normalized) ||
        point.status.toLowerCase().includes(normalized) ||
        point.type.toLowerCase().includes(normalized)
      );
    })
    .map((point) => ({ ...point }));
}

export async function updateFeedingPoint(
  id: string,
  updates: {
    name: string;
    photoUri?: string;
    removePhoto?: boolean;
  }
): Promise<FeedingPoint | null> {
  const index = allFeedingPoints.findIndex((item) => item.id === id);
  if (index < 0) return null;

  let persistedPhotoUri: string | undefined;
  if (!updates.removePhoto) {
    persistedPhotoUri = await uploadImageIfNeeded({
      uri: updates.photoUri,
      communityId: allFeedingPoints[index].communityId,
      folder: 'feeding-points',
      filePrefix: allFeedingPoints[index].communityId,
    });
  }

  if (isSupabaseDataEnabled()) {
    const { data, error } = await supabase
      .from('feeding_points')
      .update({
        name: updates.name,
        photo_uri: updates.removePhoto
          ? null
          : (persistedPhotoUri ?? allFeedingPoints[index].photoUri ?? null),
      })
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      throw formatPersistenceError(error, 'Besleme noktasi Supabase veritabaninda guncellenemedi.');
    }

    if (!data) {
      throw new Error('Supabase kaydi bulunamadi. Listeyi yenileyip tekrar deneyin.');
    }
  }

  const resolvedPhotoUri = persistedPhotoUri
    ? await resolveFileUrlForDisplay({ fileRef: persistedPhotoUri, expiresInSeconds: 1800 })
    : undefined;

  allFeedingPoints[index] = {
    ...allFeedingPoints[index],
    name: updates.name,
    photoUri: updates.removePhoto ? undefined : (resolvedPhotoUri ?? allFeedingPoints[index].photoUri),
    status: 'Guncellendi',
  };

  return { ...allFeedingPoints[index] };
}

export function getRecentFeedingRecords(pointId: string, limit = 5): FeedingRecord[] {
  return feedingRecords
    .filter((record) => record.pointId === pointId)
    .sort((left, right) => {
      const leftTime = parseFeedingRecordDate(left)?.getTime() ?? 0;
      const rightTime = parseFeedingRecordDate(right)?.getTime() ?? 0;
      return rightTime - leftTime;
    })
    .slice(0, limit)
    .map((record) => ({ ...record }));
}

export function getFeedingRecordById(id: string): FeedingRecord | null {
  const record = feedingRecords.find((item) => item.id === id);
  return record ? { ...record } : null;
}

export function getFeedingRecordsByCommunity(
  communityId: string,
  filter: FeedingRecordFilter = {}
): FeedingRecord[] {
  const normalizedFeederName = filter.feederName?.trim().toLowerCase() ?? '';
  const communityPointIds = new Set(
    allFeedingPoints
      .filter((point) => point.communityId === communityId)
      .map((point) => point.id)
  );

  return feedingRecords
    .filter((record) => communityPointIds.has(record.pointId))
    .filter((record) => {
      if (filter.pointId && record.pointId !== filter.pointId) return false;
      if (!normalizedFeederName) return true;
      return record.feederName.toLowerCase().includes(normalizedFeederName);
    })
    .sort((left, right) => {
      const leftTime = parseFeedingRecordDate(left)?.getTime() ?? 0;
      const rightTime = parseFeedingRecordDate(right)?.getTime() ?? 0;
      return rightTime - leftTime;
    })
    .map((record) => ({ ...record }));
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function getTodayFeedingRecordCountByCommunity(communityId: string): number {
  const communityPointIds = new Set(
    allFeedingPoints
      .filter((point) => point.communityId === communityId)
      .map((point) => point.id)
  );

  const today = new Date();

  return feedingRecords.filter((record) => {
    if (!communityPointIds.has(record.pointId)) return false;

    if (record.fedAtDateTime) {
      const fedAt = new Date(record.fedAtDateTime);
      return isSameLocalDay(fedAt, today);
    }

    return record.fedAt.toLowerCase().startsWith('bugun');
  }).length;
}

export function getTodayFeedingRecordCountByPoint(pointId: string): number {
  const today = new Date();

  return feedingRecords.filter((record) => {
    if (record.pointId !== pointId) return false;

    if (record.fedAtDateTime) {
      const fedAt = new Date(record.fedAtDateTime);
      return isSameLocalDay(fedAt, today);
    }

    return record.fedAt.toLowerCase().startsWith('bugun');
  }).length;
}

function formatFeedingTime(date: Date): string {
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isFutureDateTime(date: Date): boolean {
  return date.getTime() > Date.now();
}

function formatPersistenceError(error: any, fallback: string): Error {
  const parts = [error?.message, error?.details, error?.hint].filter(Boolean);
  if (parts.length === 0) return new Error(fallback);
  return new Error(parts.join(' - '));
}

export async function addFeedingRecord(input: {
  pointId: string;
  feederName: string;
  note?: string;
  fedAt?: Date;
  fedByUserId?: string;
}): Promise<FeedingRecord | null> {
  const pointIndex = allFeedingPoints.findIndex((item) => item.id === input.pointId);
  if (pointIndex < 0) return null;

  const date = input.fedAt ?? new Date();
  if (isFutureDateTime(date)) return null;

  let recordId = `rec-${Date.now()}`;

  if (isSupabaseDataEnabled()) {
    const point = allFeedingPoints[pointIndex];
    const payload: Record<string, any> = {
      community_id: point.communityId,
      feeding_point_id: input.pointId,
      fed_at: date.toISOString(),
      feeder_name: input.feederName,
      notes: input.note ?? null,
    };

    if (input.fedByUserId) {
      payload.fed_by = input.fedByUserId;
    }

    const { data, error } = await supabase
      .from('feeding_logs')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      throw formatPersistenceError(error, 'Besleme kaydi Supabase veritabanina kaydedilemedi.');
    }

    recordId = String(data.id);
  }

  const record: FeedingRecord = {
    id: recordId,
    pointId: input.pointId,
    fedAt: formatFeedingTime(date),
    feederName: input.feederName,
    note: input.note,
    fedAtDateTime: date.toISOString(),
  };

  feedingRecords.unshift(record);

  allFeedingPoints[pointIndex] = {
    ...allFeedingPoints[pointIndex],
    status: `Son besleme: ${record.fedAt}`,
  };

  return { ...record };
}

export async function updateFeedingRecord(
  id: string,
  updates: {
    pointId: string;
    feederName: string;
    note?: string;
    fedAt: Date;
    fedByUserId?: string;
  }
): Promise<FeedingRecord | null> {
  const index = feedingRecords.findIndex((item) => item.id === id);
  if (index < 0) return null;

  const pointIndex = allFeedingPoints.findIndex((item) => item.id === updates.pointId);
  if (pointIndex < 0) return null;

  if (isFutureDateTime(updates.fedAt)) return null;

  if (isSupabaseDataEnabled()) {
    const point = allFeedingPoints[pointIndex];
    const payload: Record<string, any> = {
      community_id: point.communityId,
      feeding_point_id: updates.pointId,
      fed_at: updates.fedAt.toISOString(),
      feeder_name: updates.feederName,
      notes: updates.note ?? null,
    };

    if (updates.fedByUserId) {
      payload.fed_by = updates.fedByUserId;
    }

    const { data, error } = await supabase
      .from('feeding_logs')
      .update(payload)
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      throw formatPersistenceError(error, 'Besleme kaydi Supabase veritabaninda guncellenemedi.');
    }

    if (!data) {
      throw new Error('Supabase kaydi bulunamadi. Listeyi yenileyip tekrar deneyin.');
    }
  }

  const updatedRecord: FeedingRecord = {
    ...feedingRecords[index],
    pointId: updates.pointId,
    feederName: updates.feederName,
    note: updates.note,
    fedAt: formatFeedingTime(updates.fedAt),
    fedAtDateTime: updates.fedAt.toISOString(),
  };

  feedingRecords[index] = updatedRecord;

  allFeedingPoints[pointIndex] = {
    ...allFeedingPoints[pointIndex],
    status: `Son besleme: ${updatedRecord.fedAt}`,
  };

  return { ...updatedRecord };
}
