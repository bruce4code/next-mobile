import { Module } from "@nestjs/common"
import { DatabaseModule } from "../database/database.module"
import { RetrievalModule } from "../retrieval/retrieval.module"
import { ChatController } from "./chat.controller"
import { ChatService } from "./chat.service"

@Module({
  imports: [DatabaseModule, RetrievalModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
