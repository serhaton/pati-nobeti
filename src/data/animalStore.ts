import { animals } from './mock';
import { getAppDataSource, isSupabaseDataEnabled, supabase } from '../services/supabase';

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

let allAnimals: CommunityAnimal[] = getAppDataSource() === 'mock' ? animals.map((item, index) => ({
  id: item.id,
  communityId: item.communityId,
  name: item.name,
  type: item.type === 'Kedi' ? 'Kedi' : 'Köpek',
  breed: item.cins,
  gender: index % 2 === 0 ? 'Dişi' : 'Erkek',
  isSterilized: index % 2 === 0,
  birthDate: index % 2 === 0 ? '2022-03-10' : '2021-09-24',
  location: item.location,
  vaccinationSchedule: [
    { id: `vac-${item.id}-1`, name: 'Kuduz', date: '2025-04-15' },
    { id: `vac-${item.id}-2`, name: 'Karma', date: '2025-02-01' },
  ],
  treatmentSchedule: [
    { id: `tr-${item.id}-1`, name: 'Parazit tedavisi', date: '2025-06-03', note: 'Damla uygulandi' },
  ],
  photoUris: [],
})) : [];

export function setAnimalsData(items: CommunityAnimal[]) {
  allAnimals = items.map((animal) => cloneAnimal(animal));
}

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

function formatPersistenceError(error: any, fallback: string): Error {
  const parts = [error?.message, error?.details, error?.hint].filter(Boolean);
  if (parts.length === 0) return new Error(fallback);
  return new Error(parts.join(' - '));
}

export async function addAnimal(input: SaveAnimalInput): Promise<CommunityAnimal> {
  let animalId = `animal-${Date.now()}`;

  if (isSupabaseDataEnabled()) {
    const { data, error } = await supabase
      .from('animals')
      .insert({
        community_id: input.communityId,
        name: input.name,
        animal_type: input.type === 'Köpek' ? 'dog' : 'cat',
        color: input.breed,
        gender: input.gender,
        neutered: input.isSterilized,
        notes: input.location,
        photo_url: input.photoUris?.[0] ?? null,
      })
      .select('id')
      .single();

    if (error) {
      throw formatPersistenceError(error, 'Can dost Supabase veritabanina kaydedilemedi.');
    }

    animalId = String(data.id);
  }

  const created: CommunityAnimal = {
    id: animalId,
    communityId: input.communityId,
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

  allAnimals.unshift(created);

  return cloneAnimal(created);
}

export async function updateAnimal(id: string, input: Omit<SaveAnimalInput, 'communityId'>): Promise<CommunityAnimal | null> {
  const index = allAnimals.findIndex((animal) => animal.id === id);
  if (index < 0) return null;

  if (isSupabaseDataEnabled()) {
    const { data, error } = await supabase
      .from('animals')
      .update({
        name: input.name,
        animal_type: input.type === 'Köpek' ? 'dog' : 'cat',
        color: input.breed,
        gender: input.gender,
        neutered: input.isSterilized,
        notes: input.location,
        photo_url: input.photoUris?.[0] ?? null,
      })
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      throw formatPersistenceError(error, 'Can dost Supabase veritabaninda guncellenemedi.');
    }

    if (!data) {
      throw new Error('Supabase kaydi bulunamadi. Listeyi yenileyip tekrar deneyin.');
    }
  }

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
