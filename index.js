const { google } = require("googleapis");
const puppeteer = require("puppeteer");
const dotenv = require("dotenv");
const ical = require("node-ical");
const dayjs = require("dayjs");

dotenv.config();

const login = process.env.LIBRUS_LOGIN;
const pass = process.env.LIBRUS_PASS;
const calendarId = process.env.CALENDAR_ID;

let daysOffTable = [];

setInterval(getTimetable, process.env.INTERVAL_MS);
getTimetable();

async function downloadICSFile(page) {
  try {
    const res = await page.evaluate(() => {
      return fetch(
        "https://synergia.librus.pl/eksporty/ical/eksportuj/planUcznia",
        {
          method: "GET",
          credentials: "include",
        }
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
        if (event.type === "VEVENT" && dayjs(event.start).isAfter(dayjs())) {
          const eventsToRemove = eventsList?.filter(
            (item) =>
              dayjs(item.start.dateTime).isSame(dayjs(event.start)) &&
              dayjs(item.end.dateTime).isSame(dayjs(event.end)) &&
              event.summary !== item.summary
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
                item.summary === event.summary
            ) &&
            !out.eventsToInsert?.some(
              (item) =>
                dayjs(item.start.dateTime).isSame(dayjs(event.start)) &&
                dayjs(item.end.dateTime).isSame(dayjs(event.end)) &&
                item.summary === event.summary
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

async function getTimetableEvents(page) {
  return await page.evaluate(() => {
    let timetableEvents = [];
    const todayElement = document.querySelectorAll(
      ".container-background table tbody tr .center.today"
    );
    let todayIndex = Array.from(
      document.querySelectorAll(".container-background table tbody tr .center")
    ).findIndex((el) => el.classList.contains("today"));
    if (todayElement.length > 0) {
      let eventsAfterToday = Array.from(
        document.querySelectorAll(
          ".container-background table tbody tr .center"
        )
      ).slice(todayIndex);
      timetableEvents = eventsAfterToday.flatMap((timetableEvent) => {
        return Array.from(
          timetableEvent.querySelectorAll(".center table tbody tr td")
        ).map((timetableEvent) => timetableEvent.getAttribute("onclick"));
      });
    } else {
      timetableEvents = Array.from(
        document.querySelectorAll(".center table tbody tr td")
      ).map((timetableEvent) => timetableEvent.getAttribute("onclick"));
    }
    return timetableEvents;
  });
}

async function fetchEventDetails(page) {
  return await page.evaluate(() => {
    const rows = document.querySelectorAll(
      ".container-background table tbody tr"
    );

    const date = rows[0].querySelector("td").textContent.trim();
    const type = rows[3].querySelector("td").textContent.trim();
    const subject = rows[4].querySelector("td").textContent;

    let description = rows[5];
    while (description.querySelector("th").textContent.trim() !== "Opis") {
      description = description.nextElementSibling;
    }

    return {
      summary: type + ", " + subject,
      description: description.querySelector("td").textContent,
      date: { date: date },
    };
  });
}

async function fetchDaysOff(page) {
  return await page.evaluate(() => {
    return {
      date: { date: document.querySelectorAll(".container-background table tbody tr")[0].querySelector("td").textContent.trim() },
    };
  });
}

async function navigateToNextMonth(page) {
  await page.evaluate(() => {
    let monthDropdown = document.querySelector('.ListaWyboru[name="miesiac"]');
    let currentMonthOption = [...document.querySelectorAll('.ListaWyboru[name="miesiac"] option')].find((option) => option.selected);
    let newMonth = parseInt(currentMonthOption.value) + 1;

    if (newMonth > 12) {
      newMonth = 1;
      
      let yearDropdown = document.querySelector('.ListaWyboru[name="rok"]');
      let currentYearOption = [...document.querySelectorAll('.ListaWyboru[name="rok"] option')].find((option) => option.selected);
      yearDropdown.value = parseInt(currentYearOption.value) + 1;
      yearDropdown.dispatchEvent(new Event("change"));
    }

    monthDropdown.value = newMonth;
    monthDropdown.dispatchEvent(new Event("change"));

  });

  await page.waitForNavigation();
}

async function processTimetableEvents(page) {
  let eventDetailsTable = [];
  for (let i = 0; i <= 3; i++) {
    let timetableEvents = await getTimetableEvents(page);

    for (const timetableEvent of timetableEvents) {
      if(timetableEvent && timetableEvent.includes("terminarz/szczegoly_wolne/")){
        await page.goto(
          "https://synergia.librus.pl" + timetableEvent.split("'")[1]
        );
        await page.waitForSelector("body .container");

        const dayOffDetail = await fetchDaysOff(page);
        daysOffTable.push(dayOffDetail);

      } else if (timetableEvent && timetableEvent.includes("terminarz/szczegoly/")) {
        await page.goto(
          "https://synergia.librus.pl" + timetableEvent.split("'")[1]
        );
        await page.waitForSelector("body .container");

        const eventDetail = await fetchEventDetails(page);
        eventDetailsTable.push(eventDetail);
      }
    }
    await page.goto("https://synergia.librus.pl/terminarz/");
    await page.waitForSelector('.ListaWyboru[name="miesiac"]');
    await navigateToNextMonth(page);
  }
  return eventDetailsTable;
}

async function getTimetable() {
  console.log("Getting timetable...", "||", dayjs().format("YYYY-MM-DD HH:mm"));

  const browser = await puppeteer.launch({
    headless: false,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  page.setUserAgent(
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36"
  );

  await page.goto("https://aplikacje.edukacja.gorzow.pl/");
  await page.type("#Username", login);
  await page.type("#Password", pass);

  await page.click("#box > div:nth-child(4) > button");
  await page.waitForNavigation();
  await page.click("body > div > div > a:nth-child(1) > figure > div > img");
  await page.waitForSelector("#user-section");

  const icsContent = await downloadICSFile(page);

  await page.goto("https://synergia.librus.pl/terminarz/");
  await page.waitForSelector(".center table tbody tr td");

  let eventDetailsTable = await processTimetableEvents(page);
  browser.close();

  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: "https://www.googleapis.com/auth/calendar",
  });
  const calendar = google.calendar({ version: "v3", auth });
  const eventsList = await calendar.events.list({
    calendarId: calendarId,
    timeMin: dayjs().subtract(1, 'day').toDate(),
  });


  const uniqueDaysOffTable = Array.from(new Set(daysOffTable.map(a => a.date.date)))
  console.log(uniqueDaysOffTable)

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
        dayjs(event.start?.dateTime).format("YYYY-MM-DD HH:mm")
      );
    } catch (error) {
      console.error(
        "Error inserting event:",
        error.message,
        "(",
        event.summary,
        "||",
        dayjs(event.start?.dateTime).format("YYYY-MM-DD HH:mm"),
        ")"
      );
    }
  }

  for (let i = 0; i < eventsList.data.items.length; i++) {
    if (eventsList.data.items[i].start.date) {
      try {
        await calendar.events.delete({
          calendarId: calendarId,
          eventId: eventsList.data.items[i].id,
        });
        console.log(
          "Event deleted successfully:",
          eventsList.data.items[i].summary
        );
      } catch (error) {
        console.error("Error deleting event:", error.message);
      }
    }
  }

  for (const eventDetails of eventDetailsTable) {
    const eventResource = {
      summary: eventDetails.summary,
      description: eventDetails.description,
      start: eventDetails.date,
      end: eventDetails.date,
      location:
        "Zespół Szkół Elektrycznych, Dąbrowskiego 33, 66-400 Gorzów Wielkopolski, Polska",
    };
    try {
      await calendar.events.insert({
        calendarId,
        resource: eventResource,
      });
      console.log(
        "Event inserted successfully:",
        eventDetails.summary,
        "||",
        dayjs(eventDetails.start?.dateTime).format("YYYY-MM-DD HH:mm")
      );
    } catch (error) {
      console.error(
        "Error inserting event:",
        error.message,
        "(",
        eventDetails.summary,
        "||",
        dayjs(eventDetails.start?.dateTime).format("YYYY-MM-DD HH:mm"),
        ")"
      );
    }
  }
}

console.log(
  "App initialized successfuly",
  "||",
  dayjs().format("YYYY-MM-DD HH:mm")
);
