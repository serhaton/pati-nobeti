# Pati Uzat — Expo Prototype

Türkçe, topluluk tabanlı sokak hayvanları takip uygulaması prototipi.

## Kapsam

- Google / Apple ile giriş için auth mimarisi
- Birden fazla topluluğa üyelik
- Topluluk oluşturma ve yönetici onayı
- Harita üzerinde mama / su noktaları
- Kedi ve köpek profilleri
- Günlük mama kayıtları
- Masraf, fiş ve borç takibi
- Mama / veteriner borçları
- Topluluk duyuruları
- Profil ve topluluk yönetimi

Bu sürüm **UI + mock data prototipidir**. Supabase bağlantı noktaları `src/services/` altında hazırlanmıştır.

## Çalıştırma

```bash
npm install
npx expo start
```

iOS simulator için:

```bash
npm run ios
```

## iOS App Store ve TestFlight

EAS CLI kurulumu ve giriş:

```bash
npm install -g eas-cli
eas login
```

İlk kez proje yapılandırma:

```bash
eas build:configure
```

Production iOS build alma:

```bash
npm run release:ios
```

Son alınan build'i App Store Connect'e gönderme:

```bash
npm run release:ios:submit
```

Notlar:

- iOS `buildNumber` her release'te artmalıdır (bu projede `eas.json` içindeki `autoIncrement` bunu otomatik yönetir).
- App Store Connect tarafında uygulama kaydı ve doğru bundle identifier (`com.serhatonal.patiuzat`) hazır olmalıdır.
- İlk submit sırasında Apple kimlik doğrulama bilgileri EAS tarafından istenir.

## Sonraki aşama

1. Supabase projesi oluştur.
2. `src/services/supabase.ts` içine URL ve anon key ekle.
3. Apple ve Google OAuth redirect URL'lerini Expo / Supabase tarafında tanımla.
4. `schema.sql` dosyasındaki tabloları oluştur.
5. Mock repository'leri Supabase repository'leri ile değiştir.
