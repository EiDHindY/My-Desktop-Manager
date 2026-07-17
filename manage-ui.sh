#!/bin/bash

# Project Directory
PROJECT_DIR="/home/dod/Projects/My_Desktop_Manager"
ELECTRON_BIN="$PROJECT_DIR/electron_ui/node_modules/.bin/electron"
APP_DIR="$PROJECT_DIR/electron_ui"

# Ensure common paths are in PATH
export PATH=$PATH:/usr/local/bin:/usr/bin:/bin

# Source NVM to ensure npm and node are available to the Electron app
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

PID_FILE="/tmp/desktop-manager.pid"

# Check if PID file exists and the process is alive
if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE" 2>/dev/null) 2>/dev/null; then
    # App is already running in the background -> instantly signal it to show
    env > /tmp/manage-ui-env.log
    kill -USR2 $(cat "$PID_FILE")
else
    # App is completely closed -> launch it directly (bypass npm for speed)
    "$ELECTRON_BIN" --class=DesktopManager "$APP_DIR" > /dev/null 2>&1 &
fi

exit 0
