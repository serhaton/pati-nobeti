# Pati Nöbeti — Expo Prototype

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

## Sonraki aşama

1. Supabase projesi oluştur.
2. `src/services/supabase.ts` içine URL ve anon key ekle.
3. Apple ve Google OAuth redirect URL'lerini Expo / Supabase tarafında tanımla.
4. `schema.sql` dosyasındaki tabloları oluştur.
5. Mock repository'leri Supabase repository'leri ile değiştir.
