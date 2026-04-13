import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { MailModule } from '../mail/mail.module';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [MailModule],
  providers: [NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
