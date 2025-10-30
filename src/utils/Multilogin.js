import { chromium } from 'playwright';
import crypto from 'crypto';

/**
 * Multilogin API integration for Playwright
 * Handles authentication and browser profile management
 */
export class Multilogin {
  static MLX_BASE = 'https://api.multilogin.com';
  static MLX_LAUNCHER = 'https://launcher.mlx.yt:45001/api/v1';

  static REQUEST_HEADERS = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Accept-Language': 'en',
  };

  constructor({ folderId, profileId }) {
    this.folderId = folderId;
    this.profileId = profileId;
    this.token = null;
  }

  /**
   * Sign in to Multilogin
   * @param {Object} params
   * @param {string} params.email - Multilogin email
   * @param {string} params.password - Multilogin password
   * @returns {Promise<{token: string}>}
   */
  async signIn({ email, password }) {
    const payload = {
      email,
      password: crypto.createHash('md5').update(password).digest('hex'),
    };

    try {
      const response = await fetch(`${Multilogin.MLX_BASE}/user/signin`, {
        method: 'POST',
        headers: Multilogin.REQUEST_HEADERS,
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      this.token = data.data.token;

      return {
        token: this.token,
      };
    } catch (error) {
      throw new Error('SignIn failed: ' + error.message);
    }
  }

  /**
   * Start a Multilogin browser profile
   * @param {boolean} headless - Run in headless mode (default: false)
   * @returns {Promise<{browser: Browser, page: Page, context: BrowserContext}>}
   */
  async startProfile(headless = false) {
    if (!this.token) {
      throw new Error('Please use signIn() before startProfile()');
    }

    try {
      // Add headless parameter to the query string if enabled
      const headlessParam = headless ? '&headless_mode=true' : '';
      const response = await fetch(
        `${Multilogin.MLX_LAUNCHER}/profile/f/${this.folderId}/p/${this.profileId}/start?automation_type=playwright${headlessParam}`,
        {
          headers: {
            ...Multilogin.REQUEST_HEADERS,
            Authorization: `Bearer ${this.token}`,
          },
        }
      );

      const data = await response.json();

      // Check if the profile is locked or already running
      if (data.status.message === "can't lock profile" ||
          data.status.message === 'browser process is running') {
        console.log('⚠️  Profile is locked or already running. Attempting to stop it...');
        await this.stopProfile();
        console.log('✓ Profile stopped. Waiting 3 seconds before retry...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Retry starting the profile
        console.log('🔄 Retrying profile start...');
        const retryResponse = await fetch(
          `${Multilogin.MLX_LAUNCHER}/profile/f/${this.folderId}/p/${this.profileId}/start?automation_type=playwright${headlessParam}`,
          {
            headers: {
              ...Multilogin.REQUEST_HEADERS,
              Authorization: `Bearer ${this.token}`,
            },
          }
        );
        const retryData = await retryResponse.json();

        if (retryData.status.message === "can't lock profile") {
          throw new Error(
            'Profile is still locked after stop attempt. Please:\n' +
            '  1. Manually stop the profile in Multilogin app\n' +
            '  2. Wait a few seconds and try again'
          );
        }

        const browserURL = `http://127.0.0.1:${retryData.status.message}`;
        const browser = await chromium.connectOverCDP(browserURL);
        const context = browser.contexts()[0];
        const page = context.pages()[0] || (await context.newPage());

        return { browser, page, context };
      }

      const browserURL = `http://127.0.0.1:${data.status.message}`;

      // Using connectOverCDP for Chromium
      const browser = await chromium.connectOverCDP(browserURL);
      const context = browser.contexts()[0];
      const page = context.pages()[0] || (await context.newPage());

      return {
        browser,
        page,
        context,
      };
    } catch (error) {
      // Check if it's a connection refused error
      if (error.cause?.code === 'ECONNREFUSED') {
        throw new Error(
          'Cannot connect to Multilogin launcher. Please ensure:\n' +
          '  1. Multilogin application is installed\n' +
          '  2. Multilogin application is running\n' +
          '  3. The launcher is accessible at: ' + Multilogin.MLX_LAUNCHER
        );
      }
      throw new Error('StartProfile failed: ' + error.message);
    }
  }

  /**
   * Stop the Multilogin browser profile
   * @returns {Promise<void>}
   */
  async stopProfile() {
    try {
      await fetch(
        `${Multilogin.MLX_LAUNCHER}/profile/stop/p/${this.profileId}`,
        {
          headers: {
            ...Multilogin.REQUEST_HEADERS,
            Authorization: `Bearer ${this.token}`,
          },
        }
      );
    } catch (error) {
      // Don't throw on stopProfile failure during cleanup
      if (error.cause?.code === 'ECONNREFUSED') {
        console.warn('Warning: Could not stop profile - Multilogin launcher not accessible');
        return;
      }
      throw new Error('StopProfile failed: ' + error.message);
    }
  }

  /**
   * Check if Multilogin launcher is accessible
   * @returns {Promise<boolean>}
   */
  static async checkLauncher() {
    try {
      const response = await fetch(`${Multilogin.MLX_LAUNCHER}/health`, {
        method: 'GET',
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}
