import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

type DeleteCommunityRequest = {
  communityId?: string;
};

type StorageRef = {
  bucket: string;
  objectPath: string;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

  // Backward compatibility: raw path in app-images bucket.
  if (!noQuery.includes('://')) {
    return { bucket: 'app-images', objectPath: noQuery.replace(/^\/+/, '') };
  }

  return null;
}

async function requireAppAdmin(authHeader: string | null): Promise<string> {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    throw new Error('Yetkisiz istek: kullanıcı oturumu bulunamadı.');
  }

  const jwt = authHeader.slice('Bearer '.length).trim();
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);

  if (userError || !userData.user) {
    throw new Error('Yetkisiz istek: kullanıcı doğrulanamadı.');
  }

  const userId = String(userData.user.id);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_app_admin, status')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Yetki kontrolü başarısız: ${profileError.message}`);
  }

  const isActive = String(profile?.status ?? 'active') === 'active';
  const isAppAdmin = Boolean(profile?.is_app_admin);

  if (!isActive || !isAppAdmin) {
    throw new Error('Bu işlem sadece aktif sistem yöneticileri tarafından yapılabilir.');
  }

  return userId;
}

async function collectStorageRefs(communityId: string): Promise<StorageRef[]> {
  const refs: string[] = [];

  const [communityRes, memberRes, animalRes, feedingPointRes, expenseRes, contributionRes] = await Promise.all([
    supabase.from('communities').select('cover_url').eq('id', communityId).maybeSingle(),
    supabase.from('community_members').select('photo_url').eq('community_id', communityId),
    supabase.from('animals').select('photo_url').eq('community_id', communityId),
    supabase.from('feeding_points').select('photo_uri').eq('community_id', communityId),
    supabase.from('expenses').select('receipt_url, receipt_urls').eq('community_id', communityId),
    supabase.from('contributions').select('receipt_url, receipt_urls').eq('community_id', communityId),
  ]);

  const allErrors = [
    communityRes.error,
    memberRes.error,
    animalRes.error,
    feedingPointRes.error,
    expenseRes.error,
    contributionRes.error,
  ].filter(Boolean);

  if (allErrors.length > 0) {
    throw new Error(`Topluluk dosya referansları okunamadı: ${allErrors[0]?.message}`);
  }

  if (communityRes.data?.cover_url) refs.push(String(communityRes.data.cover_url));

  (memberRes.data ?? []).forEach((row: any) => {
    if (row.photo_url) refs.push(String(row.photo_url));
  });

  (animalRes.data ?? []).forEach((row: any) => {
    if (row.photo_url) refs.push(String(row.photo_url));
  });

  (feedingPointRes.data ?? []).forEach((row: any) => {
    if (row.photo_uri) refs.push(String(row.photo_uri));
  });

  (expenseRes.data ?? []).forEach((row: any) => {
    if (row.receipt_url) refs.push(String(row.receipt_url));
    if (Array.isArray(row.receipt_urls)) {
      row.receipt_urls.forEach((item: unknown) => {
        if (item) refs.push(String(item));
      });
    }
  });

  (contributionRes.data ?? []).forEach((row: any) => {
    if (row.receipt_url) refs.push(String(row.receipt_url));
    if (Array.isArray(row.receipt_urls)) {
      row.receipt_urls.forEach((item: unknown) => {
        if (item) refs.push(String(item));
      });
    }
  });

  const unique = new Map<string, StorageRef>();

  refs.forEach((ref) => {
    const parsed = parseStorageReference(ref);
    if (!parsed) return;

    const key = `${parsed.bucket}/${parsed.objectPath}`;
    if (!unique.has(key)) {
      unique.set(key, parsed);
    }
  });

  return Array.from(unique.values());
}

async function removeStorageObjects(storageRefs: StorageRef[]): Promise<number> {
  const byBucket = new Map<string, string[]>();

  storageRefs.forEach((item) => {
    if (!byBucket.has(item.bucket)) {
      byBucket.set(item.bucket, []);
    }
    byBucket.get(item.bucket)?.push(item.objectPath);
  });

  let deletedCount = 0;

  for (const [bucket, objectPaths] of byBucket.entries()) {
    for (let i = 0; i < objectPaths.length; i += 100) {
      const chunk = objectPaths.slice(i, i + 100);
      const { data, error } = await supabase.storage.from(bucket).remove(chunk);

      if (error) {
        throw new Error(`Dosya silme hatası (${bucket}): ${error.message}`);
      }

      deletedCount += Array.isArray(data) ? data.length : 0;
    }
  }

  return deletedCount;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
    }

    const body = (await req.json()) as DeleteCommunityRequest;
    const communityId = String(body?.communityId ?? '').trim();

    if (!communityId) {
      return jsonResponse({ ok: false, error: 'communityId zorunludur.' }, 400);
    }

    await requireAppAdmin(req.headers.get('Authorization'));

    const { data: communityExists, error: communityReadError } = await supabase
      .from('communities')
      .select('id')
      .eq('id', communityId)
      .maybeSingle();

    if (communityReadError) {
      return jsonResponse({ ok: false, error: `Topluluk okunamadı: ${communityReadError.message}` }, 500);
    }

    if (!communityExists) {
      return jsonResponse({ ok: false, error: 'Topluluk bulunamadı.' }, 404);
    }

    const storageRefs = await collectStorageRefs(communityId);
    const deletedStorageObjects = await removeStorageObjects(storageRefs);

    const { error: deleteError } = await supabase
      .from('communities')
      .delete()
      .eq('id', communityId);

    if (deleteError) {
      return jsonResponse({ ok: false, error: `Topluluk silinemedi: ${deleteError.message}` }, 500);
    }

    return jsonResponse({
      ok: true,
      communityId,
      deletedStorageObjects,
    });
  } catch (error: any) {
    return jsonResponse({ ok: false, error: String(error?.message ?? error) }, 500);
  }
});
