import { Multilogin } from './src/utils/Multilogin.js';
import 'dotenv/config';

/**
 * Test script to verify Docker Multilogin setup
 *
 * Prerequisites:
 * 1. Docker container is running (docker compose up -d)
 * 2. .env file has USE_LOCAL_DOCKER=true
 * 3. MULTILOGIN_EMAIL and MULTILOGIN_PASSWORD are set in .env
 * 4. FOLDER_ID and PROFILE_ID are configured
 */

async function testDockerMultilogin() {
  console.log('\n🧪 Testing Docker Multilogin Setup\n');
  console.log('═══════════════════════════════════════\n');

  // Check environment variables
  console.log('📋 Configuration:');
  console.log(`   USE_LOCAL_DOCKER: ${process.env.USE_LOCAL_DOCKER}`);
  console.log(`   MULTILOGIN_EMAIL: ${process.env.MULTILOGIN_EMAIL ? '✓ Set' : '✗ Not set'}`);
  console.log(`   MULTILOGIN_PASSWORD: ${process.env.MULTILOGIN_PASSWORD ? '✓ Set' : '✗ Not set'}`);
  console.log(`   FOLDER_ID: ${process.env.FOLDER_ID || '✗ Not set'}`);
  console.log(`   PROFILE_ID: ${process.env.PROFILE_ID || '✗ Not set'}`);
  console.log();

  if (process.env.USE_LOCAL_DOCKER !== 'true') {
    console.log('⚠️  USE_LOCAL_DOCKER is not set to "true" in your .env file');
    console.log('   This test will use cloud endpoints instead of Docker');
    console.log();
  }

  // Check if launcher is accessible
  console.log('🔍 Checking Multilogin launcher accessibility...');
  const launcherAvailable = await Multilogin.checkLauncher();

  if (!launcherAvailable) {
    console.log('❌ Multilogin launcher is not accessible');
    console.log('\n💡 Troubleshooting steps:');
    console.log('   1. Ensure Docker container is running: docker compose ps');
    console.log('   2. Check container logs: docker compose logs multilogin');
    console.log('   3. Verify ports are accessible: lsof -i :45001');
    console.log('   4. Access noVNC web interface: http://localhost:6080/vnc.html');
    process.exit(1);
  }

  console.log('✅ Multilogin launcher is accessible\n');

  // Initialize Multilogin
  console.log('🚀 Initializing Multilogin...');
  const ml = new Multilogin({
    folderId: process.env.FOLDER_ID,
    profileId: process.env.PROFILE_ID,
  });
  console.log();

  // Sign in
  try {
    console.log('🔐 Signing in to Multilogin...');
    await ml.signIn({
      email: process.env.MULTILOGIN_EMAIL,
      password: process.env.MULTILOGIN_PASSWORD,
    });
    console.log('✅ Sign in successful\n');
  } catch (error) {
    console.log('❌ Sign in failed:', error.message);
    console.log('\n💡 Check your MULTILOGIN_EMAIL and MULTILOGIN_PASSWORD in .env');
    process.exit(1);
  }

  // Start profile
  try {
    console.log('🌐 Starting browser profile...');
    const { browser, page, context } = await ml.startProfile();
    console.log('✅ Browser profile started successfully\n');

    // Navigate to a test page
    console.log('🧭 Navigating to test page...');
    await page.goto('https://forager.muckrack.com/search/?result_type=person');
    const title = await page.title();
    console.log(`✅ Page loaded successfully: "${title}"\n`);

    // Take a screenshot
    console.log('📸 Taking screenshot...');
    await page.screenshot({ path: 'test-screenshot.png' });
    console.log('✅ Screenshot saved to test-screenshot.png\n');

    // Clean up
    console.log('🧹 Closing browser...');
    await browser.close();
    await ml.stopProfile();
    console.log('✅ Browser closed\n');

    console.log('═══════════════════════════════════════');
    console.log('🎉 All tests passed! Docker setup is working correctly.');
    console.log('═══════════════════════════════════════\n');
    console.log('💡 Next steps:');
    console.log('   - Access browser via noVNC: http://localhost:6080/vnc.html');
    console.log('   - View container logs: docker compose logs -f multilogin');
    console.log('   - Run your scrapers with USE_LOCAL_DOCKER=true in .env\n');

  } catch (error) {
    console.log('❌ Browser profile failed:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Check if profile exists in Multilogin dashboard');
    console.log('   2. Verify FOLDER_ID and PROFILE_ID are correct');
    console.log('   3. Check container logs: docker compose logs multilogin');
    console.log('   4. Try accessing noVNC: http://localhost:6080/vnc.html\n');

    // Try to clean up
    try {
      await ml.stopProfile();
    } catch (e) {
      // Ignore cleanup errors
    }

    process.exit(1);
  }
}

// Run the test
testDockerMultilogin().catch((error) => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});
