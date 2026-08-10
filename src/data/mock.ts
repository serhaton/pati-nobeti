export const communities = [
  { id: '1', name: 'Moda Pati Gönüllüleri', neighborhood: 'Kadıköy', members: 38, animals: 24, debt: 6840 },
  { id: '2', name: 'Yıldız Mahallesi Can Dostları', neighborhood: 'Beşiktaş', members: 21, animals: 17, debt: 3250 },
  { id: '3', name: 'Çankaya Pati Ekibi', neighborhood: 'Çankaya', members: 46, animals: 31, debt: 9120 },
];

export const animals = [
  { id: '1', name: 'Misket', type: 'Kedi', color: 'Tekir', location: 'Moda Parkı', fedToday: true },
  { id: '2', name: 'Tarçın', type: 'Köpek', color: 'Kahverengi', location: 'Bahariye', fedToday: false },
  { id: '3', name: 'Boncuk', type: 'Kedi', color: 'Beyaz / Gri', location: 'Rıhtım', fedToday: true },
];

export const feedingPoints = [
  { id: '1', name: 'Moda Parkı Mama Noktası', lat: 40.9857, lng: 29.0262, type: 'Kedi + Köpek', status: 'Bugün beslendi' },
  { id: '2', name: 'Bahariye Su & Mama', lat: 40.9901, lng: 29.0288, type: 'Kedi', status: 'Mama bekliyor' },
  { id: '3', name: 'Rıhtım Köpek Noktası', lat: 40.9908, lng: 29.0232, type: 'Köpek', status: 'Bugün beslendi' },
];

export const expenses = [
  { id: '1', title: '25 kg kedi maması', vendor: 'PetMarket', amount: 2850, paid: 2850, category: 'Mama', date: '9 Ağustos' },
  { id: '2', title: 'Misket veteriner tedavisi', vendor: 'Moda Veteriner', amount: 4200, paid: 1500, category: 'Veteriner', date: '8 Ağustos' },
  { id: '3', title: 'Köpek maması', vendor: 'PatiDepo', amount: 3200, paid: 1200, category: 'Mama', date: '6 Ağustos' },
];

export const joinRequests = [
  { id: '1', name: 'Elif Yılmaz', initials: 'EY', note: 'Moda bölgesinde düzenli besleme yapmak istiyorum.' },
  { id: '2', name: 'Mert Kaya', initials: 'MK', note: 'Veteriner masraflarına destek olmak istiyorum.' },
];
