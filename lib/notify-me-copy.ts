/**
 * Copy for the PDP "Notify me when it's back" form — 9 languages, engineering-written (NOT native-reviewed:
 * S10 must review before this is claimed native). Chosen by the storefront's active locale
 * (`<html lang>`); an unlisted language shows English, and the fallback is REPORTED (`fellBack`), never a
 * broken or half-translated string.
 */
export interface NotifyMeCopy {
  title: string
  label: string
  placeholder: string
  button: string
  note: string
  success: string
  available: string
  invalid: string
  error: string
  sending: string
}

const COPY: Record<string, NotifyMeCopy> = {
  en: { title: 'Notify me when it’s back', label: 'Email address', placeholder: 'you@example.com', button: 'Notify me', note: 'We’ll email you once when this item is back in stock — nothing else, and no marketing. You can unsubscribe in that email.', success: 'Thanks — we’ll email you once when it’s back.', available: 'Good news — this item is in stock now.', invalid: 'Enter a valid email address.', error: 'We couldn’t save that. Please try again.', sending: 'Saving…' },
  th: { title: 'แจ้งฉันเมื่อสินค้ากลับมา', label: 'อีเมล', placeholder: 'you@example.com', button: 'แจ้งฉัน', note: 'เราจะส่งอีเมลหนึ่งครั้งเมื่อสินค้านี้กลับมามีจำหน่าย ไม่มีอย่างอื่น และไม่ใช่การตลาด คุณยกเลิกได้ในอีเมลนั้น', success: 'ขอบคุณ — เราจะส่งอีเมลหนึ่งครั้งเมื่อสินค้ากลับมา', available: 'ข่าวดี — สินค้านี้มีจำหน่ายแล้ว', invalid: 'กรุณากรอกอีเมลที่ถูกต้อง', error: 'บันทึกไม่สำเร็จ โปรดลองอีกครั้ง', sending: 'กำลังบันทึก…' },
  ja: { title: '再入荷したらお知らせ', label: 'メールアドレス', placeholder: 'you@example.com', button: 'お知らせを受け取る', note: 'この商品が再入荷したときに1回だけメールでお知らせします。それ以外の用途やマーケティングには使いません。配信停止はそのメールから行えます。', success: 'ありがとうございます。再入荷時に1回だけメールでお知らせします。', available: '朗報です。この商品は現在在庫があります。', invalid: '有効なメールアドレスを入力してください。', error: '保存できませんでした。もう一度お試しください。', sending: '保存中…' },
  zh: { title: '到货时通知我', label: '电子邮箱', placeholder: 'you@example.com', button: '通知我', note: '此商品到货时我们只会给您发送一封邮件,不做其他用途,也不用于营销。您可在该邮件中取消。', success: '谢谢——到货时我们会给您发送一封邮件。', available: '好消息——此商品现已有货。', invalid: '请输入有效的邮箱地址。', error: '保存失败,请重试。', sending: '保存中…' },
  es: { title: 'Avísame cuando vuelva', label: 'Correo electrónico', placeholder: 'tu@ejemplo.com', button: 'Avísame', note: 'Te escribiremos una sola vez cuando este artículo vuelva a estar disponible: nada más y sin marketing. Podrás darte de baja en ese correo.', success: 'Gracias: te escribiremos una vez cuando vuelva.', available: 'Buenas noticias: este artículo ya está disponible.', invalid: 'Introduce un correo electrónico válido.', error: 'No pudimos guardarlo. Inténtalo de nuevo.', sending: 'Guardando…' },
  de: { title: 'Benachrichtigen, wenn wieder verfügbar', label: 'E-Mail-Adresse', placeholder: 'sie@beispiel.de', button: 'Benachrichtigen', note: 'Wir schreiben Ihnen einmal, wenn dieser Artikel wieder verfügbar ist – sonst nichts und kein Marketing. Abbestellen können Sie in dieser E-Mail.', success: 'Danke – wir schreiben Ihnen einmal, sobald er wieder da ist.', available: 'Gute Nachrichten – dieser Artikel ist jetzt verfügbar.', invalid: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.', error: 'Das konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.', sending: 'Wird gespeichert…' },
  fr: { title: 'Me prévenir du retour en stock', label: 'Adresse e-mail', placeholder: 'vous@exemple.fr', button: 'Me prévenir', note: 'Nous vous écrirons une seule fois lorsque cet article sera de nouveau disponible — rien d’autre, et aucun marketing. Vous pourrez vous désabonner dans cet e-mail.', success: 'Merci — nous vous écrirons une fois lors de son retour.', available: 'Bonne nouvelle — cet article est disponible.', invalid: 'Saisissez une adresse e-mail valide.', error: 'Nous n’avons pas pu l’enregistrer. Veuillez réessayer.', sending: 'Enregistrement…' },
  pt: { title: 'Avise-me quando voltar', label: 'E-mail', placeholder: 'voce@exemplo.com', button: 'Avise-me', note: 'Enviaremos um único e-mail quando este item voltar ao estoque — nada mais e sem marketing. Você poderá cancelar nesse e-mail.', success: 'Obrigado — enviaremos um e-mail quando voltar.', available: 'Boas notícias — este item está disponível agora.', invalid: 'Informe um e-mail válido.', error: 'Não foi possível salvar. Tente novamente.', sending: 'Salvando…' },
  ar: { title: 'أعلمني عند عودته', label: 'البريد الإلكتروني', placeholder: 'you@example.com', button: 'أعلمني', note: 'سنراسلك مرة واحدة عند عودة هذا المنتج للمخزون — لا شيء آخر ولا تسويق. يمكنك إلغاء الاشتراك من تلك الرسالة.', success: 'شكرًا — سنراسلك مرة واحدة عند عودته.', available: 'أخبار سارة — هذا المنتج متوفر الآن.', invalid: 'أدخل بريدًا إلكترونيًا صالحًا.', error: 'تعذّر الحفظ. يُرجى المحاولة مرة أخرى.', sending: 'جارٍ الحفظ…' },
}

export const NOTIFY_ME_LANGS = Object.keys(COPY)

/** Copy for a BCP-47 tag: its base language if we have it, else English with `fellBack: true`. */
export function notifyMeCopy(locale: string | null | undefined): { copy: NotifyMeCopy; lang: string; fellBack: boolean } {
  const base = String(locale ?? '').split('-')[0]!.toLowerCase()
  const hit = COPY[base]
  return hit ? { copy: hit, lang: base, fellBack: false } : { copy: COPY.en!, lang: 'en', fellBack: true }
}

export const isRtl = (lang: string): boolean => ['ar', 'he', 'fa', 'ur'].includes(lang)
