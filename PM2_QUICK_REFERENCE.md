# PM2 Quick Reference Card

## 🚀 Initial Setup (One-time on Windows Server)

```bash
# Install PM2 globally
npm install -g pm2
npm install -g pm2-windows-startup

# Setup Windows startup
pm2-startup install

# Install project dependencies
npm install
```

## ▶️ Starting Scrapers

```bash
# Start profiles scraper (headless)
npm run pm2:start:profiles

# Start outlets scraper (headless)
npm run pm2:start:outlets

# Start both scrapers
npm run pm2:start

# IMPORTANT: Save configuration after starting
npm run pm2:save
```

## 📊 Monitoring

```bash
# Check status
npm run pm2:status

# View live logs (Ctrl+C to exit, keeps running)
npm run pm2:logs
npm run pm2:logs:profiles
npm run pm2:logs:outlets

# Interactive dashboard
npm run pm2:monit
```

## ⏸️ Stop/Restart

```bash
# Stop all
npm run pm2:stop

# Restart all
npm run pm2:restart

# Delete from PM2
npm run pm2:delete

# Emergency kill all
pm2 kill
```

## 🔄 Switch Between Resume and Fresh Mode

Edit `ecosystem.config.cjs`, change the `args` line:

```javascript
// Resume from last state
args: '--resume --headless',

// OR fresh start
args: '--fresh --headless',
```

Then restart:
```bash
npm run pm2:restart
```

## 📁 Important Files

- `ecosystem.config.cjs` - PM2 configuration
- `logs/profiles-out.log` - Profiles scraper output
- `logs/profiles-error.log` - Profiles scraper errors
- `logs/outlets-out.log` - Outlets scraper output
- `logs/outlets-error.log` - Outlets scraper errors
- `data/profiles/` - Scraped profile data
- `data/outlets/` - Scraped outlet data

## ✅ Typical Workflow

1. **Start scraping:**
   ```bash
   npm run pm2:start:profiles
   npm run pm2:save
   ```

2. **Check it's working:**
   ```bash
   npm run pm2:status
   npm run pm2:logs:profiles
   ```

3. **Close RDP** - scraper continues running!

4. **Check later:**
   ```bash
   npm run pm2:status
   npm run pm2:logs:profiles --lines 50
   ```

5. **Stop when done:**
   ```bash
   npm run pm2:stop
   ```

## 🐛 Troubleshooting

```bash
# Check if PM2 is running
pm2 list

# View error logs
npm run pm2:logs:profiles

# Clear logs
pm2 flush

# Check raw log files
Get-Content logs\profiles-error.log -Tail 50

# Restart if stuck
npm run pm2:restart
```

## 💾 Data Files

```bash
# Check scraped data (Windows)
dir data\profiles\*.csv
dir data\profiles\state\*.json

# View last few lines of CSV (PowerShell)
Get-Content data\profiles\muckrack-profiles-*.csv -Tail 10
```

## 🔑 Key Points

- ✅ PM2 keeps processes running after RDP disconnect
- ✅ Automatically restarts on crash
- ✅ Automatically restarts on Windows reboot (if saved)
- ✅ All scrapers run in headless mode by default
- ✅ Logs are saved to `logs/` directory
- ✅ State is saved every 10 profiles
- ✅ Can resume scraping after stopping

---

For detailed documentation, see: `PM2_SETUP_WINDOWS.md`
