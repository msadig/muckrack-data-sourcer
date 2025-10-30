import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Multilogin } from './utils/Multilogin.js';
import { extractOutletUrls, extractOutletData } from './utils/muckrack-outlet-scraper.js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const hasHeadlessArg = args.includes('--headless');
const hasHeadedArg = args.includes('--headed');

// Configuration
// const MUCKRACK_SEARCH_URL = 'https://forager.muckrack.com/search/results?sort=outlet_name_a_z&q=&result_type=media_outlet&search_source=homepage&user_recent_search=&embed=&person=&duplicate_group=&person_title=&medialists=&exclude_medialists=&sources=&exclude_sources=&outlet_lists=&exclude_outlet_lists=&covered_topics_any=&covered_topics_all=&covered_topics_none=&beats=&topics_any=&topics_all=&topics_none=&article_types=&exclude_article_types=&stations=&exclude_stations=&networks=&exclude_networks=&programs=&exclude_programs=&domains=&exclude_domains=&daterange_preset=8&daterange_starts=2024-10-27&timerange_starts=12%3A00%20AM&daterange_ends=2025-10-27&timerange_ends=11%3A59%20PM&timezone=&languages=&exclude_languages=&domain_authority_range=&domain_authority_min=&domain_authority_max=&locations=43972&exclude_locations=&dmas=&exclude_dmas=&accepts_contributed=';
const MUCKRACK_SEARCH_URL = 'https://forager.muckrack.com/search/results?sort=outlet_name_a_z&q=&result_type=media_outlet&search_source=homepage&user_recent_search=&embed=&person=&duplicate_group=&person_title=&medialists=&exclude_medialists=&sources=&exclude_sources=&outlet_lists=&exclude_outlet_lists=&covered_topics_any=&covered_topics_all=&covered_topics_none=&beats=&topics_any=&topics_all=&topics_none=&article_types=&exclude_article_types=&stations=&exclude_stations=&networks=&exclude_networks=&programs=&exclude_programs=&domains=&exclude_domains=&daterange_preset=8&daterange_starts=2024-10-28&timerange_starts=12%3A00%20AM&daterange_ends=2025-10-28&timerange_ends=11%3A59%20PM&timezone=&languages=&exclude_languages=&domain_authority_range=&domain_authority_min=&domain_authority_max=&exclude_media_types=13&check_media_types=exclude&locations=43972&exclude_locations=&dmas=&exclude_dmas=&accepts_contributed=';
const MAX_OUTLETS = 100; // Maximum number of outlets to scrape
const START_PAGE = 1; // Starting page number (useful for resuming scraping)
const DELAY_BETWEEN_OUTLETS = 2000; // 2 seconds delay between outlet visits

// Global references for cleanup
let globalContext = null;
let globalMultilogin = null;

/**
 * Convert outlet data to CSV row
 */
