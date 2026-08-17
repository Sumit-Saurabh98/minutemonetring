import {
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { json, NextFunction, Request, Response } from 'express';
import { gunzipSync } from 'node:zlib';

const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Parses JSON bodies and gunzips `application/json+gzip` payloads.
 */
export function ingestBodyParser() {
  const jsonParser = json({ limit: '1mb' });

  return (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.headers['content-type'] ?? '';

    if (!contentType.includes('json+gzip')) {
      return jsonParser(req, res, next);
    }

    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      const size = chunks.reduce((sum, part) => sum + part.length, 0);
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        next(new PayloadTooLargeException({ error: 'body_too_large' }));
      }
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks);
        const inflated = gunzipSync(raw);
        if (inflated.length > MAX_BODY_BYTES) {
          next(new PayloadTooLargeException({ error: 'body_too_large' }));
          return;
        }
        req.body = JSON.parse(inflated.toString('utf8'));
        next();
      } catch {
        next(new BadRequestException({ error: 'invalid_gzip_body' }));
      }
    });

    req.on('error', next);
  };
}
