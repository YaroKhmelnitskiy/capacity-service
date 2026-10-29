import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { CapacityService } from '../CapacityService';
import { Capacity } from '../types';
import { ReservationDto, toReservationDto } from './dto/ReservationDto';
import { ReserveDto } from './dto/ReserveDto';
import { ParseIdPipe } from './ParseIdPipe';

@Controller('programs/:programId')
export class ProgramsController {
  public constructor(private readonly capacity: CapacityService) {}

  @Get()
  public async getCapacity(@Param('programId', ParseIdPipe) programId: string): Promise<Capacity> {
    return this.capacity.getCapacity(programId);
  }

  @Post('reservations')
  public async reserve(
    @Param('programId', ParseIdPipe) programId: string,
    @Body() dto: ReserveDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReservationDto> {
    const { reservation, created } = await this.capacity.reserve({ programId, ...dto });
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return toReservationDto(reservation);
  }

  @Get('reservations/:invoiceId')
  public async getReservation(
    @Param('programId', ParseIdPipe) programId: string,
    @Param('invoiceId', ParseIdPipe) invoiceId: string,
  ): Promise<ReservationDto> {
    return toReservationDto(await this.capacity.getReservation(programId, invoiceId));
  }

  @Post('reservations/:invoiceId/release')
  @HttpCode(HttpStatus.OK)
  public async release(
    @Param('programId', ParseIdPipe) programId: string,
    @Param('invoiceId', ParseIdPipe) invoiceId: string,
  ): Promise<ReservationDto> {
    const { reservation } = await this.capacity.release(programId, invoiceId);
    return toReservationDto(reservation);
  }
}
