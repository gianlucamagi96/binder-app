import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';

type JsonResponse = {
  status: (code: number) => { json: (body: unknown) => void };
};

@Catch()
export class ScansExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ScansExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<JsonResponse>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json(typeof body === 'string' ? { message: body } : body);
      return;
    }

    const code =
      exception && typeof exception === 'object' && 'code' in exception
        ? String((exception as { code?: unknown }).code ?? '')
        : '';
    if (code === 'LIMIT_FILE_SIZE') {
      response.status(413).json({
        message: 'La foto è troppo grande. Avvicina meno carte o riprova.',
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    response.status(500).json({ message: 'Scansione non riuscita' });
  }
}
