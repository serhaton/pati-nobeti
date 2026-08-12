import { supabase, isSupabaseDataEnabled } from './supabase';

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
    throw new Error('Topluluk oluşturma yalnızca Supabase modunda destekleniyor.');
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
    throw new Error('Katılım isteği yalnızca Supabase modunda destekleniyor.');
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
    throw new Error('İstek onayi yalnızca Supabase modunda destekleniyor.');
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
    throw new Error('İstek reddi yalnızca Supabase modunda destekleniyor.');
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
    throw new Error('Üye güncelleme yalnızca Supabase modunda destekleniyor.');
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
