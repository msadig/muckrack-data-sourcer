# Browser Automation Scraper

A minimal boilerplate for browser automation and web scraping using Playwright with support for both local browsers and Multilogin cloud browser profiles.

## Features

- Browser automation with Playwright
- **Two scraper modes:**
  - **Basic Scraper**: Uses local Playwright browser
  - **Multilogin Scraper**: Uses cloud browser profiles with anti-detection
- Data extraction from web pages
- CSV file export
- Headless browser support
- Environment-based configuration

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install browser binaries:
```bash
npm run install-browsers
```

3. **(Optional) For Multilogin**: Copy [.env.example](.env.example) to `.env` and configure your credentials:
```bash
cp .env.example .env
```

Then edit `.env` with your Multilogin credentials.

## Usage

### Basic Scraper (Local Browser)

Run the basic scraper with local Playwright browser:
```bash
npm start
```

### Muck Rack Scraper (Multilogin Cloud Browser)

Run the Muck Rack scraper with Multilogin cloud browser profiles:
```bash
npm run multilogin
```

**What it does:**
- Scrapes PR professional profiles from Muck Rack Forager
- Extracts comprehensive data including emails, social media links, bios
- Visits individual profile pages for detailed information
- Saves up to 1,000 profiles (configurable) to CSV

**Data extracted per profile:**
- Full name, title, verification status
- Email address (when available)
- Twitter/X handle, followers, post count
- LinkedIn URL
- Instagram handle and URL
- YouTube channel, website
- Media outlets, location, bio
- Beats/topics covered
- Profile photo URL

**Requirements for Multilogin:**
- Active Multilogin account (sign up at https://multilogin.com)
- Configured `.env` file with your credentials
- Multilogin app running locally
- Must be logged into Muck Rack Forager in the Multilogin browser profile

## Project Structure

```
├── src/
│   ├── index.js                  # Basic scraper (local browser)
│   ├── multilogin-scraper.js     # Muck Rack scraper (Multilogin)
│   └── utils/
│       ├── Multilogin.js         # Multilogin API integration
│       └── muckrack-scraper.js   # Muck Rack extraction utilities
├── data/                         # CSV output files saved here
├── .env.example                  # Environment variables template
├── package.json                  # Project configuration
└── README.md
```

## Customization

### Basic Scraper
Edit [src/index.js](src/index.js) to customize the local browser scraper.

### Muck Rack Scraper

**Change search filters**: Edit `MUCKRACK_SEARCH_URL` in [src/multilogin-scraper.js](src/multilogin-scraper.js#L12)
- Current filter: United States location, Last 12 months
- Customize location, beats, outlets, etc. via Muck Rack UI and copy the URL

**Adjust limits**:
- `MAX_PROFILES`: Maximum profiles to scrape (default: 1000)
- `DELAY_BETWEEN_PROFILES`: Delay in ms between profiles (default: 2000)

**Modify extraction logic**: Edit [src/utils/muckrack-scraper.js](src/utils/muckrack-scraper.js)
- `extractProfileData()`: Customize which fields to extract
- `extractProfileUrls()`: Modify search results parsing

**Toggle headless mode**: Set `HEADLESS=true` in `.env`

## Multilogin Features

The Multilogin integration provides:
- **Anti-detection browsing**: Uses real browser profiles
- **Cloud-based profiles**: Manage multiple identities
- **Headless mode support**: Available on Solo, Team, and Custom plans
- **Session persistence**: Browser fingerprints and cookies are saved

### Environment Variables

```env
MULTILOGIN_EMAIL=your-email@example.com
MULTILOGIN_PASSWORD=your-password
FOLDER_ID=your-folder-id
PROFILE_ID=your-profile-id
HEADLESS=false  # Set to true for headless mode
```

See [.env.example](.env.example) for details.

## Example

### Basic Scraper
**Target**: `quotes.toscrape.com`

**Extracted data**:
- Quote text
- Author name
- Tags

**Output**: `data/scraped-data-{timestamp}.csv`

### Muck Rack Scraper
**Target**: Muck Rack Forager media database

**Extracted data** (21 fields per profile):
- Full Name, First Name, Last Name
- Verification Status
- Title, Primary Outlet, Other Outlets
- Location, Bio
- Twitter Handle, Followers, Posts
- Email Address
- LinkedIn URL
- Instagram Handle & URL
- YouTube URL, Website
- Profile Photo URL
- Beats/Topics
- Profile URL

**Output**: `data/muckrack-profiles-{timestamp}.csv`

**Configuration**:
- `MAX_PROFILES`: 1000 (configurable in [src/multilogin-scraper.js](src/multilogin-scraper.js))
- `DELAY_BETWEEN_PROFILES`: 2000ms (rate limiting protection)

## Troubleshooting

### Multilogin Connection Errors

**Error**: `ECONNREFUSED 127.0.0.1:45001`

This means the Multilogin launcher is not accessible. Follow these steps:

1. **Install Multilogin**
   - Download from https://multilogin.com
   - Install the application on your machine

2. **Launch Multilogin**
   - Open the Multilogin application
   - Log in with your account credentials
   - Keep the application running in the background

3. **Verify Installation**
   - The Multilogin app must be running for the scraper to work
   - The launcher API runs on `https://launcher.mlx.yt:45001`

4. **Check Your Environment Variables**
   - Ensure `.env` file exists and has correct credentials
   - Verify `FOLDER_ID` and `PROFILE_ID` match your Multilogin account

5. **Test Connection**
   ```bash
   # Check if port 45001 is listening
   lsof -i :45001
   ```

### Common Issues

**Invalid credentials**: Check your email/password in `.env`

**Profile not found**: Verify `FOLDER_ID` and `PROFILE_ID` in Multilogin dashboard

**Browser already running**: Close any existing browser sessions for the profile

**Headless mode not working**: Requires Solo, Team, or Custom plan (not available on Starter)

## Documentation

For detailed Multilogin integration documentation, see [ai-docs/external/MULTILOGIN.md](ai-docs/external/MULTILOGIN.md)
