/**
 * ATELIER CMS — Page Template Definitions
 * Initial section/block content for each template type.
 */

import type { Section } from '@/core/document/types'

function id() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`
}

export type TemplateId = 'lp' | 'corporate' | 'event' | 'profile' | 'blank'

export function buildTemplateSections(templateId: TemplateId): Section[] {
  if (templateId === 'blank') return []

  if (templateId === 'lp') {
    const s1 = id(), s2 = id(), s3 = id(), s4 = id()
    return [
      {
        id: s1, type: 'hero', order: 0, label: 'ヒーロー', settings: {},
        blocks: [{
          id: id(), type: 'hero', order: 0, settings: {},
          content: {
            title: 'あなたのサービスのキャッチコピー',
            subtitle: 'ここにサービスの価値や特徴を一文で説明します。お客様が「これだ」と感じる言葉を入れましょう。',
            buttonText: '無料で始める',
            buttonUrl: '#cta',
            imageUrl: '',
          },
        }],
      },
      {
        id: s2, type: 'features', order: 1, label: '3つの特徴', settings: {},
        blocks: [{
          id: id(), type: 'feature-list', order: 0, settings: {},
          content: {
            features: [
              { icon: '✦', title: '特徴 1', description: 'このサービスがお客様の課題を解決する理由をここに書きます。' },
              { icon: '✦', title: '特徴 2', description: '競合と差別化できるポイントをわかりやすく説明しましょう。' },
              { icon: '✦', title: '特徴 3', description: '導入後に得られる具体的なメリットやビフォーアフターを示します。' },
            ],
            layout: 'grid',
          },
        }],
      },
      {
        id: s3, type: 'faq', order: 2, label: 'よくある質問', settings: {},
        blocks: [
          { id: id(), type: 'faq', order: 0, settings: {}, content: { question: 'このサービスはどんな人に向いていますか？', answer: '〇〇に課題を感じている方や、△△を効率化したい方に特におすすめです。' } },
          { id: id(), type: 'faq', order: 1, settings: {}, content: { question: '費用はどのくらいかかりますか？', answer: '基本プランは月額〇〇円からご利用いただけます。まずは無料トライアルでお試しください。' } },
          { id: id(), type: 'faq', order: 2, settings: {}, content: { question: 'サポートはありますか？', answer: 'メール・チャットによるサポートをご用意しています。平日10〜18時に対応しております。' } },
        ],
      },
      {
        id: s4, type: 'cta', order: 3, label: 'CTA', settings: {},
        blocks: [{
          id: id(), type: 'cta', order: 0, settings: {},
          content: {
            headline: 'まずは無料でお試しください',
            description: 'クレジットカード不要。30日間の無料トライアルでご確認いただけます。',
            primaryText: '無料トライアルを始める',
            primaryUrl: '#',
            secondaryText: '詳しく見る',
            secondaryUrl: '#',
          },
        }],
      },
    ]
  }

  if (templateId === 'corporate') {
    const s1 = id(), s2 = id(), s3 = id(), s4 = id()
    return [
      {
        id: s1, type: 'hero', order: 0, label: 'ヒーロー', settings: {},
        blocks: [{
          id: id(), type: 'hero', order: 0, settings: {},
          content: {
            title: '私たちが大切にしていること',
            subtitle: '会社のビジョンやミッションをここに一言で表します。お客様・社会にどんな価値を届けたいかを伝えましょう。',
            buttonText: 'サービスを見る',
            buttonUrl: '#services',
            imageUrl: '',
          },
        }],
      },
      {
        id: s2, type: 'content', order: 1, label: '会社概要', settings: {},
        blocks: [
          { id: id(), type: 'text', order: 0, settings: {}, content: { text: '## 私たちについて\n\n私たちは〇〇を専門とする企業です。創業以来、クライアントの課題解決に真摯に向き合い、△△件以上の実績を積み重ねてきました。\n\nチームの強みは、〇〇の深い専門知識と、お客様一人ひとりに寄り添う姿勢です。', format: 'markdown' } },
        ],
      },
      {
        id: s3, type: 'features', order: 2, label: 'サービス', settings: {},
        blocks: [{
          id: id(), type: 'feature-list', order: 0, settings: {},
          content: {
            features: [
              { icon: '🔷', title: 'サービス A', description: 'サービス内容と提供できる価値を簡潔に説明します。' },
              { icon: '🔷', title: 'サービス B', description: 'どんな課題を解決できるか、具体的に書きましょう。' },
              { icon: '🔷', title: 'サービス C', description: '導入後のビフォーアフターや事例を交えると効果的です。' },
            ],
            layout: 'grid',
          },
        }],
      },
      {
        id: s4, type: 'cta', order: 3, label: 'お問い合わせ', settings: {},
        blocks: [{
          id: id(), type: 'cta', order: 0, settings: {},
          content: {
            headline: 'お気軽にご相談ください',
            description: 'ご質問・ご要望はメールまたはお問い合わせフォームからどうぞ。',
            primaryText: 'お問い合わせ',
            primaryUrl: '#contact',
          },
        }],
      },
    ]
  }

  if (templateId === 'event') {
    const s1 = id(), s2 = id(), s3 = id()
    return [
      {
        id: s1, type: 'hero', order: 0, label: 'イベント概要', settings: {},
        blocks: [{
          id: id(), type: 'hero', order: 0, settings: {},
          content: {
            title: 'イベント名をここに入力',
            subtitle: '日程：2024年〇月〇日（〇）　会場：〇〇（またはオンライン）\n参加費：〇〇円（無料）',
            buttonText: '今すぐ申し込む',
            buttonUrl: '#apply',
            imageUrl: '',
          },
        }],
      },
      {
        id: s2, type: 'content', order: 1, label: 'プログラム', settings: {},
        blocks: [
          { id: id(), type: 'text', order: 0, settings: {}, content: { text: '## イベント内容\n\nこのイベントでは〇〇について学べます。\n\n**こんな方におすすめ**\n- 〇〇に興味のある方\n- △△を改善したいと考えている方\n- □□に課題を感じている方\n\n## タイムライン\n\n| 時間 | 内容 |\n|------|------|\n| 13:00 | 開場・受付 |\n| 13:30 | 開会・主催者挨拶 |\n| 14:00 | 講演「〇〇について」 |\n| 15:30 | 質疑応答 |\n| 16:00 | 閉会 |', format: 'markdown' } },
        ],
      },
      {
        id: s3, type: 'cta', order: 2, label: '申し込みCTA', settings: {},
        blocks: [{
          id: id(), type: 'cta', order: 0, settings: {},
          content: {
            headline: '参加申し込みはこちら',
            description: '定員〇〇名。お早めにお申し込みください。',
            primaryText: '申し込みフォームへ',
            primaryUrl: '#',
          },
        }],
      },
    ]
  }

  if (templateId === 'profile') {
    const s1 = id(), s2 = id(), s3 = id()
    return [
      {
        id: s1, type: 'hero', order: 0, label: '自己紹介', settings: {},
        blocks: [{
          id: id(), type: 'hero', order: 0, settings: {},
          content: {
            title: 'お名前 / 肩書き',
            subtitle: '専門分野や自分がどんな人物かを一文で。例：「フリーランスのWebデザイナー。UXと美しいビジュアルにこだわっています。」',
            buttonText: '仕事の依頼はこちら',
            buttonUrl: '#contact',
            imageUrl: '',
          },
        }],
      },
      {
        id: s2, type: 'content', order: 1, label: '実績・スキル', settings: {},
        blocks: [
          { id: id(), type: 'text', order: 0, settings: {}, content: { text: '## スキル・専門領域\n\n- 〇〇（歴〇年）\n- △△\n- □□\n\n## 主な実績\n\n**プロジェクト名 / クライアント名**  \n概要を1〜2行で説明します。\n\n**プロジェクト名 / クライアント名**  \n概要を1〜2行で説明します。', format: 'markdown' } },
        ],
      },
      {
        id: s3, type: 'cta', order: 2, label: '連絡先', settings: {},
        blocks: [{
          id: id(), type: 'cta', order: 0, settings: {},
          content: {
            headline: 'お仕事のご相談はこちら',
            description: 'メールまたはSNSからお気軽にご連絡ください。',
            primaryText: 'メールを送る',
            primaryUrl: 'mailto:your@email.com',
            secondaryText: 'SNSを見る',
            secondaryUrl: '#',
          },
        }],
      },
    ]
  }

  return []
}
