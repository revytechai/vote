import { Module } from '@nestjs/common';
import { OidcController } from './oidc.controller';

@Module({
  controllers: [OidcController],
})
export class OidcModule {}
