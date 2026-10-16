import { Global, Module } from '@nestjs/common';
import { DbService } from './db.service';
import { MailService } from '../mail/mail.service';

@Global()
@Module({
  providers: [DbService, MailService],
  exports: [DbService, MailService],
})
export class CoreModule {}
