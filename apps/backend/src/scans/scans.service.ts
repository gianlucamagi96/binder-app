import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TcgdexService } from '../catalog/tcgdex.service';
import type { IdentifyCardDto } from '../catalog/catalog.types';
import { UnexpectedVisionFormatError, parseVisionPayload, type VisionCard } from './parse-vision';
import { VISION_MODEL, VISION_PROMPT } from './vision-prompt';
import type { ScanCandidate, ScanDetection, ScanResult } from './scans.types';

const CANDIDATE_LIMIT = 3;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

type MemoryFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

type GroqUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
};

@Injectable()
export class ScansService {
  private readonly logger = new Logger(ScansService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tcgdex: TcgdexService,
  ) {}

  async scan(file: MemoryFile | undefined): Promise<ScanResult> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Manca la foto');
    }
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      throw new BadRequestException('La foto deve essere JPEG, PNG o WebP');
    }

    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('Identificazione non configurata');
    }

    const model = this.config.get<string>('GROQ_VISION_MODEL') || VISION_MODEL;
    const started = Date.now();
    const { content, usage } = await this.askVision(apiKey, model, file);
    let readings: VisionCard[];
    try {
      readings = parseVisionPayload(content);
    } catch (error) {
      if (error instanceof UnexpectedVisionFormatError) {
        this.logger.warn(`Formato vision inatteso: ${content.slice(0, 240)}`);
        throw new UnprocessableEntityException(
          'L\'AI ha risposto in un formato inatteso. Riprova con una foto più nitida.',
        );
      }
      throw error;
    }

    const detections = await Promise.all(readings.map((reading) => this.matchReading(reading)));
    this.logger.log(
      `Scan ${Date.now() - started}ms model=${model} cards=${detections.length} in=${usage.prompt_tokens ?? '?'} out=${usage.completion_tokens ?? '?'} bytes=${file.size}`,
    );
    return { detections };
  }

  private async matchReading(reading: VisionCard): Promise<ScanDetection> {
    const searchName = reading.name.length >= 2 ? reading.name : reading.printedName;
    let ranked: IdentifyCardDto[] = [];
    if (searchName.trim().length >= 2 || reading.setNumber.trim()) {
      try {
        const found = await this.tcgdex.identifyCards(searchName, reading.setNumber);
        ranked = found.items.slice(0, CANDIDATE_LIMIT);
      } catch (error) {
        if (!(error instanceof BadRequestException)) {
          this.logger.warn(`Ricerca catalogo fallita per "${searchName}": ${error}`);
        }
      }
    }

    const candidates = await Promise.all(
      ranked.map(async (hit) => this.toCandidate(hit, reading.confidence)),
    );

    return {
      box: reading.box,
      reading: {
        name: reading.name,
        printedName: reading.printedName,
        setNumber: reading.setNumber,
        setSymbol: reading.setSymbol,
        confidence: reading.confidence,
      },
      candidates,
    };
  }

  private async toCandidate(hit: IdentifyCardDto, aiConfidence: number): Promise<ScanCandidate> {
    const detail = await this.tcgdex.getCardDetail(hit.id);
    return {
      id: hit.id,
      name: hit.name,
      image: detail?.image ?? hit.image,
      localId: hit.localId,
      rarity: detail?.rarity ?? '',
      set: detail?.set ?? hit.set,
      confidence: candidateConfidence(hit.score, aiConfidence, hit.exactNumber),
      exactNumber: hit.exactNumber,
    };
  }

  private async askVision(apiKey: string, model: string, file: MemoryFile) {
    const withJson = await this.complete(apiKey, model, file, true);
    if (withJson.ok) return withJson;
    if (withJson.rateLimited) {
      throw new ServiceUnavailableException('Troppe identificazioni di fila. Riprova tra qualche secondo.');
    }
    if (!withJson.jsonModeRejected) {
      throw new ServiceUnavailableException('Il servizio di identificazione non risponde');
    }
    this.logger.warn('JSON mode rifiutato dal modello, riprovo senza response_format');
    const plain = await this.complete(apiKey, model, file, false);
    if (!plain.ok) {
      throw new ServiceUnavailableException('Il servizio di identificazione non risponde');
    }
    return plain;
  }

  private async complete(apiKey: string, model: string, file: MemoryFile, jsonMode: boolean) {
    const mime = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype;
    const dataUrl = `data:${mime};base64,${file.buffer.toString('base64')}`;
    const body: Record<string, unknown> = {
      model,
      temperature: 0,
      max_completion_tokens: 1200,
      reasoning_effort: 'none',
      reasoning_format: 'hidden',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: VISION_PROMPT },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    };
    if (jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    let response: Response;
    try {
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      this.logger.error(`Groq irraggiungibile: ${error}`);
      return { ok: false as const, jsonModeRejected: false, rateLimited: false, content: '', usage: {} };
    }

    if (!response.ok) {
      const detail = await response.text();
      const jsonModeRejected = jsonMode && response.status === 400 && /response_format|json/i.test(detail);
      this.logger.error(`Groq ${response.status}: ${detail.slice(0, 300)}`);
      return {
        ok: false as const,
        jsonModeRejected,
        rateLimited: response.status === 429,
        content: '',
        usage: {},
      };
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: GroqUsage;
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? '';
    if (!content) {
      return { ok: false as const, jsonModeRejected: false, rateLimited: false, content: '', usage: data.usage ?? {} };
    }
    return { ok: true as const, jsonModeRejected: false, rateLimited: false, content, usage: data.usage ?? {} };
  }
}

function candidateConfidence(rankScore: number, aiConfidence: number, exactNumber: boolean): number {
  const rank = Math.min(1, Math.max(0, rankScore / 150));
  const base = exactNumber ? 0.55 + rank * 0.45 : rank * 0.85;
  const mixed = base * 0.75 + aiConfidence * 0.25;
  return Math.round(Math.min(1, Math.max(0, mixed)) * 100) / 100;
}
