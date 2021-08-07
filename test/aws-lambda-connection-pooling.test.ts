import * as cdk from 'aws-cdk-lib';
import * as AwsLambdaConnectionPooling from '../lib/aws-lambda-connection-pooling-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new AwsLambdaConnectionPooling.AwsLambdaConnectionPoolingStack(app, 'MyTestStack');
    // THEN
    const actual = app.synth().getStackArtifact(stack.artifactId).template;
    expect(actual.Resources ?? {}).toEqual({});
});
