# PM2 Setup Guide for Windows Server

This guide shows how to run your scrapers in the background on Windows Server using PM2, so they continue running even after you close RDP.

## 🚀 Quick Start

### 1. Install PM2 Globally (One-time setup)

On your Windows server, open PowerShell or Command Prompt as Administrator and run:

```bash
npm install -g pm2
npm install -g pm2-windows-startup
```

### 2. Configure PM2 to Start on Windows Boot

This ensures PM2 restarts automatically if the server reboots:

```bash
pm2-startup install
```

### 3. Start Your Scrapers

Navigate to your project directory and run:

```bash
# Install dependencies (if not already done)
npm install

# Start the profiles scraper in headless mode
npm run pm2:start:profiles

# OR start the outlets scraper
npm run pm2:start:outlets

# OR start both scrapers
npm run pm2:start
```

### 4. Save the PM2 Process List

After starting your scrapers, save the configuration so PM2 remembers to restart them:

```bash
npm run pm2:save
```

## 📊 Managing Your Scrapers

### Check Status

```bash
npm run pm2:status
```

This shows:
- Process ID
- Status (online/stopped)
- CPU and memory usage
- Uptime
- Restart count

### View Live Logs

```bash
# View all logs
npm run pm2:logs

# View only profiles scraper logs
npm run pm2:logs:profiles

# View only outlets scraper logs
npm run pm2:logs:outlets
```

Press `Ctrl+C` to exit log view (process keeps running).

### Monitor in Real-Time

```bash
npm run pm2:monit
```

This opens an interactive dashboard showing:
- CPU usage
- Memory usage
- Live logs
- Process list

Press `Ctrl+C` to exit (processes keep running).

### Stop Scrapers

```bash
# Stop all scrapers
npm run pm2:stop

# Stop specific scraper
pm2 stop muckrack-profiles-scraper
pm2 stop muckrack-outlets-scraper
```

### Restart Scrapers

```bash
# Restart all
npm run pm2:restart

# Restart specific
pm2 restart muckrack-profiles-scraper
```

### Delete from PM2

```bash
# Remove all scrapers from PM2
npm run pm2:delete

# Remove specific scraper
pm2 delete muckrack-profiles-scraper
```

## 🔧 Configuration

The PM2 configuration is in `ecosystem.config.cjs`. Key features:

### Headless Mode
- Both scrapers are configured to run in `--headless` mode by default
- This is required for Windows Server (no display)

### Auto-Restart
- Automatically restarts if the process crashes
- Max 5 restarts per minute (prevents restart loops)
- 5-second delay between restarts

### Memory Management
- Automatically restarts if memory usage exceeds 2GB
- Prevents memory leaks from causing issues

### Logs
- Located in `./logs/` directory:
  - `profiles-out.log` - Profiles scraper output
  - `profiles-error.log` - Profiles scraper errors
  - `outlets-out.log` - Outlets scraper output
  - `outlets-error.log` - Outlets scraper errors

### Graceful Shutdown
- 30-second timeout for graceful shutdown
- Allows cleanup handlers to run (saving state, closing browsers)

## 🔄 Running Different Modes

### Resume Mode (Continue from Previous Session)

Edit `ecosystem.config.cjs` and change the `args` line:

```javascript
// For profiles scraper
{
  name: 'muckrack-profiles-scraper',
  script: './src/multilogin-scraper.js',
  args: '--resume --headless',  // Changed from --fresh to --resume
  // ... rest of config
}
```

Then restart:

```bash
npm run pm2:restart
```

### Fresh Start Mode (Clear Previous State)

Default configuration uses `--fresh --headless`.

## 📝 Common Workflows

### Starting a Long-Running Scrape Session

1. Connect to Windows server via RDP
2. Open Command Prompt or PowerShell
3. Navigate to project directory:
   ```bash
   cd C:\path\to\media-db
   ```
4. Start the scraper:
   ```bash
   npm run pm2:start:profiles
   ```
5. Verify it's running:
   ```bash
   npm run pm2:status
   ```
6. Check logs briefly:
   ```bash
   npm run pm2:logs:profiles
   ```
   Press `Ctrl+C` to exit logs
7. Close RDP - **scraper continues running!**

### Checking on Progress Later

1. Connect to Windows server via RDP
2. Check status:
   ```bash
   cd C:\path\to\media-db
   npm run pm2:status
   ```
3. View recent logs:
   ```bash
   npm run pm2:logs:profiles --lines 50
   ```
4. Check the data files:
   ```bash
   dir data\profiles
   ```

### Stopping Everything and Cleaning Up

```bash
# Stop all processes
npm run pm2:stop

# Remove from PM2
npm run pm2:delete

# Or do both with:
pm2 kill
```

## 🔍 Troubleshooting

### PM2 Not Found After Installation

Add npm global bin to your PATH:

1. Find npm global path:
   ```bash
   npm config get prefix
   ```
2. Add `<prefix>\node_modules\.bin` to your Windows PATH environment variable

### Processes Show as "Errored"

Check error logs:
```bash
npm run pm2:logs:profiles
```

Common issues:
- Missing `.env` file or environment variables
- Multilogin credentials incorrect
- Profile ID or Folder ID invalid

### Want to See Browser (Not Headless)

**Warning:** This won't work properly on Windows Server without an active RDP session.

If you need to debug, edit `ecosystem.config.cjs`:

```javascript
args: '--fresh',  // Remove --headless
```

Then restart, but keep RDP open:
```bash
npm run pm2:restart
```

### Memory Issues

If scrapers are crashing due to memory:

1. Increase memory limit in `ecosystem.config.cjs`:
   ```javascript
   max_memory_restart: '4G',  // Increased from 2G
   ```
2. Restart: `npm run pm2:restart`

### Checking Logs from File System

If PM2 isn't working, check log files directly:

```bash
# Windows Command Prompt
type logs\profiles-out.log
type logs\profiles-error.log

# PowerShell
Get-Content logs\profiles-out.log -Tail 50
Get-Content logs\profiles-error.log -Tail 50
```

## 🎯 Best Practices

1. **Always save after starting processes:**
   ```bash
   npm run pm2:start:profiles
   npm run pm2:save
   ```

2. **Monitor for the first few minutes** after starting to ensure it's working

3. **Check logs periodically** to catch issues early

4. **Set up Windows Task Scheduler** as a backup to start PM2 on reboot:
   - Task: Run `pm2 resurrect` at system startup
   - User: Your service account
   - Run whether user is logged on or not

5. **Keep logs manageable** - PM2 log files can grow large:
   ```bash
   pm2 flush  # Clear all logs
   ```

6. **Update your scrapers** by stopping, pulling changes, and restarting:
   ```bash
   npm run pm2:stop
   git pull
   npm install
   npm run pm2:start
   npm run pm2:save
   ```

## 🆘 Emergency Stop

If something goes wrong and you need to kill everything immediately:

```bash
pm2 kill
```

This stops PM2 daemon and all processes.

## 📞 Support

For PM2 issues, see: https://pm2.keymetrics.io/docs/usage/quick-start/
For scraper issues, check the main README.md
