import { animals } from './mock';

export type AnimalType = 'Kedi' | 'Köpek';
export type AnimalGender = 'Dişi' | 'Erkek' | 'Bilinmiyor';

export type AnimalHealthEvent = {
  id: string;
  name: string;
  date: string;
  note?: string;
};

export type CommunityAnimal = {
  id: string;
  communityId: string;
  name: string;
  type: AnimalType;
  breed: string;
  gender: AnimalGender;
  isSterilized: boolean;
  birthDate: string;
  location: string;
  fedToday: boolean;
  vaccinationSchedule: AnimalHealthEvent[];
  treatmentSchedule: AnimalHealthEvent[];
  photoUris: string[];
};

export const CAT_BREEDS: string[] = [
  'Tekir',
  'Sarman',
  'Beyaz',
  'Siyah',
  'Gri',
  'Duman',
  'Alaca',
  'Üç Renkli',
  'Kaplumbağa Desenli',
  'Smokin (Tuxedo)',
  'Van Desenli',
  'Patisi Beyaz',
  'Kulak Ucu Kesik',
  'Uzun Tüylü Melez',
  'Kısa Tüylü Melez',
  'Ankara Kedisi',
  'Van Kedisi',
  'Melez',
];

export const DOG_BREEDS: string[] = [
  'Sokak Köpeği (Melez)',
  'Melez',
  'Çoban Kırması',
  'Kangal Kırması',
  'Terrier Kırması',
  'Av Köpeği Kırması',
  'Labrador Kırması',
  'Golden Kırması',
  'Husky Kırması',
  'Küçük Irk Melez',
  'Orta Irk Melez',
  'Büyük Irk Melez',
  'Siyah',
  'Kahverengi',
  'Beyaz',
  'Alaca',
];

function seedCommunityId(index: number): string {
  if (index % 3 === 0) return '1';
  if (index % 3 === 1) return '2';
  return '3';
}

const allAnimals: CommunityAnimal[] = animals.map((item, index) => ({
  id: item.id,
  communityId: seedCommunityId(index),
  name: item.name,
  type: item.type === 'Kedi' ? 'Kedi' : 'Köpek',
  breed: item.color,
  gender: index % 2 === 0 ? 'Dişi' : 'Erkek',
  isSterilized: index % 2 === 0,
  birthDate: index % 2 === 0 ? '2022-03-10' : '2021-09-24',
  location: item.location,
  fedToday: item.fedToday,
  vaccinationSchedule: [
    { id: `vac-${item.id}-1`, name: 'Kuduz', date: '2025-04-15' },
    { id: `vac-${item.id}-2`, name: 'Karma', date: '2025-02-01' },
  ],
  treatmentSchedule: [
    { id: `tr-${item.id}-1`, name: 'Parazit tedavisi', date: '2025-06-03', note: 'Damla uygulandi' },
  ],
  photoUris: [],
}));

function cloneAnimal(animal: CommunityAnimal): CommunityAnimal {
  return {
    ...animal,
    vaccinationSchedule: animal.vaccinationSchedule.map((event) => ({ ...event })),
    treatmentSchedule: animal.treatmentSchedule.map((event) => ({ ...event })),
    photoUris: [...animal.photoUris],
  };
}

export function getAnimalsByCommunity(communityId: string, searchText = ''): CommunityAnimal[] {
  const normalized = searchText.trim().toLowerCase();

  return allAnimals
    .filter((animal) => animal.communityId === communityId)
    .filter((animal) => {
      if (!normalized) return true;
      return (
        animal.name.toLowerCase().includes(normalized) ||
        animal.type.toLowerCase().includes(normalized) ||
        animal.breed.toLowerCase().includes(normalized) ||
        animal.gender.toLowerCase().includes(normalized) ||
        animal.location.toLowerCase().includes(normalized)
      );
    })
    .map(cloneAnimal);
}

export function getAnimalById(id: string): CommunityAnimal | null {
  const found = allAnimals.find((animal) => animal.id === id);
  return found ? cloneAnimal(found) : null;
}

export type SaveAnimalInput = {
  communityId: string;
  name: string;
  type: AnimalType;
  breed: string;
  gender: AnimalGender;
  isSterilized: boolean;
  birthDate: string;
  location: string;
  vaccinationSchedule: AnimalHealthEvent[];
  treatmentSchedule: AnimalHealthEvent[];
  photoUris?: string[];
};

export function addAnimal(input: SaveAnimalInput): CommunityAnimal {
  const created: CommunityAnimal = {
    id: `animal-${Date.now()}`,
    communityId: input.communityId,
    name: input.name,
    type: input.type,
    breed: input.breed,
    gender: input.gender,
    isSterilized: input.isSterilized,
    birthDate: input.birthDate,
    location: input.location,
    fedToday: false,
    vaccinationSchedule: input.vaccinationSchedule.map((event) => ({ ...event })),
    treatmentSchedule: input.treatmentSchedule.map((event) => ({ ...event })),
    photoUris: input.photoUris ? [...input.photoUris] : [],
  };

  allAnimals.unshift(created);
  return cloneAnimal(created);
}

export function updateAnimal(id: string, input: Omit<SaveAnimalInput, 'communityId'>): CommunityAnimal | null {
  const index = allAnimals.findIndex((animal) => animal.id === id);
  if (index < 0) return null;

  allAnimals[index] = {
    ...allAnimals[index],
    name: input.name,
    type: input.type,
    breed: input.breed,
    gender: input.gender,
    isSterilized: input.isSterilized,
    birthDate: input.birthDate,
    location: input.location,
    vaccinationSchedule: input.vaccinationSchedule.map((event) => ({ ...event })),
    treatmentSchedule: input.treatmentSchedule.map((event) => ({ ...event })),
    photoUris: input.photoUris ? [...input.photoUris] : [],
  };

  return cloneAnimal(allAnimals[index]);
}
