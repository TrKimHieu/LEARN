import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  friendSettingsSchema,
  inviteFriendSchema,
  type FriendSettingsInput,
  type InviteFriendInput,
} from '@learn/contracts';
import { zodBody, zodParam } from '../../../core/exceptions/errors';
import {
  Auth,
  CurrentUser,
  RateLimitGuard,
  Throttle,
  type UserContext,
} from '../../../core/security';
import { FriendsService } from '../application/friends.service';

const idSchema = z.string().uuid();

@Controller('api/v1/friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  @Auth()
  overview(@CurrentUser() user: UserContext) {
    return this.friends.overview(user.userId);
  }

  @Get('leaderboard')
  @Auth()
  leaderboard(@CurrentUser() user: UserContext) {
    return this.friends.leaderboard(user.userId);
  }

  @Post('code/rotate')
  @UseGuards(RateLimitGuard)
  @Auth()
  @Throttle(5, 3600)
  rotate(@CurrentUser() user: UserContext) {
    return this.friends.rotateCode(user.userId);
  }

  @Post('invite')
  // Above @Auth() so RateLimitGuard runs after AuthGuard (limit per userId). 20 lời mời/ngày.
  @UseGuards(RateLimitGuard)
  @Auth()
  @Throttle(20, 86_400)
  invite(
    @CurrentUser() user: UserContext,
    @Body(zodBody(inviteFriendSchema)) body: InviteFriendInput,
  ) {
    return this.friends.invite(user.userId, body);
  }

  @Post('requests/:id/accept')
  @Auth()
  accept(@CurrentUser() user: UserContext, @Param('id', zodParam(idSchema)) id: string) {
    return this.friends.accept(user.userId, id);
  }

  /** Từ chối lời mời đến hoặc huỷ lời mời đã gửi. */
  @Delete('requests/:id')
  @Auth()
  dropRequest(@CurrentUser() user: UserContext, @Param('id', zodParam(idSchema)) id: string) {
    return this.friends.dropRequest(user.userId, id);
  }

  @Delete(':userId')
  @Auth()
  remove(@CurrentUser() user: UserContext, @Param('userId', zodParam(idSchema)) friendId: string) {
    return this.friends.remove(user.userId, friendId);
  }

  @Patch('settings')
  @Auth()
  settings(
    @CurrentUser() user: UserContext,
    @Body(zodBody(friendSettingsSchema)) body: FriendSettingsInput,
  ) {
    return this.friends.updateSettings(user.userId, body.leaderboardHidden);
  }
}
