import { Type } from 'class-transformer';
import { IsBooleanString, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

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

export const PRIORITY_VALUES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

export class AssignComplaintDto {
  /** Admin user id, or null to unassign. */
  @IsOptional()
  @IsString()
  assigneeId?: string | null;
}

export class SetPriorityDto {
  @IsIn(PRIORITY_VALUES)
  priority: (typeof PRIORITY_VALUES)[number];
}

export class AdminListQueryDto {
  @IsOptional()
  @IsIn(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED', 'ACTIVE'])
  status?: string;

  /** "me", "unassigned" or an admin user id. */
  @IsOptional()
  @IsString()
  assignee?: string;

  @IsOptional()
  @IsIn(PRIORITY_VALUES)
  priority?: (typeof PRIORITY_VALUES)[number];

  /** "1" → only complaints past a deadline (first response or resolution). */
  @IsOptional()
  @IsBooleanString()
  overdue?: string;
}
