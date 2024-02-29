import got from 'got';
import { AUTHORIZATION, SERVER_URI } from './constant';

export const client = got.extend({
  prefixUrl: SERVER_URI,
  headers: {
    authorization: 'Bearer ' + AUTHORIZATION,
  },
});
