import { writeFileSync, mkdirSync, existsSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Multilogin } from './utils/Multilogin.js';
import { extractProfileUrls, extractProfileData } from './utils/muckrack-scraper.js';
import { ScraperState } from './utils/scraper-state.js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const hasHeadlessArg = args.includes('--headless');
const hasHeadedArg = args.includes('--headed');
const shouldResume = args.includes('--resume');
const shouldFreshStart = args.includes('--fresh');

// Configuration
const MUCKRACK_SEARCH_URL = 'https://forager.muckrack.com/search/results?sort=date&q=&result_type=person&search_source=homepage&user_recent_search=&embed=&person=&duplicate_group=&accepts_contributed=&topics_any=&topics_all=&topics_none=&article_types=&exclude_article_types=&domain_authority_range=&domain_authority_min=&domain_authority_max=&stations=&exclude_stations=&networks=&exclude_networks=&programs=&exclude_programs=&domains=&exclude_domains=&daterange_preset=8&daterange_starts=2024-10-21&timerange_starts=&daterange_ends=2025-10-21&timerange_ends=&timezone=&person_title=&beats=&covered_topics_any=&covered_topics_all=&covered_topics_none=&sources=&exclude_sources=&outlet_lists=&exclude_outlet_lists=&medialists=&exclude_medialists=&locations=43972&exclude_locations=&dmas=&exclude_dmas=&languages=&exclude_languages=';
const MAX_PROFILES = 175000; // Maximum number of profiles to scrape
const START_PAGE = 1; // Starting page number (useful for resuming scraping)
const DELAY_BETWEEN_PROFILES = 2000; // 2 seconds delay between profile visits

// Batch processing configuration
const PAGES_PER_BATCH = 10; // Process this many pages before saving state
const BATCH_DELAY_MIN = 8000; // Minimum delay between batches (4 seconds)
const BATCH_DELAY_MAX = 15000; // Maximum delay between batches (8 seconds)
const SAVE_INTERVAL = 10; // Save state every N profiles processed
const MAX_RETRIES = 3; // Maximum retry attempts for failed URLs

// Global references for cleanup
let globalContext = null;
let globalMultilogin = null;
let globalState = null;

/**
 * Convert profile data to CSV row
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
 * Get random delay between min and max
 */
