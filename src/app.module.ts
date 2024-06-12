import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import * as amqp from 'amqplib';
import { AppService } from './app.service';
import {
  FILE_MS_CLIENT,
  FILE_MS_URI,
  FILE_PROTO_PATH,
  RABBITMQ_CLIENT,
  RABBITMQ_URI,
} from './constant';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: FILE_MS_CLIENT,
        transport: Transport.GRPC,
        options: {
          url: FILE_MS_URI,
          package: ['file', 'account'],
          protoPath: FILE_PROTO_PATH,
          loader: {
            keepCase: true,
            enums: String,
          },
        },
      },
    ]),
  ],
  controllers: [],
  providers: [
    {
      provide: RABBITMQ_CLIENT,
      useFactory: async () => {
        const conn = await amqp.connect(RABBITMQ_URI);
        console.log('Connected to rabbitmq');
        return conn;
      },
    },
    AppService,
  ],
})
export class AppModule {}
