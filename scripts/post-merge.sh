#!/bin/bash
set -e

echo "[post-merge] Installing root dependencies..."
npm install --legacy-peer-deps

echo "[post-merge] Installing mobile-app dependencies..."
cd mobile-app && npm install --legacy-peer-deps && cd ..

echo "[post-merge] Done."
