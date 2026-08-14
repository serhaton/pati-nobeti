import { isSupabaseDataEnabled, supabase } from './supabase';

const DEFAULT_BUCKET = process.env.EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'app-images';

function inferExtension(uri: string): string {
  const clean = uri.split('?')[0].split('#')[0];
  const dotIndex = clean.lastIndexOf('.');
  if (dotIndex < 0) return 'jpg';

  const raw = clean.slice(dotIndex + 1).toLowerCase();
  if (raw === 'jpeg' || raw === 'jpg') return 'jpg';
  if (raw === 'png') return 'png';
  if (raw === 'webp') return 'webp';
  if (raw === 'heic') return 'heic';
  if (raw === 'pdf') return 'pdf';
  return 'jpg';
}

function inferMimeType(extension: string): string {
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic') return 'image/heic';
  if (extension === 'pdf') return 'application/pdf';
  return 'image/jpeg';
}

function assertAllowedExtension(extension: string, allowed: string[], errorMessage: string) {
  if (!allowed.includes(extension)) {
    throw new Error(errorMessage);
  }
}

function isRemoteUrl(uri: string): boolean {
  return uri.startsWith('http://') || uri.startsWith('https://');
}

function encodeStorageReference(bucket: string, objectPath: string): string {
  return `sb://${bucket}/${objectPath}`;
}

function decodeStorageReference(value: string): { bucket: string; objectPath: string } | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('sb://')) return null;

  const payload = trimmed.slice('sb://'.length);
  const slashIndex = payload.indexOf('/');
  if (slashIndex <= 0 || slashIndex === payload.length - 1) return null;

  const bucket = payload.slice(0, slashIndex);
  const objectPath = payload.slice(slashIndex + 1);
  if (!bucket || !objectPath) return null;
  return { bucket, objectPath };
}

function parseSupabaseObjectPath(urlValue: string): { bucket: string; objectPath: string } | null {
  try {
    const parsed = new URL(urlValue);
    const marker = '/storage/v1/object/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return null;

    const afterMarker = parsed.pathname.slice(markerIndex + marker.length);
    const pathParts = afterMarker.split('/').filter(Boolean);
    if (pathParts.length < 3) return null;

    const mode = pathParts[0];
    if (mode !== 'public' && mode !== 'authenticated' && mode !== 'sign') return null;

    const bucket = pathParts[1];
    const objectPath = pathParts.slice(2).join('/');
    if (!bucket || !objectPath) return null;
    return { bucket, objectPath };
  } catch {
    return null;
  }
}

function normalizeStorageReference(value: string): string {
  const decoded = decodeStorageReference(value) ?? parseSupabaseObjectPath(value);
  if (!decoded) return value;
  return encodeStorageReference(decoded.bucket, decoded.objectPath);
}

function formatStorageError(error: any, fallback: string): Error {
  const details = [error?.message, error?.details, error?.hint].filter(Boolean).join(' - ');
  return new Error(details || fallback);
}

function generateGuid(): string {
  const randomUuid = (globalThis as any)?.crypto?.randomUUID;
  if (typeof randomUuid === 'function') {
    return randomUuid();
  }

  // Fallback UUIDv4-like generator for runtimes without crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
}

async function uploadToBucket(input: {
  sourceUri: string;
  bucket: string;
  objectPath: string;
  contentType: string;
  fallbackErrorText: string;
}): Promise<void> {
  const uploadBody = await getUploadBodyFromUri(input.sourceUri);
  const { error: uploadError } = await supabase
    .storage
    .from(input.bucket)
    .upload(input.objectPath, uploadBody, {
      contentType: input.contentType,
      upsert: false,
    });

  if (uploadError) {
    throw formatStorageError(uploadError, `${input.fallbackErrorText} Bucket: ${input.bucket}`);
  }
}

