import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { TeamsService } from './teams.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  async createTeam(
    @Body('name') name: string,
    @CurrentUser() user: AuthenticatedUser | null,
  ) {
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    return this.teamsService.createTeam(name, user);
  }

  @Post(':id/members')
  async addMember(
    @Param('id', ParseIntPipe) id: number,
    @Body('handle') handle: string,
    @CurrentUser() user: AuthenticatedUser | null,
  ) {
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    return this.teamsService.addMember(id, handle, user);
  }
}
