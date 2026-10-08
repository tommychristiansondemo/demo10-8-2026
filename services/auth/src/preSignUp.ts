import type { PreSignUpTriggerHandler } from 'aws-lambda';

/** Class-friendly sign-up: confirm the account and mark the email verified without sending a code. */
export const handler: PreSignUpTriggerHandler = async (event) => {
  event.response.autoConfirmUser = true;
  if (event.request.userAttributes.email) event.response.autoVerifyEmail = true;
  return event;
};
