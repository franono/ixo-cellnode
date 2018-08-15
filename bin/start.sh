#!/bin/bash

#green=`tput setaf 2`
echo "***********************************"
echo "* ELYSIAN START                   *"
echo "***********************************"
echo ""
CURRENT_DIR=`dirname $0`
ROOT_DIR=$CURRENT_DIR/..

if [ "$1" = "dev" ]
then
  echo "Building Developer images"

  if [[ ! -f $ROOT_DIR/docker-compose.dev.yml  ]] ; then
      echo 'It appears as if you are trying to run in local development mode without a docker-compose.dev.yml. Make a copy of docker-compose.uat.yml, rename it and adapt it as neccesary. BUT NEVER CHECK IT IN!'
      exit
  fi

  $ROOT_DIR/node_modules/typescript/bin/tsc

  docker build -t trustlab/ixo-elysian $ROOT_DIR
  docker-compose -f $ROOT_DIR/docker-compose.yml -f $ROOT_DIR/docker-compose.dev.yml up --no-start
elif [ "$1" = "uat" ]; then
  echo "Running with UAT config"

  docker-compose -f $ROOT_DIR/docker-compose.yml -f $ROOT_DIR/docker-compose.uat.yml up --no-start
else
  echo "Pulling Production images"
  docker-compose -f $ROOT_DIR/docker-compose.yml -f $ROOT_DIR/docker-compose.prod.yml up --no-start
fi

# docker-compose create
docker-compose start db
docker-compose start mq
docker-compose start cache

# attempting to wait for mongodb to be ready
$ROOT_DIR/bin/wait-for-service.sh db 'waiting for connections on port' 10
# attempting to wait for rabbitmq to be ready
$ROOT_DIR/bin/wait-for-service.sh mq 'Server startup complete;' 10
docker-compose start pol
docker-compose start app


echo -n "Starting Elysian ..."
sleep 5
echo ${green} "done"
docker-compose logs --tail 13 app
echo ""
echo "***********************************"
echo "* ELYSIAN START COMPLETE          *"
echo "***********************************"
docker-compose ps