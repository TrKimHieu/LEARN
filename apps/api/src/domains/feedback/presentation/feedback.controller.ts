import { Body, Controller, Get, Post } from '@nestjs/common';
import { submitFeedbackSchema, type SubmitFeedbackInput } from '@learn/contracts';
import { zodBody } from '../../../core/exceptions/errors';
import { Auth, CurrentUser, Throttle, type UserContext } from '../../../core/security';
import { FeedbackService } from '../application/feedback.service';

@Controller('api/v1')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post('feedback')
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