export async function createSignedDownloadUrl(input: {
  fileRef: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const trimmedRef = input.fileRef.trim();
  if (!trimmedRef) {
    throw new Error('Geçerli bir dosya bağlantısı bulunamadı.');
  }

  const expiresInSeconds = Math.max(30, Math.min(3600, Math.floor(input.expiresInSeconds ?? 120)));

  const decoded = decodeStorageReference(trimmedRef) ?? parseSupabaseObjectPath(trimmedRef);
  if (!decoded) {
    return trimmedRef;
  }

  const { data, error } = await supabase
    .storage
    .from(decoded.bucket)
    .createSignedUrl(decoded.objectPath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw formatStorageError(error, 'Dosya için geçici erişim bağlantısı üretilemedi.');
  }

  return data.signedUrl;
}

export async function resolveFileUrlForDisplay(input: {
  fileRef?: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const raw = String(input.fileRef ?? '').trim();
  if (!raw) return '';

  const normalized = normalizeStorageReference(raw);
  if (normalized.startsWith('sb://')) {
    return createSignedDownloadUrl({ fileRef: normalized, expiresInSeconds: input.expiresInSeconds ?? 1800 });
  }

  return normalized;
}

async function getUploadBodyFromUri(uri: string): Promise<ArrayBuffer | Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Görsel dosyasi okunamadı, lütfen tekrar secip deneyin.');
  }

  if (typeof response.arrayBuffer === 'function') {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > 0) return buffer;
  }

  const blob = await response.blob();
  if (typeof blob.size === 'number' && blob.size > 0) {
    return blob;
  }

  throw new Error('Görsel dosyasi 0 byte olarak okundu. Lütfen farkli bir görsel secip tekrar deneyin.');
}

export async function uploadImageIfNeeded(input: {
  uri?: string;
  communityId: string;
  folder: string;
  filePrefix: string;
}): Promise<string | undefined> {
  const sourceUri = input.uri?.trim();
  if (!sourceUri) return undefined;

  const normalizedExistingRef = normalizeStorageReference(sourceUri);
  if (normalizedExistingRef.startsWith('sb://')) {
    return normalizedExistingRef;
  }

  if (isRemoteUrl(sourceUri)) {
    return normalizedExistingRef;
  }

  if (!isSupabaseDataEnabled()) {
    return sourceUri;
  }

  const normalizedCommunityId = input.communityId.trim();
  if (!normalizedCommunityId) {
    throw new Error('Community id bulunamadı. Görsel yüklenemedi.');
  }

  const extension = inferExtension(sourceUri);
  assertAllowedExtension(extension, ['jpg', 'png', 'webp', 'heic'], 'Yalnızca görsel dosyaları yüklenebilir.');
  const contentType = inferMimeType(extension);
  const guid = generateGuid();
  const objectPath = `${normalizedCommunityId}/${input.folder}/${input.filePrefix}-${guid}.${extension}`;

  await uploadToBucket({
    sourceUri,
    bucket: DEFAULT_BUCKET,
    objectPath,
    contentType,
    fallbackErrorText: 'Görsel dosya servisine yüklenemedi.',
  });

  return encodeStorageReference(DEFAULT_BUCKET, objectPath);
}

export async function uploadExpenseReceiptIfNeeded(input: {
  uri?: string;
  communityId: string;
  filePrefix: string;
}): Promise<string | undefined> {
  const sourceUri = input.uri?.trim();
  if (!sourceUri) return undefined;

  const normalizedExistingRef = normalizeStorageReference(sourceUri);
  if (normalizedExistingRef.startsWith('sb://')) {
    return normalizedExistingRef;
  }

  if (isRemoteUrl(sourceUri)) {
    return normalizedExistingRef;
  }

  if (!isSupabaseDataEnabled()) {
    return sourceUri;
  }

  const normalizedCommunityId = input.communityId.trim();
  if (!normalizedCommunityId) {
    throw new Error('Topluluk bilgisi bulunamadı. Fiş yüklenemedi.');
  }

  const extension = inferExtension(sourceUri);
  assertAllowedExtension(extension, ['jpg', 'png', 'webp', 'heic', 'pdf'], 'Fiş yalnızca görsel veya PDF olabilir.');

  const contentType = inferMimeType(extension);
  const guid = generateGuid();
  const objectPath = `${normalizedCommunityId}/expenses/${input.filePrefix}-${guid}.${extension}`;

  await uploadToBucket({
    sourceUri,
    bucket: DEFAULT_BUCKET,
    objectPath,
    contentType,
    fallbackErrorText: 'Fiş dosyası dosya servisine yüklenemedi.',
  });

  return encodeStorageReference(DEFAULT_BUCKET, objectPath);
}

export async function uploadExpenseReceiptsIfNeeded(input: {
  uris: string[];
  communityId: string;
  filePrefix: string;
}): Promise<string[]> {
  const normalizedUris = input.uris
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (normalizedUris.length === 0) return [];

  const uploadedUrls = await Promise.all(
    normalizedUris.map((uri, index) => uploadExpenseReceiptIfNeeded({
      uri,
      communityId: input.communityId,
      filePrefix: `${input.filePrefix}-${index + 1}`,
    }))
  );

  return uploadedUrls.filter((item): item is string => Boolean(item));
}
