/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Metadata } from '@grpc/grpc-js';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import type * as amqp from 'amqplib';
import { AccountServiceHandlers } from 'pb/account/AccountService';
import { UploadRequestDTO__Output } from 'pb/account/UploadRequestDTO';
import { FileServiceHandlers } from 'pb/file/FileService';
import { FilePartUpload__Output } from 'pb/queue/FilePartUpload';
import { Queues } from 'pb/queue/Queues';
import { Observable, ReplaySubject, firstValueFrom } from 'rxjs';
import { client } from './client';
import { FILE_MS_CLIENT, FilePartUpload, RABBITMQ_CLIENT } from './constant';
import { GrpcService } from './type';

@Injectable()
export class AppService implements OnModuleInit {
  @Inject(RABBITMQ_CLIENT)
  private readonly rabbitmqClient: amqp.Connection;

  @Inject(FILE_MS_CLIENT)
  private readonly file_ms_client: ClientGrpc;

  private accountServiceMS: GrpcService<AccountServiceHandlers>;
  private fileServiceMS: GrpcService<FileServiceHandlers>;

  onModuleInit() {
    this.accountServiceMS = this.file_ms_client.getService('AccountService');
    this.fileServiceMS = this.file_ms_client.getService('FileService');

    this.consume_file_part_upload();
  }

  async consume_file_part_upload() {
    const queue = Queues.FILE_PART_UPLOAD;
    const channel = await this.rabbitmqClient.createChannel();
    await channel.assertQueue(queue);

    channel.consume(queue, async (data) => {
      const { name, offset, size, _id } = FilePartUpload.decode(
        data.content,
      ) as unknown as FilePartUpload__Output;

      const account = await firstValueFrom(
        this.accountServiceMS.PickBySize({ value: size.toString() }),
      );

      const server_file_stream = await client.stream('upload/file/' + name, {
        searchParams: {
          start: offset,
          end: size,
        },
      });

      if (server_file_stream instanceof Error) {
        await firstValueFrom(
          this.accountServiceMS.IncreaseSize({ _id: account._id, size }),
        );
        channel.reject(data, false);
        return;
      }

      const grpc_request = new ReplaySubject<UploadRequestDTO__Output>();

      server_file_stream.on('data', async (data) => {
        grpc_request.next({ buffer: data });
      });

      server_file_stream.on('end', () => grpc_request.complete());

      server_file_stream.on('error', (err) => {
        console.log('filestream error', err);
        channel.reject(data, true);
        return;
      });

      const metadata = new Metadata();
      metadata.set('account', account._id);

      //@ts-ignore
      const { value: file_id } = await firstValueFrom(
        this.accountServiceMS.Upload(
          grpc_request,
          //@ts-ignore
          metadata,
        ) as Observable<any>,
      );

      const file_part = await firstValueFrom(
        this.fileServiceMS.CreateFilePart({
          _id,
          part: {
            id: file_id,
            name,
            offset,
            size,
            owner: account._id,
          },
        }),
      );

      console.log(file_part);

      channel.ack(data);
    });
  }
}
