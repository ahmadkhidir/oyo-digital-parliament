/**
 * The Oyo State ward reference seed (`schema.md` Ward, `FEAT-002`).
 *
 * ## Provenance
 *
 * The table below is transcribed from the Independent National Electoral Commission's Registration
 * Area Centres directory for Oyo State, the official list of the state's registration areas (wards)
 * per local government area, published at
 * `https://www.inecnigeria.org/documents/resources/rac/OYO.pdf` and read on 18 November 2026. The
 * directory prints one section per local government area, numbered `001` upward, and the seed keeps
 * that order: a ward's number in its local government area is the registration-area code the source
 * prints. Where the PDF's text layer split a name across two lines or misread a glyph, the value is
 * repaired against the same ward as INEC's ward pages reproduce it
 * (`https://www.manpower.com.ng/places/wards-in-state/31`, read the same day); punctuation is
 * normalised for display and nothing is added to the published names.
 *
 * ## What this seed is, and what it is not
 *
 * No authoritative ward dataset is assumed (`architecture.md` Ward Reference Service). This is the
 * platform's own reference: a ward row exists because the platform seeded it, a resident confirmed a
 * candidate, or review settled it (`schema.md` Ward.source). The list is a starting point for
 * confirmation, not an electoral register, and the platform publishes against its own records.
 *
 * ## Determinism
 *
 * The data is a literal, not a fetch, a scan or a generated sample, so two runs read the same table.
 * A ward's identifier is `wrd_` plus a truncated SHA-256 of its local government area and number, so
 * it is stable across runs and machines and carries nothing a caller may parse (`C-001`). The
 * natural key is `(name, localGovernmentArea)`: that pair is what the seed checks before it inserts
 * and what the unique index in the Ward table enforces.
 *
 * The recorded instant is fixed for the same reason. A creation time read from the clock would make
 * the second run differ from the first; the reference data was recorded once, on the date above.
 *
 * No personal data appears here: a ward has a name, a local government area and a source, and
 * nothing about any resident.
 */
import { createHash } from 'node:crypto';

/** One local government area and its wards, in registration-area order. */
export interface WardReferenceGroup {
  /** The local government area as the platform publishes it. */
  readonly localGovernmentArea: string;
  /** Ward names without the shared `Ward <number>, ` prefix, in registration-area order. */
  readonly wards: readonly string[];
}

/**
 * The seeded ward reference: 33 local government areas and 351 wards.
 *
 * Order is load-bearing: the nth entry of `wards` is ward number n of its local government area, and
 * that number is the registration-area code the source prints.
 */
