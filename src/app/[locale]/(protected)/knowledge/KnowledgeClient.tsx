'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Plus, Edit, Trash2, Search, BookOpen, FileText, HelpCircle, Package, Tag, Upload } from 'lucide-react'
import { toast } from "sonner"

interface Document {
  id: string
  title: string
  content: string
  contentType: string
  category?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
  similarity?: number
  status: 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED'
  version: number
  sourceType: string
  sourceName?: string
  sourceUri?: string
  lastIndexedAt?: string
  ingestionError?: string
}

const CATEGORIES = [
  { value: 'product', label: '产品', icon: Package },
  { value: 'faq', label: '常见问题', icon: HelpCircle },
  { value: 'policy', label: '政策', icon: FileText },
  { value: 'order', label: '订单', icon: BookOpen },
  { value: 'promotion', label: '促销', icon: Tag },
  { value: 'review', label: '评价', icon: HelpCircle },
]

export function KnowledgePageClient() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingDoc, setEditingDoc] = useState<Document | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [newDoc, setNewDoc] = useState({
    title: '',
    content: '',
    contentType: 'text',
    category: 'faq',
    sourceType: 'inline',
    sourceName: '',
  })

  useEffect(() => {
    fetchDocuments()
  }, [selectedCategory]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDocuments = async (background = false) => {
    try {
      if (!background) setIsLoading(true)
      const params = new URLSearchParams()
      if (selectedCategory !== 'all') {
        params.set('category', selectedCategory)
      }
      
      const response = await fetch(`/api/documents?${params.toString()}`, { cache: 'no-store' })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`获取文档失败: ${response.status} - ${errorText}`)
      }
      
      const data = await response.json()
      setDocuments(data)
    } catch (error) {
      toast.error(`获取文档失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      if (!background) setIsLoading(false)
    }
  }

  useEffect(() => {
    const hasActiveIngestion = documents.some((document) =>
      document.status === 'QUEUED' || document.status === 'PROCESSING'
    )
    if (!hasActiveIngestion) return

    const timer = window.setTimeout(() => fetchDocuments(true), 2_500)
    return () => window.clearTimeout(timer)
  }, [documents, selectedCategory]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    
    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(newDoc),
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`添加文档失败: ${response.status} - ${errorText}`)
      }
      
      await response.json()
      toast.success('文档已进入处理队列')
      setIsAddDialogOpen(false)
      setNewDoc({
        title: '',
        content: '',
        contentType: 'text',
        category: 'faq',
        sourceType: 'inline',
        sourceName: '',
      })
      fetchDocuments()
    } catch (error) {
      toast.error(`添加文档失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const content = await file.text()
      const title = file.name.replace(/\.(md|markdown)$/i, '')
      setNewDoc({
        ...newDoc,
        title,
        content,
        contentType: 'markdown',
        sourceType: 'upload',
        sourceName: file.name,
      })
      toast.success(`已加载文件: ${file.name}`)
    } catch {
      toast.error('读取文件失败')
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleEditDocument = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingDoc) return
    
    setIsSaving(true)
    
    try {
      const response = await fetch(`/api/documents?id=${editingDoc.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          title: editingDoc.title,
          content: editingDoc.content,
          contentType: editingDoc.contentType,
          category: editingDoc.category,
        }),
      })
      
      if (!response.ok) throw new Error('更新文档失败')
      
      toast.success('文档更新已进入处理队列')
      setIsEditDialogOpen(false)
      setEditingDoc(null)
      fetchDocuments()
    } catch (error) {
      console.error('更新文档失败:', error)
      toast.error('更新文档失败')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteDocument = async (id: string) => {
    if (!confirm('确定要删除这个文档吗？')) return
    
    try {
      const response = await fetch(`/api/documents?id=${id}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) throw new Error('删除文档失败')
      
      toast.success('文档删除成功')
      fetchDocuments()
    } catch (error) {
      console.error('删除文档失败:', error)
      toast.error('删除文档失败')
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      fetchDocuments()
      return
    }
    
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      params.set('search', searchQuery)
      if (selectedCategory !== 'all') {
        params.set('category', selectedCategory)
      }
      
      const response = await fetch(`/api/documents?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('搜索失败')
      const data = await response.json()
      setDocuments(data)
    } catch {
      toast.error('搜索失败')
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const getCategoryBadge = (category?: string) => {
    const cat = CATEGORIES.find(c => c.value === category)
    if (!cat) return <Badge variant="outline">未分类</Badge>
    
    const Icon = cat.icon
    return (
      <Badge variant="secondary" className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {cat.label}
      </Badge>
    )
  }

  const getStatusBadge = (document: Document) => {
    const labels = {
      QUEUED: '排队中',
      PROCESSING: '处理中',
      READY: '可检索',
      FAILED: '处理失败',
    }
    const variant = document.status === 'FAILED'
      ? 'destructive'
      : document.status === 'READY'
        ? 'secondary'
        : 'outline'

    return (
      <Badge variant={variant} title={document.ingestionError || undefined}>
        {labels[document.status]}
      </Badge>
    )
  }

  const filteredDocuments = documents

  if (isLoading) {
    return (
      <div className="min-h-full bg-background/60 backdrop-blur-sm flex items-center justify-center transition-all duration-300">
        <div
          className="opacity-0 scale-95"
          style={{ animation: 'appear 0.25s ease-out 0.2s forwards' }}
        >
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">知识库管理</h1>
            <p className="text-muted-foreground mt-1">管理和搜索你的知识库文档</p>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  添加文档
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
                <form onSubmit={handleAddDocument} className="flex flex-col flex-1 overflow-hidden">
                  <DialogHeader className="flex-shrink-0">
                    <DialogTitle>添加新文档</DialogTitle>
                    <DialogDescription>
                      添加新的文档到你的知识库中
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex-1 overflow-y-auto px-1 pr-2">
                    <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">标题</Label>
                      <Input
                        id="title"
                        value={newDoc.title}
                        onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
                        placeholder="输入文档标题"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="category">分类</Label>
                        <Select
                          value={newDoc.category}
                          onValueChange={(value) => setNewDoc({ ...newDoc, category: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择分类" />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((cat) => (
                              <SelectItem key={cat.value} value={cat.value}>
                                {cat.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contentType">内容类型</Label>
                        <Select
                          value={newDoc.contentType}
                          onValueChange={(value) => setNewDoc({ ...newDoc, contentType: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择类型" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">纯文本</SelectItem>
                            <SelectItem value="markdown">Markdown</SelectItem>
                            <SelectItem value="pdf">PDF</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label>内容</Label>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".md,.markdown"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground gap-1"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload className="w-3 h-3" />
                          上传MD文件
                        </Button>
                      </div>
                      <Textarea
                        id="content"
                        value={newDoc.content}
                        onChange={(e) => setNewDoc({ ...newDoc, content: e.target.value })}
                        placeholder="手动输入内容，或点击「上传MD文件」自动填充"
                        className="h-[300px] resize-none"
                        required
                      />
                    </div>
                  </div>
                  </div>
                  <DialogFooter className="flex-shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddDialogOpen(false)}
                      disabled={isSaving}
                    >
                      取消
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                      {isSaving ? '添加中...' : '添加文档'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="搜索文档..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-10"
            />
          </div>
          <Button variant="outline" onClick={handleSearch}>
            搜索
          </Button>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="全部分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分类</SelectItem>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="list" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="list">列表视图</TabsTrigger>
            <TabsTrigger value="grid">卡片视图</TabsTrigger>
          </TabsList>
          
          <TabsContent value="list">
            <Card>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  {filteredDocuments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <BookOpen className="w-12 h-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-2">暂无文档</h3>
                      <p className="text-muted-foreground mb-4">
                        {searchQuery ? '没有找到匹配的文档' : '开始添加你的第一个文档吧'}
                      </p>
                      <Button onClick={() => setIsAddDialogOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        添加文档
                      </Button>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredDocuments.map((doc) => (
                        <div key={doc.id} className="p-4 hover:bg-muted/50 transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-medium truncate">{doc.title}</h3>
                                {getCategoryBadge(doc.category)}
                                {getStatusBadge(doc)}
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                                {doc.content}
                              </p>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span>创建于: {formatDate(doc.createdAt)}</span>
                                <span>更新于: {formatDate(doc.updatedAt)}</span>
                                <Badge variant="outline" className="text-xs">
                                  {doc.contentType}
                                </Badge>
                                {doc.similarity !== undefined && (
                                  <Badge variant="secondary" className="text-xs">
                                    相似度: {(doc.similarity * 100).toFixed(1)}%
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingDoc(doc)
                                  setIsEditDialogOpen(true)
                                }}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteDocument(doc.id)}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="grid">
            {filteredDocuments.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <BookOpen className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">暂无文档</h3>
                  <p className="text-muted-foreground mb-4">
                    {searchQuery ? '没有找到匹配的文档' : '开始添加你的第一个文档吧'}
                  </p>
                  <Button onClick={() => setIsAddDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    添加文档
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDocuments.map((doc) => (
                  <Card key={doc.id} className="flex flex-col">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg truncate">{doc.title}</CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            {getCategoryBadge(doc.category)}
                            {getStatusBadge(doc)}
                            <Badge variant="outline" className="text-xs">
                              {doc.contentType}
                            </Badge>
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <p className="text-sm text-muted-foreground line-clamp-4">
                        {doc.content}
                      </p>
                    </CardContent>
                    <div className="px-6 pb-4">
                      <Separator className="mb-4" />
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">
                            {formatDate(doc.updatedAt)}
                          </span>
                          {doc.similarity !== undefined && (
                            <Badge variant="secondary" className="text-xs mt-1 w-fit">
                              相似度: {(doc.similarity * 100).toFixed(1)}%
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingDoc(doc)
                              setIsEditDialogOpen(true)
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDocument(doc.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {editingDoc && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <form onSubmit={handleEditDocument} className="flex flex-col flex-1 overflow-hidden">
              <DialogHeader className="flex-shrink-0">
                <DialogTitle>编辑文档</DialogTitle>
                <DialogDescription>
                  修改文档内容
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-1 pr-2">
                <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-title">标题</Label>
                  <Input
                    id="edit-title"
                    value={editingDoc.title}
                    onChange={(e) => setEditingDoc({ ...editingDoc, title: e.target.value })}
                    placeholder="输入文档标题"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-category">分类</Label>
                    <Select
                      value={editingDoc.category || ''}
                      onValueChange={(value) => setEditingDoc({ ...editingDoc, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择分类" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-contentType">内容类型</Label>
                    <Select
                      value={editingDoc.contentType}
                      onValueChange={(value) => setEditingDoc({ ...editingDoc, contentType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">纯文本</SelectItem>
                        <SelectItem value="markdown">Markdown</SelectItem>
                        <SelectItem value="pdf">PDF</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-content">内容</Label>
                  <Textarea
                    id="edit-content"
                    value={editingDoc.content}
                    onChange={(e) => setEditingDoc({ ...editingDoc, content: e.target.value })}
                    placeholder="输入文档内容"
                    className="h-[300px] resize-none"
                    required
                  />
                </div>
              </div>
              </div>
              <DialogFooter className="flex-shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditDialogOpen(false)
                    setEditingDoc(null)
                  }}
                  disabled={isSaving}
                >
                  取消
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? '保存中...' : '保存更改'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
