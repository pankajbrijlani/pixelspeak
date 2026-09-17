#!/bin/bash
# Double-click this file in Finder to start PixelSpeak and open it in your
# browser. Leave the Terminal window it opens running in the background —
# closing that window (or pressing Ctrl+C in it) stops the app.

cd "$(dirname "$0")/.."

if curl -s -o /dev/null http://localhost:3000/login; then
  echo "PixelSpeak is already running — opening your browser."
  open http://localhost:3000/montage
  exit 0
fi

echo "Starting PixelSpeak..."
npm run dev &
DEV_PID=$!

echo "Waiting for it to be ready..."
for i in $(seq 1 60); do
  if curl -s -o /dev/null http://localhost:3000/login; then
    break
  fi
  sleep 1
done

open http://localhost:3000/montage

echo ""
echo "PixelSpeak is running at http://localhost:3000"
echo "Keep this window open while you use the app. Press Ctrl+C to stop it."
wait "$DEV_PID"
