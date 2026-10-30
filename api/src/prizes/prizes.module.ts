import { Module } from '@nestjs/common';
import { PrizesService } from './prizes.service';
import { PrizesAdminController } from './prizes-admin.controller';
import { RoundsModule } from '../rounds/rounds.module';

@Module({
  imports: [RoundsModule],
  providers: [PrizesService],
  controllers: [PrizesAdminController],
  exports: [PrizesService],
})
export class PrizesModule {}
