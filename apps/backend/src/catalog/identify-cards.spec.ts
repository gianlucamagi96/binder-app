import {
  canonicalLocalId,
  localIdQueryVariants,
  parseCollectorNumber,
  pickIdentifyResults,
  rankIdentifyCandidates,
} from './identify-cards';

describe('parseCollectorNumber', () => {
  it('usa il numeratore e ignora gli zeri iniziali', () => {
    expect(parseCollectorNumber('025/165')).toBe('25');
    expect(parseCollectorNumber('4/102')).toBe('4');
    expect(parseCollectorNumber('TG15/TG30')).toBe('TG15');
    expect(parseCollectorNumber('tg015 / tg30')).toBe('TG15');
  });

  it('accetta un numero isolato', () => {
    expect(parseCollectorNumber('SVP 014')).toBe('SVP14');
  });

  it('rifiuta testo senza cifre', () => {
    expect(parseCollectorNumber('')).toBeNull();
    expect(parseCollectorNumber('pikachu')).toBeNull();
  });
});

describe('canonicalLocalId', () => {
  it('allinea prefisso e zeri', () => {
    expect(canonicalLocalId('025')).toBe('25');
    expect(canonicalLocalId('TG015')).toBe('TG15');
    expect(canonicalLocalId('15')).not.toBe(canonicalLocalId('TG15'));
  });
});

describe('localIdQueryVariants', () => {
  it('chiede a TCGdex sia la forma corta sia quella imbottita', () => {
    expect(localIdQueryVariants('25').sort()).toEqual(['025', '25'].sort());
    expect(localIdQueryVariants('TG15')).toContain('TG015');
  });
});

describe('rankIdentifyCandidates', () => {
  const cards = [
    { id: 'sv3-25', name: 'Pikachu', localId: '025' },
    { id: 'sv1-25', name: 'Pikachu', localId: '25' },
    { id: 'base1-58', name: 'Pikachu', localId: '58' },
    { id: 'sv3-6', name: 'Charizard', localId: '006' },
  ];

  it('tiene solo le carte con lo stesso numero quando il numero torna', () => {
    const ranked = rankIdentifyCandidates(cards, { name: 'Pikachu', number: '025/165' });
    const picked = pickIdentifyResults(ranked);
    expect(picked.map((card) => card.id).sort()).toEqual(['sv1-25', 'sv3-25']);
    expect(picked.every((card) => card.exactNumber)).toBe(true);
  });

  it('non scarta la shortlist se il nome OCR non è quello inglese', () => {
    const ranked = rankIdentifyCandidates(cards, { name: 'Dracaufeu', number: '25/165' });
    const picked = pickIdentifyResults(ranked);
    expect(picked.map((card) => card.id).sort()).toEqual(['sv1-25', 'sv3-25']);
  });

  it('ricade sul nome se il numero non coincide con nessuna carta', () => {
    const ranked = rankIdentifyCandidates(cards, { name: 'Charizard', number: '99/165' });
    const picked = pickIdentifyResults(ranked);
    expect(picked.map((card) => card.id)).toEqual(['sv3-6']);
    expect(picked[0].exactNumber).toBe(false);
  });
});
