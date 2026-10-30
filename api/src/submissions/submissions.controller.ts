import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  UnauthorizedException,
} from '@nestjs/common';
import { SubmissionsService, UpdateSubmissionDto } from './submissions.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Public()
  @Get(':id')
  async getOne(@Param('id', ParseIntPipe) id: number) {
    return this.submissionsService.getApproved(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSubmissionDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ) {
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    return this.submissionsService.updateOwnSubmission(id, dto, user);
  }
}
