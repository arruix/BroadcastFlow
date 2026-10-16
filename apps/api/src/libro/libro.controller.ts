import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { LibroService } from './libro.service';

@Controller('webhooks')
export class LibroController {
  constructor(private readonly libro: LibroService) {}

  @Post('donations')
  @HttpCode(200)
  settle(@Req() request: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    return this.libro.settle(request.rawBody, signature);
  }
}
