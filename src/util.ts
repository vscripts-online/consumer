import * as crypto from 'node:crypto';

export function generateEncodedVerifyCode(
  id: number,
  code: number,
  secret: string,
) {
  const signature = crypto
    .createHmac('md5', secret)
    .update(id + '|' + code)
    .digest('base64url');

  const data = id.toString(36) + '|' + code.toString(36) + '|' + signature;
  return Buffer.from(data).toString('base64url');
}
