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

Belirli bir simulator cihazı ile çalıştırma:

```bash
npm run ios -- -d "iPhone 16"
```

Alternatif olarak Expo komutunu doğrudan da kullanabilirsin:

```bash
npx expo run:ios -d "iPhone 16"
```

Not: `npm run` ile script'e argüman geçerken araya `--` koymalısın.

## iOS App Store ve TestFlight

EAS CLI kurulumu ve giriş:

```bash
npm install -g eas-cli
eas login
```

Alternatif (global kurulum olmadan):

```bash
npx eas-cli login
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

### Slug değişikliği sonrası EAS yeniden bağlama

Eğer aşağıdaki hatayı alırsanız:

`Slug for project identified by "extra.eas.projectId" (...) does not match the "slug" field (...)`

proje yeni slug ile EAS'e yeniden bağlanmalıdır.

```bash
npx eas-cli init
```

Ardından yeni proje altında tekrar build ve submit alın:

```bash
npm run release:ios
npm run release:ios:submit
```

Notlar:

- iOS `buildNumber` her release'te artmalıdır (bu projede `eas.json` içindeki `autoIncrement` bunu otomatik yönetir).
- App Store Connect tarafında uygulama kaydı ve doğru bundle identifier (`com.serhatonal.patiuzat`) hazır olmalıdır.
- İlk submit sırasında Apple kimlik doğrulama bilgileri EAS tarafından istenir.
- Slug değiştiyse eski EAS project ile submit edilemez; `npx eas-cli init` sonrası yeni project altında en az bir iOS build alınmalıdır.

## Sonraki aşama

1. Supabase projesi oluştur.
2. `src/services/supabase.ts` içine URL ve anon key ekle.
3. Apple ve Google OAuth redirect URL'lerini Expo / Supabase tarafında tanımla.
4. `schema.sql` dosyasındaki tabloları oluştur.
5. Mock repository'leri Supabase repository'leri ile değiştir.

## Admin Onay Push Notification Kurulumu

Bu projede admin onayı gerektiren aksiyonlar için push notification akışı hazırlandı:

- Mobil uygulama cihaz tokenını `user_devices` tablosuna kaydeder.
- `community_join_requests`, `expenses`, `contributions` için `pending` kayıtlar `notification_events` tablosuna trigger ile event düşer.
- Supabase Edge Function (`admin-approval-push`) bu eventleri okuyup topluluk admin cihazlarına push gönderir.

### 1) SQL migration

Sırasıyla çalıştır:

```bash
# Supabase SQL Editor içinde
# 1) db/schema.sql
# 2) db/rls.sql
# 3) db/auth_triggers.sql
```

### 2) Edge Function deploy

```bash
supabase functions deploy admin-approval-push
```

Lokal test:

```bash
supabase functions serve admin-approval-push --env-file .env
```

### 3) Scheduled run (önerilen)

Edge Function'ı her 1 dakikada bir çağıracak bir schedule/job tanımla.
Supabase Dashboard veya cron ile function endpoint'i periyodik tetiklenmelidir.

### 4) Mobil taraf

- `expo-notifications` kuruldu.
- Login sonrası token register edilir.
- Logout'ta token pasife çekilir.
- Bildirim tıklaması varsayılan olarak yönetici ekranına (`/community`) yönlendirir.
