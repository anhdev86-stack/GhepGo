import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '../../generated/prisma/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import type { TopupCallbackDto, TopupDto, WithdrawDto, ResolveWithdrawalDto } from './wallet.dto.js';

type Tx = Prisma.TransactionClient;
type TxType = 'TOPUP' | 'TRIP_PAYMENT' | 'TRIP_EARNING' | 'COMMISSION' | 'WITHDRAWAL' | 'REFUND' | 'ADJUSTMENT';

export class InsufficientBalance extends BadRequestException {
  constructor() {
    super('Số dư ví không đủ');
  }
}

/**
 * Wallet ledger + trip settlement.
 *
 * Every balance change goes through `post()` inside a transaction that locks
 * the wallet row (SELECT ... FOR UPDATE), so concurrent settlements/withdrawals
 * cannot double-spend. Driver wallets may go negative for CASH commission
 * (the driver owes the platform), customer wallets may not.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  readonly commissionRate: number;
  private readonly webhookSecret: string;

  constructor(
    private prisma: PrismaService,
    private publisher: RealtimePublisher,
    config: ConfigService,
  ) {
    this.commissionRate = Number(config.get('COMMISSION_RATE') ?? 0.2);
    this.webhookSecret = config.get<string>('PAYMENT_WEBHOOK_SECRET') ?? 'dev-webhook-secret';
  }

  // ---------------- ledger primitives ----------------

  private async lockWallet(tx: Tx, userId: string) {
    const rows = await tx.$queryRaw<{ id: string; balance: Prisma.Decimal }[]>`
      SELECT id, balance FROM wallets WHERE "userId" = ${userId} FOR UPDATE`;
    if (rows.length === 0) {
      const created = await tx.wallet.create({ data: { userId, balance: 0 } });
      return { id: created.id, balance: new Prisma.Decimal(0) };
    }
    return rows[0];
  }

  /** Apply a signed amount to a user's wallet. Throws InsufficientBalance unless allowNegative. */
  async post(
    tx: Tx,
    userId: string,
    input: { type: TxType; amount: number; tripId?: string; reference?: string; description?: string; allowNegative?: boolean },
  ) {
    const wallet = await this.lockWallet(tx, userId);
    const after = wallet.balance.plus(input.amount);
    if (after.lessThan(0) && !input.allowNegative) throw new InsufficientBalance();
    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: after } });
    return tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: input.type,
        amount: input.amount,
        balanceAfter: after,
        tripId: input.tripId,
        reference: input.reference,
        description: input.description,
      },
    });
  }

  // ---------------- queries ----------------

  async getMine(userId: string) {
    const wallet = await this.prisma.wallet.upsert({
      where: { userId },
      create: { userId, balance: 0 },
      update: {},
    });
    const pendingTopups = await this.prisma.walletTransaction.count({
      where: { walletId: wallet.id, type: 'TOPUP', status: 'PENDING' },
    });
    return { ...wallet, pendingTopups, commissionRate: this.commissionRate };
  }

  async transactions(userId: string, limit = 50) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return [];
    return this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ---------------- top-up (gateway stub) ----------------

  /**
   * Creates a PENDING top-up and returns a payment URL. In production this is
   * where the VNPay/Momo order is created; here the URL points at the mock
   * checkout page which calls back `/wallet/topup/callback`.
   */
  async createTopup(userId: string, dto: TopupDto, baseUrl: string) {
    const wallet = await this.prisma.wallet.upsert({ where: { userId }, create: { userId, balance: 0 }, update: {} });
    const tx = await this.prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'TOPUP',
        status: 'PENDING',
        amount: dto.amount,
        balanceAfter: wallet.balance,
        description: `Nạp ví ${dto.amount.toLocaleString('vi-VN')} đ`,
      },
    });
    return {
      txId: tx.id,
      amount: dto.amount,
      paymentUrl: `${baseUrl}/wallet/mock-checkout?txId=${tx.id}&amount=${dto.amount}`,
      gateway: 'MOCK',
    };
  }

  sign(txId: string, result: string, gatewayRef: string) {
    return createHmac('sha256', this.webhookSecret).update(`${txId}|${result}|${gatewayRef}`).digest('hex');
  }

  async handleTopupCallback(dto: TopupCallbackDto) {
    const expected = this.sign(dto.txId, dto.result, dto.gatewayRef);
    const a = Buffer.from(expected);
    const b = Buffer.from(dto.signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Chữ ký không hợp lệ');
    }

    return this.prisma.$transaction(async (tx) => {
      const pending = await tx.walletTransaction.findUnique({ where: { id: dto.txId }, include: { wallet: true } });
      if (!pending || pending.type !== 'TOPUP') throw new NotFoundException('Giao dịch không tồn tại');
      if (pending.status !== 'PENDING') return pending; // idempotent replay

      if (dto.result === 'FAILED') {
        return tx.walletTransaction.update({
          where: { id: pending.id },
          data: { status: 'FAILED', reference: dto.gatewayRef },
        });
      }

      const wallet = await this.lockWallet(tx, pending.wallet.userId);
      const after = wallet.balance.plus(pending.amount);
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: after } });
      return tx.walletTransaction.update({
        where: { id: pending.id },
        data: { status: 'COMPLETED', balanceAfter: after, reference: dto.gatewayRef },
      });
    });
  }

  // ---------------- trip settlement ----------------

  /**
   * Called exactly once when a trip completes.
   *  WALLET: customer pays fare from wallet → driver gets fare − commission.
   *          Insufficient balance → falls back to CASH (payment stays PENDING for the driver to collect).
   *  CASH:   driver collected the fare in person → driver wallet is debited the commission.
   */
  async settleTrip(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { driver: { select: { userId: true } }, payment: true },
    });
    if (!trip || !trip.driver) return;
    if (trip.payment?.status === 'PAID') return; // already settled
    const fare = Number(trip.fare);
    const commission = Math.round(fare * this.commissionRate);
    const driverUserId = trip.driver.userId;

    try {
      await this.prisma.$transaction(async (tx) => {
        let method = trip.paymentMethod;
        if (method === 'WALLET') {
          try {
            await this.post(tx, trip.customerId, {
              type: 'TRIP_PAYMENT',
              amount: -fare,
              tripId,
              description: `Thanh toán chuyến ${trip.pickupAddress} → ${trip.dropoffAddress}`,
            });
            await this.post(tx, driverUserId, {
              type: 'TRIP_EARNING',
              amount: fare - commission,
              tripId,
              description: `Thu nhập chuyến (đã trừ ${Math.round(this.commissionRate * 100)}% phí nền tảng)`,
              allowNegative: true,
            });
          } catch (err) {
            if (!(err instanceof InsufficientBalance)) throw err;
            method = 'CASH';
            await tx.trip.update({ where: { id: tripId }, data: { paymentMethod: 'CASH' } });
          }
        }
        if (method === 'CASH') {
          await this.post(tx, driverUserId, {
            type: 'COMMISSION',
            amount: -commission,
            tripId,
            description: 'Phí nền tảng chuyến tiền mặt',
            allowNegative: true,
          });
        }
        await tx.payment.upsert({
          where: { tripId },
          create: {
            tripId,
            amount: fare,
            method,
            status: method === 'WALLET' ? 'PAID' : 'PENDING',
            paidAt: method === 'WALLET' ? new Date() : null,
          },
          update: {
            method,
            status: method === 'WALLET' ? 'PAID' : 'PENDING',
            paidAt: method === 'WALLET' ? new Date() : null,
          },
        });
      });
    } catch (err) {
      this.logger.error(`settleTrip(${tripId}) failed: ${(err as Error).message}`);
      throw err;
    }

    this.publisher.publish({
      type: 'trip.updated',
      tripId,
      customerId: trip.customerId,
      driverUserId,
      status: 'COMPLETED',
      groupId: trip.groupId,
    });
  }

  /** Driver confirms cash received (payment PENDING → PAID). */
  async confirmCash(driverUserId: string, tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { driver: { select: { userId: true } }, payment: true },
    });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến đi');
    if (trip.driver?.userId !== driverUserId) throw new ForbiddenException('Không phải chuyến của bạn');
    if (!trip.payment || trip.payment.method !== 'CASH') throw new BadRequestException('Chuyến này không thanh toán tiền mặt');
    return this.prisma.payment.update({
      where: { tripId },
      data: { status: 'PAID', paidAt: new Date() },
    });
  }

  // ---------------- withdrawals ----------------

  async requestWithdrawal(driverUserId: string, dto: WithdrawDto) {
    const driver = await this.prisma.driver.findUnique({ where: { userId: driverUserId } });
    if (!driver) throw new NotFoundException('Không tìm thấy hồ sơ tài xế');

    return this.prisma.$transaction(async (tx) => {
      const open = await tx.withdrawal.count({ where: { driverId: driver.id, status: { in: ['REQUESTED', 'APPROVED'] } } });
      if (open > 0) throw new BadRequestException('Bạn đang có yêu cầu rút tiền chưa xử lý');
      const w = await tx.withdrawal.create({
        data: { driverId: driver.id, amount: dto.amount, bankName: dto.bankName, bankAccount: dto.bankAccount },
      });
      // Hold the funds immediately so the balance cannot be spent twice.
      await this.post(tx, driverUserId, {
        type: 'WITHDRAWAL',
        amount: -dto.amount,
        reference: w.id,
        description: `Rút tiền về ${dto.bankName} ${dto.bankAccount}`,
      });
      return w;
    });
  }

  async myWithdrawals(driverUserId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { userId: driverUserId } });
    if (!driver) return [];
    return this.prisma.withdrawal.findMany({ where: { driverId: driver.id }, orderBy: { createdAt: 'desc' } });
  }

  async listWithdrawals(status?: string) {
    return this.prisma.withdrawal.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { createdAt: 'asc' },
      include: { driver: { include: { user: { select: { fullName: true, phone: true } } } } },
    });
  }

  async resolveWithdrawal(id: string, dto: ResolveWithdrawalDto) {
    return this.prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.findUnique({ where: { id }, include: { driver: true } });
      if (!w) throw new NotFoundException('Không tìm thấy yêu cầu rút tiền');
      const allowed: Record<string, string[]> = { REQUESTED: ['APPROVED', 'REJECTED'], APPROVED: ['PAID', 'REJECTED'] };
      if (!(allowed[w.status] ?? []).includes(dto.status)) {
        throw new BadRequestException(`Không thể chuyển ${w.status} → ${dto.status}`);
      }
      if (dto.status === 'REJECTED') {
        await this.post(tx, w.driver.userId, {
          type: 'REFUND',
          amount: Number(w.amount),
          reference: w.id,
          description: `Hoàn tiền yêu cầu rút bị từ chối${dto.note ? `: ${dto.note}` : ''}`,
          allowNegative: true,
        });
      }
      return tx.withdrawal.update({
        where: { id },
        data: { status: dto.status, note: dto.note, resolvedAt: dto.status === 'APPROVED' ? undefined : new Date() },
      });
    });
  }
}
