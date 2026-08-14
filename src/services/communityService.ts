import { supabase, isSupabaseDataEnabled } from './supabase';
import { resolveFileUrlForDisplay } from './supabaseStorage';

export type CommunityMembership = {
  communityId: string;
  status: string;
  role: string;
};

export type PendingJoinRequest = {
  id: string;
  communityId: string;
  userId: string;
  requesterName: string;
  note: string;
  status: string;
  createdAt: string;
};

export type ManagedCommunityMember = {
  id: string;
  communityId: string;
  userId: string;
  role: 'admin' | 'member';
  status: 'active' | 'passive' | 'pending' | 'approved' | 'rejected';
  joinedAt: string;
  fullName: string;
  username: string;
};

export type UserProfileSettings = {
  fullName: string;
  phone: string;
  avatarUrl: string;
};

const profileSettingsCache = new Map<string, UserProfileSettings>();

function isMissingColumnError(error: any, columnName: string): boolean {
  const code = String(error?.code ?? '').toLowerCase();
  const message = String(error?.message ?? '').toLowerCase();
  const details = String(error?.details ?? '').toLowerCase();

  if (code === '42703') return true;

  const needle = columnName.toLowerCase();
  return (
    (message.includes('does not exist') || message.includes('could not find')) && message.includes(needle)
  ) || (
    (details.includes('does not exist') || details.includes('could not find')) && details.includes(needle)
  );
}

function formatError(error: any, fallback: string): Error {
  const code = error?.code ? `[${error.code}] ` : '';
  const details = [error?.message, error?.details, error?.hint].filter(Boolean).join(' - ');
  return new Error(details ? `${code}${details}` : fallback);
}

export async function getMembershipsForUser(userId: string): Promise<CommunityMembership[]> {
  if (!isSupabaseDataEnabled()) return [];

  const { data, error } = await supabase
    .from('community_members')
    .select('community_id, status, role')
    .eq('user_id', userId);

  if (error) throw formatError(error, 'Üyelik bilgileri okunamadı.');

  return (data ?? []).map((row: any) => ({
    communityId: String(row.community_id),
    status: String(row.status ?? 'pending'),
    role: String(row.role ?? 'member'),
  }));
}

export async function createCommunityAndAssignAdmin(input: {
  name: string;
  neighborhood: string;
  description?: string;
  latitude: number;
  longitude: number;
  defaultZoom?: number;
  userId: string;
}): Promise<{ communityId: string }> {
  if (!isSupabaseDataEnabled()) {
    throw new Error('Topluluk oluşturma işlemi şu anda kullanılamıyor.');
  }

  const { data: communityData, error: communityError } = await supabase
    .from('communities')
    .insert({
      name: input.name,
      neighborhood: input.neighborhood,
      description: input.description ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
      default_zoom: input.defaultZoom ?? 17,
      created_by: input.userId,
    })
    .select('id')
    .single();

  if (communityError) {
    throw formatError(communityError, 'Topluluk oluşturulamadı.');
  }

  const communityId = String(communityData.id);

  const { error: memberError } = await supabase
    .from('community_members')
    .insert({
      community_id: communityId,
      user_id: input.userId,
      role: 'admin',
      status: 'active',
    });

  if (memberError) {
    throw formatError(memberError, 'Topluluk oluşturuldu ancak admin üyeliği oluşturulamadı.');
  }

  return { communityId };
}

export async function sendJoinRequest(input: {
  communityId: string;
  userId: string;
  requesterName: string;
  note: string;
}): Promise<void> {
  if (!isSupabaseDataEnabled()) {
    throw new Error('Katılım isteği gönderme işlemi şu anda kullanılamıyor.');
  }

  // Re-request flow: remove previous request row, then create a fresh pending request.
  const { error: deleteError } = await supabase
    .from('community_join_requests')
    .delete()
    .eq('community_id', input.communityId)
    .eq('user_id', input.userId);

  if (deleteError) {
    throw formatError(deleteError, 'Önceki katılım isteği temizlenemedi.');
  }

  const { error: insertRequestError } = await supabase
    .from('community_join_requests')
    .insert({
      community_id: input.communityId,
      user_id: input.userId,
      requester_name: input.requesterName,
      note: input.note,
      status: 'pending',
    });

  if (insertRequestError) {
    throw formatError(insertRequestError, 'Katılım isteği gönderilemedi.');
  }

  const { error: upsertMemberError } = await supabase
    .from('community_members')
    .upsert({
      community_id: input.communityId,
      user_id: input.userId,
      role: 'member',
      status: 'pending',
    }, { onConflict: 'community_id,user_id' });

  if (upsertMemberError) {
    throw formatError(upsertMemberError, 'Üyelik durumu güncellenemedi.');
  }
}

