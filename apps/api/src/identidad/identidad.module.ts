import { Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { IdentidadController } from './identidad.controller';
import { IdentidadService } from './identidad.service';

@Module({
  controllers: [IdentidadController],
  providers: [IdentidadService, AuthGuard],
  exports: [IdentidadService, AuthGuard],
})
export class IdentidadModule {}
