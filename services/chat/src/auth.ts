import { CognitoJwtVerifier } from 'aws-jwt-verify';

/**
 * CloudFront signs origin requests with SigV4 (OAC), which occupies the Authorization header, so the browser sends
 * its Cognito access token in X-Auth-Token. The function URL only accepts IAM-signed calls from our distribution;
 * this check identifies the end user.
 */
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID!,
  clientId: process.env.USER_POOL_CLIENT_ID!,
  tokenUse: 'access',
});

export interface User { sub: string; username: string }

export async function authenticate(headers: Record<string, string | undefined>): Promise<User | null> {
  const token = headers['x-auth-token'];
  if (!token) return null;
  try {
    const p = await verifier.verify(token);
    return { sub: p.sub, username: String(p.username ?? p.sub) };
  } catch {
    return null;
  }
}
