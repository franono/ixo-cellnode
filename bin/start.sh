#!/bin/bash

#green=`tput setaf 2`
echo "***********************************"
echo "* ELYSIAN START                   *"
echo "***********************************"
echo ""
CURRENT_DIR=`dirname $0`
ROOT_DIR=$CURRENT_DIR/..

TARGET_ENVIRONMENT="prod"

# prepare parameters from the AWS Parameter Store
export DB_USER="relayer"
export DB_PASSWORD="<new mongodb password>"
export MQ_USER="relayer"
export MQ_PASSWORD="<new RabbbitMQ password>"
export ASYMCYPHER="<add a random string here for Wallet encryption>"
export ASYMKEY="<add a random string here for Wallet encryption>"

export BLOCKCHAIN_URI_REST="http://<blocksync IP>/api/did/getByDid/"
export BLOCKSYNC_URI_REST="http://<blocksync IP>/api/"
export BLOCKCHAIN_REST="http://<REST server IP>:1317"
export NODEDID="<DID of Relayer>"

dbadmin="$ROOT_DIR/dbadmin"
echo "Check if ${dbadmin} dir present"
echo "Does ${dbadmin} exist? "
if [ -d "${dbadmin}" ]
then
  echo "YES"

  sed -i "s|%%ROOT%%|$ROOT|" "$dbadmin/create-admin-user.js"
  sed -i "s|%%PASSWORD%%|$DB_PASSWORD|" "$dbadmin/create-admin-user.js"
  sudo mv $dbadmin/create-admin-user.js $ROOT_DIR/db/

  sed -i "s|%%USER%%|$DB_USER|" "$dbadmin/create-elysian-user.js"
  sed -i "s|%%PASSWORD%%|$DB_PASSWORD|" "$dbadmin/create-elysian-user.js"
  sudo mv $dbadmin/create-elysian-user.js $ROOT_DIR/db/

  rm -rf ${dbadmin}
else
  echo "NO"
fi

echo "Pulling $TARGET_ENVIRONMENT images"
docker-compose -f "$ROOT_DIR/docker-compose.yml" -f "$ROOT_DIR/docker-compose.$TARGET_ENVIRONMENT.yml" up --no-start

# docker-compose create
docker-compose start db
docker-compose start mq
docker-compose start cache

# attempting to wait for mongodb to be ready
$ROOT_DIR/bin/wait-for-service.sh db 'waiting for connections on port' 10

if [ -f "$ROOT_DIR/db/create-admin-user.js" ]
then
  docker exec db mongo admin /data/db/create-admin-user.js
  docker exec db rm /data/db/create-admin-user.js
fi

if [ -f "$ROOT_DIR/db/create-elysian-user.js" ]
then
  docker exec db mongo elysian /data/db/create-elysian-user.js
  docker exec db rm /data/db/create-elysian-user.js
fi

# attempting to wait for rabbitmq to be ready
$ROOT_DIR/bin/wait-for-service.sh mq 'Server startup complete;' 10
docker-compose start pol
docker-compose start app
docker-compose start cli

echo -n "Starting Elysian ..."
sleep 5
echo ${green} "done"
docker-compose logs --tail 13 app
echo ""
echo "***********************************"
echo "* ELYSIAN START COMPLETE          *"
echo "***********************************"
docker-compose ps
# branch: dev
