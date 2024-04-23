const { google } = require("googleapis");
const puppeteer = require("puppeteer");
const dotenv = require("dotenv");
const ical = require("node-ical");
const dayjs = require("dayjs");

dotenv.config();

const login = process.env.LIBRUS_LOGIN;
const pass = process.env.LIBRUS_PASS;
const calendarId = process.env.CALENDAR_ID;

// const interval = setInterval(getTimetable, process.env.INTERVAL_MS)
getTimetable()

async function downloadICSFile(page) {
  try {
    const res = await page.evaluate(() => {
      return fetch(
        "https://synergia.librus.pl/eksporty/ical/eksportuj/planUcznia",
        {
          method: "GET",
          credentials: "include",
        },
      ).then((r) => r.text());
    });
    return res;
  } catch (error) {
    console.error("Error downloading the file:", error);
  }
}

function parseICSFileContent(content, eventsList = []) {
  return new Promise((resolve) => {
    const out = {
      eventsToInsert: [],
      eventsToRemove: [],
    };

    const parsedData = ical.sync.parseICS(content);
    for (const key in parsedData) {
      if (parsedData.hasOwnProperty(key)) {
        const event = parsedData[key];
        if (
          event.type === "VEVENT" &&
          dayjs(event.start).isAfter(dayjs())
        ) {
          const eventsToRemove = eventsList?.filter(
            (item) =>
              dayjs(item.start.dateTime).isSame(dayjs(event.start)) &&
              dayjs(item.end.dateTime).isSame(dayjs(event.end)) &&
              event.summary !== item.summary,
          );
          eventsToRemove.map((item) => {
            out.eventsToRemove.push({
              calendarEvent: item,
              icsEvent: event,
            });

            out.eventsToInsert.push({
              summary: event.summary,
              description: event.description,
              start: { dateTime: event.start },
              end: { dateTime: event.end },
              location:
                "Zespół Szkół Elektrycznych, Dąbrowskiego 33, 66-400 Gorzów Wielkopolski, Polska",
            });
          });

          if (
            !eventsList?.some(
              (item) =>
                dayjs(item.start.dateTime).isSame(dayjs(event.start)) &&
                dayjs(item.end.dateTime).isSame(dayjs(event.end)) &&
                item.summary === event.summary,
            ) &&
            !out.eventsToInsert?.some(
              (item) =>
                dayjs(item.start.dateTime).isSame(dayjs(event.start)) &&
                dayjs(item.end.dateTime).isSame(dayjs(event.end)) &&
                item.summary === event.summary,
            )
          ) {
            out.eventsToInsert.push({
              summary: event.summary,
              description: event.description,
              start: { dateTime: event.start },
              end: { dateTime: event.end },
              location:
                "Zespół Szkół Elektrycznych, Dąbrowskiego 33, 66-400 Gorzów Wielkopolski, Polska",
            });
          }
        }
      }
    }

    resolve(out);
  });
}

async function getTimetable() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  const client = await page.target().createCDPSession();
  await client.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: "./downloads",
  });

  await page.goto("https://aplikacje.edukacja.gorzow.pl/");
  await page.type("#Username", login);
  await page.type("#Password", pass);

  await page.click("#box > div:nth-child(4) > button");
  await page.waitForNavigation();
  await page.click("body > div > div > a:nth-child(1) > figure > div > img");
  await page.waitForSelector("#user-section");

  const icsContent = await downloadICSFile(page);
  browser.close();

  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: "https://www.googleapis.com/auth/calendar",
  });
  const calendar = google.calendar({ version: "v3", auth });
  const eventsList = await calendar.events.list({
    calendarId: calendarId,
    timeMin: dayjs().toDate(),
  });

  const events = await parseICSFileContent(icsContent, eventsList.data?.items);
  events.eventsToRemove?.map(async (item) => {
    try {
      await calendar.events.delete({
        calendarId: calendarId,
        eventId: item.calendarEvent?.id,
      });
      console.log("Event deleted successfully:", item.calendarEvent?.id);
    } catch (error) {
      console.error("Error deleting event:", error.message);
    }
  });

  for (const event of events.eventsToInsert) {
    try {
      await calendar.events.insert({
        calendarId,
        resource: event,
      });
      console.log(
        "Event inserted successfully:",
        event.summary,
        "||",
        dayjs(event.start?.dateTime).format("YYYY-MM-DD HH:mm"),
      );
    } catch (error) {
      console.error(
        "Error inserting event:",
        error.message,
        "(",
        event.summary,
        "||",
        dayjs(event.start?.dateTime).format("YYYY-MM-DD HH:mm"),
        ")",
      );
    }
  }
}