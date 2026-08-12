import { isSupabaseDataEnabled, supabase } from './supabase';

export type VeterinarianRecord = {
  id: string;
  communityId: string;
  globalVeterinarianId: string;
  clinicName: string;
  veterinarianName: string;
  phone: string;
  overrideVeterinarianName: string;
  overridePhone: string;
  locationLabel: string;
  latitude: number;
  longitude: number;
  notes: string;
  distanceKm?: number;
  createdAt: string;
};

export type GlobalVeterinarianRecord = {
  id: string;
  clinicName: string;
  defaultVeterinarianName: string;
  defaultPhone: string;
  locationLabel: string;
  latitude: number;
  longitude: number;
  city: string;
  district: string;
  distanceKm?: number;
};

let mockGlobalVeterinarians: GlobalVeterinarianRecord[] = [];
let mockCommunityVeterinarians: Array<{
  id: string;
  communityId: string;
  globalVeterinarianId: string;
  overrideVeterinarianName: string;
  overridePhone: string;
  notes: string;
  createdAt: string;
}> = [];

function formatError(error: any, fallback: string): Error {
  const details = [error?.message, error?.details, error?.hint].filter(Boolean).join(' - ');
  return new Error(details || fallback);
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function getDistanceKm(left: { latitude: number; longitude: number }, right: { latitude: number; longitude: number }): number {
  const earthRadiusKm = 6371;
  const deltaLatitude = toRadians(right.latitude - left.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);

  const a =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
    Math.sin(deltaLongitude / 2) * Math.sin(deltaLongitude / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function mergeVeterinarianRow(row: any): VeterinarianRecord {
  const globalVet = row.global_veterinarians ?? {};
  const overrideName = String(row.override_veterinarian_name ?? '').trim();
  const overridePhone = String(row.override_phone ?? '').trim();

  return {
    id: String(row.id),
    communityId: String(row.community_id),
    globalVeterinarianId: String(row.global_veterinarian_id),
    clinicName: String(globalVet.clinic_name ?? ''),
    veterinarianName: overrideName || String(globalVet.default_veterinarian_name ?? ''),
    phone: overridePhone || String(globalVet.default_phone ?? ''),
    overrideVeterinarianName: overrideName,
    overridePhone,
    locationLabel: String(globalVet.location_label ?? ''),
    latitude: Number(globalVet.latitude ?? 0),
    longitude: Number(globalVet.longitude ?? 0),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

export async function getVeterinariansByCommunity(communityId: string): Promise<VeterinarianRecord[]> {
  if (!isSupabaseDataEnabled()) {
    return mockCommunityVeterinarians
      .filter((item) => item.communityId === communityId)
      .map((item) => {
        const globalVet = mockGlobalVeterinarians.find((candidate) => candidate.id === item.globalVeterinarianId);
        return {
          id: item.id,
          communityId: item.communityId,
          globalVeterinarianId: item.globalVeterinarianId,
          clinicName: globalVet?.clinicName ?? '',
          veterinarianName: item.overrideVeterinarianName || globalVet?.defaultVeterinarianName || '',
          phone: item.overridePhone || globalVet?.defaultPhone || '',
          overrideVeterinarianName: item.overrideVeterinarianName,
          overridePhone: item.overridePhone,
          locationLabel: globalVet?.locationLabel ?? '',
          latitude: globalVet?.latitude ?? 0,
          longitude: globalVet?.longitude ?? 0,
          notes: item.notes,
          createdAt: item.createdAt,
        } satisfies VeterinarianRecord;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  const { data, error } = await supabase
    .from('community_veterinarians')
    .select(
      'id, community_id, global_veterinarian_id, override_veterinarian_name, override_phone, notes, created_at, global_veterinarians!inner(id, clinic_name, default_veterinarian_name, default_phone, location_label, latitude, longitude)'
    )
    .eq('community_id', communityId)
    .order('created_at', { ascending: false });

  if (error) {
    throw formatError(error, 'Veteriner listesi okunamadı.');
  }

  return (data ?? []).map(mergeVeterinarianRow);
}

export async function getGlobalVeterinarians(input?: {
  nearLatitude?: number;
  nearLongitude?: number;
  maxDistanceKm?: number;
}): Promise<GlobalVeterinarianRecord[]> {
  const centerLatitude = Number(input?.nearLatitude);
  const centerLongitude = Number(input?.nearLongitude);
  const hasCenter = Number.isFinite(centerLatitude) && Number.isFinite(centerLongitude);
  const hasMaxDistance = typeof input?.maxDistanceKm === 'number' && Number.isFinite(input.maxDistanceKm);

  if (!isSupabaseDataEnabled()) {
    return mockGlobalVeterinarians
      .map((item) => {
        if (!hasCenter) return item;
        const distanceKm = getDistanceKm(
          { latitude: centerLatitude, longitude: centerLongitude },
          { latitude: item.latitude, longitude: item.longitude }
        );
        return { ...item, distanceKm };
      })
      .filter((item) => (hasMaxDistance && typeof item.distanceKm === 'number' ? item.distanceKm <= Number(input?.maxDistanceKm) : true))
      .sort((left, right) => {
        if (typeof left.distanceKm === 'number' && typeof right.distanceKm === 'number') {
          return left.distanceKm - right.distanceKm;
        }
        return left.clinicName.localeCompare(right.clinicName);
      });
  }

  const { data, error } = await supabase
    .from('global_veterinarians')
    .select('id, clinic_name, default_veterinarian_name, default_phone, location_label, latitude, longitude, city, district')
    .eq('is_active', true)
    .order('clinic_name', { ascending: true });

  if (error) {
    throw formatError(error, 'Global veteriner listesi okunamadı.');
  }

  const records = (data ?? []).map((row: any) => {
    const record: GlobalVeterinarianRecord = {
      id: String(row.id),
      clinicName: String(row.clinic_name ?? ''),
      defaultVeterinarianName: String(row.default_veterinarian_name ?? ''),
      defaultPhone: String(row.default_phone ?? ''),
      locationLabel: String(row.location_label ?? ''),
      latitude: Number(row.latitude ?? 0),
      longitude: Number(row.longitude ?? 0),
      city: String(row.city ?? ''),
      district: String(row.district ?? ''),
    };

    if (!hasCenter) return record;

    return {
      ...record,
      distanceKm: getDistanceKm(
        { latitude: centerLatitude, longitude: centerLongitude },
        { latitude: record.latitude, longitude: record.longitude }
      ),
    };
  });

  return records
    .filter((item) => (hasMaxDistance && typeof item.distanceKm === 'number' ? item.distanceKm <= Number(input?.maxDistanceKm) : true))
    .sort((left, right) => {
      if (typeof left.distanceKm === 'number' && typeof right.distanceKm === 'number') {
        return left.distanceKm - right.distanceKm;
      }
      return left.clinicName.localeCompare(right.clinicName);
    });
}

export async function upsertCommunityVeterinarian(input: {
  communityId: string;
  globalVeterinarianId: string;
  overrideVeterinarianName?: string;
  overridePhone?: string;
  notes?: string;
}): Promise<VeterinarianRecord> {
  if (!isSupabaseDataEnabled()) {
    const existing = mockCommunityVeterinarians.find(
      (item) => item.communityId === input.communityId && item.globalVeterinarianId === input.globalVeterinarianId
    );

    const globalVet = mockGlobalVeterinarians.find((item) => item.id === input.globalVeterinarianId);
    if (!globalVet) {
      throw new Error('Global veteriner kaydı bulunamadı.');
    }

    const timestamp = new Date().toISOString();
    const nextRow = {
      id: existing?.id ?? `community-vet-${Date.now()}`,
      communityId: input.communityId,
      globalVeterinarianId: input.globalVeterinarianId,
      overrideVeterinarianName: String(input.overrideVeterinarianName ?? '').trim(),
      overridePhone: String(input.overridePhone ?? '').trim(),
      notes: String(input.notes ?? '').trim(),
      createdAt: existing?.createdAt ?? timestamp,
    };

    mockCommunityVeterinarians = [
      nextRow,
      ...mockCommunityVeterinarians.filter((item) => item.id !== nextRow.id),
    ];

    return {
      id: nextRow.id,
      communityId: input.communityId,
      globalVeterinarianId: input.globalVeterinarianId,
      clinicName: globalVet.clinicName,
      veterinarianName: nextRow.overrideVeterinarianName || globalVet.defaultVeterinarianName,
      phone: nextRow.overridePhone || globalVet.defaultPhone,
      overrideVeterinarianName: nextRow.overrideVeterinarianName,
      overridePhone: nextRow.overridePhone,
      locationLabel: globalVet.locationLabel,
      latitude: globalVet.latitude,
      longitude: globalVet.longitude,
      notes: nextRow.notes,
      createdAt: nextRow.createdAt,
    };
  }

  const { data, error } = await supabase
    .from('community_veterinarians')
    .upsert({
      community_id: input.communityId,
      global_veterinarian_id: input.globalVeterinarianId,
      override_veterinarian_name: String(input.overrideVeterinarianName ?? '').trim() || null,
      override_phone: String(input.overridePhone ?? '').trim() || null,
      notes: String(input.notes ?? '').trim() || null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'community_id,global_veterinarian_id',
    })
    .select(
      'id, community_id, global_veterinarian_id, override_veterinarian_name, override_phone, notes, created_at, global_veterinarians!inner(id, clinic_name, default_veterinarian_name, default_phone, location_label, latitude, longitude)'
    )
    .single();

  if (error) {
    throw formatError(error, 'Community veteriner secimi kaydedilemedi.');
  }

  return mergeVeterinarianRow(data);
}

export async function deleteCommunityVeterinarianSelection(input: {
  communityId: string;
  globalVeterinarianId: string;
}): Promise<void> {
  if (!isSupabaseDataEnabled()) {
    mockCommunityVeterinarians = mockCommunityVeterinarians.filter(
      (item) => !(item.communityId === input.communityId && item.globalVeterinarianId === input.globalVeterinarianId)
    );
    return;
  }

  const { error } = await supabase
    .from('community_veterinarians')
    .delete()
    .eq('community_id', input.communityId)
    .eq('global_veterinarian_id', input.globalVeterinarianId);

  if (error) {
    throw formatError(error, 'Topluluk veterineri kaydı silinemedi.');
  }
}