export const WARD_REFERENCE: readonly WardReferenceGroup[] = [
  {
    localGovernmentArea: 'Afijio',
    wards: [
      'Ilora I', // I
      'Ilora II', // II
      'Ilora III', // III
      'Fiditi I', // IV
      'Fiditi II', // V
      'Awe I', // VI
      'Awe II', // VII
      'Akinmorin/Jobele', // VIII
      'Iware', // IX
      'Imini', // X
    ],
  },
  {
    localGovernmentArea: 'Akinyele',
    wards: [
      'Ikereku', // I
      'Olanla/Oboda/Labode', // II
      'Olanla (Ogbangan) Village', // III
      'Olode/Amosun/Onidundu', // IV
      'Ojo-Emo/Moniya', // V
      'Akinyele/Isabiyi/Irepodun', // VI
      'Iwokoto/Talontan/Idi-Oro', // VII
      'Ojoo/Ajibode/Laniba', // VIII
      'Ijaye/Ojedeji', // IX
      'Ajibade/Alabata', // X
      'Olorisa-Oko/Okegbemi/Mele', // XI
      'Iroko', // XII
    ],
  },
  {
    localGovernmentArea: 'Atiba',
    wards: [
      'Oke Afin I', // I
      'Oke Afin II', // II
      'Aremo', // III
      'Bashorun', // IV
      'Agunpopo I', // V
      'Agunpopo II', // VI
      'Agunpopo III', // VII
      'Ashipa I', // VIII
      'Ashipa II', // IX
      'Ashipa III', // X
    ],
  },
  {
    localGovernmentArea: 'Atisbo',
    wards: [
      'Tede I', // I
      'Tede II', // II
      'Irawo Ile', // III
      'Irawo Owode', // IV
      'Ofiki', // V
      'Alaga', // VI
      'Ago-Are I', // VII
      'Ago-Are II', // VIII
      'Owo/Agunrege/Sabe', // IX
      'Bashi', // X
    ],
  },
  {
    localGovernmentArea: 'Egbeda',
    wards: [
      'Erumu', // I
      'Ayede/Alugbo/Koloko', // II
      'Owobaale/Kasumu', // III
      'Olodan/Ajiwogbo', // IV
      'Olodo/Kumapayi I', // V
      'Olodo/Kumapayi II', // VI
      'Olodo/Kumapayi III', // VII
      'Osegbere/Awaye', // VIII
      'Egbeda', // IX
      'Olode/Alakia', // X
      'Olubadan Estate', // XI
    ],
  },
  {
    localGovernmentArea: 'Ibadan North',
    wards: [
      'N2', // I
      'N3', // II
      'N4', // III
      'N5A', // IV
      'N5B', // V
      'N6A Part I', // VI
      'N6A Part II', // VII
      'N6A Part III', // VIII
      'N6B Part I', // IX
      'N6B Part II', // X
      'NW8', // XI
      'NW8', // XII
    ],
  },
  {
    localGovernmentArea: 'Ibadan North East',
    wards: [
      'E1', // I
      'E2', // II
      'E3', // III
      'E4', // IV
      'E5A', // V
      'E5B', // VI
      'E6', // VII
      'E7I', // VIII
      'E7II', // IX
      'E8', // X
      'E9I', // XI
      'E9II', // XII
    ],
  },
  {
    localGovernmentArea: 'Ibadan North West',
    wards: [
      'N1 (Part I)', // I
      'N1 (Part II)', // II
      'NW1', // III
      'NW2', // IV
      'NW3 (Part I)', // V
      'NW3 (Part I)', // VI
      'NW4', // VII
      'NW5', // VIII
      'NW6', // IX
      'NW7', // X
      'NW7', // XI
    ],
  },
  {
    localGovernmentArea: 'Ibadan South East',
    wards: [
      'C1', // I
      'S1', // II
      'S2A', // III
      'S2B', // IV
      'S3', // V
      'S4A', // VI
      'S4B', // VII
      'S5', // VIII
      'S6A', // IX
      'S6B', // X
      'S7A', // XI
      'S7B', // XII
    ],
  },
  {
    localGovernmentArea: 'Ibadan South West',
    wards: [
      'C2', // I
      'SW1', // II
      'SW2', // III
      'SW3', // IV
      'SW4', // V
      'SW5', // VI
      'SW6', // VII
      'SW7', // VIII
      'SW8(1)', // IX
      'SW8(II)', // X
      'SW9(1)', // XI
      'SW9(II)', // XII
    ],
  },
  {
    localGovernmentArea: 'Ibarapa Central',
    wards: [
      'Idere Molete', // I
      'Idere II Onigbio', // II
      'Idere III (Koso/Apa)', // III
      'Iberekodo/Pataoju', // IV
      'Iberekodo/Agooro', // V
      'Idofin/Sagan-Un', // VI
      'Igbole-Pako', // VII
      'Isale Oba', // VIII
      'Oke-Iserin I & II', // IX
      'Oke-Odo', // X
    ],
  },
  {
    localGovernmentArea: 'Ibarapa East',
    wards: [
      'Eruwa I', // I
      'Eruwa II', // II
      'Eruwa III', // III
      'Eruwa IV', // IV
      'Eruwa V', // V
      'Eruwa VI', // VI
      'Lanlate I', // VII
      'Lanlate II', // VIII
      'Lanlate III', // IX
      'Lanlate IV', // X
    ],
  },
  {
    localGovernmentArea: 'Ibarapa North',
    wards: [
      'Ayete I', // I
      'Ayete II', // II
      'Igangan I', // III
      'Igangan II', // IV
      'Igangan III', // V
      'Igangan IV', // VI
      'Ofiki I', // VII
      'Ofiki II', // VIII
      'Tapa I', // IX
      'Tapa II', // X
    ],
  },
  {
    localGovernmentArea: 'Ido',
    wards: [
      'Abaemo/Ilaju/Alako', // I
      'Akufo/Idigba/Araromi', // II
      'Apete/Ayegun/Awotan', // III
      'Akinware/Akindele', // IV
      'Batake/Idi-Iya', // V
      'Erinwusi/Koguo/Odetola', // VI
      'Fenwa/Oganla/Elenusonso', // VII
      'Ido/Onikede/Okuna-Awo', // VIII
      'Omi Adio/Omi-Onigbagbo/Bakatari', // IX
      'Ogundele/Apata/Siba/Idi-Ahun', // X
    ],
  },
  {
    localGovernmentArea: 'Irepo',
    wards: [
      'Agoro', // I
      'Ajagunna', // II
      'Atipa', // III
      'Iba I', // IV
      'Iba II', // V
      'Iba III', // VI
      'Iba IV', // VII
      'Iba V', // VIII
      'Ikolaba', // IX
      'Laha/Ajana', // X
    ],
  },
  {
    localGovernmentArea: 'Iseyin',
    wards: [
      'Ado-Awaye', // I
      'Osoogun', // II
      'Ekunle I', // III
      'Ekunle II', // IV
      'Faramora', // V
      'Oke Ola, Oke Oja', // VI
      'Isalu I', // VII
      'Isalu II', // VIII
      'Koso I', // IX
      'Koso II', // X
      'Ladogan/Oke Eyin', // XI
    ],
  },
  {
    localGovernmentArea: 'Itesiwaju',
    wards: [
      'Babaode', // I
      'Igbojaye', // II
      'Ipapo', // III
      'Komu', // IV
      'Okaka I', // V
      'Okaka II', // VI
      'Oke-Amu', // VII
      'Otu I', // VIII
      'Otu II', // IX
      'Owode/Ipapo', // X
    ],
  },
  {
    localGovernmentArea: 'Iwajowa',
    wards: [
      'Agbaakin I', // I
      'Agbaakin II', // II
      'Iwere Ile I', // III
      'Iwere Ile II', // IV
      'Iwere Ile III', // V
      'Iwere Ile IV', // VI
      'Sabigana I', // VII
      'Sabigana II', // VIII
      'Sabigana III', // IX
      'Sabigana IV', // X
    ],
  },
  {
    localGovernmentArea: 'Kajola',
    wards: [
      'Ayetoro Oke', // I
      'Elero', // II
      'Gbelekale I & II', // III
      'Iba-Ogan', // IV
      'Ijo', // V
      'Ilaji-Oke/Iwere-Oke', // VI
      'Imoba/Okeogun', // VII
      'Isemi-Ile/Imia/Ilua', // VIII
      'Isia', // IX
      'Kajola', // X
      'Gbonje/Olele', // XI
    ],
  },
  {
    localGovernmentArea: 'Lagelu',
    wards: [
      'Ajara/Opeodun', // I
      'Apatere/Kuffi/Ogunbode/Ogo', // II
      'Arulogun Ehin/Kelebe', // III
      'Ejioku/Igbon/Ariku', // IV
      'Lagelu Mkt/Kajola', // V
      'Lagun', // VI
      'Lalupon I', // VII
      'Lalupon II', // VIII
      'Lalupon III', // IX
      'Ofa Igbo', // X
      'Ogunjana/Olowode/Ogburo', // XI
      'Ogunremi/Ogunsina', // XII
      'Oyedeji/Olode/Kutayi', // XIII
      'Sagbe Pabiekun', // XIV
    ],
  },
  {
    localGovernmentArea: 'Ogbomoso North',
    wards: [
      'Abogunde', // I
      'Aaje/Ogunbado/Oke Agbede', // II
      'Aguodo/Masifa', // III
      'Isale Afon', // IV
      'Isale Alaasa', // V
      'Isale Ora/Saja', // VI
      'Jagun', // VII
      'Okelerin', // VIII
      'Osupa', // IX
      'Sabo/Tara', // X
    ],
  },
  {
    localGovernmentArea: 'Ogbomoso South',
    wards: [
      'Akata', // I
      'Alapata', // II
      'Arowomole', // III
      'Ibapon', // IV
      'Ijeru I', // V
      'Ijeru II', // VI
      'Ilogbo', // VII
      'Isoko', // VIII
      'Lagbedu', // IX
      'Oke Ola/Farm Settlement', // X
    ],
  },
  {
    localGovernmentArea: 'Ogo Oluwa',
    wards: [
      'Ajaawa I', // I
      'Ajaawa II', // II
      'Ayede', // III
      'Ayetoro', // IV
      'Idewure', // V
      'Lagbedu', // VI
      'Mowolowo/Iwo Ate', // VII
      'Odo-Oba', // VIII
      'Opete', // IX
      'Otamokun', // X
    ],
  },
  {
    localGovernmentArea: 'Olorunsogo',
    wards: [
      'Aboke (Aboyun Ogun)', // I
      'Elerugba/Elehinke/Sagbo (Aperu)', // II
      'Ikolaba/Obadimo', // III
      'Onigbeti I', // IV
      'Onigbeti II/Saagbon', // V
      'Onigbeti III & IV', // VI
      'Opa/Ogunniyi', // VII
      'Seriki', // VIII
      'Seriki II', // IX
      'Waro/Apata Alaje', // X
    ],
  },
  {
    localGovernmentArea: 'Oluyole',
    wards: [
      'Ayegun', // I
      'Idiroko/Ikereku', // II
      'Idi Osan/Egbeda Atuba', // III
      'Moslem/Ogbere', // IV
      'Odo Ona Nla', // V
      'Okahinde/Latunde', // VI
      'Olomi/Olurinde', // VII
      'Olonde/Abanla', // VIII
      'Onipe', // IX
      'Orisunbare/Ojo Ekun', // X
    ],
  },
  {
    localGovernmentArea: 'Ona Ara',
    wards: [
      'Akanran/Olorunda', // I
      'Ona-Ara', // II
      'Badeku', // III
      'Gbada-Efon', // IV
      'Odi Odeyale/Odi-Aperin', // V
      'Ogbere', // VI
      'Ogbere Tioya', // VII
      'Ojoku/Ajia', // VIII
      'Olorunsogo', // IX
      'Olode/Gbedun/Ojebode', // X
      'Oremeji/Agugu', // XI
    ],
  },
  {
    localGovernmentArea: 'Orelope',
    wards: [
      'Alepata', // I
      'Aare', // II
      'Bonni', // III
      'Igbope/Iyeye I', // IV
      'Igbope/Iyeye II', // V
      'Igi-Isubu', // VI
      'Onibode I', // VII
      'Onibode II', // VIII
      'Onibode III', // IX
      'Onigboho/Alomo/Okere', // X
    ],
  },
  {
    localGovernmentArea: 'Ori Ire',
    wards: [
      'Oriire I', // I
      'Oriire II', // II
      'Oriire III', // III
      'Oriire IV', // IV
      'Oriire V', // V
      'Oriire VI', // VI
      'Oriire VII', // VII
      'Oriire VIII', // VIII
      'Oriire IX', // IX
      'Oriire X', // X
    ],
  },
  {
    localGovernmentArea: 'Oyo East',
    wards: [
      'Agboye/Molete', // I
      'Ajagba', // II
      'Alaodi/Modeke', // III
      'Apaara', // IV
      'Apinni', // V
      'Balogun', // VI
      'Jabata', // VII
      'Oke Apo', // VIII
      'Oluajo', // IX
      'Owode/Araromi', // X
    ],
  },
  {
    localGovernmentArea: 'Oyo West',
    wards: [
      'Akeetan', // I
      'Ajokidero/Akeugberu', // II
      'Fasola/Soku', // III
      'Iseke', // IV
      'Isokun I', // V
      'Isokun II', // VI
      'Iyaji', // VII
      'Opapa', // VIII
      'Owode', // IX
      'Pakoyi/Idode', // X
    ],
  },
  {
    localGovernmentArea: 'Saki East',
    wards: [
      'Agbonle', // I
      'Ago-Amodu I', // II
      'Ago-Amodu II', // III
      'Ogobooro I', // IV
      'Ogobooro II', // V
      'Oje-Owode I', // VI
      'Oje-Owode II', // VII
      'Sepeteri I', // VIII
      'Sepeteri II', // IX
      'Sepeteri III', // X
      'Sepeteri IV', // XI
    ],
  },
  {
    localGovernmentArea: 'Saki West',
    wards: [
      'Aganmu/Kooko', // I
      'Ajegunle', // II
      'Bagii', // III
      'Ekokan-Mua', // IV
      'Iya', // V
      'Ogidigbo/Kinnikinni', // VI
      'Oke-Oro', // VII
      'Okere I', // VIII
      'Okere II', // IX
      'Sangote/Booda/Ilua', // X
      'Sepeteri/Bapon', // XI
    ],
  },
  {
    localGovernmentArea: 'Surulere',
    wards: [
      'Baya-Oje', // I
      'Igbon/Gambari', // II
      'Iresaapa', // III
      'Arolu', // IV
      'Iresaadu', // V
      'Iregba', // VI
      'Iwofin', // VII
      'Oko', // VIII
      'Ilajue', // IX
      'Mayin', // X
    ],
  },
];

