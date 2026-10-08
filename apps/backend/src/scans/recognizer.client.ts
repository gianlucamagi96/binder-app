import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ScanBox } from './scans.types';

const DEFAULT_TIMEOUT_MS = 15_000;

export type RecognizerCandidate = {
  cardId: string;
  lang: string;
  score: number;
  inliers: number | null;
  name: string;
  localId: string;
  setId: string;
};

export type RecognizerDetection = {
  box: ScanBox;
  detected: boolean;
  ambiguous: boolean;
  candidates: RecognizerCandidate[];
};

type PhotoFile = {
  buffer: Buffer;
  mimetype: string;
};

// Unico punto che parla con il servizio di riconoscimento (apps/recognizer):
// per cambiare implementazione basta sostituire questo provider.
@Injectable()
export class RecognizerClient {
  private readonly logger = new Logger(RecognizerClient.name);

  constructor(private readonly config: ConfigService) {}

  async identify(file: PhotoFile): Promise<RecognizerDetection[]> {
    const baseUrl = this.config.get<string>('RECOGNIZER_URL');
    if (!baseUrl) {
      throw new ServiceUnavailableException('Identificazione non configurata');
    }
    const timeout =
      Number(this.config.get<string>('RECOGNIZER_TIMEOUT_MS')) ||
      DEFAULT_TIMEOUT_MS;

    const body = new FormData();
    body.append(
      'photo',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      'scan.jpg',
    );

    let response: Response;
    try {
      response = await fetch(new URL('/identify', baseUrl), {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      this.logger.error(
        `Recognizer irraggiungibile: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        'Il servizio di identificazione non risponde',
      );
    }

    if (response.status === 422) {
      throw new UnprocessableEntityException(
        'Foto illeggibile. Usa JPEG, PNG o WebP.',
      );
    }
    if (!response.ok) {
      this.logger.error(
        `Recognizer ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
      throw new ServiceUnavailableException(
        'Il servizio di identificazione non risponde',
      );
    }

    const data = (await response.json()) as {
      detections?: unknown;
      ms?: number;
    };
    if (!Array.isArray(data.detections)) {
      this.logger.error('Recognizer: risposta senza detections');
      throw new ServiceUnavailableException(
        'Il servizio di identificazione non risponde',
      );
    }
    this.logger.log(
      `Recognizer ${data.ms ?? '?'}ms cards=${data.detections.length}`,
    );
    return data.detections as RecognizerDetection[];
  }
}
