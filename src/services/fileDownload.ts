import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';

function extensionFromUrl(url: string): string {
  const clean = url.split('?')[0].split('#')[0];
  const lastSegment = clean.split('/').pop() ?? '';
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === lastSegment.length - 1) return 'bin';
  return lastSegment.slice(dotIndex + 1).toLowerCase();
}

function safeFileName(baseName: string, extension: string): string {
  const normalizedBase = baseName.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48) || 'dosya';
  return `${normalizedBase}-${Date.now()}.${extension}`;
}

export async function downloadAndOpenRemoteFile(input: {
  url: string;
  baseName: string;
}): Promise<void> {
  const trimmedUrl = input.url.trim();
  if (!trimmedUrl) {
    throw new Error('Geçerli bir dosya bağlantısı bulunamadı.');
  }

  const downloadDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!downloadDir) {
    throw new Error('Cihazda indirilecek klasör bulunamadı.');
  }

  const extension = extensionFromUrl(trimmedUrl);
  const fileName = safeFileName(input.baseName, extension);
  const localPath = `${downloadDir}${fileName}`;

  const result = await FileSystem.downloadAsync(trimmedUrl, localPath);
  const localUri = result.uri;

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(localUri, {
      dialogTitle: 'Dosyayı Aç / Kaydet',
    });
    return;
  }

  await Linking.openURL(localUri);
}
