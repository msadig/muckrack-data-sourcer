import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Multilogin } from './utils/Multilogin.js';
import { extractProfileData } from './utils/muckrack-scraper.js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration - SET THE PROFILE URL YOU WANT TO DEBUG HERE
const PROFILE_URL = 'https://forager.muckrack.com/warrenstewart12'; // Replace with actual profile URL
const SAVE_DEBUG_DATA = true; // Set to true to save extracted data to JSON file

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
 * Debug single profile function using Multilogin cloud browser
 */
async function debugSingleProfile() {
  // Validate environment variables
  const requiredEnvVars = ['MULTILOGIN_EMAIL', 'MULTILOGIN_PASSWORD', 'FOLDER_ID', 'PROFILE_ID'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  // Validate profile URL
  if (!PROFILE_URL || PROFILE_URL.includes('john-smith')) {
    throw new Error('Please set a valid PROFILE_URL in the script configuration');
  }

  // Initialize Multilogin
  const multilogin = new Multilogin({
    folderId: process.env.FOLDER_ID,
    profileId: process.env.PROFILE_ID,
  });

  let browser, context, page;

  // Store global references for signal handlers
  globalMultilogin = multilogin;

  try {
    console.log('Signing in to Multilogin...');
    await multilogin.signIn({
      email: process.env.MULTILOGIN_EMAIL,
      password: process.env.MULTILOGIN_PASSWORD,
    });
    console.log('✓ Successfully signed in');

    // Start profile (headless mode from env var, default to false for debugging)
    const headlessMode = process.env.HEADLESS === 'true';
    console.log(`Starting browser profile (headless: ${headlessMode})...`);

    const profile = await multilogin.startProfile(headlessMode);
    browser = profile.browser;
    page = profile.page;
    context = profile.context;
    globalContext = context; // Store for signal handlers
    console.log('✓ Browser profile started');

    console.log(`\nNavigating to profile: ${PROFILE_URL}`);
    await page.goto(PROFILE_URL, {
      waitUntil: 'networkidle',
      timeout: 60000
    });
    console.log('✓ Profile page loaded');

    // Wait for profile content to load
    console.log('\nWaiting for profile content...');
    await page.waitForSelector('h1', { timeout: 15000 });
    console.log('✓ Profile content loaded');

    // Add a small delay to ensure everything is loaded
    await sleep(2000);

    // Extract profile data with detailed logging
    console.log('\n=== EXTRACTING PROFILE DATA ===');
    const profileData = await extractProfileData(page, true); // Enable debug mode
    
    if (profileData) {
      console.log('\n✓ Profile data extracted successfully!');
      console.log('\n=== EXTRACTED DATA ===');
      
      // Pretty print the extracted data
      Object.entries(profileData).forEach(([key, value]) => {
        console.log(`${key}: ${value || 'N/A'}`);
      });

      // Create CSV output (same as main scraper)
      console.log('\n=== CREATING CSV OUTPUT ===');
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
        'Email',
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

      const csvRow = [
        escapeCSV(profileData.fullName),
        escapeCSV(profileData.firstName),
        escapeCSV(profileData.lastName),
        profileData.isVerified ? 'Yes' : 'No',
        escapeCSV(profileData.title),
        escapeCSV(profileData.primaryOutlet),
        escapeCSV(profileData.otherOutlets),
        escapeCSV(profileData.location),
        escapeCSV(profileData.bio),
        escapeCSV(profileData.twitterHandle),
        profileData.twitterFollowers || 0,
        profileData.twitterPosts || 0,
        escapeCSV(profileData.email),
        escapeCSV(profileData.linkedinUrl),
        escapeCSV(profileData.instagramHandle),
        escapeCSV(profileData.instagramUrl),
        escapeCSV(profileData.facebookUrl),
        escapeCSV(profileData.youtubeUrl),
        escapeCSV(profileData.threadsUrl),
        escapeCSV(profileData.tumblrUrl),
        escapeCSV(profileData.pinterestUrl),
        escapeCSV(profileData.flickrUrl),
        escapeCSV(profileData.tiktokUrl),
        escapeCSV(profileData.blogUrl),
        escapeCSV(profileData.website),
        escapeCSV(profileData.otherUrls),
        escapeCSV(profileData.profilePhotoUrl),
        escapeCSV(profileData.beats),
        escapeCSV(profileData.profileUrl)
      ].join(',');

      const csvContent = csvHeader + csvRow + '\n';

      // Save files to data directory
      const dataDir = join(__dirname, '..', 'data');
      
      // Ensure data directory exists
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

      // Save CSV file
      const csvFilename = join(dataDir, `debug-profile-${timestamp}.csv`);
      writeFileSync(csvFilename, csvContent, 'utf-8');
      console.log(`✓ CSV data saved to ${csvFilename}`);

      // Save debug data to JSON file if enabled
      if (SAVE_DEBUG_DATA) {
        const jsonFilename = join(dataDir, `debug-profile-${timestamp}.json`);
        
        const debugData = {
          profileUrl: PROFILE_URL,
          extractedAt: new Date().toISOString(),
          profileData: profileData,
          csvContent: csvContent
        };
        
        writeFileSync(jsonFilename, JSON.stringify(debugData, null, 2), 'utf-8');
        console.log(`✓ JSON debug data saved to ${jsonFilename}`);
      }

      // Summary stats
      console.log('\n=== SUMMARY ===');
      console.log(`Full Name: ${profileData.fullName || 'N/A'}`);
      console.log(`Email: ${profileData.email || 'Not found'}`);
      console.log(`LinkedIn: ${profileData.linkedinUrl ? 'Found' : 'Not found'}`);
      console.log(`Instagram: ${profileData.instagramHandle || 'Not found'}`);
      console.log(`Twitter: ${profileData.twitterHandle || 'Not found'}`);
      console.log(`Verified: ${profileData.isVerified ? 'Yes' : 'No'}`);
      console.log(`Beats count: ${profileData.beats ? profileData.beats.split(';').length : 0}`);

    } else {
      console.error('\n✗ Failed to extract profile data');
      
      // Try to get some basic page info for debugging
      console.log('\n=== DEBUG INFO ===');
      const pageTitle = await page.title();
      const currentUrl = page.url();
      console.log(`Page title: ${pageTitle}`);
      console.log(`Current URL: ${currentUrl}`);
      
      // Check if we can find the main profile elements
      const hasH1 = await page.locator('h1').count() > 0;
      const hasProfileSection = await page.locator('.profile-section').count() > 0;
      console.log(`Has H1 element: ${hasH1}`);
      console.log(`Has profile section: ${hasProfileSection}`);
    }

  } catch (error) {
    console.error('\nError during profile debugging:', error.message);
    console.error('Stack trace:', error.stack);
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

// Run the debugger
console.log('=== Muck Rack Single Profile Debugger ===\n');
console.log(`Profile URL: ${PROFILE_URL}`);
console.log(`Save debug data: ${SAVE_DEBUG_DATA}`);
console.log(`\n💡 Press Ctrl+C to stop and cleanup gracefully\n`);

debugSingleProfile()
  .then(() => {
    console.log('\n=== Debugging completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Debugging failed ===');
    console.error(error);
    process.exit(1);
  });