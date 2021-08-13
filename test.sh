#!/usr/bin/env bash
set -e

INTERVAL_SEC=180
REQUEST_COUNT=2

usage () {
  echo 'usage:'
  echo " test.sh <endpoint>"
}

if [[ $1 == '' ]]
then
  usage
  echo 'Error: endpoint is required to be set'
  exit 1
fi

for i in $(seq $REQUEST_COUNT)
do
  printf "$(date) "
  curl "$1"
  printf '\n'

  if [[ $i -ne $REQUEST_COUNT ]]
  then
    sleep $INTERVAL_SEC
  fi
done