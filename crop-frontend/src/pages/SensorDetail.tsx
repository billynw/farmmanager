  const chartData = [...readings].reverse()
  const W = 320, H = 80, padLeft = 20, padRight = 10, padTop = 2, padBottom = 10
  let chartPath = '', chartArea = '', chartColor = '#378ADD', yMin = 0, yMax = 100
  
  // 時間軸固定: 現在時刻から24時間前または7日前
  const now = new Date()
  const timeRangeMs = chartRange === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
  const startTime = new Date(now.getTime() - timeRangeMs)
  
  if (chartData.length >= 1) {
    const ft = selectedMetric ? featureTypeByKey[selectedMetric] : null
    chartColor = ft?.color ?? '#378ADD'
    const vals = chartData.map(r => r.value)
    const dataMin = Math.min(...vals)
    const dataMax = Math.max(...vals)
    
    // ゲート系（0/1のバイナリ値）は固定範囲0~1
    const isGate = selectedMetric === 'gate_supply' || selectedMetric === 'gate_drain' || selectedMetric === 'gate_open'
    let minV: number, maxV: number
    if (isGate) {
      minV = 0
      maxV = 1
    } else {
      const range = dataMax - dataMin
      minV = dataMin - (range > 0 ? range * 0.1 : 1)
      maxV = dataMax + (range > 0 ? range * 0.1 : 1)
    }
    yMin = minV
    yMax = maxV