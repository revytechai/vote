import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RoundsService, CreateRoundDto, UpdateRoundDto } from './rounds.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('admin')
@UseGuards(RolesGuard)
export class RoundsAdminController {
  constructor(private readonly roundsService: RoundsService) {}

  @Roles('superuser', 'manager')
  @Post('events/:slug/rounds')
  async createRound(
    @Param('slug') slug: string,
    @Body() dto: CreateRoundDto,
  ) {
    return this.roundsService.createRound(slug, dto);
  }

  @Roles('superuser', 'manager')
  @Patch('rounds/:id')
  async updateRound(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoundDto,
  ) {
    return this.roundsService.updateRound(id, dto);
  }

  @Roles('superuser', 'manager')
  @Get('rounds/:id/export.csv')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="results.csv"')
  async exportCsv(@Param('id', ParseIntPipe) id: number) {
    return this.roundsService.exportCsv(id);
  }
}
