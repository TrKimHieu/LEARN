import { Module } from '@nestjs/common';
import { XpService } from './application/xp.service';
import { FriendsService } from './application/friends.service';
import { FriendsController } from './presentation/friends.controller';

/** XP, bạn học và xếp hạng tuần (spec 2026-11-20). `XpService` dùng chung cho các luồng học. */
@Module({
  controllers: [FriendsController],
  providers: [XpService, FriendsService],
  exports: [XpService],
})
export class GamificationModule {}