/** The instant recorded on every seeded row: the date this table was transcribed from the source. */
export const WARD_REFERENCE_RECORDED_AT = '2026-11-18T00:00:00Z';

/** One Ward row as the seed inserts it. */
export interface WardSeedRow {
  readonly id: string;
  readonly name: string;
  readonly localGovernmentArea: string;
  readonly source: 'seeded';
  readonly createdAt: string;
}

const ROMAN = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
  'XIII',
  'XIV',
  'XV',
  'XVI',
  'XVII',
  'XVIII',
  'XIX',
  'XX',
] as const;

/**
 * The Roman numeral a ward number is published with.
 *
 * Oyo wards are named `Ward IV, Agbowo` in the product (`C-009`), not `Ward 4`. The list is longer
 * than any local government area needs; a number past it is a transcription error and fails loudly
 * rather than publishing `Ward 21`.
 */
export function wardNumeral(wardNumber: number): string {
  const numeral = ROMAN[wardNumber - 1];
  if (numeral === undefined) {
    throw new Error(`Ward number ${wardNumber} has no published numeral (seeds/wards.ts).`);
  }
  return numeral;
}

/**
 * The stable identifier for a seeded ward.
 *
 * `C-001` fixes `^[a-z]{3}_[0-9A-Z]{4,26}$`; the body is an opaque, upper-case digest so the
 * identifier is reproducible and reveals nothing about the ward.
 */
export function wardIdentifier(localGovernmentArea: string, wardNumber: number): string {
  const digest = createHash('sha256')
    .update(`ward:${localGovernmentArea}:${wardNumber}`, 'utf8')
    .digest('hex')
    .slice(0, 16)
    .toUpperCase();
  return `wrd_${digest}`;
}

/**
 * Builds the Ward rows the seed inserts.
 *
 * Pure and total: the same reference table always produces the same rows in the same order, which
 * is what makes a second seed run a no-op and lets the test compare two runs without a clock.
 */
export function wardSeedRows(): WardSeedRow[] {
  const rows: WardSeedRow[] = [];
  for (const group of WARD_REFERENCE) {
    group.wards.forEach((label, index) => {
      const wardNumber = index + 1;
      rows.push({
        id: wardIdentifier(group.localGovernmentArea, wardNumber),
        name: `Ward ${wardNumeral(wardNumber)}, ${label}`,
        localGovernmentArea: group.localGovernmentArea,
        source: 'seeded',
        createdAt: WARD_REFERENCE_RECORDED_AT,
      });
    });
  }
  return rows;
}
