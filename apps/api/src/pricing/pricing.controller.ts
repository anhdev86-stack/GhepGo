import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/decorators/current-user.decorator.js';
import { GeoService } from '../geo/geo.service.js';
import { ZonesService } from '../zones/zones.service.js';
import { NearbyDriversQueryDto } from '../drivers/dto/nearby-query.dto.js';
import { PricingService } from './pricing.service.js';
import { PricingRuleBodyDto, PromotionBodyDto, QuoteQueryDto } from './pricing.dto.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PricingController {
  constructor(
    private pricing: PricingService,
    private geo: GeoService,
    private zones: ZonesService,
  ) {}

  /**
   * Booking preview: road route + full fare breakdown + surge + promo check.
   * Same engine as POST /trips, so what the customer sees is what they pay.
   */
  @Get('pricing/quote')
  @Roles('CUSTOMER', 'ADMIN')
  async quote(@CurrentUser() user: AuthUser, @Query() q: QuoteQueryDto) {
    const [route, zone] = await Promise.all([
      this.geo.route([
        { lat: q.fromLat, lng: q.fromLng },
        { lat: q.toLat, lng: q.toLng },
      ]),
      this.zones.resolve(q.fromLat, q.fromLng),
    ]);
    const tripType = q.tripType ?? 'PRIVATE';
    const price = await this.pricing.price({
      distanceMeters: route.distanceMeters,
      durationSecs: route.durationSecs,
      tripType,
      zoneId: zone?.id ?? null,
      promoCode: q.promoCode,
      customerId: user.role === 'CUSTOMER' ? user.userId : null,
    });
    // Shared quotes cannot know the detour yet; show the no-detour fare and say so.
    return { route, zone: zone ? { id: zone.id, name: zone.name } : null, tripType, ...price, detourNote: tripType === 'SHARED' ? 'Cộng phụ phí theo km nếu xe phải đi vòng vì bạn' : null };
  }

  /** The rule in force at a point (customer info card). */
  @Get('pricing/rules/current')
  @Roles('CUSTOMER', 'DRIVER', 'ADMIN')
  async current(@Query() q: NearbyDriversQueryDto) {
    const zone = await this.zones.resolve(q.lat, q.lng);
    const rule = await this.pricing.ruleFor(zone?.id ?? null);
    const surge = await this.pricing.surgeFor(zone?.id ?? null, rule);
    return { zone: zone ? { id: zone.id, name: zone.name } : null, rule, surge };
  }

  // ---------------- admin: rules ----------------

  @Get('admin/pricing/rules')
  @Roles('ADMIN')
  rules() {
    return this.pricing.listRules();
  }

  @Post('admin/pricing/rules')
  @Roles('ADMIN')
  createRule(@Body() dto: PricingRuleBodyDto) {
    return this.pricing.createRule(dto);
  }

  @Patch('admin/pricing/rules/:id')
  @Roles('ADMIN')
  updateRule(@Param('id') id: string, @Body() dto: PricingRuleBodyDto) {
    return this.pricing.updateRule(id, dto);
  }

  @Delete('admin/pricing/rules/:id')
  @Roles('ADMIN')
  deleteRule(@Param('id') id: string) {
    return this.pricing.deleteRule(id);
  }

  @Get('admin/pricing/surge')
  @Roles('ADMIN')
  surge() {
    return this.pricing.surgeOverview();
  }

  // ---------------- admin: promotions ----------------

  @Get('admin/promotions')
  @Roles('ADMIN')
  promotions() {
    return this.pricing.listPromotions();
  }

  @Post('admin/promotions')
  @Roles('ADMIN')
  createPromotion(@Body() dto: PromotionBodyDto) {
    return this.pricing.createPromotion(dto);
  }

  @Patch('admin/promotions/:id')
  @Roles('ADMIN')
  updatePromotion(@Param('id') id: string, @Body() dto: PromotionBodyDto) {
    return this.pricing.updatePromotion(id, dto);
  }

  @Get('admin/promotions/:id/redemptions')
  @Roles('ADMIN')
  redemptions(@Param('id') id: string) {
    return this.pricing.promotionRedemptions(id);
  }
}
