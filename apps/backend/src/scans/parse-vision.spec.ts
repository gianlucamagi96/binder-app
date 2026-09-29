import { UnexpectedVisionFormatError, parseVisionPayload } from './parse-vision';

describe('parseVisionPayload', () => {
  it('legge l\'oggetto cards richiesto dal prompt', () => {
    const cards = parseVisionPayload(
      JSON.stringify({
        cards: [
          {
            name: 'Pikachu',
            printedName: 'Pikachu',
            setNumber: '025/165',
            setSymbol: 'Scarlet & Violet 151',
            box: { x: 10, y: 12, width: 30, height: 50 },
            confidence: 0.82,
          },
        ],
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].name).toBe('Pikachu');
    expect(cards[0].setNumber).toBe('025/165');
    expect(cards[0].box).toEqual({ x: 10, y: 12, width: 30, height: 50 });
    expect(cards[0].confidence).toBe(0.8);
  });

  it('accetta un array vuoto come nessuna carta', () => {
    expect(parseVisionPayload('{"cards":[]}')).toEqual([]);
  });

  it('tollera un array nudo e un box con angoli opposti', () => {
    const cards = parseVisionPayload(
      '[{"name":"Charizard","box":{"x1":5,"y1":10,"x2":40,"y2":80},"confidence":90}]',
    );
    expect(cards[0].box).toEqual({ x: 5, y: 10, width: 35, height: 70 });
    expect(cards[0].confidence).toBe(0.9);
  });

  it('toglie i fence markdown', () => {
    const cards = parseVisionPayload('```json\n{"cards":[{"printedName":"Mew","box":[0,0,20,40]}]}\n```');
    expect(cards[0].printedName).toBe('Mew');
    expect(cards[0].box.width).toBe(20);
  });

  it('rifiuta testo che non è JSON di carte', () => {
    expect(() => parseVisionPayload('non ho visto carte')).toThrow(UnexpectedVisionFormatError);
    expect(() => parseVisionPayload('{"note":"hello"}')).toThrow(UnexpectedVisionFormatError);
  });

  it('scarta le voci senza riquadro utilizzabile', () => {
    const cards = parseVisionPayload(
      JSON.stringify({
        cards: [
          { name: 'Pikachu' },
          { name: 'Bulbasaur', box: { x: 0, y: 0, width: 0.2, height: 10 } },
          { name: 'Squirtle', box: { x: 1, y: 2, width: 20, height: 30 } },
        ],
      }),
    );
    expect(cards.map((card) => card.name)).toEqual(['Squirtle']);
  });
});
