import { supabase, isSupabaseDataEnabled, withJwtFutureRetry } from './supabase';
import { resolveFileUrlForDisplay } from './supabaseStorage';
import { NOT_SPECIFIED_LABEL, UNKNOWN_MEMBER_LABEL } from '../constants/userLabels';

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

export type CommunityApprovalStatus = 'pending' | 'approved' | 'rejected';

export type AppAdminCommunityRecord = {
  id: string;
  name: string;
  neighborhood: string;
  description: string;
  status: CommunityApprovalStatus;
  createdAt: string;
  createdBy: string | null;
  createdByName: string;
};

export type CreatedByUserCommunityRecord = {
  id: string;
  name: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  defaultZoom: number;
  status: CommunityApprovalStatus;
  createdBy: string | null;
};

type CreatorProfileLite = {
  displayName: string;
  email: string | null;
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

function logSupabaseStageError(stage: string, error: any) {
  console.error(`[community:create][${stage}]`, {
    code: error?.code ?? null,
    message: error?.message ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  });
}

async function sendDirectNotificationToUser(input: {
  recipientUserId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  if (!isSupabaseDataEnabled()) return;

  const recipientUserId = String(input.recipientUserId ?? '').trim();
  const title = String(input.title ?? '').trim();
  const body = String(input.body ?? '').trim();
  if (!recipientUserId || !title || !body) return;

  try {
    await supabase.functions.invoke('admin-approval-push', {
      body: {
        directNotification: {
          recipientUserId,
          title,
          body,
          data: input.data ?? {},
        },
      },
    });
  } catch (error: any) {
    console.warn('[community][direct-notification:failed]', {
      recipientUserId,
      message: error?.message ?? null,
    });
  }
}

function decodeJwtPayload(accessToken: string | null | undefined): Record<string, any> | null {
  if (!accessToken) return null;

  const parts = accessToken.split('.');
  if (parts.length < 2) return null;

  try {
    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadBase64.padEnd(Math.ceil(payloadBase64.length / 4) * 4, '=');
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
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

export async function getCommunitiesCreatedByUser(userId: string): Promise<CreatedByUserCommunityRecord[]> {
  if (!isSupabaseDataEnabled()) return [];

  const { data, error } = await supabase
    .from('communities')
    .select('id, name, neighborhood, latitude, longitude, default_zoom, status, created_by')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });

  if (error) throw formatError(error, 'Oluşturduğun topluluklar okunamadı.');

  return (data ?? []).map((row: any) => {
    const rawStatus = String(row.status ?? 'pending').toLowerCase();
    const status: CommunityApprovalStatus = rawStatus === 'approved' || rawStatus === 'rejected' ? rawStatus : 'pending';

    return {
      id: String(row.id),
      name: String(row.name ?? ''),
      neighborhood: String(row.neighborhood ?? ''),
      latitude: Number(row.latitude ?? 41.018101),
      longitude: Number(row.longitude ?? 29.125607),
      defaultZoom: Number(row.default_zoom ?? 17),
      status,
      createdBy: row.created_by ? String(row.created_by) : null,
    };
  });
}

export async function updateCommunitySettingsByAdmin(input: {
  communityId: string;
  adminUserId: string;
  name: string;
  latitude: number;
  longitude: number;
  defaultZoom: number;
}): Promise<void> {
  if (!isSupabaseDataEnabled()) {
    throw new Error('Topluluk güncelleme işlemi şu anda kullanılamıyor.');
  }

  const payload = {
    name: input.name.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
    default_zoom: input.defaultZoom,
  };

  const { error } = await supabase
    .from('communities')
    .update(payload)
    .eq('id', input.communityId);

  if (error) {
    throw formatError(error, 'Topluluk bilgileri güncellenemedi.');
  }
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

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) {
    if (authError) logSupabaseStageError('auth-get-user', authError);
    throw new Error('[community:create:auth] Oturum doğrulanamadı. Lütfen tekrar giriş yapıp yeniden deneyin.');
  }

  const authUserId = String(authData.user.id);
  if (authUserId !== String(input.userId)) {
    console.warn('[community:create][auth-user-mismatch]', {
      inputUserId: input.userId,
      authUserId,
    });
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    logSupabaseStageError('auth-get-session', sessionError);
  }

  const jwtPayload = decodeJwtPayload(sessionData?.session?.access_token ?? null);
  console.log('[community:create][auth-context:client]', {
    authUserId,
    sessionUserId: sessionData?.session?.user?.id ?? null,
    jwtSub: jwtPayload?.sub ?? null,
    jwtRole: jwtPayload?.role ?? null,
    jwtAud: jwtPayload?.aud ?? null,
    jwtExp: jwtPayload?.exp ?? null,
  });

  const { data: dbAuthContext, error: dbAuthContextError } = await supabase.rpc('debug_auth_context');
  const missingDebugAuthContextFn =
    String(dbAuthContextError?.code ?? '').toLowerCase() === '42883'
    || String(dbAuthContextError?.message ?? '').toLowerCase().includes('debug_auth_context');

  if (dbAuthContextError && !missingDebugAuthContextFn) {
    logSupabaseStageError('auth-context-db', dbAuthContextError);
  } else if (missingDebugAuthContextFn) {
    console.warn('[community:create][auth-context-db]', {
      warning: 'debug_auth_context function not found. Run latest db/rls.sql to enable DB auth context logs.',
    });
  } else {
    console.log('[community:create][auth-context:db]', dbAuthContext ?? null);
  }

  const communityInsertPayload = {
    name: input.name,
    neighborhood: input.neighborhood,
    description: input.description ?? null,
    latitude: input.latitude,
    longitude: input.longitude,
    default_zoom: input.defaultZoom ?? 17,
    status: 'pending' as const,
    created_by: authUserId,
  };

  console.log('[community:create][communities-insert:start]', {
    name: communityInsertPayload.name,
    neighborhood: communityInsertPayload.neighborhood,
    status: communityInsertPayload.status,
    createdBy: communityInsertPayload.created_by,
  });
  console.log('[community:create][communities-insert:payload]', communityInsertPayload);

  const { data: communityData, error: communityError } = await withJwtFutureRetry(
    'community-create:communities-insert',
    async () => supabase
      .from('communities')
      .insert(communityInsertPayload)
      .select('id')
      .single()
  );

  if (communityError) {
    logSupabaseStageError('communities-insert', communityError);
    throw new Error(`[community:create:communities-insert] ${formatError(communityError, 'Topluluk oluşturulamadı.').message}`);
  }

  const communityId = String(communityData.id);
  console.log('[community:create][communities-insert:ok]', { communityId });

  const memberInsertPayload = {
    community_id: communityId,
    user_id: authUserId,
    role: 'admin' as const,
    status: 'pending' as const,
  };

  console.log('[community:create][community-members-insert:start]', {
    communityId,
    role: memberInsertPayload.role,
    status: memberInsertPayload.status,
    userId: memberInsertPayload.user_id,
  });
  console.log('[community:create][community-members-insert:payload]', memberInsertPayload);

  const { error: memberError } = await withJwtFutureRetry(
    'community-create:community-members-insert',
    async () => supabase
      .from('community_members')
      .insert(memberInsertPayload)
  );

  if (memberError) {
    logSupabaseStageError('community-members-insert', memberError);
    throw new Error(`[community:create:community-members-insert] ${formatError(memberError, 'Topluluk oluşturuldu ancak admin üyeliği oluşturulamadı.').message}`);
  }

  console.log('[community:create][community-members-insert:ok]', { communityId });

  // Fallback dispatch: process queued notification events immediately from client auth context.
  try {
    await supabase.functions.invoke('admin-approval-push', {
      body: {},
    });
  } catch (dispatchError: any) {
    console.warn('[community:create][notify-dispatch-fallback:failed]', {
      communityId,
      message: dispatchError?.message ?? null,
    });
  }

  return { communityId };
}

export async function getIsCurrentUserAppAdmin(userId: string): Promise<boolean> {
  if (!isSupabaseDataEnabled()) return false;

  const { data, error } = await supabase
    .from('profiles')
    .select('is_app_admin')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw formatError(error, 'Sistem yönetici bilgisi okunamadı.');
  }

  return Boolean(data?.is_app_admin);
}

