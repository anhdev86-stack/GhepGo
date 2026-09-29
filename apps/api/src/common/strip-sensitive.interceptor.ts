import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

const SENSITIVE_KEYS = new Set(['passwordHash']);

function stripSensitive<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripSensitive(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key)) continue;
      result[key] = stripSensitive(val);
    }
    return result as T;
  }
  return value;
}

@Injectable()
export class StripSensitiveInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => stripSensitive(data)));
  }
}
