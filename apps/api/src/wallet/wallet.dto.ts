import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class TopupDto {
  @Type(() => Number)
  @IsInt()
  @Min(10000)
  @Max(50_000_000)
  amount: number;
}

/** Mimics a VNPay/Momo IPN callback; signed with PAYMENT_WEBHOOK_SECRET (HMAC-SHA256). */
export class TopupCallbackDto {
  @IsString()
  @IsNotEmpty()
  txId: string;

  @IsEnum(['SUCCESS', 'FAILED'])
  result: 'SUCCESS' | 'FAILED';

  @IsString()
  @IsNotEmpty()
  gatewayRef: string;

  @IsString()
  @IsNotEmpty()
  signature: string;
}

export class WithdrawDto {
  @Type(() => Number)
  @IsInt()
  @Min(50000)
  amount: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  bankName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  bankAccount: string;
}

export class ResolveWithdrawalDto {
  @IsEnum(['APPROVED', 'REJECTED', 'PAID'])
  status: 'APPROVED' | 'REJECTED' | 'PAID';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
