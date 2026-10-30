import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PrizesService, CreatePrizeDto } from './prizes.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('admin')
@UseGuards(RolesGuard)
export class PrizesAdminController {
  constructor(private readonly prizesService: PrizesService) {}

  @Roles('superuser', 'manager', 'sponsor')
  @Post('events/:slug/prizes')
  async createPrize(
    @Param('slug') slug: string,
    @Body() dto: CreatePrizeDto,
  ) {
    return this.prizesService.createPrize(slug, dto);
  }

  @Roles('superuser', 'manager', 'sponsor')
  @Get('prizes/:id/awards')
  async getSuggestedWinners(@Param('id', ParseIntPipe) id: number) {
    return this.prizesService.getSuggestedWinners(id);
  }

  @Roles('superuser', 'manager', 'sponsor')
  @Post('prizes/:id/awards')
  async awardPrize(
    @Param('id', ParseIntPipe) id: number,
    @Body('submissionId') submissionId: number,
  ) {
    return this.prizesService.awardPrize(id, submissionId);
  }
}
