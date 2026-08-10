import { feedingPoints } from './mock';

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
};

const allFeedingPoints: FeedingPoint[] = feedingPoints.map((point, index) => ({
  ...point,
  communityId: index === 0 ? '1' : index === 1 ? '2' : '3',
}));

const feedingRecords: FeedingRecord[] = [
  { id: 'r1', pointId: '1', fedAt: 'Bugun 19:40', feederName: 'Elif Yilmaz' },
  { id: 'r2', pointId: '1', fedAt: 'Bugun 15:10', feederName: 'Mert Kaya' },
  { id: 'r3', pointId: '1', fedAt: 'Bugun 11:55', feederName: 'Sena Demir' },
  { id: 'r4', pointId: '1', fedAt: 'Bugun 08:25', feederName: 'Can Ates' },
  { id: 'r5', pointId: '1', fedAt: 'Dun 21:15', feederName: 'Aylin Tekin' },
  { id: 'r6', pointId: '2', fedAt: 'Bugun 18:05', feederName: 'Merve Yaman' },
  { id: 'r7', pointId: '2', fedAt: 'Bugun 13:30', feederName: 'Gokhan Uslu' },
  { id: 'r8', pointId: '2', fedAt: 'Bugun 09:05', feederName: 'Deniz Acar' },
  { id: 'r9', pointId: '2', fedAt: 'Dun 20:50', feederName: 'Asli Ozturk' },
  { id: 'r10', pointId: '2', fedAt: 'Dun 16:10', feederName: 'Yigit Eren' },
  { id: 'r11', pointId: '3', fedAt: 'Bugun 20:15', feederName: 'Baris Korkmaz' },
  { id: 'r12', pointId: '3', fedAt: 'Bugun 14:45', feederName: 'Sibel Kara' },
  { id: 'r13', pointId: '3', fedAt: 'Bugun 10:20', feederName: 'Nihat Aksoy' },
  { id: 'r14', pointId: '3', fedAt: 'Dun 22:00', feederName: 'Ece Turan' },
  { id: 'r15', pointId: '3', fedAt: 'Dun 17:35', feederName: 'Kaan Ileri' },
];

export function getAllFeedingPoints(): FeedingPoint[] {
  return allFeedingPoints.map((point) => ({ ...point }));
}

export function getFeedingPointById(id: string): FeedingPoint | null {
  const point = allFeedingPoints.find((item) => item.id === id);
  return point ? { ...point } : null;
}

export function addCustomFeedingPoint(input: {
  communityId: string;
  name: string;
  lat: number;
  lng: number;
  photoUri: string;
}): FeedingPoint {
  const point: FeedingPoint = {
    id: `custom-${Date.now()}`,
    communityId: input.communityId,
    name: input.name,
    lat: input.lat,
    lng: input.lng,
    type: 'Kedi + Kopek',
    status: 'Yeni eklendi',
    photoUri: input.photoUri,
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

export function updateFeedingPoint(
  id: string,
  updates: {
    name: string;
    photoUri?: string;
  }
): FeedingPoint | null {
  const index = allFeedingPoints.findIndex((item) => item.id === id);
  if (index < 0) return null;

  allFeedingPoints[index] = {
    ...allFeedingPoints[index],
    name: updates.name,
    photoUri: updates.photoUri ?? allFeedingPoints[index].photoUri,
    status: 'Guncellendi',
  };

  return { ...allFeedingPoints[index] };
}

export function getRecentFeedingRecords(pointId: string, limit = 5): FeedingRecord[] {
  return feedingRecords
    .filter((record) => record.pointId === pointId)
    .slice(0, limit)
    .map((record) => ({ ...record }));
}

function formatFeedingTime(date: Date): string {
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function addFeedingRecord(input: {
  pointId: string;
  feederName: string;
  note?: string;
  fedAt?: Date;
}): FeedingRecord | null {
  const pointIndex = allFeedingPoints.findIndex((item) => item.id === input.pointId);
  if (pointIndex < 0) return null;

  const date = input.fedAt ?? new Date();
  const record: FeedingRecord = {
    id: `rec-${Date.now()}`,
    pointId: input.pointId,
    fedAt: formatFeedingTime(date),
    feederName: input.feederName,
    note: input.note,
  };

  feedingRecords.unshift(record);

  allFeedingPoints[pointIndex] = {
    ...allFeedingPoints[pointIndex],
    status: `Son besleme: ${record.fedAt}`,
  };

  return { ...record };
}
