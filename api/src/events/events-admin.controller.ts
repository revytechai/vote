import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { EventsService, CreateEventDto, UpdateEventDto } from './events.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('admin/events')
@UseGuards(RolesGuard)
export class EventsAdminController {
  constructor(private readonly eventsService: EventsService) {}

  @Roles('superuser', 'manager')
  @Get()
  async listEvents() {
    return this.eventsService.listPublicEvents();
  }

  @Roles('superuser', 'manager')
  @Post()
  async createEvent(@Body() dto: CreateEventDto) {
    return this.eventsService.createEvent(dto);
  }

  @Roles('superuser', 'manager')
  @Patch(':slug')
  async updateEvent(
    @Param('slug') slug: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.updateEvent(slug, dto);
  }

  @Roles('superuser', 'manager')
  @Delete(':slug')
  async deleteEvent(@Param('slug') slug: string) {
    return this.eventsService.deleteEvent(slug);
  }

  @Roles('superuser', 'manager')
  @Post(':slug/import-csv')
  async importCsv(
    @Param('slug') slug: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    let csvData = '';
    if (typeof body === 'string') {
      csvData = body;
    } else if (body && typeof body.csv === 'string') {
      csvData = body.csv;
    } else if (Buffer.isBuffer(req.body)) {
      csvData = req.body.toString('utf-8');
    }
    return this.eventsService.importCsv(slug, csvData);
  }
}
