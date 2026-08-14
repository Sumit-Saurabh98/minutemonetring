import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';

const MAX_EVENTS = 100;
const MAX_ATTR_KEYS = 50;
const MAX_ATTR_DEPTH = 3;

type RawEvent = Record<string, unknown>;

@Injectable()
export class SchemaGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ body?: unknown }>();

    let body = req.body;

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException({ error: 'invalid_body' });
    }

    // A bare single event is allowed — wrap it into a one-element batch
    if (!('events' in body) && 'eventId' in body) {
      body = { events: [body] };
      req.body = body;
    }

    const events = (body as { events?: unknown }).events;

    if (!Array.isArray(events) || events.length === 0) {
      throw new BadRequestException({ error: 'events_required' });
    }

    if (events.length > MAX_EVENTS) {
      throw new BadRequestException({
        error: 'batch_too_large',
        maxEvents: MAX_EVENTS,
      });
    }

    for (const raw of events) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new BadRequestException({ error: 'invalid_event' });
      }

      const event = raw as RawEvent;

      if (typeof event.level === 'string') {
        event.level = event.level.toLowerCase().trim();
      }

      if (event.attrs !== undefined) {
        this.checkAttrs(event.attrs, 1);
      }
    }

    return true;
  }

  private checkAttrs(attrs: unknown, depth: number): void {
    if (attrs === null || typeof attrs !== 'object' || Array.isArray(attrs)) {
      throw new BadRequestException({ error: 'attrs_must_be_object' });
    }

    if (depth > MAX_ATTR_DEPTH) {
      throw new BadRequestException({
        error: 'attrs_too_deep',
        maxDepth: MAX_ATTR_DEPTH,
      });
    }

    const keys = Object.keys(attrs);

    if (depth === 1 && keys.length > MAX_ATTR_KEYS) {
      throw new BadRequestException({
        error: 'too_many_attr_keys',
        maxKeys: MAX_ATTR_KEYS,
      });
    }

    for (const key of keys) {
      const value = (attrs as Record<string, unknown>)[key];
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        this.checkAttrs(value, depth + 1);
      }
    }
  }
}