export async function getCommunitiesForAppAdmin(): Promise<AppAdminCommunityRecord[]> {
  if (!isSupabaseDataEnabled()) return [];

  const { data, error } = await supabase
    .from('communities')
    .select('id, name, neighborhood, description, status, created_by, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw formatError(error, 'Topluluklar okunamadı.');
  }

  const rows = data ?? [];
  const creatorIds = Array.from(new Set(rows.map((row: any) => String(row.created_by ?? '')).filter(Boolean)));
  let creatorInfoById = new Map<string, CreatorProfileLite>();

  if (creatorIds.length > 0) {
    const { data: creatorRows, error: creatorError } = await supabase
      .from('profiles')
      .select('id, full_name, username, name, email')
      .in('id', creatorIds);

    if (creatorError) {
      throw formatError(creatorError, 'Topluluk oluşturan kullanıcı bilgileri okunamadı.');
    }

    creatorInfoById = new Map(
      (creatorRows ?? []).map((row: any) => [
        String(row.id),
        {
          displayName: String(row.full_name ?? row.name ?? row.username ?? UNKNOWN_MEMBER_LABEL),
          email: row.email ? String(row.email) : null,
        },
      ])
    );
  }

  return rows.map((row: any) => {
    const rawStatus = String(row.status ?? 'pending').toLowerCase();
    const status: CommunityApprovalStatus = rawStatus === 'approved' || rawStatus === 'rejected' ? rawStatus : 'pending';
    const createdBy = row.created_by ? String(row.created_by) : null;
    const creatorInfo = createdBy ? creatorInfoById.get(createdBy) : null;
    const createdByName = creatorInfo
      ? (creatorInfo.email
        ? `${creatorInfo.displayName} (${creatorInfo.email})`
        : creatorInfo.displayName)
      : (createdBy ? UNKNOWN_MEMBER_LABEL : NOT_SPECIFIED_LABEL);

    return {
      id: String(row.id),
      name: String(row.name ?? ''),
      neighborhood: String(row.neighborhood ?? ''),
      description: String(row.description ?? ''),
      status,
      createdAt: String(row.created_at ?? ''),
      createdBy,
      createdByName,
    };
  });
}

