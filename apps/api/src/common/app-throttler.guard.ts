import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Rate limiting that can be switched off for automated tests (THROTTLE_DISABLED=true). */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(): Promise<boolean> {
    return process.env.THROTTLE_DISABLED === 'true';
  }
}
