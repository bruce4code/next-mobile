#!/usr/bin/env bash
# 测试 POST /api/documents 的 Zod 校验逻辑
# 使用前请确保 npm run dev 正在运行

BASE_URL="http://localhost:8000"

# 如果传了参数就用参数作为 URL
if [ -n "$1" ]; then
  BASE_URL="$1"
fi

echo "=========================================="
echo " 测试 POST /api/documents 校验逻辑"
echo " 服务器: $BASE_URL"
echo "=========================================="

# 1. 正常数据（应返回 200）
echo ""
echo "❓ 测试 1: 合法数据 → 期望 200"
curl -s -w "\n  HTTP状态码: %{http_code}\n" \
  -X POST "$BASE_URL/api/documents" \
  -H "Content-Type: application/json" \
  -d '{"title":"测试文档","content":"这是一段测试内容","contentType":"markdown","category":"faq"}'
echo "---"

# 2. 缺 title（应返回 400 + "标题不能为空"）
echo "❓ 测试 2: 缺少 title → 期望 400"
curl -s -w "\n  HTTP状态码: %{http_code}\n" \
  -X POST "$BASE_URL/api/documents" \
  -H "Content-Type: application/json" \
  -d '{"content":"只有内容没有标题"}'
echo "---"

# 3. 缺 content（应返回 400 + "内容不能为空"）
echo "❓ 测试 3: 缺少 content → 期望 400"
curl -s -w "\n  HTTP状态码: %{http_code}\n" \
  -X POST "$BASE_URL/api/documents" \
  -H "Content-Type: application/json" \
  -d '{"title":"只有标题没有内容"}'
echo "---"

# 4. title 为空字符串（应返回 400 + "标题不能为空"）
echo "❓ 测试 4: title 为空字符串 → 期望 400"
curl -s -w "\n  HTTP状态码: %{http_code}\n" \
  -X POST "$BASE_URL/api/documents" \
  -H "Content-Type: application/json" \
  -d '{"title":"","content":"标题是空的"}'
echo "---"

# 5. contentType 非法（应返回 400 + "Invalid enum value"）
echo "❓ 测试 5: contentType 传非法值 → 期望 400"
curl -s -w "\n  HTTP状态码: %{http_code}\n" \
  -X POST "$BASE_URL/api/documents" \
  -H "Content-Type: application/json" \
  -d '{"title":"测试","content":"内容","contentType":"pdf"}'
echo "---"

# 6. 只传 title 和 content，不传 contentType（应返回 200，contentType 走默认值 "text"）
echo "❓ 测试 6: 不传 contentType（走默认值）→ 期望 200"
curl -s -w "\n  HTTP状态码: %{http_code}\n" \
  -X POST "$BASE_URL/api/documents" \
  -H "Content-Type: application/json" \
  -d '{"title":"默认类型","content":"contentType 应该被设为 text"}'
echo "---"

# 7. 传空对象（缺 title 和 content，应返回 400 + 两条错误）
echo "❓ 测试 7: 传空对象 → 期望 400（应有两条错误）"
curl -s -w "\n  HTTP状态码: %{http_code}\n" \
  -X POST "$BASE_URL/api/documents" \
  -H "Content-Type: application/json" \
  -d '{}'
echo "---"

echo ""
echo "=========================================="
echo " 测试完成"
echo "=========================================="