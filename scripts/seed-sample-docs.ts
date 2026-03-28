import { addDocuments } from '@/lib/rag'

const sampleDocuments = [
  {
    title: '退货政策',
    content: '我们的退货政策：您可以在收到商品后的30天内申请退货。商品必须保持未使用状态，并且保留原始包装。退款将在收到退回商品后的7个工作日内处理。',
    category: 'policy',
  },
  {
    title: '运费规则',
    content: '订单满99元免运费。未满99元的订单收取10元运费。偏远地区（如新疆、西藏）可能需要额外运费，具体以结算页面显示为准。',
    category: 'policy',
  },
  {
    title: '常见问题 - 账户',
    content: '如何注册账户？点击首页右上角的"注册"按钮，填写邮箱和密码即可完成注册。忘记密码？点击登录页面的"忘记密码"链接，通过邮箱重置密码。',
    category: 'faq',
  },
  {
    title: '常见问题 - 支付',
    content: '我们支持哪些支付方式？支持微信支付、支付宝、银行卡支付。支付安全吗？我们使用SSL加密技术保护您的支付信息，确保交易安全。',
    category: 'faq',
  },
  {
    title: '产品规格 - 无线耳机',
    content: '无线耳机规格：蓝牙5.3，续航时间24小时（带充电盒），主动降噪，IPX4防水，支持触摸控制，颜色有黑色、白色、蓝色可选。',
    category: 'product',
  },
  {
    title: '产品规格 - 智能手表',
    content: '智能手表规格：1.4英寸AMOLED屏幕，心率监测，血氧监测，睡眠追踪，50米防水，电池续航7天，支持iOS和Android。',
    category: 'product',
  },
]

async function main() {
  console.log('正在添加示例文档...')
  
  await addDocuments(sampleDocuments)
  
  console.log('示例文档添加完成！')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
