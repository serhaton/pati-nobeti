import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type StorageRef = {
  bucket: string;
  objectPath: string;
};

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseStorageReference(value: string): StorageRef | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const noQuery = raw.split('?')[0] ?? raw;

  if (noQuery.startsWith('sb://')) {
    const payload = noQuery.slice(5);
    const slashIndex = payload.indexOf('/');
    if (slashIndex <= 0) return null;

    const bucket = payload.slice(0, slashIndex);
    const objectPath = payload.slice(slashIndex + 1);
    if (!bucket || !objectPath) return null;

    return { bucket, objectPath };
  }

  const storageMarker = '/storage/v1/object/';
  const markerIndex = noQuery.indexOf(storageMarker);
  if (markerIndex >= 0) {
    let objectPart = noQuery.slice(markerIndex + storageMarker.length);

    if (objectPart.startsWith('public/')) {
      objectPart = objectPart.slice('public/'.length);
    } else if (objectPart.startsWith('sign/')) {
      objectPart = objectPart.slice('sign/'.length);
    } else if (objectPart.startsWith('authenticated/')) {
      objectPart = objectPart.slice('authenticated/'.length);
    }

    const slashIndex = objectPart.indexOf('/');
    if (slashIndex <= 0) return null;

    const bucket = objectPart.slice(0, slashIndex);
    const objectPath = objectPart.slice(slashIndex + 1);
    if (!bucket || !objectPath) return null;

    return { bucket, objectPath };
  }

  if (!noQuery.includes('://')) {
    return { bucket: 'app-images', objectPath: noQuery.replace(/^\/+/, '') };
  }

  return null;
}

async function cleanupUserStorageObjects(userId: string): Promise<number> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Profil dosyası okunamadı: ${profileError.message}`);
  }

  const avatarUrl = String(profile?.avatar_url ?? '').trim();
  if (!avatarUrl) return 0;

  const parsed = parseStorageReference(avatarUrl);
  if (!parsed) return 0;

  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .remove([parsed.objectPath]);

  if (error) {
    throw new Error(`Profil dosyası silinemedi: ${error.message}`);
  }

  return Array.isArray(data) ? data.length : 0;
}

async function cleanupUserReferences(userId: string): Promise<void> {
  const operations: Array<Promise<{ error: any }>> = [
    supabase.from('communities').update({ created_by: null }).eq('created_by', userId),
    supabase.from('communities').update({ actioned_by: null }).eq('actioned_by', userId),
    supabase.from('feeding_points').update({ created_by: null }).eq('created_by', userId),
    supabase.from('feeding_logs').update({ fed_by: null }).eq('fed_by', userId),
    supabase.from('expenses').update({ paid_by: null }).eq('paid_by', userId),
    supabase.from('expenses').update({ submitted_by: null }).eq('submitted_by', userId),
    supabase.from('expenses').update({ actioned_by: null }).eq('actioned_by', userId),
    supabase.from('contributions').update({ user_id: null }).eq('user_id', userId),
    supabase.from('contributions').update({ contributor_user_id: null }).eq('contributor_user_id', userId),
    supabase.from('contributions').update({ created_by: null }).eq('created_by', userId),
    supabase.from('contributions').update({ actioned_by: null }).eq('actioned_by', userId),
    supabase.from('contribution_allocations').update({ allocated_by: null }).eq('allocated_by', userId),
    supabase.from('global_veterinarians').update({ created_by: null }).eq('created_by', userId),
    supabase.from('global_veterinarians').update({ updated_by: null }).eq('updated_by', userId),
    supabase.from('community_veterinarians').update({ created_by: null }).eq('created_by', userId),
    supabase.from('community_veterinarians').update({ updated_by: null }).eq('updated_by', userId),
  ];

  const results = await Promise.all(operations);
  const failed = results.find((item) => item.error);
  if (failed?.error) {
    throw new Error(`Kullanıcı referansları temizlenemedi: ${failed.error.message}`);
  }

  const { error: deviceCleanupError } = await supabase
    .from('user_devices')
    .delete()
    .eq('user_id', userId);

  if (deviceCleanupError) {
    throw new Error(`Cihaz kayıtları silinemedi: ${deviceCleanupError.message}`);
  }
}

async function getAuthenticatedUserId(authHeader: string | null): Promise<string> {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    throw new Error('Yetkisiz istek: kullanıcı oturumu bulunamadı.');
  }

  const jwt = authHeader.slice('Bearer '.length).trim();
  const { data, error } = await supabase.auth.getUser(jwt);

  if (error || !data.user) {
    throw new Error('Yetkisiz istek: kullanıcı doğrulanamadı.');
  }

  return String(data.user.id);
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
    }

    const userId = await getAuthenticatedUserId(req.headers.get('Authorization'));

    await cleanupUserReferences(userId);
    const deletedStorageObjects = await cleanupUserStorageObjects(userId);

    // hard-delete=true by default in Supabase Admin API.
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) {
      return jsonResponse({ ok: false, error: `Hesap silinemedi: ${deleteError.message}` }, 500);
    }

    return jsonResponse({ ok: true, userId, deletedStorageObjects });
  } catch (error: any) {
    return jsonResponse({ ok: false, error: String(error?.message ?? error) }, 500);
  }
});
