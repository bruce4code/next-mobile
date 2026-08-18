import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common"
import { CreateDocumentSchema, DocumentQuerySchema, UpdateDocumentSchema } from "@ai-arg/contracts"
import type { AuthenticatedUser } from "../auth/auth.types"
import { CurrentUser } from "../auth/current-user.decorator"
import { DocumentsService } from "./documents.service"

@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  async listDocuments(@CurrentUser() user: AuthenticatedUser, @Query() queryParams: unknown) {
    let query
    try {
      query = DocumentQuerySchema.parse(queryParams)
    } catch (error) {
      throw new BadRequestException({ error: "请求参数校验失败", details: error })
    }

    return this.documents.list(user.id, query)
  }

  @Get(":id")
  async getDocument(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    const doc = await this.documents.get(user.id, id)
    if (!doc) {
      throw new NotFoundException({ error: "文档不存在" })
    }
    return doc
  }

  @Post()
  async createDocument(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    let data
    try {
      data = CreateDocumentSchema.parse(body)
    } catch (error) {
      throw new BadRequestException({ error: "请求参数校验失败", details: error })
    }

    return this.documents.create(user.id, data)
  }

  @Put(":id")
  async updateDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    let data
    try {
      data = UpdateDocumentSchema.parse(body)
    } catch (error) {
      throw new BadRequestException({ error: "请求参数校验失败", details: error })
    }

    const doc = await this.documents.update(user.id, id, data)
    if (!doc) {
      throw new NotFoundException({ error: "文档不存在" })
    }
    return doc
  }

  @Delete(":id")
  async deleteDocument(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    const deleted = await this.documents.delete(user.id, id)
    if (!deleted) {
      throw new NotFoundException({ error: "文档不存在" })
    }
    return { success: true }
  }
}
