export type UserAuthMethod = 'password' | 'google' | 'apple';
export type UserStatus = 'active' | 'passive';
export type CommunityMemberRole = 'admin' | 'member';

export type AppUser = {
  id: string;
  username: string;
  fullName: string;
  authMethod: UserAuthMethod;
  password?: string;
  status: UserStatus;
};

export type CommunityMember = {
  id: string;
  communityId: string;
  userId: string;
  role: CommunityMemberRole;
  status: UserStatus;
  joinedAt: string;
};

export type BaseCommunity = {
  id: string;
  name: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  defaultZoom: number;
};

const baseCommunities: BaseCommunity[] = [
  {
    id: '1',
    name: 'Moda Pati Gönüllüleri',
    neighborhood: 'Kadıköy',
    latitude: 40.9857,
    longitude: 29.0262,
    defaultZoom: 17,
  },
  {
    id: '2',
    name: 'Yıldız Mahallesi Can Dostları',
    neighborhood: 'Beşiktaş',
    latitude: 41.0458,
    longitude: 29.0106,
    defaultZoom: 17,
  },
  {
    id: '3',
    name: 'Çankaya Pati Ekibi',
    neighborhood: 'Çankaya',
    latitude: 39.9059,
    longitude: 32.8607,
    defaultZoom: 17,
  },
  {
    id: '4',
    name: 'Agaoglu My City Kedi Grubu',
    neighborhood: 'Ümraniye',
    latitude: 41.018101,
    longitude: 29.125607,
    defaultZoom: 17,
  },
];

export const users: AppUser[] = [
  { id: 'user-1', username: 'serhat', fullName: 'Serhat Onal', authMethod: 'google', status: 'active' },
  { id: 'user-2', username: 'elif.y', fullName: 'Elif Yılmaz', authMethod: 'apple', status: 'active' },
  { id: 'user-3', username: 'mertk', fullName: 'Mert Kaya', authMethod: 'password', password: 'mert123', status: 'active' },
  { id: 'user-4', username: 'sena.d', fullName: 'Sena Demir', authMethod: 'password', password: 'sena123', status: 'active' },
  { id: 'user-5', username: 'gokhanu', fullName: 'Gökhan Uslu', authMethod: 'google', status: 'active' },
  { id: 'user-6', username: 'mervey', fullName: 'Merve Yaman', authMethod: 'apple', status: 'active' },
  { id: 'user-7', username: 'aslio', fullName: 'Aslı Öztürk', authMethod: 'password', password: 'asli123', status: 'active' },
  { id: 'user-8', username: 'kaane', fullName: 'Kaan İleri', authMethod: 'google', status: 'active' },
  { id: 'user-9', username: 'cana', fullName: 'Can Ates', authMethod: 'password', password: 'can123', status: 'active' },
  { id: 'user-10', username: 'aylint', fullName: 'Aylin Tekin', authMethod: 'google', status: 'active' },
  { id: 'user-11', username: 'deniza', fullName: 'Deniz Acar', authMethod: 'apple', status: 'active' },
  { id: 'user-12', username: 'yigite', fullName: 'Yigit Eren', authMethod: 'password', password: 'yigit123', status: 'active' },
  { id: 'user-13', username: 'barisk', fullName: 'Baris Korkmaz', authMethod: 'google', status: 'active' },
  { id: 'user-14', username: 'sibelk', fullName: 'Sibel Kara', authMethod: 'apple', status: 'active' },
  { id: 'user-15', username: 'nihata', fullName: 'Nihat Aksoy', authMethod: 'password', password: 'nihat123', status: 'active' },
  { id: 'user-16', username: 'ecet', fullName: 'Ece Turan', authMethod: 'google', status: 'active' },
];

