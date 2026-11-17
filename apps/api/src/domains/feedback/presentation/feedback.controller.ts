import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { submitFeedbackSchema, type SubmitFeedbackInput } from '@learn/contracts';
import { zodBody } from '../../../core/exceptions/errors';
import {
  Auth,
  CurrentUser,
  RateLimitGuard,
  Throttle,
  type UserContext,
} from '../../../core/security';
import { FeedbackService } from '../application/feedback.service';

@Controller('api/v1')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post('feedback')
  // Above @Auth() so RateLimitGuard runs after AuthGuard (limit per userId).
  @UseGuards(RateLimitGuard)
  @Auth()
  @Throttle(30, 60)
  submit(
    @CurrentUser() user: UserContext,
    @Body(zodBody(submitFeedbackSchema)) body: SubmitFeedbackInput,
  ) {
    return this.feedback.submit(user.userId, body);
  }

  @Get('admin/feedback')
  @Auth('ADMIN')
  summary() {
    return this.feedback.summary();
  }
}
