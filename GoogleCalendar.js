const { google } = require("googleapis");
const { OAuth2Client } = require("google-auth-library");

class GoogleCalendar {
  static async createEvent(dto) {
    const client = await this.createClient(dto.authString);
    const calendar = this.createCalendar(client);

    const event = {
      summary: dto.summary,
      description: this.prepareDescription(dto.description),
      start: {
        dateTime: dto.startDateTime,
        timeZone: process.env.APP_TIMEZONE,
      },
      end: {
        dateTime: dto.endDateTime,
        timeZone: process.env.APP_TIMEZONE,
      },
    };

    try {
      const response = await calendar.events.insert({
        calendarId: dto.calendarId,
        resource: event,
      });

      return response.data.id;
    } catch (error) {
      throw new Error("GoogleCalendarException");
    }
  }

  static async deleteEvent(dto) {
    const client = await this.createClient(dto.authString);
    const calendar = this.createCalendar(client);

    try {
      await calendar.events.delete({
        calendarId: dto.calendarId,
        eventId: dto.eventId,
      });
    } catch (error) {
      throw new Error("GoogleCalendarDeleteEventException");
    }
  }

  static async createClient(authString) {
    const client = new OAuth2Client();

    client.setCredentials(JSON.parse(authString));

    return client;
  }

  static createCalendar(client) {
    return google.calendar({ version: "v3", auth: client });
  }

  static prepareDescription(description) {
    let descriptionString = "";

    for (const [key, value] of Object.entries(description)) {
      descriptionString += `${key}: ${value}\n`;
    }

    return descriptionString;
  }
}

module.exports = GoogleCalendar;
