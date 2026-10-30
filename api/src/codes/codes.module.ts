import { Module } from '@nestjs/common';
import { CodesService } from './codes.service';
import { CodesAdminController } from './codes-admin.controller';

@Module({
  providers: [CodesService],
  controllers: [CodesAdminController],
  exports: [CodesService],
})
export class CodesModule {}
