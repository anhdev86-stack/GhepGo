import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

  private async getDriverByUserId(userId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) throw new NotFoundException('Không tìm thấy hồ sơ tài xế');
    return driver;
  }

  async create(userId: string, dto: CreateVehicleDto) {
    const driver = await this.getDriverByUserId(userId);
    return this.prisma.vehicle.create({
      data: {
        driverId: driver.id,
        plateNumber: dto.plateNumber,
        make: dto.make,
        model: dto.model,
        seats: dto.seats ?? 4,
      },
    });
  }

  async findMine(userId: string) {
    const driver = await this.getDriverByUserId(userId);
    return this.prisma.vehicle.findMany({ where: { driverId: driver.id } });
  }

  async findAll() {
    return this.prisma.vehicle.findMany({ include: { driver: { include: { user: true } } } });
  }

  async remove(userId: string, vehicleId: string) {
    const driver = await this.getDriverByUserId(userId);
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Không tìm thấy xe');
    if (vehicle.driverId !== driver.id) throw new ForbiddenException('Không có quyền xoá xe này');
    return this.prisma.vehicle.delete({ where: { id: vehicleId } });
  }
}