export async function updateCommunityStatusByAppAdmin(input: {
  communityId: string;
  status: Exclude<CommunityApprovalStatus, 'pending'>;
  actorUserId: string;
  rejectionReason?: string;
}): Promise<void> {
  if (!isSupabaseDataEnabled()) {
    throw new Error('Topluluk durum güncelleme işlemi şu anda kullanılamıyor.');
  }

  const nowIso = new Date().toISOString();
  console.log('[community:admin-approve][communities-update:start]', {
    communityId: input.communityId,
    status: input.status,
    actorUserId: input.actorUserId,
  });

  const { error } = await supabase
    .from('communities')
    .update({
      status: input.status,
      actioned_at: nowIso,
      actioned_by: input.actorUserId,
    })
    .eq('id', input.communityId);

  if (error) {
    logSupabaseStageError('admin-approve.communities-update', error);
    throw new Error(`[community:admin-approve:communities-update] ${formatError(error, 'Topluluk durumu güncellenemedi.').message}`);
  }

  console.log('[community:admin-approve][communities-update:ok]', {
    communityId: input.communityId,
    status: input.status,
  });

  if (input.status === 'approved') {
    console.log('[community:admin-approve][communities-read-created-by:start]', {
      communityId: input.communityId,
    });

    const { data: communityRow, error: communityReadError } = await supabase
      .from('communities')
      .select('created_by')
      .eq('id', input.communityId)
      .maybeSingle();

    if (communityReadError) {
      logSupabaseStageError('admin-approve.communities-read-created-by', communityReadError);
      throw new Error(`[community:admin-approve:communities-read-created-by] ${formatError(communityReadError, 'Topluluk sahibi bilgisi okunamadı.').message}`);
    }

    const createdBy = String(communityRow?.created_by ?? '').trim();
    console.log('[community:admin-approve][communities-read-created-by:ok]', {
      communityId: input.communityId,
      createdBy: createdBy || null,
    });

    if (createdBy) {
      console.log('[community:admin-approve][community-members-upsert-creator-admin:start]', {
        communityId: input.communityId,
        userId: createdBy,
      });

      const { error: upsertCreatorAdminError } = await supabase
        .from('community_members')
        .upsert(
          {
            community_id: input.communityId,
            user_id: createdBy,
            role: 'admin',
            status: 'active',
          },
          { onConflict: 'community_id,user_id' }
        );

      if (upsertCreatorAdminError) {
        logSupabaseStageError('admin-approve.community-members-upsert-creator-admin', upsertCreatorAdminError);
        throw new Error(`[community:admin-approve:community-members-upsert-creator-admin] ${formatError(upsertCreatorAdminError, 'Topluluk kurucusu admin üyeliği aktive edilemedi.').message}`);
      }

      console.log('[community:admin-approve][community-members-upsert-creator-admin:ok]', {
        communityId: input.communityId,
        userId: createdBy,
      });
    }

    console.log('[community:admin-approve][community-members-activate-admins:start]', {
      communityId: input.communityId,
    });

    const { error: memberError } = await supabase
      .from('community_members')
      .update({ status: 'active' })
      .eq('community_id', input.communityId)
      .eq('role', 'admin')
      .neq('status', 'active');

    if (memberError) {
      logSupabaseStageError('admin-approve.community-members-activate-admins', memberError);
      throw new Error(`[community:admin-approve:community-members-activate-admins] ${formatError(memberError, 'Topluluk admin üyelikleri aktive edilemedi.').message}`);
    }

    console.log('[community:admin-approve][community-members-activate-admins:ok]', {
      communityId: input.communityId,
    });

    // Fallback dispatch: if DB-level net.http_post trigger path is delayed/misconfigured,
    // force processing of pending notification events from the client side.
    try {
      await supabase.functions.invoke('admin-approval-push', {
        body: {},
      });
    } catch (dispatchError: any) {
      console.warn('[community:admin-approve][notify-dispatch-fallback:failed]', {
        communityId: input.communityId,
        message: dispatchError?.message ?? null,
      });
    }

    return;
  }

  console.log('[community:admin-approve][community-members-reject-admins:start]', {
    communityId: input.communityId,
  });

  const { error: rejectMemberError } = await supabase
    .from('community_members')
    .update({ status: 'rejected' })
    .eq('community_id', input.communityId)
    .eq('role', 'admin')
    .eq('status', 'pending');

  if (rejectMemberError) {
    logSupabaseStageError('admin-approve.community-members-reject-admins', rejectMemberError);
    throw new Error(`[community:admin-approve:community-members-reject-admins] ${formatError(rejectMemberError, 'Topluluk admin üyelikleri reddedilemedi.').message}`);
  }

  console.log('[community:admin-approve][community-members-reject-admins:ok]', {
    communityId: input.communityId,
  });

  const reason = String(input.rejectionReason ?? '').trim();
  const { data: rejectedCommunityRow, error: rejectedCommunityReadError } = await supabase
    .from('communities')
    .select('name, created_by')
    .eq('id', input.communityId)
    .maybeSingle();

  if (rejectedCommunityReadError) {
    logSupabaseStageError('admin-reject.communities-read-created-by', rejectedCommunityReadError);
    return;
  }

  const rejectedCommunityName = String(rejectedCommunityRow?.name ?? 'Topluluk').trim() || 'Topluluk';
  const rejectedCreatedBy = String(rejectedCommunityRow?.created_by ?? '').trim();
  if (!rejectedCreatedBy) return;

  await sendDirectNotificationToUser({
    recipientUserId: rejectedCreatedBy,
    title: 'Topluluk oluşturma isteği reddedildi',
    body: reason
      ? `${rejectedCommunityName} için red nedeni: ${reason}`
      : `${rejectedCommunityName} oluşturma isteği reddedildi.`,
    data: {
      screen: 'community-select',
      communityId: input.communityId,
      eventType: 'community_rejected',
      decisionStatus: 'rejected',
      decisionNote: reason,
    },
  });
}

