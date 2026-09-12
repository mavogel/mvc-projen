// import { SecretsManager } from "@aws-sdk/client-secrets-manager"; <- UNCOMMENT
// import { Secret } from "./crd-example"; // <- UNCOMMENT

// const secretsManager = new SecretsManager(); <- UNCOMMENT

// aws-cdk-lib's OnEventRequest/OnEventResponse (custom-resources/lib/provider-framework/types)
// aren't part of its public exports map, so they can't be imported directly -
// see https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/package.json.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (event: any): Promise<any> => {
  console.log('Event: %j', { ...event, ResponseURL: '...' });

  if (event.RequestType === 'Delete') {
    // do nothing
    return {};
  }

  // Create and update case
  // const secretArn = event.ResourceProperties.SecretArn; // <- UNCOMMENT

  try {
    // const secret = await secretsManager.getSecretValue({
    //   SecretId: secretArn,
    // });

    // const parsedSecretValue: Secret = JSON.parse(secretValue);
    // console.log("secretValue is JSON: %j", parsedSecretValue);

    // UNCOMMENT -^

    return {
      Data: {
        secretPasswordValue: 'secret-value', // parsedSecretValue.password, <- UNCOMMENT
      },
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
};
