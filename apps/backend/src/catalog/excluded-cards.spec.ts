import { EXCLUDED_SET_IDS_FALLBACK, isCardInSets } from './excluded-cards';

describe('isCardInSets', () => {
  const pocket = EXCLUDED_SET_IDS_FALLBACK;

  it('riconosce le carte Pocket, promo comprese', () => {
    expect(isCardInSets('A1-025', pocket)).toBe(true);
    expect(isCardInSets('A1a-025', pocket)).toBe(true);
    expect(isCardInSets('A2b-022', pocket)).toBe(true);
    expect(isCardInSets('P-A-009', pocket)).toBe(true);
  });

  it('non tocca le carte reali', () => {
    expect(isCardInSets('sv03.5-025', pocket)).toBe(false);
    expect(isCardInSets('base1-58', pocket)).toBe(false);
    expect(isCardInSets('swsh12.5-160', pocket)).toBe(false);
    expect(isCardInSets('svp-001', pocket)).toBe(false);
  });

  it('confronta l’id del set intero, non solo il prefisso', () => {
    expect(isCardInSets('A1a-001', ['A1'])).toBe(false);
    expect(isCardInSets('A10-001', ['A1'])).toBe(false);
  });
});
