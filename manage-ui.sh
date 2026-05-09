#!/bin/bash

# Project Directory
PROJECT_DIR="/home/dod/projects/Desktop Manager"
cd "$PROJECT_DIR"

# Ensure common paths are in PATH
export PATH=$PATH:/usr/local/bin:/usr/bin:/bin

PID_FILE="/tmp/desktop-manager.pid"

# Check if PID file exists and the process is alive
if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE" 2>/dev/null) 2>/dev/null; then
    # App is already running in the background -> instantly signal it to show
    kill -USR2 $(cat "$PID_FILE")
else
    # App is completely closed -> launch it from scratch
    npm run rocket > /dev/null 2>&1 &
fi

exit 0
