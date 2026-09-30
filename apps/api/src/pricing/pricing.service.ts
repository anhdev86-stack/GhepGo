import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../../generated/prisma/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { slotOf } from '../forecast/forecast.util.js';
import type { PricingRuleBodyDto, PromotionBodyDto } from './pricing.dto.js';
import { computeFare, DEFAULT_RULE, finalFare, promoDiscount, surgeFromSupplyDemand, type FareBreakdown, type FareRule } from './pricing.util.js';

const SURGE_CACHE_SECS = 60;
type TripType = 'PRIVATE' | 'SHARED';

export interface PriceInput {
  distanceMeters: number;
  durationSecs: number;
  tripType: TripType;
  zoneId: string | null;
  /** Extra metres a shared rider adds to the group route. */
  detourMeters?: number;
  promoCode?: string | null;
  /** Needed to validate per-user / first-ride promo limits. Omit for anonymous quotes. */
  customerId?: string | null;
  at?: Date;
}

export interface PriceResult {
  ruleId: string | null;
  ruleName: string;
  zoneId: string | null;
  breakdown: FareBreakdown;
  /** Fare before promotion (after surge, shared discount and minimum). */
  subtotal: number;
  discount: number;
  /** Final amount charged. */
  total: number;
  surgeMultiplier: number;
  promo: { code: string; id: string; valid: true; description: string | null } | { code: string; valid: false; reason: string } | null;
  cancellationFee: number;
}

