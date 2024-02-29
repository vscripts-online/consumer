import type * as grpc from '@grpc/grpc-js';
import { Observable } from 'rxjs';

type GetResponseType<Type> =
  Type extends grpc.handleUnaryCall<unknown, infer Z> ? Observable<Z> : any;

type GetRequestType<Type> =
  Type extends grpc.handleUnaryCall<infer X, unknown> ? X : null;

export type GrpcService<T extends grpc.UntypedServiceImplementation> = {
  [K in keyof T]: (data: GetRequestType<T[K]>) => GetResponseType<T[K]>;
};
