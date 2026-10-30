import { Module } from '@nestjs/common';
import { TallyService } from './tally.service';

@Module({
  providers: [TallyService],
  exports: [TallyService],
})
export class TallyModule {}
