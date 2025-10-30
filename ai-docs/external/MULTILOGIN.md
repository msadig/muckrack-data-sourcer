# Multilogin Browser with Playwright

This project demonstrates how to integrate the Multilogin browser with Playwright for automated browser testing. The example includes signing in to Multilogin, starting a browser profile (with optional headless mode), running tests, and stopping the profile.

## Important Notes About Headless Mode

**Headless Mode Support (Updated 2025):**

- Multilogin X now supports headless mode via the `headless` query parameter
- Available on Solo, Team, and Custom plans (not available on Starter plan)
- Headless mode may limit interaction with certain page elements
- **Important Limitation**: While the app supports headless mode, browser profiles still require a system with a graphical user interface to function properly

## Prerequisites

Before you begin, ensure you have the following installed on your machine:

- Node.js (>=14.x)
- npm (Node Package Manager)
- Playwright

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/naimulcsx/multilogin-playwright
cd multilogin-playwright
```

### 2. Install Dependencies

Install the required npm packages:

```bash
npm install
```

### 3. Install Playwright Browsers

Run the following command to install the necessary browsers for Playwright:

```bash
npx playwright install
```

### 4. Set Environment Variables

Create a `.env` file in the root directory and add the following environment variables:

```env
MULTILOGIN_EMAIL=<your-multilogin-email>
MULTILOGIN_PASSWORD=<your-multilogin-password>
FOLDER_ID=<your-folder-id>
PROFILE_ID=<your-profile-id>
```

Replace `<your-multilogin-email>`, `<your-multilogin-password>`, `<your-folder-id>`, and `<your-profile-id>` with your actual Multilogin credentials and IDs.

## Usage

### Multilogin Class

The `Multilogin` class handles the following tasks:

- Signing in to Multilogin
- Starting a browser profile
- Stopping the browser profile

```ts
# Multilogin.ts
import { chromium } from "playwright";
import * as crypto from "crypto";


type SignInResponse = {
  data: {
    token: string;
  };
};

type StartProfileResponse = {
  status: {
    message: string;
  };
};

type MultiloginOptions = {
  folderId: string;
  profileId: string;
};

type SignInArgs = {
  email: string;
  password: string;
};

export class Multilogin {
  static MLX_BASE = "https://api.multilogin.com";
  static MLX_LAUNCHER = "https://launcher.mlx.yt:45001/api/v1";

  static REQUEST_HEADERS = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Accept-Language": "en",
  };

  private folderId: string;
  private profileId: string;
  private token: string | null = null;

  constructor({ folderId, profileId }: MultiloginOptions) {
    this.folderId = folderId;
    this.profileId = profileId;
  }

  public async signIn({ email, password }: SignInArgs) {
    const payload = {
      email,
      password: crypto.createHash("md5").update(password).digest("hex"),
    };
    try {
      const response = await fetch(`${Multilogin.MLX_BASE}/user/signin`, {
        method: "POST",
        headers: Multilogin.REQUEST_HEADERS,
        body: JSON.stringify(payload),
      });
      const data: SignInResponse = await response.json();
      this.token = data.data.token;
      return {
        token: this.token,
      };
    } catch (error: any) {
      throw new Error("SignIn failed");
    }
  }

  public async startProfile(headless: boolean = false) {
    if (!this.token) {
      throw new Error("Please use signIn() before startProfile()");
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
      const data: StartProfileResponse = await response.json();
      const browserURL = `http://127.0.0.1:${data.status.message}`;
      if (data.status.message === "browser process is running") {
        throw new Error("Browser already running");
      }
      const browser = await chromium.connectOverCDP(browserURL); // Using connectOverCDP for Chromium
      const context = browser.contexts()[0];
      const page = context.pages()[0] || (await context.newPage());
      return {
        browser,
        page,
        context,
      };
    } catch (error) {
      console.log(error);
      throw new Error("StartProfile failed");
    }
  }

  public async stopProfile() {
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
      throw new Error("StopProfile failed");
    }
  }
}

```

#### Method Signatures

- **constructor(options: MultiloginOptions)**: Initializes the Multilogin instance with folder and profile IDs.
  - `options`: An object containing `folderId` and `profileId`.

- **signIn(args: SignInArgs): Promise<SignInResponse>**: Signs in to Multilogin using the provided email and password.
  - `args`: An object containing `email` and `password`.

- **startProfile(headless?: boolean): Promise<{ browser: Browser, page: Page, context: BrowserContext }>**: Starts the Multilogin browser profile and returns the browser, page, and context instances.
  - `headless` (optional): Boolean flag to run browser in headless mode (default: `false`). Set to `true` to run without visible UI.
  - **Note**: Headless mode may limit interaction with certain page elements and requires a GUI-enabled system.

- **stopProfile(): Promise<void>**: Stops the Multilogin browser profile.

### Using Headless Mode

You can run browser profiles in headless mode by passing `true` to the `startProfile()` method:

```typescript
// Start profile in headless mode
const profile = await multilogin.startProfile(true);

// Or explicitly set headless to false (default)
const profile = await multilogin.startProfile(false);
```

**Headless Mode Query Parameter:**

The headless parameter is added as a query string to the API request:

```
https://launcher.mlx.yt:45001/api/v1/profile/f/{folderId}/p/{profileId}/start?automation_type=playwright&headless=true
```

**When to use headless mode:**

- ✅ Background automation tasks
- ✅ Server environments without display
- ✅ Faster execution (no UI rendering)
- ❌ Debugging (can't see what's happening)
- ❌ Some elements may not be interactive in headless mode

### Playwright Tests

The example test script does the following:

1. Signs in to Multilogin.
2. Starts a Multilogin browser profile (with optional headless mode).
3. Runs a test to verify if the browser is detected as automated.
4. Stops the Multilogin browser profile.

Here is the test script:

```typescript
import { expect, test } from '@playwright/test';
import { Browser, BrowserContext, Page } from 'playwright';
import { Multilogin } from '../src/Multilogin';

let browser: Browser;
let context: BrowserContext;
let page: Page;
let multilogin: Multilogin;

test.beforeEach(async () => {
  multilogin = new Multilogin({
    profileId: process.env.PROFILE_ID!,
    folderId: process.env.FOLDER_ID!,
  });
  await multilogin.signIn({
    email: process.env.MULTILOGIN_EMAIL!,
    password: process.env.MULTILOGIN_PASSWORD!,
  });

  // Start profile in headless mode (set to false to see browser window)
  const headlessMode = process.env.HEADLESS === 'true';
  const profile = await multilogin.startProfile(headlessMode);

  browser = profile.browser;
  page = profile.page;
  context = profile.context;
});

test('SHOULD open the Multilogin browser', async () => {
  await page.goto('https://bot.sannysoft.com/');
  const webDriverAdvanced = await page.$('td#advanced-webdriver-result');
  if (webDriverAdvanced) {
    expect(await webDriverAdvanced.textContent()).toBe('passed');
  }
});

test.afterEach(async () => {
  await context.close();
  await multilogin.stopProfile();
});
```

### Running the Tests

To run the tests, use the following command:

```bash
npx playwright test --ui
```

This will open the Playwright Test Runner UI, where you can run and inspect the tests.
