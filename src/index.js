import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function scrapeData() {
  // Launch browser
  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to example page...');

  // Navigate to a page (example: quotes.toscrape.com)
  await page.goto('http://quotes.toscrape.com/', {
    waitUntil: 'networkidle'
  });

  console.log('Extracting data...');

  // Extract data from the page
  const quotes = await page.$$eval('.quote', elements => {
    return elements.map(el => {
      const text = el.querySelector('.text')?.innerText || '';
      const author = el.querySelector('.author')?.innerText || '';
      const tags = Array.from(el.querySelectorAll('.tag'))
        .map(tag => tag.innerText)
        .join('; ');

      return { text, author, tags };
    });
  });

  console.log(`Extracted ${quotes.length} quotes`);

  // Convert to CSV format
  const csvHeader = 'Quote,Author,Tags\n';
  const csvRows = quotes.map(q => {
    // Escape quotes and commas in CSV
    const escapeCSV = (str) => {
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    return `${escapeCSV(q.text)},${escapeCSV(q.author)},${escapeCSV(q.tags)}`;
  }).join('\n');

  const csvContent = csvHeader + csvRows;

  // Save to file
  const dataDir = join(__dirname, '..', 'data');

  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const filename = join(dataDir, `scraped-data-${Date.now()}.csv`);
  writeFileSync(filename, csvContent, 'utf-8');

  console.log(`Data saved to ${filename}`);

  // Close browser
  await browser.close();
}

// Run the scraper
scrapeData().catch(error => {
  console.error('Error during scraping:', error);
  process.exit(1);
});
