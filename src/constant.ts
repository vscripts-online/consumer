import * as path from 'node:path';
import * as protobufjs from 'protobufjs';

export const RABBITMQ_CLIENT = Symbol('RABBITMQ_CLIENT');
export const FILE_MS_CLIENT = Symbol('FILE_MS_CLIENT');

export const PORT = process.env.PORT;
export const RABBITMQ_URI = process.env.RABBITMQ_URI;
export const FILE_MS_URI = process.env.FILE_MS_URI;
export const SERVER_URI = process.env.SERVER_URI;
export const AUTHORIZATION = process.env.AUTHORIZATION;

export const QUEUE_PROTO_PATH = path.resolve('./proto/queue.proto');
export const ACCOUNT_PROTO_PATH = path.resolve('./proto/account.proto');
export const FILE_PROTO_PATH = path.resolve('./proto/file.proto');

const queue_root = protobufjs.loadSync(QUEUE_PROTO_PATH);
export const FilePartUpload = queue_root.lookupType('queue.FilePartUpload');
