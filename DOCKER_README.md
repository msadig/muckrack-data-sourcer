# Multilogin Docker Setup

This Docker setup allows you to run Multilogin 6 in a containerized environment with browser access via VNC or web browser (noVNC).

## Features

- Multi-architecture support (AMD64 and ARM64/M1 Mac)
- Headless operation with Xvfb virtual display
- Browser access via VNC or noVNC web interface
- Supervisor for process management
- Persistent storage for profiles and configurations
- Health checks and automatic restarts

## Prerequisites

- Docker and Docker Compose installed
- Multilogin account credentials
- For M1 Macs: Docker Desktop with Rosetta 2 emulation enabled

## Quick Start

1. **Set up your credentials:**

   Update your `.env` file with your Multilogin credentials:
   ```bash
   MULTILOGIN_EMAIL=your_email@example.com
   MULTILOGIN_PASSWORD=your_password
   VNC_PASSWORD=your_vnc_password
   ```

2. **Build the container:**
   ```bash
   ./docker-build.sh
   ```

   Or using docker-compose directly:
   ```bash
   docker compose build
   ```

3. **Run the container:**
   ```bash
   ./docker-run.sh
   ```

   Or using docker-compose:
   ```bash
   docker compose up -d
   ```

## Accessing Multilogin

Once the container is running, you can access Multilogin through:

### 1. Web Browser (noVNC) - Recommended
- Open: http://localhost:6080/vnc.html
- Click "Connect"
- Enter VNC password when prompted

### 2. VNC Client
- Connect to: `vnc://localhost:5900`
- Password: Your VNC_PASSWORD from .env

### 3. API Access
- Multilogin API: http://localhost:35000
- Automation Port: http://localhost:45001

### 4. Test API Connection
```bash
# List profiles
curl http://localhost:35000/api/v2/profile/list

# Check health
curl http://localhost:45001/health
```

## Using with Your Scrapers

### Quick Start

1. **Enable Docker mode in your `.env` file:**
   ```bash
   USE_LOCAL_DOCKER=true
   ```

2. **Run the test script:**
   ```bash
   node test-docker-multilogin.js
   ```

   This will verify:
   - Docker container is accessible
   - Authentication works
   - Browser profile can be launched
   - Screenshots can be captured

3. **Run your scrapers:**
   ```bash
   npm run multilogin
   ```

   The `Multilogin` utility class automatically detects `USE_LOCAL_DOCKER=true` and connects to:
   - API: `http://localhost:35000/api/v2`
   - Automation: `http://localhost:45001/api/v1`

### Switching Between Cloud and Docker

Your code automatically switches based on the `USE_LOCAL_DOCKER` environment variable:

- **Docker mode:** `USE_LOCAL_DOCKER=true` (uses localhost endpoints)
- **Cloud mode:** `USE_LOCAL_DOCKER=false` (uses cloud endpoints)

No code changes needed - just toggle the environment variable!

## Architecture Notes

### For M1/ARM64 Macs
The container uses x86_64 emulation via QEMU to run the Multilogin binary. This may impact performance but ensures compatibility.

### For Intel/AMD64 Systems
The container runs natively without emulation for optimal performance.

## Container Management

### View logs:
```bash
docker compose logs -f multilogin
```

### Stop the container:
```bash
docker compose down
```

### Remove all data and start fresh:
```bash
docker compose down -v
docker compose up -d
```

### Access container shell:
```bash
docker compose exec multilogin bash
```

## File Structure

- `Dockerfile` - Main container definition
- `docker-compose.yml` - Orchestration configuration
- `docker-entrypoint.sh` - Container initialization script
- `run.sh` - Multilogin startup script
- `supervisord.conf` - Process management configuration
- `docker-build.sh` - Helper script to build the container
- `docker-run.sh` - Helper script to run the container
- `.dockerignore` - Files to exclude from Docker context

## Ports

- `35000` - Multilogin API
- `45001` - Multilogin Automation
- `5900` - VNC Server
- `6080` - noVNC Web Interface

## Volumes

The following directories are persisted:
- `/root/.local/share/multilogin` - Multilogin profiles
- `/root/.config/multilogin` - Multilogin configuration
- `/opt/multilogin/profiles` - Additional profile storage
- `./data` - Your local data directory

## Troubleshooting

### Container won't start
1. Check logs: `docker compose logs multilogin`
2. Verify credentials in `.env` file
3. Ensure ports are not in use: `lsof -i :35000`

### Can't connect to VNC
1. Ensure VNC_PASSWORD is set in `.env`
2. Try the web interface instead: http://localhost:6080

### Multilogin not responding
1. Check if the process is running:
   ```bash
   docker compose exec multilogin ps aux | grep multilogin
   ```
2. Restart the container:
   ```bash
   docker compose restart multilogin
   ```

### Performance issues on M1 Mac
- This is expected due to x86_64 emulation
- Consider using a cloud VM or Intel-based system for production use

## Security Notes

- Change default VNC password in production
- Use strong Multilogin credentials
- Consider using a reverse proxy with SSL for remote access
- Restrict port access using firewall rules in production

## Support

For issues related to:
- Docker setup: Check this README and Docker logs
- Multilogin: Contact Multilogin support
- Scraper code: Check the main project README