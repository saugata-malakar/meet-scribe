#!/bin/bash
set -e

# Start Xvfb for Playwright
Xvfb :99 -screen 0 1280x720x24 -ac &
export DISPLAY=:99

# Tailscale setup for IP bypass
if [ -n "${TAILSCALE_AUTH_KEY}" ]; then
  echo "Tailscale auth key detected. Starting Tailscale userspace proxy..."
  
  # Start the daemon in userspace mode and expose a SOCKS5 proxy
  tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &
  
  # Wait a moment for daemon to boot
  sleep 3
  
  # Connect to the Tailnet using the provided auth key
  if [ -n "${TAILSCALE_EXIT_NODE_IP}" ]; then
    echo "Connecting to Tailnet and routing through exit node ${TAILSCALE_EXIT_NODE_IP}..."
    tailscale up --authkey="${TAILSCALE_AUTH_KEY}" --hostname=meet-scribe-bot --exit-node="${TAILSCALE_EXIT_NODE_IP}"
  else
    echo "Connecting to Tailnet..."
    tailscale up --authkey="${TAILSCALE_AUTH_KEY}" --hostname=meet-scribe-bot
  fi
  
  echo "Tailscale connected. Bot traffic will be routed through the SOCKS5 proxy."
  export PROXY_URL="socks5://localhost:1055"
fi

echo "Starting Next.js..."
exec npx next start -H 0.0.0.0 -p ${PORT:-10000}
