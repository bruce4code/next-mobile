import { type Metric } from 'web-vitals';

const reportWebVitals = (metric: Metric) => {
  // 您可以在这里将指标发送到分析服务，或者简单地打印到控制台
  console.log(metric);

  // 示例：根据指标类型进行不同处理
  switch (metric.name) {
    case 'FCP':
      // 处理 FCP 指标
      console.log('FCP:', metric.value);
      break;
    case 'LCP':
      // 处理 LCP 指标
      console.log('LCP:', metric.value);
      break;
    case 'CLS':
      // 处理 CLS 指标
      console.log('CLS:', metric.value);
      break;
    // case 'FID':
    //   // 处理 FID 指标
    //   console.log('FID:', metric.value);
    //   break;
    case 'TTFB':
      // 处理 TTFB 指标
      console.log('TTFB:', metric.value);
      break;
    case 'INP':
      // 处理 INP 指标 (Interaction to Next Paint)
      console.log('INP:', metric.value);
      break;
    default:
      break;
  }
};

export default reportWebVitals;