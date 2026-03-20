// ggwave音声送信ユーティリティ
// ggwave.js は index.html で CDN から読み込み済み
declare const ggwave_factory: any

let ggwaveInstance: any = null
let ggwaveModule: any = null

async function getGgwave() {
  if (ggwaveInstance !== null) return { gw: ggwaveModule, instance: ggwaveInstance }
  const gw = await ggwave_factory()
  const params = gw.getDefaultParameters()
  params.sampleRateInp = 48000
  params.sampleRateOut = 48000
  params.samplesPerFrame = 1024
  params.payloadLength = 16
  const instance = gw.init(params)
  ggwaveModule = gw
  ggwaveInstance = instance
  return { gw, instance }
}

/** テキストを音声で送信する。再生完了まで待機する */
export async function transmitText(text: string): Promise<void> {
  const { gw, instance } = await getGgwave()
  const protocol = gw.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FASTEST
  const encoded = gw.encode(instance, text, protocol, 50)
  const samples = new Float32Array(encoded.buffer, encoded.byteOffset, encoded.byteLength / 4)

  return new Promise((resolve, reject) => {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext
    const ctx = new AudioCtx({ sampleRate: 48000 })
    const buf = ctx.createBuffer(1, samples.length, 48000)
    buf.copyToChannel(samples, 0)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.onended = () => { ctx.close(); resolve() }
    src.onerror = (e: any) => { ctx.close(); reject(e) }
    src.start()
  })
}

/** ミリ秒待機 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * WIFI情報をggwaveで音声送信する
 * SSIDを送信 → 1秒待機 → パスワードを送信
 * onStatus コールバックで進行状況を通知
 */
export async function transmitWifi(
  ssid: string,
  password: string,
  onStatus: (msg: string) => void
): Promise<void> {
  onStatus('SSIDを送信中…')
  await transmitText(ssid)
  onStatus('1秒待機中…')
  await sleep(1000)
  onStatus('パスワードを送信中…')
  await transmitText(password)
  onStatus('送信完了')
}
