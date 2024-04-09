const puppeteer = require("puppeteer");
const dotenv = require("dotenv");
dotenv.config();

const login = process.env.LIBRUS_LOGIN;
const pass = process.env.LIBRUS_PASS;

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

(async () => {
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
  console.log(icsContent);
})();
