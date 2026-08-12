#!/usr/bin/env node

/**
 * Fetch Istanbul veterinary places from Overpass (OpenStreetMap)
 * and generate SQL inserts for public.global_veterinarians.
 *
 * Data source attribution: OpenStreetMap contributors (ODbL).
 */

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];
const OUTPUT_PATH = resolve(process.cwd(), 'scripts/output/istanbul_global_veterinarians.sql');

const OVERPASS_QUERY = `
[out:json][timeout:180];
(
  node["amenity"="veterinary"](40.80,28.40,41.45,29.75);
  way["amenity"="veterinary"](40.80,28.40,41.45,29.75);
  relation["amenity"="veterinary"](40.80,28.40,41.45,29.75);
);
out center tags;
`;

function sqlEscape(value) {
  return String(value).replace(/'/g, "''");
}

function collapseWhitespace(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickClinicName(tags, osmType, osmId) {
  return (
    collapseWhitespace(tags.name) ||
    collapseWhitespace(tags.operator) ||
    `Veteriner Kaydi ${osmType}${osmId}`
  );
}

function pickVetName(tags) {
  return (
    collapseWhitespace(tags['contact:person']) ||
    collapseWhitespace(tags.doctor) ||
    collapseWhitespace(tags.veterinarian) ||
    collapseWhitespace(tags.operator) ||
    'Belirtilmedi'
  );
}

function pickPhone(tags) {
  return (
    collapseWhitespace(tags['contact:phone']) ||
    collapseWhitespace(tags.phone) ||
    collapseWhitespace(tags['phone:mobile']) ||
    'Belirtilmedi'
  );
}

function pickDistrict(tags) {
  return (
    collapseWhitespace(tags['addr:district']) ||
    collapseWhitespace(tags['addr:suburb']) ||
    collapseWhitespace(tags['is_in:district']) ||
    ''
  );
}

function pickLocationLabel(tags, lat, lon) {
  const street = collapseWhitespace(tags['addr:street']);
  const housenumber = collapseWhitespace(tags['addr:housenumber']);
  const suburb = collapseWhitespace(tags['addr:suburb']);
  const district = pickDistrict(tags);
  const city = collapseWhitespace(tags['addr:city']) || 'Istanbul';

  const streetPart = [street, housenumber].filter(Boolean).join(' ');
  const areaPart = [suburb, district, city].filter(Boolean).join(' / ');
  const text = [streetPart, areaPart].filter(Boolean).join(' - ');

  if (text) return text;
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

function toRecord(element) {
  const tags = element.tags ?? {};
  const lat = Number(element.lat ?? element.center?.lat);
  const lon = Number(element.lon ?? element.center?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const osmType = String(element.type ?? 'x').slice(0, 1);
  const osmId = Number(element.id ?? 0);

  return {
    key: `${pickClinicName(tags, osmType, osmId).toLowerCase()}|${lat.toFixed(5)}|${lon.toFixed(5)}`,
    clinicName: pickClinicName(tags, osmType, osmId),
    defaultVeterinarianName: pickVetName(tags),
    defaultPhone: pickPhone(tags),
    locationLabel: pickLocationLabel(tags, lat, lon),
    latitude: lat,
    longitude: lon,
    city: 'Istanbul',
    district: pickDistrict(tags),
    source: `osm_overpass:${element.type}/${element.id}`,
    verified: false,
    isActive: true,
  };
}

function recordToSqlTuple(record) {
  const districtLiteral = record.district ? `'${sqlEscape(record.district)}'` : 'null';

  return `(
    '${sqlEscape(record.clinicName)}',
    '${sqlEscape(record.defaultVeterinarianName)}',
    '${sqlEscape(record.defaultPhone)}',
    '${sqlEscape(record.locationLabel)}',
    ${record.latitude},
    ${record.longitude},
    '${sqlEscape(record.city)}',
    ${districtLiteral},
    '${sqlEscape(record.source)}',
    ${record.verified},
    ${record.isActive}
  )`;
}

async function tryFetch(url, body, contentType) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      Accept: 'application/json',
      'User-Agent': 'pati-nobeti-vet-seeder/1.0',
    },
    body,
  });
}

async function fetchOverpassData() {
  const errors = [];

  for (const url of OVERPASS_URLS) {
    const attempts = [
      {
        body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
        contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      {
        body: OVERPASS_QUERY,
        contentType: 'text/plain; charset=UTF-8',
      },
    ];

    for (const attempt of attempts) {
      try {
        const response = await tryFetch(url, attempt.body, attempt.contentType);
        if (!response.ok) {
          errors.push(`${url} -> ${response.status} ${response.statusText}`);
          continue;
        }

        const payload = await response.json();
        return Array.isArray(payload.elements) ? payload.elements : [];
      } catch (error) {
        errors.push(`${url} -> ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  throw new Error(`Overpass request failed on all endpoints: ${errors.join(' | ')}`);
}

async function main() {
  console.log('Fetching veterinary places in Istanbul from Overpass...');
  const elements = await fetchOverpassData();

  const byKey = new Map();
  for (const element of elements) {
    const record = toRecord(element);
    if (!record) continue;
    if (!byKey.has(record.key)) {
      byKey.set(record.key, record);
    }
  }

  const records = [...byKey.values()].sort((a, b) => a.clinicName.localeCompare(b.clinicName, 'tr'));

  if (records.length === 0) {
    throw new Error('No veterinary records were found for Istanbul.');
  }

  const tuples = records.map(recordToSqlTuple).join(',\n');

  const sql = `-- Auto-generated from OpenStreetMap Overpass\n-- Source license: ODbL (OpenStreetMap contributors)\n-- Generated at: ${new Date().toISOString()}\n\ninsert into public.global_veterinarians (\n  clinic_name,\n  default_veterinarian_name,\n  default_phone,\n  location_label,\n  latitude,\n  longitude,\n  city,\n  district,\n  source,\n  verified,\n  is_active\n)\nvalues\n${tuples}\n;\n`;

  await writeFile(OUTPUT_PATH, sql, 'utf8');
  console.log(`Done. ${records.length} records written to:`);
  console.log(OUTPUT_PATH);
}

main().catch((error) => {
  console.error('Failed to generate SQL:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
