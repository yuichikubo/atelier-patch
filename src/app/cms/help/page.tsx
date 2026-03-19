import Link from 'next/link'

export default function HelpPage() {
  const steps = [
    {
      num: '01',
      title: 'ページを作成する',
      desc: '「新しいページ」からテンプレートを選んでタイトルとスラッグを設定します。',
      tip: 'スラッグはURLに使われます（例: my-lp → /site/my-lp）',
    },
    {
      num: '02',
      title: 'AIでコンテンツを生成する',
      desc: 'エディター右上の「✦ AI」ボタンを押してプロンプトを入力。「ランディングページ全体を生成して」のように指示すると自動でセクションとブロックが作られます。',
      tip: 'プロンプト例は入力欄の下に表示されます。クリックで選択できます。',
    },
    {
      num: '03',
      title: 'ブロックを手動で追加する',
      desc: 'エディター左の「ブロック」タブからヒーロー・テキスト・FAQなどのブロックをクリックして追加できます。',
      tip: '「セクション」タブで並び順を変更・削除できます。',
    },
    {
      num: '04',
      title: 'HTMLをインポートする',
      desc: '他のツールで作成したHTMLを「インポート」タブに貼り付けると編集可能なブロックに変換されます。',
      tip: 'Claude / ChatGPT で生成したHTMLもそのまま貼り付けられます。',
    },
    {
      num: '05',
      title: 'ブロックを選択して編集する',
      desc: 'キャンバス上のブロックをクリックすると右側のパネルで内容を編集できます。テキスト・画像URL・ボタンリンクなどを変更できます。',
      tip: '「改善」タブではAIによる改善提案を確認できます。',
    },
    {
      num: '06',
      title: '保存・公開する',
      desc: '「保存」ボタン（またはCmd+S）で下書き保存。「公開」ボタンで /site/スラッグ のURLで公開されます。',
      tip: '公開後も「更新」ボタンで内容を更新できます。',
    },
  ]

  const prompts = [
    { cat: 'ページ全体', items: ['ランディングページ全体を生成して', 'コーポレートサイト向けに全体を構成して', 'イベント告知ページを作って'] },
    { cat: 'セクション追加', items: ['ヒーローセクションを追加して', 'お客様の声を3件追加して', 'よくある質問（FAQ）を3問作って', 'お問い合わせCTAを追加して', '料金プランの比較表を作って'] },
    { cat: 'テキスト改善', items: ['文章をより説得力のある表現に書き直して', '文章を短くして読みやすくして', 'コンバージョン向けの文体に変えて'] },
  ]

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px 80px', fontFamily: 'var(--font-ui)', color: '#2C2A28', background: '#F8F5F0', minHeight: '100vh' }}>
      <div style={{ paddingTop: 48, marginBottom: 40 }}>
        <Link href="/cms/pages" style={{ fontSize: 11, color: '#B8903C', textDecoration: 'none' }}>← ページ一覧へ</Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2C2A28', marginTop: 16, marginBottom: 6 }}>ATELIERの使い方</h1>
        <p style={{ fontSize: 13, color: '#9A9490' }}>AIを使ってウェブページを素早く作る方法をご案内します</p>
      </div>

      {/* Steps */}
      <div style={{ marginBottom: 48 }}>
        {steps.map(s => (
          <div key={s.num} style={{ display: 'flex', gap: 20, marginBottom: 28 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#C9A84C', minWidth: 32, paddingTop: 1 }}>{s.num}</div>
            <div style={{ flex: 1, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#2C2A28', marginBottom: 6 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: '#6A6560', lineHeight: 1.7, marginBottom: 8 }}>{s.desc}</div>
              <div style={{ fontSize: 11, color: '#B8903C', background: 'rgba(201,168,76,0.07)', padding: '6px 10px', borderRadius: 6, lineHeight: 1.5 }}>
                💡 {s.tip}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* AI Prompt Examples */}
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '24px' }}>
        <div style={{ fontSize: 11, color: '#9A9490', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>AIプロンプト テンプレート集</div>
        {prompts.map(g => (
          <div key={g.cat} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#B0A898', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>{g.cat}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {g.items.map(p => (
                <div key={p} style={{ fontSize: 12, color: '#6A6560', background: '#F8F5F0', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 6, padding: '8px 12px', lineHeight: 1.5 }}>
                  「{p}」
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: 40 }}>
        <Link href="/cms/new" style={{ display: 'inline-block', padding: '12px 28px', background: '#C9A84C', color: '#FEFCF8', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>
          さっそくページを作る →
        </Link>
      </div>
    </div>
  )
}
