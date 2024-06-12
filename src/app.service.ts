/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Metadata } from '@grpc/grpc-js';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import type * as amqp from 'amqplib';
import { HTTPError } from 'got';
import * as nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { AccountServiceHandlers } from 'pb/account/AccountService';
import { UploadRequestDTO__Output } from 'pb/account/UploadRequestDTO';
import { UploadResponseDTO__Output } from 'pb/account/UploadResponseDTO';
import { FilePart__Output } from 'pb/file/FilePart';
import { FileServiceHandlers } from 'pb/file/FileService';
import { FilePartUpload__Output } from 'pb/queue/FilePartUpload';
import { Queues } from 'pb/queue/Queues';
import { Observable, ReplaySubject, firstValueFrom } from 'rxjs';
import { client } from './client';
import {
  FILE_MS_CLIENT,
  FilePart,
  FilePartUpload,
  MAIL_PASS,
  MAIL_SECURE,
  MAIL_SMTP_HOST,
  MAIL_SMTP_PORT,
  MAIL_USER,
  RABBITMQ_CLIENT,
} from './constant';
import { GrpcService } from './type';

@Injectable()
export class AppService implements OnModuleInit {
  @Inject(RABBITMQ_CLIENT)
  private readonly rabbitmqClient: amqp.Connection;

  @Inject(FILE_MS_CLIENT)
  private readonly file_ms_client: ClientGrpc;

  private accountServiceMS: GrpcService<AccountServiceHandlers>;
  private fileServiceMS: GrpcService<FileServiceHandlers>;

  private transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;

  onModuleInit() {
    this.accountServiceMS = this.file_ms_client.getService('AccountService');
    this.fileServiceMS = this.file_ms_client.getService('FileService');

    this.transporter = nodemailer.createTransport({
      host: MAIL_SMTP_HOST,
      port: parseInt(MAIL_SMTP_PORT),
      secure: Boolean(MAIL_SECURE),
      auth: {
        user: MAIL_USER,
        pass: MAIL_PASS,
      },
    });

    this.file_part_upload();
    this.delete_file();
  }

  async file_part_upload() {
    const queue = Queues.FILE_PART_UPLOAD;
    const channel = await this.rabbitmqClient.createChannel();
    await channel.assertQueue(queue);
    channel.prefetch(1);

    channel.consume(queue, async (data) => {
      console.log('consume consume_file_part_upload');
      const message = FilePartUpload.decode(data.content);

      const object = FilePartUpload.toObject(message, {
        longs: String,
        enums: String,
      }) as FilePartUpload__Output;

      const { name, offset, size, _id, last } = object;

      // CHECK IS FILE DELETED
      const { files } = await firstValueFrom(
        this.fileServiceMS.GetFiles({
          where: { _id },
          limit: { limit: 1, skip: 0 },
        }),
      );

      if (files?.length === 0) {
        console.log('FILE IS DELETED', _id);
        channel.reject(data, false);
        return;
      }

      const account = await firstValueFrom(
        this.accountServiceMS.PickBySize({ value: size.toString() }),
      );

      const end = parseInt(offset) + parseInt(size);
      const path = `upload/file/${name}?start=${offset}&end=${end}`;
      console.log('path', path);

      const server_file_stream = await client.stream(path);

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

      server_file_stream.on('error', async (err) => {
        const not_found =
          err instanceof HTTPError &&
          err.message === 'Response code 404 (Not Found)';

        await firstValueFrom(
          this.accountServiceMS.IncreaseSize({ _id: account._id, size }),
        );

        if (not_found) {
          // await firstValueFrom(this.queueServiceMS.DeleteFile({ value: _id }));
          // console.log(_id, 'deleted');
          console.log('Real file not found');
          channel.reject(data, false);
          return;
        }

        console.log('filestream error', err);
        channel.reject(data, true);
        return;
      });

      const metadata = new Metadata();
      metadata.set('account', account._id);

      //@ts-ignore
      const { file_id, name: file_name } = await firstValueFrom(
        this.accountServiceMS.Upload(
          grpc_request,
          //@ts-ignore
          metadata,
        ) as Observable<UploadResponseDTO__Output>,
      );

      const file_part = await firstValueFrom(
        this.fileServiceMS.CreateFilePart({
          _id,
          part: {
            id: file_id,
            name: file_name,
            offset,
            size,
            owner: account._id,
          },
        }),
      );

      if (!file_part.value) {
        console.log('file_part_upload failed');
        this.file_delete({
          id: file_id,
          name,
          offset,
          owner: account._id,
          size,
        });
      }

      file_part.value && console.log('file_part_upload success');

      if (last) {
        try {
          await client.delete(`upload/file/${_id}`);
        } catch (error) {}
      }

      channel.ack(data);
    });
  }

  async delete_file() {
    const queue = Queues.DELETE_FILE;
    const channel = await this.rabbitmqClient.createChannel();
    await channel.assertQueue(queue);
    channel.prefetch(1);

    channel.consume(queue, async (data) => {
      console.log('consume delete_file');
      const message = FilePart.decode(data.content);

      const object = FilePart.toObject(message, {
        longs: String,
        enums: String,
      }) as FilePart__Output;

      try {
        this.file_delete(object);
        channel.ack(data);
      } catch (error) {
        channel.reject(data, true);
      }
    });
  }

  private async file_delete(object: FilePart__Output) {
    const { name, offset, size, id, owner } = object;

    const deleted = await firstValueFrom(
      this.fileServiceMS.DeleteFileFromStorage({
        id,
        name,
        offset,
        owner,
        size,
      }),
    );

    if (!deleted.value) {
      throw new Error('Could not deleted');
    }

    console.log('file_delete success');

    return true;
  }
}