/**
 * Fare engine: rule lookup (zone → global → built-in default), live surge,
 * promotions, and the audit trail of redemptions.
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  readonly timeZone: string;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    config: ConfigService,
  ) {
    this.timeZone = config.get<string>('FORECAST_TZ') ?? 'Asia/Ho_Chi_Minh';
  }

  // ---------------- rules ----------------

  /** Active rule for a zone, falling back to the global row, then to built-in defaults. */
  async ruleFor(zoneId: string | null): Promise<FareRule & { id: string | null; name: string; zoneId: string | null }> {
    const rows = await this.prisma.pricingRule.findMany({
      where: { isActive: true, OR: [{ zoneId: zoneId ?? undefined }, { zoneId: null }] },
    });
    const zoneRule = zoneId ? rows.find((r) => r.zoneId === zoneId) : undefined;
    const rule = zoneRule ?? rows.find((r) => r.zoneId === null);
    if (!rule) return { ...DEFAULT_RULE, id: null, name: 'Mặc định hệ thống', zoneId: null };
    return { ...rule, id: rule.id, name: rule.name, zoneId: rule.zoneId };
  }

  async listRules() {
    const rules = await this.prisma.pricingRule.findMany({ include: { zone: { select: { id: true, name: true } } }, orderBy: [{ zoneId: 'asc' }, { createdAt: 'asc' }] });
    return { defaults: DEFAULT_RULE, rules };
  }

  async createRule(dto: PricingRuleBodyDto) {
    const zoneId = dto.zoneId ?? null;
    if (zoneId && !(await this.prisma.serviceZone.findUnique({ where: { id: zoneId } }))) throw new NotFoundException('Không tìm thấy khu vực');
    if (!zoneId && (await this.prisma.pricingRule.count({ where: { zoneId: null } })) > 0) throw new BadRequestException('Đã có bảng giá mặc định; hãy sửa thay vì tạo mới');
    if (zoneId && (await this.prisma.pricingRule.count({ where: { zoneId } })) > 0) throw new BadRequestException('Khu vực này đã có bảng giá');
    this.validateRule(dto);
    const { zoneId: _z, name, ...rest } = dto;
    return this.prisma.pricingRule.create({ data: { ...rest, name: name ?? (zoneId ? 'Bảng giá khu vực' : 'Bảng giá mặc định'), zoneId } as Prisma.PricingRuleUncheckedCreateInput, include: { zone: { select: { id: true, name: true } } } });
  }

  async updateRule(id: string, dto: PricingRuleBodyDto) {
    if (!(await this.prisma.pricingRule.findUnique({ where: { id } }))) throw new NotFoundException('Không tìm thấy bảng giá');
    this.validateRule(dto);
    const { zoneId: _z, ...rest } = dto;
    return this.prisma.pricingRule.update({ where: { id }, data: rest as Prisma.PricingRuleUncheckedUpdateInput, include: { zone: { select: { id: true, name: true } } } });
  }

  async deleteRule(id: string) {
    if (!(await this.prisma.pricingRule.findUnique({ where: { id } }))) throw new NotFoundException('Không tìm thấy bảng giá');
    await this.prisma.pricingRule.delete({ where: { id } });
    return { ok: true };
  }

  private validateRule(dto: PricingRuleBodyDto) {
    if (dto.minFare != null && dto.baseFare != null && dto.minFare < dto.baseFare) throw new BadRequestException('Giá tối thiểu phải ≥ giá mở cửa');
  }

  // ---------------- surge ----------------

  /** Live multiplier for a zone from open requests vs. available drivers (cached 60 s). */
  async surgeFor(zoneId: string | null, rule: FareRule): Promise<{ multiplier: number; openRequests: number; availableDrivers: number }> {
    if (!rule.surgeEnabled) return { multiplier: 1, openRequests: 0, availableDrivers: 0 };
    const key = `pricing:surge:${zoneId ?? 'all'}`;
    const cached = await this.redis.client.get(key).catch(() => null);
    if (cached) {
      const c = JSON.parse(cached) as { openRequests: number; availableDrivers: number };
      return { ...c, multiplier: surgeFromSupplyDemand(c.openRequests, c.availableDrivers, rule.surgeMax) };
    }
    const [openTrips, openGroups, availableDrivers] = await Promise.all([
      this.prisma.trip.count({ where: { status: 'REQUESTED', tripType: 'PRIVATE', ...(zoneId ? { pickupZoneId: zoneId } : {}) } }),
      this.prisma.tripGroup.count({ where: { status: 'MATCHING', ...(zoneId ? { zoneId } : {}) } }),
      this.prisma.driver.count({ where: { status: 'AVAILABLE', ...(zoneId ? { OR: [{ zoneId }, { zoneId: null }] } : {}) } }),
    ]);
    const snapshot = { openRequests: openTrips + openGroups, availableDrivers };
    await this.redis.client.set(key, JSON.stringify(snapshot), 'EX', SURGE_CACHE_SECS).catch(() => undefined);
    return { ...snapshot, multiplier: surgeFromSupplyDemand(snapshot.openRequests, snapshot.availableDrivers, rule.surgeMax) };
  }

  /** Surge per zone for the admin dashboard. */
  async surgeOverview() {
    const zones = await this.prisma.serviceZone.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    const rows = await Promise.all(
      [{ id: null as string | null, name: 'Toàn hệ thống' }, ...zones].map(async (z) => {
        const rule = await this.ruleFor(z.id);
        const s = await this.surgeFor(z.id, rule);
        return { zoneId: z.id, zoneName: z.name, ruleName: rule.name, surgeEnabled: rule.surgeEnabled, surgeMax: rule.surgeMax, ...s };
      }),
    );
    return rows;
  }

  // ---------------- quotes ----------------

  async price(input: PriceInput): Promise<PriceResult> {
    const at = input.at ?? new Date();
    const rule = await this.ruleFor(input.zoneId);
    const surge = await this.surgeFor(input.zoneId, rule);
    const breakdown = computeFare(rule, {
      distanceMeters: input.distanceMeters,
      durationSecs: input.durationSecs,
      tripType: input.tripType,
      localHour: slotOf(at, this.timeZone).hour,
      surgeMultiplier: surge.multiplier,
      detourMeters: input.detourMeters,
    });
    const subtotal = breakdown.subtotal;
    let discount = 0;
    let promo: PriceResult['promo'] = null;
    if (input.promoCode) {
      const check = await this.checkPromo(input.promoCode, { subtotal, tripType: input.tripType, customerId: input.customerId ?? null, at });
      if (check.ok) {
        discount = check.discount;
        promo = { code: check.promo.code, id: check.promo.id, valid: true, description: check.promo.description };
      } else {
        promo = { code: input.promoCode.toUpperCase(), valid: false, reason: check.reason };
      }
    }
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      zoneId: rule.zoneId,
      breakdown,
      subtotal,
      discount,
      total: finalFare(subtotal, discount, rule.roundTo),
      surgeMultiplier: breakdown.surgeMultiplier,
      promo,
      cancellationFee: rule.cancellationFee,
    };
  }

  /** Booking must fail loudly on a bad code; quotes just explain it. */
  async priceForBooking(input: PriceInput): Promise<PriceResult> {
    const r = await this.price(input);
    if (r.promo && !r.promo.valid) throw new BadRequestException(`Mã khuyến mãi không áp dụng được: ${r.promo.reason}`);
    return r;
  }

  // ---------------- promotions ----------------

  private async checkPromo(codeRaw: string, ctx: { subtotal: number; tripType: TripType; customerId: string | null; at: Date }) {
    const code = codeRaw.trim().toUpperCase();
    const promo = await this.prisma.promotion.findUnique({ where: { code } });
    if (!promo || !promo.isActive) return { ok: false as const, reason: 'mã không tồn tại hoặc đã tắt' };
    if (promo.startsAt && promo.startsAt > ctx.at) return { ok: false as const, reason: 'chưa tới thời gian áp dụng' };
    if (promo.endsAt && promo.endsAt < ctx.at) return { ok: false as const, reason: 'mã đã hết hạn' };
    if (promo.tripType && promo.tripType !== ctx.tripType) return { ok: false as const, reason: promo.tripType === 'SHARED' ? 'chỉ áp dụng cho xe ghép' : 'chỉ áp dụng cho bao xe' };
    if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) return { ok: false as const, reason: 'mã đã hết lượt' };
    if (ctx.subtotal < promo.minFare) return { ok: false as const, reason: `đơn tối thiểu ${promo.minFare.toLocaleString('vi-VN')} đ` };
    if (ctx.customerId) {
      const [used, rides] = await Promise.all([
        this.prisma.promotionRedemption.count({ where: { promotionId: promo.id, userId: ctx.customerId } }),
        promo.firstRideOnly ? this.prisma.trip.count({ where: { customerId: ctx.customerId, status: { not: 'CANCELLED' } } }) : Promise.resolve(0),
      ]);
      if (used >= promo.perUserLimit) return { ok: false as const, reason: 'bạn đã dùng hết lượt của mã này' };
      if (promo.firstRideOnly && rides > 0) return { ok: false as const, reason: 'chỉ dành cho chuyến đầu tiên' };
    }
    const discount = promoDiscount(promo, ctx.subtotal);
    if (discount <= 0) return { ok: false as const, reason: 'không đủ điều kiện giảm giá' };
    return { ok: true as const, promo, discount };
  }

  /** Record a redemption inside the booking transaction (enforces the global usage limit atomically). */
  async redeem(tx: Prisma.TransactionClient, promoId: string, userId: string, tripId: string, amount: number) {
    const updated = await tx.promotion.updateMany({
      where: { id: promoId, OR: [{ usageLimit: null }, { usageLimit: { gt: (await tx.promotion.findUniqueOrThrow({ where: { id: promoId }, select: { usedCount: true } })).usedCount } }] },
      data: { usedCount: { increment: 1 } },
    });
    if (updated.count !== 1) throw new BadRequestException('Mã khuyến mãi vừa hết lượt');
    await tx.promotionRedemption.create({ data: { promotionId: promoId, userId, tripId, amount } });
  }

  /** A cancelled trip gives the promo back. */
  async releaseRedemption(tripId: string) {
    const r = await this.prisma.promotionRedemption.findUnique({ where: { tripId } });
    if (!r) return;
    await this.prisma.$transaction([
      this.prisma.promotionRedemption.delete({ where: { tripId } }),
      this.prisma.promotion.update({ where: { id: r.promotionId }, data: { usedCount: { decrement: 1 } } }),
    ]);
  }

  async listPromotions() {
    return this.prisma.promotion.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { redemptions: true } } } });
  }

  async createPromotion(dto: PromotionBodyDto) {
    if (!dto.code || !dto.type || dto.value == null) throw new BadRequestException('Cần mã, loại và giá trị');
    if (dto.type === 'PERCENT' && dto.value > 100) throw new BadRequestException('Phần trăm tối đa 100');
    const code = dto.code.toUpperCase();
    if (await this.prisma.promotion.findUnique({ where: { code } })) throw new BadRequestException('Mã đã tồn tại');
    return this.prisma.promotion.create({ data: this.promoData({ ...dto, code }) as Prisma.PromotionUncheckedCreateInput, include: { _count: { select: { redemptions: true } } } });
  }

  async updatePromotion(id: string, dto: PromotionBodyDto) {
    const cur = await this.prisma.promotion.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Không tìm thấy mã');
    if ((dto.type ?? cur.type) === 'PERCENT' && (dto.value ?? cur.value) > 100) throw new BadRequestException('Phần trăm tối đa 100');
    const { code: _c, ...rest } = dto;
    return this.prisma.promotion.update({ where: { id }, data: this.promoData(rest) as Prisma.PromotionUncheckedUpdateInput, include: { _count: { select: { redemptions: true } } } });
  }

  async promotionRedemptions(id: string) {
    if (!(await this.prisma.promotion.findUnique({ where: { id } }))) throw new NotFoundException('Không tìm thấy mã');
    return this.prisma.promotionRedemption.findMany({
      where: { promotionId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { id: true, fullName: true, phone: true } }, trip: { select: { id: true, status: true, fare: true, pickupAddress: true, dropoffAddress: true } } },
    });
  }

  private promoData(dto: PromotionBodyDto) {
    const { startsAt, endsAt, ...rest } = dto;
    return {
      ...rest,
      ...(startsAt !== undefined ? { startsAt: startsAt ? new Date(startsAt) : null } : {}),
      ...(endsAt !== undefined ? { endsAt: endsAt ? new Date(endsAt) : null } : {}),
    };
  }
}
