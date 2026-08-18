import { Module } from "@nestjs/common"
import { DatabaseModule } from "../database/database.module"
import { ChatHistoryController } from "./chat-history.controller"
import { ChatHistoryService } from "./chat-history.service"

@Module({
  imports: [DatabaseModule],
  controllers: [ChatHistoryController],
  providers: [ChatHistoryService],
})
export class ChatHistoryModule {}
