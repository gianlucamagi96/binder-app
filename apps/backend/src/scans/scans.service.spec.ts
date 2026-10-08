import {
  BadRequestException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { TcgdexService } from '../catalog/tcgdex.service';
import type { FeaturedCardDto } from '../catalog/catalog.types';
import {
  RecognizerClient,
  type RecognizerDetection,
} from './recognizer.client';
import { ScansService } from './scans.service';

const PHOTO = {
  buffer: Buffer.from([1, 2, 3]),
  mimetype: 'image/jpeg',
  size: 3,
};

const DETECTION: RecognizerDetection = {
  box: { x: 10, y: 5, width: 60, height: 80 },
  detected: true,
  ambiguous: true,
  candidates: [
    {
      cardId: 'base4-4',
      lang: 'en',
      score: 0.93,
      inliers: 340,
      name: 'Charizard',
      localId: '4',
      setId: 'base4',
    },
    {
      cardId: 'base1-4',
      lang: 'en',
      score: 0.94,
      inliers: 60,
      name: 'Charizard',
      localId: '4',
      setId: 'base1',
    },
  ],
};

function fakeTcgdex(details: Record<string, FeaturedCardDto>, failing = false) {
  return {
    getCardDetail: (id: string) =>
      failing
        ? Promise.reject(new Error('TCGdex giù'))
        : Promise.resolve(details[id] ?? null),
  } as unknown as TcgdexService;
}

function fakeRecognizer(detections: RecognizerDetection[]) {
  return {
    identify: () => Promise.resolve(detections),
  } as unknown as RecognizerClient;
}

const CHARIZARD_BASE4: FeaturedCardDto = {
  id: 'base4-4',
  name: 'Charizard',
  image: 'https://assets.tcgdex.net/en/base/base4/4/high.webp',
  rarity: 'Rare Holo',
  hp: 120,
  types: ['Fire'],
  set: { id: 'base4', name: 'Base Set 2' },
};

describe('ScansService', () => {
  it("mantiene l'ordine del riconoscimento e arricchisce i candidati da TCGdex", async () => {
    const service = new ScansService(
      fakeRecognizer([DETECTION]),
      fakeTcgdex({ 'base4-4': CHARIZARD_BASE4 }),
    );

    const { detections } = await service.scan(PHOTO);

    expect(detections).toHaveLength(1);
    expect(detections[0].ambiguous).toBe(true);
    expect(detections[0].box).toEqual(DETECTION.box);
    const [first, second] = detections[0].candidates;
    expect(first).toEqual({
      id: 'base4-4',
      name: 'Charizard',
      image: CHARIZARD_BASE4.image,
      localId: '4',
      rarity: 'Rare Holo',
      set: { id: 'base4', name: 'Base Set 2' },
      lang: 'en',
      confidence: 0.93,
    });
    // Senza dettaglio TCGdex restano i dati del riconoscimento.
    expect(second).toMatchObject({
      id: 'base1-4',
      name: 'Charizard',
      image: null,
      set: { id: 'base1' },
    });
  });

  it('non fallisce se TCGdex non risponde', async () => {
    const service = new ScansService(
      fakeRecognizer([DETECTION]),
      fakeTcgdex({}, true),
    );

    const { detections } = await service.scan(PHOTO);

    expect(detections[0].candidates.map((candidate) => candidate.id)).toEqual([
      'base4-4',
      'base1-4',
    ]);
  });

  it('rifiuta file mancanti o di tipo sbagliato', async () => {
    const service = new ScansService(fakeRecognizer([]), fakeTcgdex({}));

    await expect(service.scan(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.scan({ ...PHOTO, mimetype: 'image/gif' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('RecognizerClient', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function client(url: string | undefined) {
    const config = {
      get: (key: string) => (key === 'RECOGNIZER_URL' ? url : undefined),
    } as ConfigService;
    return new RecognizerClient(config);
  }

  function respond(status: number, body: unknown) {
    const calls: string[] = [];
    globalThis.fetch = ((input: URL | string) => {
      calls.push(String(input));
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    }) as typeof fetch;
    return calls;
  }

  it('manda la foto a /identify e restituisce le detection', async () => {
    const calls = respond(200, { detections: [DETECTION], ms: 120 });

    const detections = await client('http://recognizer:8000').identify(PHOTO);

    expect(calls).toEqual(['http://recognizer:8000/identify']);
    expect(detections[0].candidates[0].cardId).toBe('base4-4');
  });

  it('senza RECOGNIZER_URL il servizio non è configurato', async () => {
    await expect(client(undefined).identify(PHOTO)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('foto illeggibile per il servizio: 422', async () => {
    respond(422, { detail: 'Foto illeggibile' });
    await expect(
      client('http://recognizer:8000').identify(PHOTO),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('servizio in errore o irraggiungibile: 503', async () => {
    respond(500, { detail: 'boom' });
    await expect(
      client('http://recognizer:8000').identify(PHOTO),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    globalThis.fetch = (() =>
      Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    await expect(
      client('http://recognizer:8000').identify(PHOTO),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
