const { ZenRows } = require("zenrows");
const fs = require("fs");
const { parse } = require("node-html-parser");
const csvParser = require("csv-parser"); // Add CSV parser to read CSV

require("dotenv").config();
const apiKey = process.env.ZENROWS_API_KEY;
const baseURL = "https://pcpartpicker.com/products/cpu/";
const outputFile = "cpus_detailed.csv";
const client = new ZenRows(apiKey);
const headers =
  "Name,Image URL,Product URL,Price,Manufacturer,Part #,Series,Microarchitecture,Core Family,Socket,Core Count,Performance Core Clock,Performance Core Boost Clock,Efficiency Core Clock,Efficiency Core Boost Clock,L2 Cache,L3 Cache,TDP,Integrated Graphics,Maximum Supported Memory,ECC Support,Includes Cooler,Packaging,Lithography,Includes CPU Cooler,Simultaneous Multithreading,Specs Num\n";
const page_number = 4;

// Store names of existing CPUs to skip duplicates
let existingCPUNames = new Set();

// Function to read existing CPU names from CSV file
function loadExistingCPUNames() {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(outputFile)) {
      fs.createReadStream(outputFile)
        .pipe(csvParser())
        .on("data", (row) => {
          // Assuming 'Name' is the first field in the CSV
          if (row["Name"]) {
            existingCPUNames.add(row["Name"]);
          }
        })
        .on("end", () => {
          console.log("Existing CPU names loaded.");
          resolve();
        })
        .on("error", reject);
    } else {
      // If the file doesn't exist, create it with headers
      console.log("CSV file not found, creating new file with headers.");
      fs.writeFileSync(outputFile, headers, "utf8");
      resolve();
    }
  });
}

function escapeCSVField(field) {
  if (field) {
    return `"${field.toString().replace(/"/g, '""')}"`;
  }
  return '""';
}

async function fetchCPUDetails(url) {
  let retries = 3;
  while (retries > 0) {
    try {
      const { data } = await client.get(url, { premium_proxy: true });

      const root = parse(data);
      const specsSelector =
        "#product-page > div.main-wrapper.xs-col-12 > div.wrapper.wrapper__pageContent > section > div > div.main-content.col.xs-col-12.md-col-8.lg-col-8.xl-col-9 > div.block.xs-block.md-hide.specs";
      const specs = root.querySelector(specsSelector);
      if (!specs) {
        console.error(`Specs section not found for ${url}`);
        return {};
      }

      const specsNum = specs.querySelectorAll("div.group").length;

      let details = {
        manufacturer: "",
        partNumber: "",
        series: "",
        microarchitecture: "",
        coreFamily: "",
        socket: "",
        coreCount: "",
        performanceCoreClock: "",
        performanceCoreBoostClock: "",
        efficiencyCoreClock: "",
        efficiencyCoreBoostClock: "",
        l2Cache: "",
        l3Cache: "",
        tdp: "",
        integratedGraphics: "",
        maximumSupportedMemory: "",
        eccSupport: "",
        includesCooler: "",
        packaging: "",
        lithography: "",
        includesCPUCooler: "",
        simultaneousMultithreading: "",
        specsNum: specsNum,
      };

      specs.querySelectorAll("div.group").forEach((group) => {
        const title = group.querySelector("h3")?.textContent.trim();
        const value =
          group.querySelector("div > p")?.textContent.trim() ||
          group
            .querySelectorAll("div > ul > li")
            .map((li) => li.textContent.trim())
            .join(", ");

        switch (title) {
          case "Manufacturer":
            details.manufacturer = value;
            break;
          case "Part #":
            details.partNumber = value;
            break;
          case "Series":
            details.series = value;
            break;
          case "Microarchitecture":
            details.microarchitecture = value;
            break;
          case "Core Family":
            details.coreFamily = value;
            break;
          case "Socket":
            details.socket = value;
            break;
          case "Core Count":
            details.coreCount = value;
            break;
          case "Performance Core Clock":
            details.performanceCoreClock = value;
            break;
          case "Performance Core Boost Clock":
            details.performanceCoreBoostClock = value;
            break;
          case "Efficiency Core Clock":
            details.efficiencyCoreClock = value;
            break;
          case "Efficiency Core Boost Clock":
            details.efficiencyCoreBoostClock = value;
            break;
          case "L2 Cache":
            details.l2Cache = value;
            break;
          case "L3 Cache":
            details.l3Cache = value;
            break;
          case "TDP":
            details.tdp = value;
            break;
          case "Integrated Graphics":
            details.integratedGraphics = value;
            break;
          case "Maximum Supported Memory":
            details.maximumSupportedMemory = value;
            break;
          case "ECC Support":
            details.eccSupport = value;
            break;
          case "Includes Cooler":
            details.includesCooler = value;
            break;
          case "Packaging":
            details.packaging = value;
            break;
          case "Lithography":
            details.lithography = value;
            break;
          case "Includes CPU Cooler":
            details.includesCPUCooler = value;
            break;
          case "Simultaneous Multithreading":
            details.simultaneousMultithreading = value;
            break;
        }
      });
      return details;
    } catch (error) {
      console.log(`Error fetching details for ${url}: ${error.message}`);
      if (retries === 1 || !error.response || error.response.status !== 422) {
        console.error(`Final fail for ${url}`);
        return {};
      }
      retries--;
      console.log(`Retrying ${url}... (${retries} retries left)`);
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait before retrying
    }
  }
}

