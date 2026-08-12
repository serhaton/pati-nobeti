import { CommunityAnimal, setAnimalsData } from '../data/animalStore';
import {
  applySupabaseSnapshot,
  BaseCommunity,
  CommunityMember,
  AppUser,
} from '../data/mock';
import { FeedingPoint, FeedingRecord, setFeedingPointsData, setFeedingRecordsData } from '../data/feedingPointStore';
import { isSupabaseDataEnabled, supabase } from './supabase';

export type SupabaseSyncResult = {
  usedSupabaseMode: boolean;
  communitiesLoaded: boolean;
  communitiesQueryError: string | null;
  communitiesTableMissing: boolean;
  syncError: string | null;
};

function formatQueryError(tableName: string, error: any): string {
  if (!error) return '';
  const code = error.code ? `[${error.code}] ` : '';
  const details = [error.message, error.details, error.hint].filter(Boolean).join(' - ');
  return `${tableName}: ${code}${details}`;
}

function toStringId(value: any, fallback: string): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function mapAnimalType(value: any): 'Kedi' | 'Köpek' {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'dog' || normalized === 'kopek' || normalized === 'köpek') return 'Köpek';
  return 'Kedi';
}

function mapCommunityRows(rows: any[]): BaseCommunity[] {
  return rows.map((row, index) => ({
    id: toStringId(row.id, `community-${index + 1}`),
    name: String(row.name ?? `Topluluk ${index + 1}`),
    neighborhood: String(row.neighborhood ?? 'Belirtilmedi'),
    latitude: Number(row.latitude ?? row.lat ?? 41.018101),
    longitude: Number(row.longitude ?? row.lng ?? 29.125607),
    defaultZoom: Number(row.default_zoom ?? row.defaultZoom ?? 17),
  }));
}

function mapProfileRows(rows: any[]): AppUser[] {
  return rows.map((row, index) => ({
    id: toStringId(row.id, `user-${index + 1}`),
    username: String(row.username ?? row.name ?? row.full_name ?? `user${index + 1}`).replace(/\s+/g, '.').toLowerCase(),
    fullName: String(row.full_name ?? row.name ?? row.username ?? `Kullanici ${index + 1}`),
    authMethod: 'password',
    status: row.status === 'passive' ? 'passive' : 'active',
  }));
}

function mapCommunityMemberRows(rows: any[]): CommunityMember[] {
  return rows.map((row, index) => ({
    // Count only truly active memberships in community summaries.
    // Pending/rejected/passive must not be treated as active.
    
    id: toStringId(row.id, `cm-${index + 1}`),
    communityId: toStringId(row.community_id, '1'),
    userId: toStringId(row.user_id, 'user-1'),
    role: row.role === 'admin' ? 'admin' : 'member',
    status: row.status === 'active' || row.status === 'approved' ? 'active' : 'passive',
    joinedAt: String(row.created_at ?? new Date().toISOString()),
  }));
}

function mapAnimalRows(rows: any[]): CommunityAnimal[] {
  return rows.map((row, index) => ({
    id: toStringId(row.id, `animal-${index + 1}`),
    communityId: toStringId(row.community_id, '1'),
    name: String(row.name ?? `Can Dost ${index + 1}`),
    type: mapAnimalType(row.animal_type),
    breed: String(row.cins ?? row.color ?? 'Melez'),
    gender: row.gender === 'Erkek' || row.gender === 'Dişi' || row.gender === 'Bilinmiyor' ? row.gender : 'Bilinmiyor',
    isSterilized: Boolean(row.neutered ?? false),
    birthDate: String(row.birth_date ?? '2022-01-01'),
    location: String(row.location ?? row.neighborhood ?? 'Belirtilmedi'),
    vaccinationSchedule: [],
    treatmentSchedule: [],
    photoUris: row.photo_url ? [String(row.photo_url)] : [],
  }));
}

function mapFeedingPointRows(rows: any[]): FeedingPoint[] {
  return rows.map((row, index) => ({
    id: toStringId(row.id, `point-${index + 1}`),
    communityId: toStringId(row.community_id, '1'),
    name: String(row.name ?? `Nokta ${index + 1}`),
    lat: Number(row.latitude ?? row.lat ?? 41.018101),
    lng: Number(row.longitude ?? row.lng ?? 29.125607),
    type: String(row.animal_type ?? row.type ?? 'Kedi + Köpek'),
    status: String(row.status ?? row.notes ?? 'Durum belirtilmedi'),
    photoUri: row.photo_uri ? String(row.photo_uri) : undefined,
  }));
}

function mapFeedingLogRows(rows: any[]): FeedingRecord[] {
  return rows.map((row, index) => {
    const fedAtDate = row.fed_at ? new Date(row.fed_at) : new Date();
    return {
      id: toStringId(row.id, `record-${index + 1}`),
      pointId: toStringId(row.feeding_point_id, '1'),
      fedAt: fedAtDate.toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      feederName: String(row.feeder_name ?? row.fed_by_name ?? 'Bilinmiyor'),
      note: row.notes ? String(row.notes) : undefined,
      fedAtDateTime: fedAtDate.toISOString(),
    };
  });
}

