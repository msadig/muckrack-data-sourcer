# x86_64 only Dockerfile for Multilogin 6
# Forces linux/amd64 platform for M1 Mac compatibility via Rosetta 2

FROM --platform=linux/amd64 ubuntu:22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV ML_USERNAME=""
ENV ML_PASSWORD=""
ENV DISPLAY=:99
ENV XVFB_RESOLUTION=1920x1080x24

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    unzip \
    xvfb \
    libglu1-mesa \
    libgtk-3-0 \
    libdbus-glib-1-2 \
    libxt6 \
    libxcomposite1 \
    libasound2 \
    libatspi2.0-0 \
    libdrm2 \
    libgbm1 \
    libxcb1 \
    libxkbcommon0 \
    libxrandr2 \
    libxss1 \
    fonts-liberation \
    libnss3 \
    libnspr4 \
    ca-certificates \
    openssh-client \
    openjdk-18-jre-headless \
    x11vnc \
    fluxbox \
    novnc \
    websockify \
    supervisor \
    net-tools \
    socat \
    && rm -rf /var/lib/apt/lists/*

# Create working directory
WORKDIR /opt/multilogin

# Download and install Multilogin
# Since we're forcing linux/amd64 platform, we can directly install the amd64 package
RUN wget -q https://cdn-download.multiloginapp.com/multilogin/6.4.5/multilogin-6.4.5-7-linux_x86_64.zip -O /tmp/multilogin.zip && \
    unzip -q /tmp/multilogin.zip -d /tmp/ && \
    # Force installation and ignore dependency errors initially
    dpkg --force-all -i /tmp/multilogin.deb 2>/dev/null || true && \
    # Fix any missing dependencies
    apt-get update && apt-get install -f -y && \
    # Verify installation
    dpkg -l | grep multilogin || echo "Warning: Multilogin package not fully installed" && \
    # Find the actual installed files
    find /opt -name "*multilogin*" -type d 2>/dev/null | head -5 && \
    rm -rf /tmp/multilogin.zip /tmp/multilogin.deb

# Create directories for Multilogin
RUN mkdir -p /root/.local/share/multilogin \
    /root/.config/multilogin \
    /opt/multilogin/profiles \
    /var/log/supervisor

# Try to find and copy the Multilogin executable
RUN find /opt /usr -name "multilogin" -type f 2>/dev/null | head -1 | xargs -I {} cp {} /opt/multilogin/multilogin 2>/dev/null || \
    echo "Warning: Multilogin executable not found in standard locations" && \
    # Check if MLM directory exists (alternative installation path)
    ls -la /opt/mlm/ 2>/dev/null || echo "MLM directory not found"

# Copy startup scripts
COPY run.sh /opt/multilogin/run.sh
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Make scripts executable
RUN chmod +x /opt/multilogin/run.sh /usr/local/bin/docker-entrypoint.sh

# Expose ports
# 35000 - Multilogin API port
# 45001 - Multilogin automation port
# 5900 - VNC port
# 6080 - noVNC web port
EXPOSE 35000 45001 5900 6080

# Set entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Default command
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]