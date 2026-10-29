# AWS deployment candidate

Target: Node 22 API container on private ECS/Fargate behind an internal HTTPS ALB. The container has no persistent storage or application AWS permissions. The execution role can pull ECR images, write logs and read the one existing API-token secret. This deployment definition has not yet been exercised in an AWS account; source/build tests are not AWS acceptance evidence.

Prerequisites: selected account/region, existing VPC and at least two private subnets with NAT or ECR/S3/CloudWatch/Secrets Manager endpoints, ECR repository, ACM certificate/internal DNS name, existing raw API token in Secrets Manager, and an explicit allowed client CIDR. A customer-managed KMS key additionally requires scoped `kms:Decrypt` on the execution role. Do not put secret values into Git, CLI parameter files or issue comments.

Build and push from the repository root using the organization's normal ECR login:

```sh
docker build -f deploy/Dockerfile -t "$IMAGE_URI" .
docker push "$IMAGE_URI"
# Record the immutable image digest, not a mutable latest tag.
aws cloudformation validate-template --template-body file://deploy/aws/fargate.json
aws cloudformation deploy --stack-name geotechniek-core --template-file deploy/aws/fargate.json \
  --capabilities CAPABILITY_IAM --parameter-overrides \
  VpcId="$VPC_ID" PrivateSubnets="$PRIVATE_SUBNETS" ClientCidr="$CLIENT_CIDR" \
  ImageUri="$IMAGE_DIGEST_URI" ApiTokenSecretArn="$TOKEN_SECRET_ARN" TlsCertificateArn="$TLS_CERTIFICATE_ARN"
```

Connect an internal DNS record matching the supplied TLS certificate to the returned ALB DNS name. From the allowed private client network, run:

```sh
OGS_BASE_URL=https://your.internal.name OGS_API_TOKEN="$EXISTING_TOKEN" node deploy/aws/smoke.mjs
```

The smoke test requires valid TLS, checks unauthenticated denial, version and the independent 20 mm settlement example. Record stack ID, account/region, image digest, version, smoke output and ECS task health in the release evidence. CloudWatch logs contain startup information; no source files or tokens are logged. Roll back by deploying the previous image digest. Stack deletion removes the service/ALB/roles; the pre-existing token, VPC and ECR repository are outside the stack.

References: [Fargate private networking](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/vpc-endpoints.html), [task execution role](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html).
