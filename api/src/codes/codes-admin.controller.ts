import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CodesService } from './codes.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('admin')
@UseGuards(RolesGuard)
export class CodesAdminController {
  constructor(private readonly codesService: CodesService) {}

  @Roles('superuser', 'manager')
  @Post('events/:slug/codes')
  async generateCodes(
    @Param('slug') slug: string,
    @Body('count') count?: number,
  ) {
    return this.codesService.generateCodes(slug, count || 1);
  }

  @Roles('superuser', 'manager')
  @Get('events/:slug/codes')
  async listCodes(@Param('slug') slug: string) {
    return this.codesService.listCodes(slug);
  }

  @Roles('superuser', 'manager')
  @Post('codes/:id/revoke')
  async revokeCode(@Param('id', ParseIntPipe) id: number) {
    return this.codesService.revokeCode(id);
  }
}
