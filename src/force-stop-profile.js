import { Multilogin } from './utils/Multilogin.js';
import 'dotenv/config';

/**
 * Force stop a locked Multilogin profile
 * Useful when a profile is stuck in a locked state
 */
async function forceStopProfile() {
  // Validate environment variables
  const requiredEnvVars = ['MULTILOGIN_EMAIL', 'MULTILOGIN_PASSWORD', 'FOLDER_ID', 'PROFILE_ID'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  console.log('=== Force Stop Multilogin Profile ===\n');

  try {
    // Initialize Multilogin
    const multilogin = new Multilogin({
      folderId: process.env.FOLDER_ID,
      profileId: process.env.PROFILE_ID,
    });

    console.log('Signing in to Multilogin...');
    await multilogin.signIn({
      email: process.env.MULTILOGIN_EMAIL,
      password: process.env.MULTILOGIN_PASSWORD,
    });
    console.log('✓ Successfully signed in');

    console.log('\nAttempting to stop profile...');
    await multilogin.stopProfile();
    console.log('✓ Profile stopped successfully');

    console.log('\nWaiting 2 seconds to ensure profile is fully stopped...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('✓ Done! You can now start your scraper.');

  } catch (error) {
    console.error('\n✗ Error:', error.message);
    console.log('\nIf the profile is still locked, try:');
    console.log('  1. Open the Multilogin application');
    console.log('  2. Manually stop the profile');
    console.log('  3. Wait a few seconds and try again');
    process.exit(1);
  }
}

// Run the force stop
forceStopProfile()
  .then(() => {
    console.log('\n=== Force stop completed successfully ===');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n=== Force stop failed ===');
    console.error(error);
    process.exit(1);
  });