export const communityMembers: CommunityMember[] = [
  { id: 'cm-1', communityId: '1', userId: 'user-1', role: 'admin', status: 'active', joinedAt: '2025-01-12T09:15:00Z' },
  { id: 'cm-2', communityId: '1', userId: 'user-2', role: 'member', status: 'active', joinedAt: '2025-02-01T13:40:00Z' },
  { id: 'cm-3', communityId: '1', userId: 'user-3', role: 'member', status: 'active', joinedAt: '2025-02-15T18:05:00Z' },
  { id: 'cm-10', communityId: '1', userId: 'user-4', role: 'member', status: 'active', joinedAt: '2025-03-01T09:30:00Z' },
  { id: 'cm-11', communityId: '1', userId: 'user-9', role: 'member', status: 'active', joinedAt: '2025-03-07T10:45:00Z' },
  { id: 'cm-12', communityId: '1', userId: 'user-10', role: 'member', status: 'active', joinedAt: '2025-03-14T16:20:00Z' },
  { id: 'cm-4', communityId: '2', userId: 'user-4', role: 'admin', status: 'active', joinedAt: '2025-01-22T08:30:00Z' },
  { id: 'cm-5', communityId: '2', userId: 'user-5', role: 'member', status: 'active', joinedAt: '2025-03-04T11:20:00Z' },
  { id: 'cm-6', communityId: '2', userId: 'user-6', role: 'member', status: 'active', joinedAt: '2025-03-05T16:55:00Z' },
  { id: 'cm-13', communityId: '2', userId: 'user-11', role: 'member', status: 'active', joinedAt: '2025-03-19T13:15:00Z' },
  { id: 'cm-14', communityId: '2', userId: 'user-7', role: 'member', status: 'active', joinedAt: '2025-03-26T12:50:00Z' },
  { id: 'cm-15', communityId: '2', userId: 'user-12', role: 'member', status: 'active', joinedAt: '2025-04-02T17:40:00Z' },
  { id: 'cm-7', communityId: '3', userId: 'user-7', role: 'admin', status: 'active', joinedAt: '2025-01-10T10:00:00Z' },
  { id: 'cm-8', communityId: '3', userId: 'user-8', role: 'member', status: 'active', joinedAt: '2025-03-18T14:10:00Z' },
  { id: 'cm-9', communityId: '3', userId: 'user-1', role: 'member', status: 'active', joinedAt: '2025-05-02T19:25:00Z' },
  { id: 'cm-16', communityId: '3', userId: 'user-13', role: 'member', status: 'active', joinedAt: '2025-03-09T09:20:00Z' },
  { id: 'cm-17', communityId: '3', userId: 'user-14', role: 'member', status: 'active', joinedAt: '2025-03-21T15:10:00Z' },
  { id: 'cm-18', communityId: '3', userId: 'user-15', role: 'member', status: 'active', joinedAt: '2025-04-06T08:45:00Z' },
  { id: 'cm-19', communityId: '3', userId: 'user-16', role: 'member', status: 'active', joinedAt: '2025-04-17T18:30:00Z' },
];

export function getCommunityMembers(communityId: string): Array<CommunityMember & { user: AppUser | null }> {
  return communityMembers
    .filter((member) => member.communityId === communityId)
    .map((member) => ({
      ...member,
      user: users.find((user) => user.id === member.userId) ?? null,
    }));
}

export function getUserById(userId: string): AppUser | null {
  return users.find((user) => user.id === userId) ?? null;
}

export const animals = [
  { id: '1', communityId: '1', name: 'Misket', type: 'Kedi', cins: 'Tekir', location: 'Moda Parkı' },
  { id: '2', communityId: '2', name: 'Tarçın', type: 'Köpek', cins: 'Kahverengi', location: 'Bahariye' },
  { id: '3', communityId: '3', name: 'Boncuk', type: 'Kedi', cins: 'Beyaz / Gri', location: 'Rıhtım' },
];

