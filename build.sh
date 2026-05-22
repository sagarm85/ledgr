#!/bin/bash

# Prevent Mac sleep
caffeinate &

# Start tmux session and run Claude
tmux new-session -d -s ledgr
tmux send-keys -t ledgr \
  'claude --dangerously-skip-permissions -p "$(cat PROMPT.md)" 2>&1 | tee build.log' \
  Enter

echo "Running. Lock your screen and walk away."
echo "Check later: tmux attach -t ledgr"
