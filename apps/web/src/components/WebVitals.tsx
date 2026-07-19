'use client';

import { useEffect } from 'react';
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';
import reportWebVitalsFunction from '@/lib/reportWebVitals';

export function WebVitals() {
  useEffect(() => {
    onCLS(reportWebVitalsFunction);
    onFCP(reportWebVitalsFunction);
    // onFID(reportWebVitalsFunction);
    onINP(reportWebVitalsFunction);
    onLCP(reportWebVitalsFunction);
    onTTFB(reportWebVitalsFunction);
  }, []);

  return null; // 这个组件不渲染任何 UI
}