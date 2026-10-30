import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('admin/submissions')
@UseGuards(RolesGuard)
export class SubmissionsAdminController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Roles('superuser', 'manager')
  @Post(':id/moderate')
  async moderate(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
  ) {
    return this.submissionsService.moderate(id, status);
  }
}
