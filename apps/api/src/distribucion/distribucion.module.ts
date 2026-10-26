import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import {
  ConexionController,
  DistribucionController,
} from './distribucion.controller';
import { DistribucionService } from './distribucion.service';
import { FacebookGateway } from './facebook.gateway';
import { YoutubeGateway } from './youtube.gateway';

@Module({
  imports: [IdentidadModule],
  controllers: [ConexionController, DistribucionController],
  providers: [DistribucionService, FacebookGateway, YoutubeGateway],
})
export class DistribucionModule {}