export async function getPendingJoinRequestsForCommunity(communityId: string): Promise<PendingJoinRequest[]> {
  if (!isSupabaseDataEnabled()) return [];

  const { data, error } = await supabase
    .from('community_join_requests')
    .select('id, community_id, user_id, requester_name, note, status, created_at')
    .eq('community_id', communityId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    throw formatError(error, 'Katılım istekleri okunamadı.');
  }

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    communityId: String(row.community_id),
    userId: String(row.user_id),
    requesterName: String(row.requester_name ?? 'Bilinmiyor'),
    note: String(row.note ?? ''),
    status: String(row.status ?? 'pending'),
    createdAt: String(row.created_at ?? ''),
  }));
}

export async function approveJoinRequest(input: {
  requestId: string;
  communityId: string;
  userId: string;
}): Promise<void> {
  if (!isSupabaseDataEnabled()) {
    throw new Error('İstek onayı işlemi şu anda kullanılamıyor.');
  }

  const { error: requestError } = await supabase
    .from('community_join_requests')
    .update({ status: 'approved' })
    .eq('id', input.requestId);

  if (requestError) {
    throw formatError(requestError, 'Katılım isteği onaylanamadı.');
  }

  const { error: memberError } = await supabase
    .from('community_members')
    .upsert({
      community_id: input.communityId,
      user_id: input.userId,
      role: 'member',
      status: 'active',
    }, { onConflict: 'community_id,user_id' });

  if (memberError) {
    throw formatError(memberError, 'Üyelik active durumuna getirilemedi.');
  }
}

export async function rejectJoinRequest(input: {
  requestId: string;
  communityId: string;
  userId: string;
}): Promise<void> {
  if (!isSupabaseDataEnabled()) {
    throw new Error('İstek reddi işlemi şu anda kullanılamıyor.');
  }

  const { error: requestError } = await supabase
    .from('community_join_requests')
    .update({ status: 'rejected' })
    .eq('id', input.requestId);

  if (requestError) {
    throw formatError(requestError, 'Katılım isteği reddedilemedi.');
  }

  const { error: memberError } = await supabase
    .from('community_members')
    .upsert({
      community_id: input.communityId,
      user_id: input.userId,
      role: 'member',
      status: 'rejected',
    }, { onConflict: 'community_id,user_id' });

  if (memberError) {
    throw formatError(memberError, 'Üyelik rejected durumuna getirilemedi.');
  }
}

export async function getCommunityMembersForAdmin(communityId: string): Promise<ManagedCommunityMember[]> {
  if (!isSupabaseDataEnabled()) return [];

  const { data: memberRows, error: memberError } = await supabase
    .from('community_members')
    .select('id, community_id, user_id, role, status, created_at')
    .eq('community_id', communityId)
    .order('created_at', { ascending: true });

  if (memberError) {
    throw formatError(memberError, 'Topluluk üyeleri okunamadı.');
  }

  const members = memberRows ?? [];
  const userIds = members
    .map((row: any) => String(row.user_id ?? ''))
    .filter((id) => id.length > 0);

  let profileMap = new Map<string, { fullName: string; username: string }>();

  if (userIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, username, name')
      .in('id', userIds);

    if (profileError) {
      throw formatError(profileError, 'Üye profil bilgileri okunamadı.');
    }

    profileMap = new Map(
      (profileRows ?? []).map((row: any) => [
        String(row.id),
        {
          fullName: String(row.full_name ?? row.name ?? row.username ?? 'Bilinmiyor'),
          username: String(row.username ?? ''),
        },
      ])
    );
  }

  return members.map((row: any) => {
    const userId = String(row.user_id ?? '');
    const profile = profileMap.get(userId);

    return {
      id: String(row.id),
      communityId: String(row.community_id),
      userId,
      role: row.role === 'admin' ? 'admin' : 'member',
      status: String(row.status ?? 'pending') as ManagedCommunityMember['status'],
      joinedAt: String(row.created_at ?? ''),
      fullName: profile?.fullName ?? 'Bilinmiyor',
      username: profile?.username ?? '',
    };
  });
}

export async function updateCommunityMemberByAdmin(input: {
  membershipId: string;
  communityId: string;
  role?: 'admin' | 'member';
  status?: 'active' | 'passive' | 'pending' | 'approved' | 'rejected';
}): Promise<void> {
  if (!isSupabaseDataEnabled()) {
    throw new Error('Üye güncelleme işlemi şu anda kullanılamıyor.');
  }

  const payload: Record<string, string> = {};
  if (input.role) payload.role = input.role;
  if (input.status) payload.status = input.status;

  if (Object.keys(payload).length === 0) {
    throw new Error('Güncellenecek alan bulunamadı.');
  }

  const { error } = await supabase
    .from('community_members')
    .update(payload)
    .eq('id', input.membershipId)
    .eq('community_id', input.communityId);

  if (error) {
    throw formatError(error, 'Üye bilgisi güncellenemedi.');
  }
}

