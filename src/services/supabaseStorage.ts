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
  return 'jpg';
}

function inferMimeType(extension: string): string {
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic') return 'image/heic';
  return 'image/jpeg';
}

function isRemoteUrl(uri: string): boolean {
  return uri.startsWith('http://') || uri.startsWith('https://');
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

  if (isRemoteUrl(sourceUri)) {
    return sourceUri;
  }

  if (!isSupabaseDataEnabled()) {
    return sourceUri;
  }

  const normalizedCommunityId = input.communityId.trim();
  if (!normalizedCommunityId) {
    throw new Error('Community id bulunamadı. Görsel yüklenemedi.');
  }

  const extension = inferExtension(sourceUri);
  const contentType = inferMimeType(extension);
  const guid = generateGuid();
  const filePath = `${normalizedCommunityId}/${input.folder}/${input.filePrefix}-${guid}.${extension}`;
  const uploadBody = await getUploadBodyFromUri(sourceUri);

  const { error: uploadError } = await supabase
    .storage
    .from(DEFAULT_BUCKET)
    .upload(filePath, uploadBody, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw formatStorageError(
      uploadError,
      `Görsel Supabase Storage'a yüklenemedi. Bucket: ${DEFAULT_BUCKET}`
    );
  }

  const { data } = supabase.storage.from(DEFAULT_BUCKET).getPublicUrl(filePath);
  const publicUrl = data?.publicUrl;

  if (!publicUrl) {
    throw new Error('Görsel yüklendi fakat public URL alınamadı.');
  }

  return publicUrl;
}
