import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Multilogin } from './utils/Multilogin.js';
import { extractProfileUrls, extractProfileData } from './utils/muckrack-scraper.js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const hasHeadlessArg = args.includes('--headless');
const hasHeadedArg = args.includes('--headed');

// Configuration
const MUCKRACK_SEARCH_URL = 'https://forager.muckrack.com/search/results?sort=date&q=&result_type=person&search_source=homepage&user_recent_search=&embed=&person=&duplicate_group=&accepts_contributed=&topics_any=&topics_all=&topics_none=&article_types=&exclude_article_types=&domain_authority_range=&domain_authority_min=&domain_authority_max=&stations=&exclude_stations=&networks=&exclude_networks=&programs=&exclude_programs=&domains=&exclude_domains=&daterange_preset=8&daterange_starts=2024-10-21&timerange_starts=&daterange_ends=2025-10-21&timerange_ends=&timezone=&person_title=&beats=&covered_topics_any=&covered_topics_all=&covered_topics_none=&sources=&exclude_sources=&outlet_lists=&exclude_outlet_lists=&medialists=&exclude_medialists=&locations=43972&exclude_locations=&dmas=&exclude_dmas=&languages=&exclude_languages=';
const MAX_PROFILES = 100; // Maximum number of profiles to scrape
const START_PAGE = 1; // Starting page number (useful for resuming scraping)
const DELAY_BETWEEN_PROFILES = 2000; // 2 seconds delay between profile visits

// Global references for cleanup
let globalContext = null;
let globalMultilogin = null;

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
  const allProfiles = [];

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

    // Collect profile URLs from search results using cursor pagination
    console.log('\nCollecting profile URLs from search results using pagination...');

    // Muck Rack shows ~50 profiles per page, calculate how many pages we need
    const PROFILES_PER_PAGE = 50;
    const pagesToLoad = Math.ceil(MAX_PROFILES / PROFILES_PER_PAGE);
    const endPage = START_PAGE + pagesToLoad - 1;
    console.log(`  Need to scrape ${pagesToLoad} page(s) starting from page ${START_PAGE} to get ${MAX_PROFILES} profiles`);

    let allProfileUrls = [];

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

      // Extract profile URLs from current page
      const pageProfileUrls = await extractProfileUrls(page);
      console.log(`    Found ${pageProfileUrls.length} profiles on page ${pageNum}`);

      // If no profiles found, we've reached the end
      if (pageProfileUrls.length === 0) {
        console.log(`    No profiles found on page ${pageNum}, stopping pagination`);
        break;
      }

      allProfileUrls = allProfileUrls.concat(pageProfileUrls);

      // Small delay between page requests
      if (pageNum < endPage) {
        await sleep(DELAY_BETWEEN_PROFILES);
      }

      // If we've collected enough profiles, stop early
      if (allProfileUrls.length >= MAX_PROFILES) {
        console.log(`    Collected enough profiles (${allProfileUrls.length}), stopping pagination`);
        break;
      }
    }

    // Limit to MAX_PROFILES (in case we got more than expected)
    let profileUrls = allProfileUrls.slice(0, MAX_PROFILES);
    console.log(`\n✓ Collected ${profileUrls.length} profile URLs from ${Math.min(pagesToLoad, Math.ceil(allProfileUrls.length / PROFILES_PER_PAGE))} page(s)`);

    // Visit each profile and extract detailed data
    console.log(`\nStarting detailed profile extraction...`);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < profileUrls.length; i++) {
      const profileUrl = profileUrls[i];
      const progress = `[${i + 1}/${profileUrls.length}]`;

      try {
        console.log(`${progress} Visiting: ${profileUrl}`);

        await page.goto(profileUrl, {
          waitUntil: 'networkidle',
          timeout: 30000
        });

        // Wait for profile content to load
        await page.waitForSelector('h1', { timeout: 10000 });

        // Extract profile data
        const profileData = await extractProfileData(page);

        if (profileData) {
          allProfiles.push(profileData);
          successCount++;
          console.log(`${progress} ✓ Extracted: ${profileData.fullName} (${profileData.email || 'no email'})`);
        } else {
          errorCount++;
          console.log(`${progress} ✗ Failed to extract data`);
        }

        // Delay between profiles to avoid rate limiting
        if (i < profileUrls.length - 1) {
          // make wait time random between 1.5x to 2.5x of DELAY_BETWEEN_PROFILES
          const randomDelay = DELAY_BETWEEN_PROFILES * (1.5 + Math.random());
          console.log(`${progress} Waiting for ${Math.round(randomDelay)}ms before next profile...`);
          await sleep(randomDelay);
          // await sleep(DELAY_BETWEEN_PROFILES);
        }

      } catch (error) {
        errorCount++;
        console.error(`${progress} ✗ Error: ${error.message}`);

        // Continue with next profile even if one fails
        continue;
      }
    }

    console.log(`\n✓ Extraction complete!`);
    console.log(`  Successful: ${successCount}`);
    console.log(`  Failed: ${errorCount}`);
    console.log(`  Total: ${allProfiles.length} profiles`);

    // Convert to CSV
    console.log('\nConverting to CSV...');
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

    const csvRows = allProfiles.map(profile => {
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
    }).join('\n');

    const csvContent = csvHeader + csvRows;

    // Save to file
    const dataDir = join(__dirname, '..', 'data');

    // Ensure data directory exists
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = join(dataDir, `muckrack-profiles-${timestamp}.csv`);
    writeFileSync(filename, csvContent, 'utf-8');

    console.log(`✓ Data saved to ${filename}`);
    console.log(`\nSummary:`);
    console.log(`  Total profiles: ${allProfiles.length}`);
    console.log(`  With emails: ${allProfiles.filter(p => p.email).length}`);
    console.log(`  With LinkedIn: ${allProfiles.filter(p => p.linkedinUrl).length}`);
    console.log(`  With Instagram: ${allProfiles.filter(p => p.instagramHandle).length}`);
    console.log(`  Verified: ${allProfiles.filter(p => p.isVerified).length}`);

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
console.log('=== Muck Rack Scraper Started ===\n');
console.log(`Configuration:`);
console.log(`  Max profiles: ${MAX_PROFILES}`);
console.log(`  Start page: ${START_PAGE}`);
console.log(`  Delay between profiles: ${DELAY_BETWEEN_PROFILES}ms`);
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