export async function deleteCommunityByAppAdmin(input: {
  communityId: string;
}): Promise<{ deletedStorageObjects: number }> {
  if (!isSupabaseDataEnabled()) {
    throw new Error('Topluluk silme işlemi şu anda kullanılamıyor.');
  }

  const getValidAccessToken = async (): Promise<string> => {
    const { data: sessionData } = await supabase.auth.getSession();
    let accessToken = String(sessionData?.session?.access_token ?? '').trim();

    if (!accessToken) {
      const { data: refreshedData } = await supabase.auth.refreshSession();
      accessToken = String(refreshedData?.session?.access_token ?? '').trim();
    }

    if (!accessToken) {
      throw new Error('Oturum doğrulanamadı. Lütfen tekrar giriş yapıp yeniden dene.');
    }

    return accessToken;
  };

  const invokeDelete = async () => {
    const accessToken = await getValidAccessToken();

    return supabase.functions.invoke('admin-delete-community', {
      body: {
        communityId: input.communityId,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  };

  let { data, error } = await invokeDelete();

  if (error) {
    let authRelated = false;
    let firstErrorMessage = '';

    try {
      const context = (error as any)?.context;
      if (context && typeof context.json === 'function') {
        const jsonBody = await context.json();
        const backendErrorText = String(jsonBody?.error ?? '').toLowerCase();
        firstErrorMessage = String(jsonBody?.error ?? jsonBody?.message ?? '').trim();
        authRelated = backendErrorText.includes('yetkisiz') || backendErrorText.includes('doğrulanamadı') || backendErrorText.includes('dogrulanamadi');
      } else if (context && typeof context.text === 'function') {
        firstErrorMessage = String(await context.text()).trim();
        const backendErrorText = firstErrorMessage.toLowerCase();
        authRelated = backendErrorText.includes('yetkisiz') || backendErrorText.includes('doğrulanamadı') || backendErrorText.includes('dogrulanamadi');
      }
    } catch {
      authRelated = false;
    }

    if (authRelated) {
      await supabase.auth.refreshSession();
      const retried = await invokeDelete();
      data = retried.data;
      error = retried.error;

      if (error && firstErrorMessage) {
        const retriedContext = (error as any)?.context;
        if (!retriedContext || (typeof retriedContext.json !== 'function' && typeof retriedContext.text !== 'function')) {
          throw new Error(firstErrorMessage);
        }
      }
    }
  }

  if (error) {
    let edgeMessage = '';

    try {
      const context = (error as any)?.context;
      if (context && typeof context.json === 'function') {
        const jsonBody = await context.json();
        edgeMessage = String(jsonBody?.error ?? jsonBody?.message ?? '').trim();
      } else if (context && typeof context.text === 'function') {
        edgeMessage = String(await context.text()).trim();
      }
    } catch {
      // Fall back to default formatError path below.
    }

    if (edgeMessage) {
      throw new Error(edgeMessage);
    }

    throw formatError(error, 'Topluluk silinemedi.');
  }

  if (data?.ok === false) {
    const message = String(data?.error ?? 'Topluluk silinemedi.');
    throw new Error(message);
  }

  const deletedStorageObjects = Number((data as any)?.deletedStorageObjects ?? 0);
  return {
    deletedStorageObjects: Number.isFinite(deletedStorageObjects) ? deletedStorageObjects : 0,
  };
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

  // Fallback dispatch: process queued notification events immediately.
  try {
    await supabase.functions.invoke('admin-approval-push', {
      body: {},
    });
  } catch (dispatchError: any) {
    console.warn('[join-request][notify-dispatch-fallback:failed]', {
      communityId: input.communityId,
      userId: input.userId,
      message: dispatchError?.message ?? null,
    });
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
  rejectionReason?: string;
  communityName?: string;
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

  const reason = String(input.rejectionReason ?? '').trim();
  const communityName = String(input.communityName ?? '').trim() || 'Topluluk';
  await sendDirectNotificationToUser({
    recipientUserId: input.userId,
    title: 'Katılım isteğiniz reddedildi',
    body: reason
      ? `${communityName} için red nedeni: ${reason}`
      : `${communityName} için katılım isteğiniz reddedildi.`,
    data: {
      screen: 'community-select',
      communityId: input.communityId,
      eventType: 'join_request_rejected',
      decisionStatus: 'rejected',
      decisionNote: reason,
    },
  });
}

export async function getCommunityMembersForAdmin(communityId: string): Promise<ManagedCommunityMember[]> {
  if (!isSupabaseDataEnabled()) return [];

  const { data: memberRows, error: memberError } = await supabase
    .from('community_members')
    .select('id, community_id, user_id, role, status, created_at')
    .eq('community_id', communityId)
    .neq('status', 'rejected')
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

  let avatarForDisplay = '';
  if (fromDb.avatarUrl) {
    try {
      avatarForDisplay = await resolveFileUrlForDisplay({
        fileRef: fromDb.avatarUrl,
        expiresInSeconds: 1800,
      });
    } catch {
      // Missing/deleted storage objects should not block profile screen rendering.
      const cachedAvatar = profileSettingsCache.get(userId)?.avatarUrl ?? '';
      avatarForDisplay = fromDb.avatarUrl.startsWith('http') ? fromDb.avatarUrl : cachedAvatar;
    }
  }

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
