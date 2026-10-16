import { Module } from '@nestjs/common';
import { RecaudacionController } from './recaudacion.controller';
import { RecaudacionService } from './recaudacion.service';

@Module({
  controllers: [RecaudacionController],
  providers: [RecaudacionService],
})
export class RecaudacionModule {}