export async function syncMockDataFromSupabase(): Promise<SupabaseSyncResult> {
  if (!isSupabaseDataEnabled()) {
    return {
      usedSupabaseMode: false,
      communitiesLoaded: false,
      communitiesQueryError: null,
      communitiesTableMissing: false,
      syncError: null,
    };
  }

  // In Supabase mode, start from an empty runtime snapshot and only hydrate from successful queries.
  applySupabaseSnapshot({
    communities: [],
    users: [],
    communityMembers: [],
    animals: [],
    feedingPoints: [],
    expenses: [],
    joinRequests: [],
  });
  setAnimalsData([]);
  setFeedingPointsData([]);
  setFeedingRecordsData([]);

  try {
    const [
      communitiesRes,
      profilesRes,
      communityMembersRes,
      animalsRes,
      feedingPointsRes,
      feedingLogsRes,
      expensesRes,
      joinRequestsRes,
    ] = await Promise.all([
      supabase.from('communities').select('*'),
      supabase.from('profiles').select('*'),
      supabase.from('community_members').select('*'),
      supabase.from('animals').select('*'),
      supabase.from('feeding_points').select('*'),
      supabase.from('feeding_logs').select('*'),
      supabase.from('expenses').select('*'),
      supabase.from('community_join_requests').select('*'),
    ]);

    const communitiesQueryError = communitiesRes.error
      ? [communitiesRes.error.message, communitiesRes.error.details, communitiesRes.error.hint]
        .filter(Boolean)
        .join(' - ')
      : null;

    const communitiesTableMissing = communitiesRes.error?.code === '42P01';
    const communitiesLoaded = !communitiesRes.error && Array.isArray(communitiesRes.data);
    const communities = communitiesLoaded ? mapCommunityRows(communitiesRes.data ?? []) : undefined;
    const users = !profilesRes.error && profilesRes.data ? mapProfileRows(profilesRes.data) : undefined;
    const members = !communityMembersRes.error && communityMembersRes.data ? mapCommunityMemberRows(communityMembersRes.data) : undefined;

    if (communities || users || members) {
      applySupabaseSnapshot({
        communities,
        users,
        communityMembers: members,
      });
    }

    if (!animalsRes.error && animalsRes.data) {
      const mappedAnimals = mapAnimalRows(animalsRes.data);
      setAnimalsData(mappedAnimals);
      applySupabaseSnapshot({
        animals: mappedAnimals.map((animal) => ({
          id: animal.id,
          communityId: animal.communityId,
          name: animal.name,
          type: animal.type,
          cins: animal.breed,
          location: animal.location,
        })),
      });
    }

    if (!feedingPointsRes.error && feedingPointsRes.data) {
      const mappedPoints = mapFeedingPointRows(feedingPointsRes.data);
      setFeedingPointsData(mappedPoints);
      applySupabaseSnapshot({ feedingPoints: mappedPoints });
    }

    if (!feedingLogsRes.error && feedingLogsRes.data) {
      setFeedingRecordsData(mapFeedingLogRows(feedingLogsRes.data));
    }

    if (!expensesRes.error && expensesRes.data) {
      const mappedExpenses = expensesRes.data.map((row: any, index: number) => ({
        id: toStringId(row.id, `expense-${index + 1}`),
        communityId: toStringId(row.community_id, '1'),
        title: String(row.title ?? 'Masraf'),
        vendor: String(row.vendor ?? 'Bilinmiyor'),
        amount: Number(row.amount ?? 0),
        paid: Number((row.amount ?? 0) - (row.due_amount ?? 0)),
        category: String(row.category ?? 'Diger'),
        date: row.created_at ? new Date(row.created_at).toLocaleDateString('tr-TR') : 'Belirtilmedi',
      }));
      applySupabaseSnapshot({ expenses: mappedExpenses });
    }

    if (!joinRequestsRes.error && joinRequestsRes.data) {
      const mappedRequests = joinRequestsRes.data.map((row: any, index: number) => {
        const name = String(row.name ?? row.requester_name ?? `Talep ${index + 1}`);
        const initials = name
          .split(' ')
          .map((part) => part[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();

        return {
          id: toStringId(row.id, `jr-${index + 1}`),
          name,
          initials,
          note: String(row.note ?? row.status ?? 'Katilim talebi'),
        };
      });
      applySupabaseSnapshot({ joinRequests: mappedRequests });
    }

    const errors = [
      formatQueryError('communities', communitiesRes.error),
      formatQueryError('profiles', profilesRes.error),
      formatQueryError('community_members', communityMembersRes.error),
      formatQueryError('animals', animalsRes.error),
      formatQueryError('feeding_points', feedingPointsRes.error),
      formatQueryError('feeding_logs', feedingLogsRes.error),
      formatQueryError('expenses', expensesRes.error),
      formatQueryError('community_join_requests', joinRequestsRes.error),
    ].filter((item) => item.length > 0);

    const syncError = errors.length > 0 ? errors.join(' | ') : null;

    return {
      usedSupabaseMode: true,
      communitiesLoaded,
      communitiesQueryError,
      communitiesTableMissing,
      syncError,
    };
  } catch (error: any) {
    const raw = [error?.message, error?.details, error?.hint].filter(Boolean).join(' - ');
    return {
      usedSupabaseMode: true,
      communitiesLoaded: false,
      communitiesQueryError: raw || 'Bilinmeyen Supabase servis hatasi',
      communitiesTableMissing: false,
      syncError: raw || 'Bilinmeyen Supabase servis hatasi',
    };
  }
}