function escapeCSV(str) {
  if (!str) return '';
  const stringValue = String(str);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

/**
 * Sleep helper function
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main scraper function using Multilogin cloud browser
 */
async function scrapeWithMultilogin() {
  // Validate environment variables
  const requiredEnvVars = ['MULTILOGIN_EMAIL', 'MULTILOGIN_PASSWORD', 'FOLDER_ID', 'PROFILE_ID'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  // Initialize Multilogin
  const multilogin = new Multilogin({
    folderId: process.env.FOLDER_ID,
    profileId: process.env.PROFILE_ID,
  });

  let browser, context, page;
  const allOutlets = [];

  // Store global references for signal handlers
  globalMultilogin = multilogin;

  try {
    console.log('Signing in to Multilogin...');
    await multilogin.signIn({
      email: process.env.MULTILOGIN_EMAIL,
      password: process.env.MULTILOGIN_PASSWORD,
    });
    console.log('✓ Successfully signed in');

    // Determine headless mode: command-line arg takes precedence over env var
    let headlessMode;
    if (hasHeadlessArg) {
      headlessMode = true;
    } else if (hasHeadedArg) {
      headlessMode = false;
    } else {
      // Fall back to environment variable (default to false)
      headlessMode = process.env.HEADLESS === 'true';
    }
    console.log(`Starting browser profile (headless: ${headlessMode})...`);

    const profile = await multilogin.startProfile(headlessMode);
    browser = profile.browser;
    page = profile.page;
    context = profile.context;
    globalContext = context; // Store for signal handlers
    console.log('✓ Browser profile started');

    console.log(`\nNavigating to Muck Rack search page...`);
    await page.goto(MUCKRACK_SEARCH_URL, {
      waitUntil: 'networkidle',
      timeout: 60000
    });
    console.log('✓ Page loaded');

    // Wait for search results to appear
    await page.waitForSelector('[role="tabpanel"] h5', { timeout: 30000 });

    // Collect outlet URLs from search results using pagination
    console.log('\nCollecting outlet URLs from search results using pagination...');

    // Muck Rack shows ~50 outlets per page, calculate how many pages we need
    const OUTLETS_PER_PAGE = 50;
    const pagesToLoad = Math.ceil(MAX_OUTLETS / OUTLETS_PER_PAGE);
    const endPage = START_PAGE + pagesToLoad - 1;
    console.log(`  Need to scrape ${pagesToLoad} page(s) starting from page ${START_PAGE} to get ${MAX_OUTLETS} outlets`);

    let allOutletUrls = [];

    // Iterate through pages using the page parameter
    for (let pageNum = START_PAGE; pageNum <= endPage; pageNum++) {
      console.log(`  Scraping page ${pageNum}/${endPage}...`);

      // Construct URL with page parameter
      const pageUrl = `${MUCKRACK_SEARCH_URL}&page=${pageNum}`;

      // Navigate to the specific page
      await page.goto(pageUrl, {
        waitUntil: 'networkidle',
        timeout: 60000
      });

      // Wait for search results to appear
      await page.waitForSelector('[role="tabpanel"] h5', { timeout: 30000 });

      // Extract outlet URLs from current page
      const pageOutletUrls = await extractOutletUrls(page);
      console.log(`    Found ${pageOutletUrls.length} outlets on page ${pageNum}`);

      // If no outlets found, we've reached the end
      if (pageOutletUrls.length === 0) {
        console.log(`    No outlets found on page ${pageNum}, stopping pagination`);
        break;
      }

      allOutletUrls = allOutletUrls.concat(pageOutletUrls);

      // Small delay between page requests
      if (pageNum < endPage) {
        await sleep(DELAY_BETWEEN_OUTLETS);
      }

      // If we've collected enough outlets, stop early
      if (allOutletUrls.length >= MAX_OUTLETS) {
        console.log(`    Collected enough outlets (${allOutletUrls.length}), stopping pagination`);
        break;
      }
    }

    // Limit to MAX_OUTLETS (in case we got more than expected)
    let outletUrls = allOutletUrls.slice(0, MAX_OUTLETS);
    console.log(`\n✓ Collected ${outletUrls.length} outlet URLs from ${Math.min(pagesToLoad, Math.ceil(allOutletUrls.length / OUTLETS_PER_PAGE))} page(s)`);

    // Visit each outlet and extract detailed data
    console.log(`\nStarting detailed outlet extraction...`);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < outletUrls.length; i++) {
      const outletUrl = outletUrls[i];
      const progress = `[${i + 1}/${outletUrls.length}]`;
      const isPodcast = outletUrl.toLowerCase().includes('/podcast/');

      try {
        console.log(`${progress} Visiting: ${outletUrl}`);

        await page.goto(outletUrl, {
          waitUntil: 'networkidle',
          timeout: 30000
        });

        // Wait for outlet content to load
        await page.waitForSelector('h1', { timeout: 10000 });

        // Extract outlet data
        const outletData = await extractOutletData(page, outletUrl, isPodcast);

        if (outletData && outletData.outletName) {
          allOutlets.push(outletData);
          successCount++;
          console.log(`${progress} ✓ Extracted: ${outletData.outletName} (${outletData.website || 'no website'})`);
        } else {
          errorCount++;
          console.log(`${progress} ✗ Failed to extract data`);
        }

        // Delay between outlets to avoid rate limiting
        if (i < outletUrls.length - 1) {
          // make wait time random between 1.5x to 2.5x of DELAY_BETWEEN_OUTLETS
          const randomDelay = DELAY_BETWEEN_OUTLETS * (1.5 + Math.random());
          console.log(`${progress} Waiting for ${Math.round(randomDelay)}ms before next outlet...`);
          await sleep(randomDelay);
        }

      } catch (error) {
        errorCount++;
        console.error(`${progress} ✗ Error: ${error.message}`);

        // Continue with next outlet even if one fails
        continue;
      }
    }

    console.log(`\n✓ Extraction complete!`);
    console.log(`  Successful: ${successCount}`);
    console.log(`  Failed: ${errorCount}`);
    console.log(`  Total: ${allOutlets.length} outlets`);

    // Convert to CSV
    console.log('\nConverting to CSV...');
    const csvHeader = [
      'Outlet Name',
      'Outlet Type',
      'Verified',
      'Podcast?',
      'Description',
      'Network',
      'Language',
      'Genre',
      'Scope',
      'Location',
      'Address',
      'Phone',
      'Email',
      'Contact Form',
      'Website',
      'Domain Authority',
      'Twitter URL',
      'Facebook URL',
      'LinkedIn URL',
      'Instagram URL',
      'YouTube URL',
      'Logo URL',
      'Outlet URL'
    ].join(',') + '\n';

    const csvRows = allOutlets.map(outlet => {
      // Determine if it's a podcast from the outlet URL
      const isPodcast = outlet.outletUrl && outlet.outletUrl.toLowerCase().includes('/podcast/');

      return [
        escapeCSV(outlet.outletName),
        escapeCSV(outlet.outletType),
        outlet.isVerified ? 'Yes' : 'No',
        isPodcast ? 'Yes' : 'No',
        escapeCSV(outlet.description),
        escapeCSV(outlet.network),
        escapeCSV(outlet.language),
        escapeCSV(outlet.genre),
        escapeCSV(outlet.scope),
        escapeCSV(outlet.outletLocation),
        escapeCSV(outlet.address),
        escapeCSV(outlet.phone),
        escapeCSV(outlet.email),
        escapeCSV(outlet.contactForm),
        escapeCSV(outlet.website),
        escapeCSV(outlet.domainAuthority),
        escapeCSV(outlet.twitterUrl),
        escapeCSV(outlet.facebookUrl),
        escapeCSV(outlet.linkedinUrl),
        escapeCSV(outlet.instagramUrl),
        escapeCSV(outlet.youtubeUrl),
        escapeCSV(outlet.logoUrl),
        escapeCSV(outlet.outletUrl)
      ].join(',');
    }).join('\n');

    const csvContent = csvHeader + csvRows;

    // Save to file
    const dataDir = join(__dirname, '..', 'data');

    // Ensure data directory exists
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = join(dataDir, `muckrack-outlets-${timestamp}.csv`);
    writeFileSync(filename, csvContent, 'utf-8');

    console.log(`✓ Data saved to ${filename}`);
    console.log(`\nSummary:`);
    console.log(`  Total outlets: ${allOutlets.length}`);
    console.log(`  Verified outlets: ${allOutlets.filter(o => o.isVerified).length}`);
    console.log(`  With websites: ${allOutlets.filter(o => o.website).length}`);
    console.log(`  With emails: ${allOutlets.filter(o => o.email).length}`);
    console.log(`  With phone numbers: ${allOutlets.filter(o => o.phone).length}`);
    console.log(`  With Twitter: ${allOutlets.filter(o => o.twitterUrl).length}`);

  } catch (error) {
    console.error('Error during scraping:', error.message);
    throw error;
  } finally {
    // Clean up: Close browser and stop profile
    try {
      if (context) {
        console.log('\nClosing browser context...');
        await context.close();
      }

      console.log('Stopping Multilogin profile...');
      await multilogin.stopProfile();
      console.log('✓ Profile stopped successfully');
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError.message);
    }
  }
}

/**
 * Cleanup function for graceful shutdown
 */
async function cleanup() {
  console.log('\n\n⚠️  Interrupt received, cleaning up...');

  try {
    if (globalContext) {
      console.log('Closing browser context...');
      await globalContext.close().catch(() => {});
    }

    if (globalMultilogin) {
      console.log('Stopping Multilogin profile...');
      await globalMultilogin.stopProfile().catch(() => {});
    }

    console.log('✓ Cleanup complete');
  } catch (error) {
    console.error('Error during cleanup:', error.message);
  }

  process.exit(0);
}

// Handle Ctrl+C and termination signals
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Run the scraper
console.log('=== Muck Rack Outlet Scraper Started ===\n');
console.log(`Configuration:`);
console.log(`  Max outlets: ${MAX_OUTLETS}`);
console.log(`  Start page: ${START_PAGE}`);
console.log(`  Delay between outlets: ${DELAY_BETWEEN_OUTLETS}ms`);
console.log(`\n💡 Press Ctrl+C to stop and cleanup gracefully\n`);

scrapeWithMultilogin()
  .then(() => {
    console.log('\n=== Scraping completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Scraping failed ===');
    console.error(error);
    process.exit(1);
  });
