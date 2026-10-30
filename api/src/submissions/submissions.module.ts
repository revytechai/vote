import { Module } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsAdminController } from './submissions-admin.controller';

@Module({
  providers: [SubmissionsService],
  controllers: [SubmissionsController, SubmissionsAdminController],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
