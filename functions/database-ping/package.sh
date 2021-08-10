#!/usr/bin/env bash
set -e

if [[ -d 'dist' ]]; then
  rm -rf 'dist'
fi

mkdir 'dist'

pip install -r 'requirements.txt' -t 'dist'

cp AmazonRootCA1.pem 'dist/'
cp app.py 'dist/'

