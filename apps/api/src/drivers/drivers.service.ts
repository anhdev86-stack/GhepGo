import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateDriverStatusDto } from './dto/update-status.dto.js';
import { UpdateDriverLocationDto } from './dto/update-location.dto.js';

@Injectable()
export class DriversService {
  constructor(private prisma: PrismaService) {}

  async findByUserId(userId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      include: { user: true, vehicles: true },
    });
    if (!driver) throw new NotFoundException('Không tìm thấy hồ sơ tài xế');
    return driver;
  }

  async updateStatus(userId: string, dto: UpdateDriverStatusDto) {
    const driver = await this.findByUserId(userId);
    return this.prisma.driver.update({
      where: { id: driver.id },
      data: { status: dto.status },
    });
  }

  async updateLocation(userId: string, dto: UpdateDriverLocationDto) {
    const driver = await this.findByUserId(userId);
    return this.prisma.driver.update({
      where: { id: driver.id },
      data: { currentLat: dto.lat, currentLng: dto.lng },
    });
  }

  async findAll() {
    return this.prisma.driver.findMany({
      include: { user: true, vehicles: true },
    });
  }

  async findAvailable() {
    return this.prisma.driver.findMany({
      where: { status: 'AVAILABLE' },
      include: { user: true, vehicles: true },
    });
  }
}