async function scrapePage(pageNumber) {
  const url = baseURL + `#page=${pageNumber}`;
  let csvContent = "";

  try {
    const { data } = await client.get(url, {
      js_render: true,
      wait: 3000,
      premium_proxy: true,
    });
    const root = parse(data);
    const rows = root.querySelectorAll("#category_content > tr");

    for (const row of rows) {
      const name = row
        .querySelector("td.td__name > a > div.td__nameWrapper > p")
        ?.innerText.trim();

      // Check if the name already exists in the CSV
      if (existingCPUNames.has(name)) {
        console.log(`Skipping ${name} - already in CSV`);
        continue; // Skip this CPU if the name exists
      } else {
        console.log(`Trying to fetch ${name}`);
      }

      const imageUrl = row
        .querySelector("td.td__name > a > div.td__imageWrapper > div > img")
        ?.getAttribute("src");
      const productUrl =
        "https://pcpartpicker.com" +
        row.querySelector("td.td__name > a")?.getAttribute("href");
      const priceElement = row.querySelector("td.td__price");
      let price = priceElement
        ? priceElement.innerText.trim().split("Add")[0].trim()
        : "N/A";

      const details = await fetchCPUDetails(productUrl);
      csvContent +=
        [
          escapeCSVField(name),
          escapeCSVField(imageUrl),
          escapeCSVField(productUrl),
          escapeCSVField(price),
          escapeCSVField(details.manufacturer),
          escapeCSVField(details.partNumber),
          escapeCSVField(details.series),
          escapeCSVField(details.microarchitecture),
          escapeCSVField(details.coreFamily),
          escapeCSVField(details.socket),
          escapeCSVField(details.coreCount),
          escapeCSVField(details.performanceCoreClock),
          escapeCSVField(details.performanceCoreBoostClock),
          escapeCSVField(details.efficiencyCoreClock),
          escapeCSVField(details.efficiencyCoreBoostClock),
          escapeCSVField(details.l2Cache),
          escapeCSVField(details.l3Cache),
          escapeCSVField(details.tdp),
          escapeCSVField(details.integratedGraphics),
          escapeCSVField(details.maximumSupportedMemory),
          escapeCSVField(details.eccSupport),
          escapeCSVField(details.includesCooler),
          escapeCSVField(details.packaging),
          escapeCSVField(details.lithography),
          escapeCSVField(details.includesCPUCooler),
          escapeCSVField(details.simultaneousMultithreading),
          escapeCSVField(details.specsNum),
        ].join(",") + "\n";
    }
    fs.appendFileSync(outputFile, csvContent, "utf8");
    console.log(`Page ${pageNumber} scraped successfully.`);
  } catch (error) {
    console.error(`Failed to scrape page ${pageNumber}: ${error.message}`);
  }
}

(async () => {
  // Load existing CPU names from the CSV before starting the scraping process
  await loadExistingCPUNames();
  await scrapePage(page_number);
  console.log("Data has been written to CSV file.");
})();