function getRandomDelay(min, max) {
  return min + Math.random() * (max - min);
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

  // Initialize state manager with profiles-specific directory
  const dataDir = join(__dirname, '..', 'data', 'profiles');
  const state = new ScraperState(dataDir);
  globalState = state;

  // Handle resume vs fresh start
  if (shouldFreshStart) {
    console.log('Starting fresh scraping session...');
    await state.clearState();
  } else if (shouldResume) {
    const stats = await state.getStats();
    console.log('Resuming from previous session...');
    console.log(`  URLs in queue: ${stats.totalQueued}`);
    console.log(`  Already visited: ${stats.totalVisited}`);
    console.log(`  Remaining: ${stats.totalRemaining}`);
    console.log(`  Failed: ${stats.totalFailed}`);
  }

  // Initialize Multilogin
  const multilogin = new Multilogin({
    folderId: process.env.FOLDER_ID,
    profileId: process.env.PROFILE_ID,
  });

  let browser, context, page;
  const allProfiles = [];
  let csvFilename = null;

  // Store global references for signal handlers
  globalMultilogin = multilogin;

  try {
    console.log('\nSigning in to Multilogin...');
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

    // PHASE 1: URL COLLECTION (with batch processing)
    let progress = await state.loadProgress();
    let startPage = progress.currentPage || START_PAGE;

    // Only collect URLs if we don't have enough unprocessed ones
    const unprocessedUrls = await state.getUnprocessedUrls();
    if (unprocessedUrls.length < MAX_PROFILES && !shouldResume) {
      console.log(`\nCollecting profile URLs from search results...`);
      console.log(`Starting from page ${startPage}`);

      // Calculate total pages needed
      const PROFILES_PER_PAGE = 50;
      const totalPagesNeeded = Math.ceil(MAX_PROFILES / PROFILES_PER_PAGE);

      while (startPage <= totalPagesNeeded) {
        // Determine batch size (don't exceed total pages needed)
        const batchEndPage = Math.min(startPage + PAGES_PER_BATCH - 1, totalPagesNeeded);
        console.log(`\n📦 Processing batch: pages ${startPage} to ${batchEndPage}`);

        let batchUrls = [];

        // Collect URLs for this batch of pages
        for (let pageNum = startPage; pageNum <= batchEndPage; pageNum++) {
          console.log(`  Page ${pageNum}/${totalPagesNeeded}...`);

          // Construct URL with page parameter
          const pageUrl = `${MUCKRACK_SEARCH_URL}&page=${pageNum}`;

          // Navigate to the specific page
          await page.goto(pageUrl, {
            waitUntil: 'load',
            timeout: 60000
          });

          // Check if page has results or shows "no results" message
          const hasNoResults = await page.evaluate(() => {
            const bodyText = document.body.textContent;
            return bodyText.includes("didn't return any results") ||
                   bodyText.includes("no results found");
          });

          if (hasNoResults) {
            console.log(`    ⚠️  No more results available on page ${pageNum}`);
            console.log(`    📍 Reached end of available pages (Muck Rack limit)`);
            break;
          }

          // Wait for search results to appear (with fallback)
          try {
            await page.waitForSelector('[role="tabpanel"] h5', { timeout: 30000 });
          } catch (error) {
            console.log(`    ⚠️  No results found on page ${pageNum} (timeout waiting for results)`);
            console.log(`    📍 Stopping collection at page ${pageNum - 1}`);
            break;
          }

          // Extract profile URLs from current page
          const pageProfileUrls = await extractProfileUrls(page);
          console.log(`    Found ${pageProfileUrls.length} profiles`);

          if (pageProfileUrls.length === 0) {
            console.log(`    ⚠️  No profiles found on page ${pageNum}, stopping collection`);
            break;
          }

          batchUrls = batchUrls.concat(pageProfileUrls);

          // Update progress
          await state.saveProgress({
            ...progress,
            currentPage: pageNum,
            totalPages: totalPagesNeeded,
            status: 'collecting_urls'
          });

          // Small delay between pages
          if (pageNum < batchEndPage) {
            await sleep(1000);
          }
        }

        // Save batch URLs to queue
        if (batchUrls.length > 0) {
          console.log(`  💾 Saving batch: ${batchUrls.length} URLs`);
          await state.saveQueue(batchUrls, true);

          // Update total collected
          const allQueued = await state.loadQueue();
          progress.totalUrlsCollected = allQueued.length;
          await state.saveProgress(progress);
        }

        // Check if we have enough URLs
        const currentQueue = await state.loadQueue();
        if (currentQueue.length >= MAX_PROFILES) {
          console.log(`  ✓ Collected enough URLs (${currentQueue.length}), stopping collection`);
          break;
        }

        // Random delay between batches (4-8 seconds)
        if (batchEndPage < totalPagesNeeded) {
          const batchDelay = getRandomDelay(BATCH_DELAY_MIN, BATCH_DELAY_MAX);
          console.log(`  ⏱️  Waiting ${Math.round(batchDelay / 1000)} seconds before next batch...`);
          await sleep(batchDelay);
        }

        startPage = batchEndPage + 1;
      }
    }

    // PHASE 2: DATA EXTRACTION
    console.log('\n📋 Starting data extraction phase...');

    // Get unprocessed URLs
    let urlsToProcess = await state.getUnprocessedUrls(MAX_PROFILES);
    console.log(`  URLs to process: ${urlsToProcess.length}`);

    if (urlsToProcess.length === 0) {
      console.log('  No URLs to process!');
      return;
    }

    // Prepare CSV file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    csvFilename = join(dataDir, `muckrack-profiles-${timestamp}.csv`);

    // Ensure data directory exists
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    // Write CSV header if new file
    if (!existsSync(csvFilename)) {
      const csvHeader = [
        'Full Name',
        'First Name',
        'Last Name',
        'Verified',
        'Title',
        'Primary Outlet',
        'Other Outlets',
        'Location',
        'Bio',
        'Twitter Handle',
        'Twitter Followers',
        'Twitter Posts',
        'Default Email',
        'Other Emails',
        'LinkedIn URL',
        'Instagram Handle',
        'Instagram URL',
        'Facebook URL',
        'YouTube URL',
        'Threads URL',
        'Tumblr URL',
        'Pinterest URL',
        'Flickr URL',
        'TikTok URL',
        'Blog URL',
        'Website',
        'Other URLs',
        'Profile Photo URL',
        'Beats',
        'Profile URL'
      ].join(',') + '\n';
      writeFileSync(csvFilename, csvHeader, 'utf-8');
    }

    let successCount = 0;
    let errorCount = 0;
    let batchNumber = 1;
    let batchData = [];

    // Process each URL
    for (let i = 0; i < urlsToProcess.length; i++) {
      const profileUrl = urlsToProcess[i];
      const overallProgress = `[${i + 1}/${urlsToProcess.length}]`;

      // Check if already visited
      if (await state.isVisited(profileUrl)) {
        console.log(`${overallProgress} ⏭️  Skipping (already visited): ${profileUrl}`);
        continue;
      }

      let retryCount = 0;
      let success = false;

      while (retryCount < MAX_RETRIES && !success) {
        try {
          if (retryCount > 0) {
            console.log(`${overallProgress} 🔄 Retry ${retryCount}/${MAX_RETRIES}: ${profileUrl}`);
          } else {
            console.log(`${overallProgress} 🌐 Visiting: ${profileUrl}`);
          }

          await page.goto(profileUrl, {
            waitUntil: 'load',
            timeout: 60000
          });

          // Wait for profile content to load
          await page.waitForSelector('h1', { timeout: 10000 });

          // Extract profile data
          const profileData = await extractProfileData(page);

          if (profileData && profileData.fullName) {
            // Mark as visited
            await state.markVisited(profileUrl, profileData);

            // Add to batch data
            batchData.push(profileData);
            allProfiles.push(profileData);

            // Write to CSV immediately (append mode)
            const csvRow = createCSVRow(profileData);
            appendFileSync(csvFilename, csvRow + '\n', 'utf-8');

            successCount++;
            success = true;
            console.log(`${overallProgress} ✅ Extracted: ${profileData.fullName} (${profileData.email || 'no email'})`);

            // Save batch if interval reached
            if (batchData.length >= SAVE_INTERVAL) {
              await state.saveBatch(batchData, batchNumber++);
              batchData = [];
            }
          } else {
            throw new Error('Failed to extract data');
          }

        } catch (error) {
          retryCount++;

          if (retryCount >= MAX_RETRIES) {
            errorCount++;
            console.error(`${overallProgress} ❌ Failed after ${MAX_RETRIES} attempts: ${error.message}`);
            await state.markFailed(profileUrl, error);
          } else {
            // Wait before retry
            const retryDelay = 3000 * retryCount;
            console.log(`${overallProgress} ⏳ Waiting ${retryDelay / 1000}s before retry...`);
            await sleep(retryDelay);
          }
        }
      }

      // Delay between profiles
      if (i < urlsToProcess.length - 1 && success) {
        const randomDelay = DELAY_BETWEEN_PROFILES * (1.5 + Math.random());
        console.log(`${overallProgress} ⏱️  Waiting ${Math.round(randomDelay / 1000)}s before next profile...`);
        await sleep(randomDelay);
      }

      // Update progress periodically
      if ((i + 1) % 5 === 0) {
        const stats = await state.getStats();
        await state.saveProgress({
          ...progress,
          totalUrlsProcessed: stats.totalVisited,
          totalUrlsFailed: stats.totalFailed,
          status: 'extracting_data'
        });
      }
    }

    // Save final batch if any
    if (batchData.length > 0) {
      await state.saveBatch(batchData, batchNumber);
    }

    // Final statistics
    const finalStats = await state.getStats();
    console.log(`\n✅ Extraction complete!`);
    console.log(`  Successful: ${successCount}`);
    console.log(`  Failed: ${errorCount}`);
    console.log(`  Total processed: ${finalStats.totalVisited}`);
    console.log(`  CSV saved to: ${csvFilename}`);

    if (allProfiles.length > 0) {
      console.log(`\n📊 Summary:`);
      console.log(`  Total profiles: ${allProfiles.length}`);
      console.log(`  With emails: ${allProfiles.filter(p => p.email).length}`);
      console.log(`  With LinkedIn: ${allProfiles.filter(p => p.linkedinUrl).length}`);
      console.log(`  With Instagram: ${allProfiles.filter(p => p.instagramHandle).length}`);
      console.log(`  Verified: ${allProfiles.filter(p => p.isVerified).length}`);
    }

  } catch (error) {
    console.error('Error during scraping:', error.message);
    throw error;
  } finally {
    // Save final state
    if (globalState) {
      const finalProgress = await globalState.loadProgress();
      await globalState.saveProgress({
        ...finalProgress,
        status: 'completed',
        lastUpdated: new Date().toISOString()
      });
    }

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
 * Create CSV row from profile data
 */
function createCSVRow(profile) {
  return [
    escapeCSV(profile.fullName),
    escapeCSV(profile.firstName),
    escapeCSV(profile.lastName),
    profile.isVerified ? 'Yes' : 'No',
    escapeCSV(profile.title),
    escapeCSV(profile.primaryOutlet),
    escapeCSV(profile.otherOutlets),
    escapeCSV(profile.location),
    escapeCSV(profile.bio),
    escapeCSV(profile.twitterHandle),
    profile.twitterFollowers || 0,
    profile.twitterPosts || 0,
    escapeCSV(profile.email),
    escapeCSV(profile.all_emails),
    escapeCSV(profile.linkedinUrl),
    escapeCSV(profile.instagramHandle),
    escapeCSV(profile.instagramUrl),
    escapeCSV(profile.facebookUrl),
    escapeCSV(profile.youtubeUrl),
    escapeCSV(profile.threadsUrl),
    escapeCSV(profile.tumblrUrl),
    escapeCSV(profile.pinterestUrl),
    escapeCSV(profile.flickrUrl),
    escapeCSV(profile.tiktokUrl),
    escapeCSV(profile.blogUrl),
    escapeCSV(profile.website),
    escapeCSV(profile.otherUrls),
    escapeCSV(profile.profilePhotoUrl),
    escapeCSV(profile.beats),
    escapeCSV(profile.profileUrl)
  ].join(',');
}

/**
 * Cleanup function for graceful shutdown
 */
async function cleanup() {
  console.log('\n\n⚠️  Interrupt received, cleaning up...');

  try {
    // Save current state before exiting
    if (globalState) {
      console.log('Saving current state...');
      const progress = await globalState.loadProgress();
      await globalState.saveProgress({
        ...progress,
        status: 'interrupted',
        lastUpdated: new Date().toISOString()
      });

      const stats = await globalState.getStats();
      console.log(`  URLs collected: ${stats.totalQueued}`);
      console.log(`  URLs processed: ${stats.totalVisited}`);
      console.log(`  URLs remaining: ${stats.totalRemaining}`);
      console.log(`\n💡 Run with --resume flag to continue from this point`);
    }

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

// Display help if requested
if (args.includes('--help') || args.includes('-h')) {
  console.log('Muck Rack Profile Scraper\n');
  console.log('Usage: node multilogin-scraper.js [options]\n');
  console.log('Options:');
  console.log('  --headless    Run browser in headless mode');
  console.log('  --headed      Run browser in headed mode (visible)');
  console.log('  --resume      Resume from previous interrupted session');
  console.log('  --fresh       Start fresh, clearing any existing state');
  console.log('  --help, -h    Show this help message\n');
  console.log('Configuration (via environment variables):');
  console.log('  MULTILOGIN_EMAIL     Multilogin account email');
  console.log('  MULTILOGIN_PASSWORD  Multilogin account password');
  console.log('  FOLDER_ID           Multilogin folder ID');
  console.log('  PROFILE_ID          Multilogin profile ID');
  console.log('  HEADLESS            Default headless mode (true/false)');
  process.exit(0);
}

// Run the scraper
console.log('=== Muck Rack Profile Scraper Started ===\n');
console.log(`Configuration:`);
console.log(`  Max profiles: ${MAX_PROFILES}`);
console.log(`  Start page: ${START_PAGE}`);
console.log(`  Delay between profiles: ${DELAY_BETWEEN_PROFILES}ms`);
console.log(`  Pages per batch: ${PAGES_PER_BATCH}`);
console.log(`  Batch delay: ${BATCH_DELAY_MIN / 1000}-${BATCH_DELAY_MAX / 1000} seconds`);
console.log(`  Save interval: Every ${SAVE_INTERVAL} profiles`);
console.log(`  Max retries: ${MAX_RETRIES}`);
console.log(`\nMode: ${shouldResume ? '🔄 Resume' : shouldFreshStart ? '🆕 Fresh Start' : '🔍 Auto'}`);
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