export async function leaveCommunityByUser(input: {
  communityId: string;
  userId: string;
}): Promise<void> {
  if (!isSupabaseDataEnabled()) {
    throw new Error('Topluluktan ayrılma işlemi şu anda kullanılamıyor.');
  }

  const { error } = await supabase
    .from('community_members')
    .update({ status: 'passive' })
    .eq('community_id', input.communityId)
    .eq('user_id', input.userId);

  if (error) {
    throw formatError(error, 'Topluluktan ayrılma işlemi kaydedilemedi.');
  }
}

export async function getUserProfileSettings(userId: string): Promise<UserProfileSettings> {
  if (!isSupabaseDataEnabled()) {
    return profileSettingsCache.get(userId) ?? {
      fullName: '',
      phone: '',
      avatarUrl: '',
    };
  }

  const withPhone = await supabase
    .from('profiles')
    .select('full_name, name, avatar_url, phone')
    .eq('id', userId)
    .maybeSingle();

  let data: any = withPhone.data;
  let error = withPhone.error;

  if (error && isMissingColumnError(error, 'phone')) {
    const fallback = await supabase
      .from('profiles')
      .select('full_name, name, avatar_url')
      .eq('id', userId)
      .maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw formatError(error, 'Profil bilgileri okunamadı.');
  }

  const fromDb: UserProfileSettings = {
    fullName: String(data?.full_name ?? data?.name ?? ''),
    phone: String(data?.phone ?? ''),
    avatarUrl: String(data?.avatar_url ?? ''),
  };

  let fallbackPhoneFromMembership = '';
  if (!fromDb.phone) {
    const phoneFromMembership = await supabase
      .from('community_members')
      .select('phone')
      .eq('user_id', userId)
      .not('phone', 'is', null)
      .limit(1);

    if (!phoneFromMembership.error) {
      const membershipPhone = String(phoneFromMembership.data?.[0]?.phone ?? '').trim();
      fallbackPhoneFromMembership = membershipPhone;
    } else if (!isMissingColumnError(phoneFromMembership.error, 'phone')) {
      // Optional fallback source failed; keep profile read resilient.
    }
  }

  const avatarForDisplay = fromDb.avatarUrl
    ? await resolveFileUrlForDisplay({ fileRef: fromDb.avatarUrl, expiresInSeconds: 1800 })
    : '';

  const cached = profileSettingsCache.get(userId);
  const merged: UserProfileSettings = {
    fullName: fromDb.fullName || cached?.fullName || '',
    phone: fromDb.phone || fallbackPhoneFromMembership || cached?.phone || '',
    avatarUrl: avatarForDisplay || cached?.avatarUrl || '',
  };

  profileSettingsCache.set(userId, merged);
  return merged;
}

export async function updateUserProfileSettings(input: {
  userId: string;
  fullName: string;
  phone: string;
  avatarUrl?: string;
}): Promise<void> {
  if (!isSupabaseDataEnabled()) {
    profileSettingsCache.set(input.userId, {
      fullName: input.fullName,
      phone: input.phone,
      avatarUrl: input.avatarUrl?.trim() || '',
    });
    return;
  }

  const basePayload: Record<string, any> = {
    full_name: input.fullName,
    name: input.fullName,
    avatar_url: input.avatarUrl?.trim() || null,
    status: 'active',
  };

  const payloadWithPhone = {
    ...basePayload,
    phone: input.phone.trim() || null,
  };

  const { error: firstError } = await supabase
    .from('profiles')
    .upsert({
      id: input.userId,
      ...payloadWithPhone,
    }, { onConflict: 'id' });

  if (firstError) {
    const phoneColumnMissing = isMissingColumnError(firstError, 'phone');

    if (!phoneColumnMissing) {
      throw formatError(firstError, 'Profil bilgileri güncellenemedi.');
    }

    const { error: fallbackError } = await supabase
      .from('profiles')
      .upsert({
        id: input.userId,
        ...basePayload,
      }, { onConflict: 'id' });

    if (fallbackError) {
      throw formatError(fallbackError, 'Profil bilgileri güncellenemedi.');
    }
  }

  profileSettingsCache.set(input.userId, {
    fullName: input.fullName,
    phone: input.phone,
    avatarUrl: input.avatarUrl?.trim() || '',
  });

  // Best-effort mirror into community_members, if custom columns exist in the project.
  // Some deployments may not have these optional columns yet.
  const { error: memberMirrorError } = await supabase
    .from('community_members')
    .update({
      full_name: input.fullName,
      phone: input.phone.trim() || null,
      photo_url: input.avatarUrl?.trim() || null,
    })
    .eq('user_id', input.userId);

  if (memberMirrorError) {
    const message = String(memberMirrorError?.message ?? '').toLowerCase();
    const details = String(memberMirrorError?.details ?? '').toLowerCase();
    const optionalColumnMissing =
      message.includes('full_name') ||
      message.includes('phone') ||
      message.includes('photo_url') ||
      details.includes('full_name') ||
      details.includes('phone') ||
      details.includes('photo_url');

    if (!optionalColumnMissing) {
      // Keep profile update as the source of truth; avoid failing the whole flow on mirror step.
      // Intentionally ignored.
    }
  }
}
