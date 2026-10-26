import { Module } from '@nestjs/common';
import { ComercialModule } from '../comercial/comercial.module';
import { IdentidadModule } from '../identidad/identidad.module';
import { LibroModule } from '../libro/libro.module';
import { PlataformaController } from './plataforma.controller';
import { PlataformaService } from './plataforma.service';

@Module({
  imports: [IdentidadModule, LibroModule, ComercialModule],
  controllers: [PlataformaController],
  providers: [PlataformaService],
})
export class PlataformaModule {}
