import { Module } from '@nestjs/common';
import { XpService } from './application/xp.service';

/** XP, bạn học và xếp hạng tuần (spec 2026-11-20). `XpService` dùng chung cho các luồng học. */
@Module({
  providers: [XpService],
  exports: [XpService],
})
export class GamificationModule {}
