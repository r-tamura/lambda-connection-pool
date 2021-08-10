#!/usr/bin/env bash
set -e

INTERVAL_SEC=180
REQUEST_COUNT=2

for i in $(seq $REQUEST_COUNT)
do
  printf "$(date) "
  curl https://aamhyi19dh.execute-api.us-east-1.amazonaws.com/prod/
  printf '\n'

  if [[ $i -ne $REQUEST_COUNT ]]
  then
    sleep $INTERVAL_SEC
  fi
done