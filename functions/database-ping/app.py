import json
import os
import typing as t

import boto3
import sqlalchemy
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.utilities.typing import LambdaContext

SERVICE = "lambda-connection-pooling-demo"
logger = Logger(service=SERVICE)
tracer = Tracer(service=SERVICE)

# https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-output-format
class LambdaProxyIntegrationResponse(t.TypedDict, total=False):
    statusCode: int
    body: str
    headers: t.Dict[str, t.Any]

DB_USER_SECRET_NAME = os.environ.get("DB_USER_SECRET_NAME")
DB_HOST = os.environ.get("DB_HOST")
# DB_USER = os.environ.get("DB_USER", "admin")
# DB_PORT = os.environ.get("DB_PORT", 3306)
assert DB_USER_SECRET_NAME is not None
assert DB_HOST is not None

secrentsmanager = boto3.client(service_name='secretsmanager')
get_secret_value_response = secrentsmanager.get_secret_value(SecretId=DB_USER_SECRET_NAME)
secret = json.loads(get_secret_value_response["SecretString"])
db_user = secret["username"]
db_password = secret["password"]
db_host = DB_HOST or secret["host"]
db_port = secret["port"]

# TODO: IAM based authentication
# rds = boto3.client("rds")
# token = rds.generate_db_auth_token(DBHostname=DB_HOST, Port=DB_PORT, DBUsername=DB_USER)
# print(f"token: {token}")

# Using ssl https://docs.sqlalchemy.org/en/14/dialects/mysql.html#ssl-connections
url = f"mysql+pymysql://{db_user}:{db_password}@{db_host}:{db_port}/"
engine = sqlalchemy.create_engine(
    url,
    connect_args={
        "ssl": {
            "ssl_ca": "./AmazonRootCA1.pem",
        }
    }
)

@tracer.capture_lambda_handler
def handler(event, context: LambdaContext) -> LambdaProxyIntegrationResponse:
    logger.debug("connecting to db...")
    with engine.connect() as connection:
        try:
            connection.execute(sqlalchemy.text("select 5"))
        except Exception as e:
            logger.error("An error occured:")
            print(e)
            return {
                "statusCode": 200,
                "body": json.dumps({
                    "state": "ERROR",
                    "message": f"response from '{context.log_stream_name}'"
                })
            }


    return {
        "statusCode": 200,
        "body": json.dumps({
            "state": "SUCCESS",
            "message": f"response from '{context.log_stream_name}'"
        })
    }
