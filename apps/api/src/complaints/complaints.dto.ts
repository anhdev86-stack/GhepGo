import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export enum ComplaintCategoryDto {
  DRIVER_BEHAVIOR = 'DRIVER_BEHAVIOR',
  CUSTOMER_BEHAVIOR = 'CUSTOMER_BEHAVIOR',
  ROUTE = 'ROUTE',
  FARE = 'FARE',
  SAFETY = 'SAFETY',
  LOST_ITEM = 'LOST_ITEM',
  PAYMENT = 'PAYMENT',
  OTHER = 'OTHER',
}

export class CreateComplaintDto {
  @IsString()
  @IsNotEmpty()
  tripId: string;

  @IsEnum(ComplaintCategoryDto)
  category: ComplaintCategoryDto;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description: string;
}

export class AddMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;
}

export class ResolveComplaintDto {
  @IsEnum(['IN_REVIEW', 'RESOLVED', 'REJECTED'])
  status: 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string;

  /** VND credited to the customer's wallet on RESOLVED (platform-funded refund). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  refundAmount?: number;

  /** Also debit the driver's wallet by the refund (their fault). Default false. */
  @IsOptional()
  chargeDriver?: boolean;
}
