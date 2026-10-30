import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { EventsAdminController } from './events-admin.controller';
import { SubmissionsModule } from '../submissions/submissions.module';
import { CodesModule } from '../codes/codes.module';

@Module({
  imports: [SubmissionsModule, CodesModule],
  providers: [EventsService],
  controllers: [EventsController, EventsAdminController],
  exports: [EventsService],
})
export class EventsModule {}