export const feedingPoints = [
  { id: '1', communityId: '1', name: 'Moda Parkı Mama Noktası', lat: 40.9857, lng: 29.0262, type: 'Kedi + Köpek', status: 'Bugün beslendi' },
  { id: '2', communityId: '2', name: 'Bahariye Su & Mama', lat: 40.9901, lng: 29.0288, type: 'Kedi', status: 'Mama bekliyor' },
  { id: '3', communityId: '3', name: 'Rıhtım Köpek Noktası', lat: 40.9908, lng: 29.0232, type: 'Köpek', status: 'Bugün beslendi' },
  { id: '4', communityId: '1', name: 'Moda Sahil Çim Alan Mama Noktası', lat: 40.9864, lng: 29.0271, type: 'Kedi + Köpek', status: 'Su yenilenmeli' },
  { id: '5', communityId: '1', name: 'Yoğurtçu Parkı Giriş Noktası', lat: 40.9882, lng: 29.0294, type: 'Kedi', status: 'Mama bekliyor' },
  { id: '6', communityId: '1', name: 'Kadıköy İskele Yanı Su & Mama', lat: 40.9900, lng: 29.0244, type: 'Kedi + Köpek', status: 'Bugün beslendi' },
];

export const expenses = [
  { id: '1', communityId: '1', title: '25 kg kedi maması', vendor: 'PetMarket', amount: 2850, paid: 2850, category: 'Mama', date: '9 Ağustos' },
  { id: '2', communityId: '1', title: 'Misket veteriner tedavisi', vendor: 'Moda Veteriner', amount: 4200, paid: 1500, category: 'Veteriner', date: '8 Ağustos' },
  { id: '3', communityId: '2', title: 'Köpek maması', vendor: 'PatiDepo', amount: 3200, paid: 1200, category: 'Mama', date: '6 Ağustos' },
];

function getCommunityAnimalCount(communityId: string): number {
  return animals.filter((animal) => animal.communityId === communityId).length;
}

function getCommunityDebt(communityId: string): number {
  return expenses
    .filter((item) => item.communityId === communityId)
    .reduce((total, item) => total + (item.amount - item.paid), 0);
}

export const communities: Array<BaseCommunity & {
  members: number;
  animals: number;
  debt: number;
  adminUserIds: string[];
}> = [];

export function recomputeCommunities() {
  communities.splice(0, communities.length, ...baseCommunities.map((community) => {
  const activeMembers = communityMembers.filter(
    (member) => member.communityId === community.id && member.status === 'active'
  );

  return {
    ...community,
    members: activeMembers.length,
    animals: getCommunityAnimalCount(community.id),
    debt: getCommunityDebt(community.id),
    adminUserIds: activeMembers.filter((member) => member.role === 'admin').map((member) => member.userId),
  };
  }));
}

export const joinRequests = [
  { id: '1', name: 'Elif Yılmaz', initials: 'EY', note: 'Moda bölgesinde düzenli besleme yapmak istiyorum.' },
  { id: '2', name: 'Mert Kaya', initials: 'MK', note: 'Veteriner masraflarına destek olmak istiyorum.' },
];

function replaceArray<T>(target: T[], values: T[]) {
  target.splice(0, target.length, ...values);
}

export function applySupabaseSnapshot(input: {
  communities?: BaseCommunity[];
  users?: AppUser[];
  communityMembers?: CommunityMember[];
  animals?: Array<{ id: string; communityId: string; name: string; type: 'Kedi' | 'Köpek'; cins: string; location: string }>;
  feedingPoints?: Array<{ id: string; communityId: string; name: string; lat: number; lng: number; type: string; status: string; photoUri?: string }>;
  expenses?: Array<{ id: string; communityId: string; title: string; vendor: string; amount: number; paid: number; category: string; date: string }>;
  joinRequests?: Array<{ id: string; name: string; initials: string; note: string }>;
}) {
  if (input.communities) {
    replaceArray(baseCommunities, input.communities);
  }
  if (input.users) {
    replaceArray(users, input.users);
  }
  if (input.communityMembers) {
    replaceArray(communityMembers, input.communityMembers);
  }
  if (input.animals) {
    replaceArray(animals, input.animals);
  }
  if (input.feedingPoints) {
    replaceArray(feedingPoints, input.feedingPoints);
  }
  if (input.expenses) {
    replaceArray(expenses, input.expenses);
  }
  if (input.joinRequests) {
    replaceArray(joinRequests, input.joinRequests);
  }

  recomputeCommunities();
}

recomputeCommunities();
