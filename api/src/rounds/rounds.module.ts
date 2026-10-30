import { Module } from '@nestjs/common';
import { RoundsService } from './rounds.service';
import { RoundsController } from './rounds.controller';
import { RoundsAdminController } from './rounds-admin.controller';
import { TallyModule } from '../tally/tally.module';

@Module({
  imports: [TallyModule],
  providers: [RoundsService],
  controllers: [RoundsController, RoundsAdminController],
  exports: [RoundsService],
})
export class RoundsModule {}
