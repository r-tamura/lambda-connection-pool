import {
  aws_apigateway as apigateway,
  aws_ec2 as ec2,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_rds as rds,
  aws_secretsmanager as secretsmanager,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

const CODE_DIR = path.join(
  __dirname,
  "..",
  "functions",
  "database-ping",
  "dist"
);

export class AwsLambdaConnectionPoolingStack extends Stack {
  readonly vpc: ec2.IVpc;
  readonly database: rds.IDatabaseInstance;
  readonly databaseProxy: rds.IDatabaseProxy;
  readonly api: apigateway.IRestApi;
  readonly databaseSecret: secretsmanager.ISecret;
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    this.vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "nat", cidrMask: 24, subnetType: ec2.SubnetType.PUBLIC },
        { name: "app", cidrMask: 24, subnetType: ec2.SubnetType.PRIVATE },
        { name: "database", cidrMask: 24, subnetType: ec2.SubnetType.ISOLATED },
      ],
    });

    const database = new rds.DatabaseInstance(this, "Database", {
      vpc: this.vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.SMALL
      ),
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_5_7_33,
      }),
      subnetGroup: new rds.SubnetGroup(this, "DatabaseSubnetGroup", {
        vpc: this.vpc,
        description: "vpc subnet group for connection pooling demo",
        vpcSubnets: this.vpc.selectSubnets({
          subnetType: ec2.SubnetType.ISOLATED,
        }),
      }),
    });

    if (database.secret === undefined) {
      throw Error("database secret is required to be sed");
    }
    this.databaseSecret = database.secret;

    const { applicationSecurityGroup, proxySecurityGroup } =
      this.grantAppToConnectToProxy();
    this.databaseProxy = new rds.DatabaseProxy(this, "DatabaseProxy", {
      vpc: this.vpc,
      proxyTarget: rds.ProxyTarget.fromInstance(database),
      secrets: [database.secret],
      securityGroups: [proxySecurityGroup],
      idleClientTimeout: Duration.minutes(1),
    });

    this.createApp({ applicationSecurityGroup });
  }

  private createApp(params: { applicationSecurityGroup: ec2.ISecurityGroup }) {
    const dbConnectHandler = new lambda.Function(this, "AppFunction", {
      code: lambda.Code.fromAsset(CODE_DIR),
      handler: "app.handler",
      runtime: lambda.Runtime.PYTHON_3_8,
      vpc: this.vpc,
      vpcSubnets: this.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE,
      }),
      securityGroups: [params.applicationSecurityGroup],
      tracing: lambda.Tracing.ACTIVE,
      timeout: Duration.seconds(60),
      environment: {
        DB_USER_SECRET_NAME: this.databaseSecret.secretName,
        DB_HOST: this.databaseProxy.endpoint,
      },
      reservedConcurrentExecutions: 1,
    });
    const liveAlias = dbConnectHandler.currentVersion.addAlias("live", {
      provisionedConcurrentExecutions: 1,
    });

    new logs.LogGroup(this, "HandlerLogGroup", {
      logGroupName: `/aws/lambda/${dbConnectHandler.functionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.databaseSecret.grantRead(dbConnectHandler);
    this.databaseProxy.grantConnect(dbConnectHandler);

    const api = new apigateway.RestApi(this, "AppRestApi", {
      deployOptions: {
        dataTraceEnabled: true,
      },
    });

    // TODO: Lambda関数へのルーティング
    api.root.addMethod("GET", new apigateway.LambdaIntegration(liveAlias));

    new CfnOutput(this, "ApiEndpoint", { value: api.url });
  }

  private grantAppToConnectToProxy() {
    const applicationSecurityGroup = new ec2.SecurityGroup(
      this,
      "AppSecurityGroup",
      { vpc: this.vpc }
    );
    const proxySecurityGroup = new ec2.SecurityGroup(
      this,
      "ProxySecurityGroup",
      { vpc: this.vpc }
    );
    proxySecurityGroup.addIngressRule(
      applicationSecurityGroup,
      ec2.Port.tcp(3306),
      "Allows the app to access to the database"
    );
    return {
      applicationSecurityGroup,
      proxySecurityGroup,
    };
  }
}
