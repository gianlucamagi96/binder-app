import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { TcgdexService } from '../catalog/tcgdex.service';
import type { FeaturedCardDto } from '../catalog/catalog.types';
import { localIdFromCardId } from '../catalog/identify-cards';
import {
  RecognizerClient,
  type RecognizerCandidate,
} from './recognizer.client';
import type { ScanCandidate, ScanDetection, ScanResult } from './scans.types';

const CANDIDATE_LIMIT = 5;
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

type MemoryFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

@Injectable()
export class ScansService {
  private readonly logger = new Logger(ScansService.name);

  constructor(
    private readonly recognizer: RecognizerClient,
    private readonly tcgdex: TcgdexService,
  ) {}

  async scan(file: MemoryFile | undefined): Promise<ScanResult> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Manca la foto');
    }
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      throw new BadRequestException('La foto deve essere JPEG, PNG o WebP');
    }

    const started = Date.now();
    const found = await this.recognizer.identify(file);
    const detections: ScanDetection[] = await Promise.all(
      found.map(async (detection) => ({
        box: detection.box,
        ambiguous: detection.ambiguous,
        candidates: await Promise.all(
          detection.candidates
            .slice(0, CANDIDATE_LIMIT)
            .map((hit) => this.toCandidate(hit)),
        ),
      })),
    );
    this.logger.log(
      `Scan ${Date.now() - started}ms cards=${detections.length} bytes=${file.size}`,
    );
    return { detections };
  }

  private async toCandidate(hit: RecognizerCandidate): Promise<ScanCandidate> {
    const detail = await this.cardDetail(hit.cardId);
    return {
      id: hit.cardId,
      name: detail?.name ?? (hit.name || hit.cardId),
      image: detail?.image ?? null,
      localId: hit.localId || localIdFromCardId(hit.cardId),
      rarity: detail?.rarity ?? '',
      set:
        detail?.set ?? (hit.setId ? { id: hit.setId, name: hit.setId } : null),
      lang: hit.lang,
      confidence: Math.round(Math.min(1, Math.max(0, hit.score)) * 100) / 100,
    };
  }

  // Immagine, rarità e nome del set vengono da TCGdex (in cache). Se TCGdex non
  // risponde la scansione non fallisce: restano nome e numero dati dal riconoscimento.
  private async cardDetail(cardId: string): Promise<FeaturedCardDto | null> {
    try {
      return await this.tcgdex.getCardDetail(cardId);
    } catch (error) {
      this.logger.warn(
        `Dettaglio carta ${cardId} non disponibile: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
